// WAF signal detector + circuit breaker for Kimi. Mirrors QwenWafBreaker.
// Recognizes 403/429 and body snippets that indicate a challenge, a
// rate-limit, or a bot block. When detected, the throttle enters a
// long cooldown so we stop generating offenses.

export type KimiWafState = 'closed' | 'open' | 'half-open';

export interface KimiWafSnapshot {
  state: KimiWafState;
  openedAt: number | null;
  cooldownMs: number;
  cooldownRemainingMs: number;
  totalTrips: number;
  halfOpenInFlight: boolean;
}

export interface KimiWafDecision {
  allowed: boolean;
  reason?: string;
}

export function detectKimiWafSignal(status: number, bodyText: string): boolean {
  if (status === 403 || status === 429) return true;
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  if (lower.includes('captcha')) return true;
  if (lower.includes('verify you are human')) return true;
  if (lower.includes('rate limit')) return true;
  if (lower.includes('too many requests')) return true;
  if (lower.includes('access denied')) return true;
  if (lower.includes('security check')) return true;
  if (lower.includes('cloudflare')) return true;
  return false;
}

export class KimiWafBreaker {
  private state: KimiWafState = 'closed';
  private openedAt: number | null = null;
  private totalTrips = 0;
  private halfOpenInFlight = false;

  constructor(private readonly cooldownMs: number = 3 * 60 * 60 * 1000) {}

  canCall(): KimiWafDecision {
    if (this.state === 'closed') return { allowed: true };

    if (this.state === 'open') {
      const elapsed = Date.now() - (this.openedAt ?? Date.now());
      if (elapsed >= this.cooldownMs) {
        this.state = 'half-open';
        this.halfOpenInFlight = false;
      } else {
        return {
          allowed: false,
          reason: 'WAF cooldown active (' + Math.ceil((this.cooldownMs - elapsed) / 60000) + 'min remaining)',
        };
      }
    }
    // half-open: allow exactly one probe
    if (this.halfOpenInFlight) {
      return { allowed: false, reason: 'half-open probe already in flight' };
    }
    this.halfOpenInFlight = true;
    return { allowed: true };
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.openedAt = null;
    }
    this.halfOpenInFlight = false;
  }

  recordWafPunishment(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.totalTrips += 1;
    this.halfOpenInFlight = false;
  }

  recordNonWafFailure(): void {
    // In half-open, a non-WAF failure means the probe failed but
    // we don't know if the site is punishing us. Stay in half-open
    // so the next call can re-probe, rather than re-opening the breaker.
    // Clear the guard so the next call is allowed to probe again.
    this.halfOpenInFlight = false;
  }

  isHealthy(): boolean { return this.state === 'closed'; }

  snapshot(): KimiWafSnapshot {
    const remaining = this.state === 'open' && this.openedAt
      ? Math.max(0, this.cooldownMs - (Date.now() - this.openedAt))
      : 0;
    return {
      state: this.state,
      openedAt: this.openedAt,
      cooldownMs: this.cooldownMs,
      cooldownRemainingMs: remaining,
      totalTrips: this.totalTrips,
      halfOpenInFlight: this.halfOpenInFlight,
    };
  }
}
