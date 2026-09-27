// WAF-aware circuit breaker. Detects Alibaba's anti-bot punishment envelope
// (FAIL_SYS_USER_VALIDATE / RGV587_ERROR / /punish? / captcha) and stops
// calling Qwen until the punishment window expires.
//
// States:
//   CLOSED      - normal, calls allowed
//   OPEN        - WAF punishment detected, no calls until cooldown elapses
//   HALF_OPEN   - cooldown elapsed, one probe allowed; on success -> CLOSED,
//                 on failure -> back to OPEN
export type WafBreakerState = 'closed' | 'open' | 'half-open';

export interface WafBreakerSnapshot {
  state: WafBreakerState;
  openedAt: number | null;
  cooldownMs: number;
  cooldownRemainingMs: number;
  totalTrips: number;
  halfOpenInFlight: boolean;
}

export interface WafCallDecision {
  allowed: boolean;
  reason?: string;
  probeOnly?: boolean;
}

export class QwenWafBlockedError extends Error {
  readonly code = 'QWEN_WAF_BLOCKED';
  cooldownRemainingMs: number;
  constructor(message: string, cooldownRemainingMs: number = 0) {
    super(message);
    this.name = 'QwenWafBlockedError';
    this.cooldownRemainingMs = cooldownRemainingMs;
  }
}

export function detectQwenWafPunishment(status: number, bodyText: string): boolean {
  if (status === 403 || status === 429) return true;
  if (!bodyText) return false;
  if (bodyText.indexOf('FAIL_SYS_USER_VALIDATE') !== -1) return true;
  if (bodyText.indexOf('RGV587_ERROR') !== -1) return true;
  if (bodyText.indexOf('action=captcha') !== -1) return true;
  if (bodyText.indexOf('_____tmd_____') !== -1) return true;
  if (bodyText.indexOf('/punish?') !== -1) return true;
  return false;
}

export class QwenWafBreaker {
  private state: WafBreakerState = 'closed';
  private openedAt: number | null = null;
  private halfOpenInFlight = false;
  private totalTrips = 0;

  constructor(private readonly cooldownMs: number = 15 * 60 * 1000) {}

  canCall(): WafCallDecision {
    if (this.state === 'closed') return { allowed: true };

    if (this.state === 'open') {
      const elapsed = Date.now() - (this.openedAt ?? Date.now());
      if (elapsed >= this.cooldownMs) {
        this.state = 'half-open';
        this.halfOpenInFlight = false;
        // fall through to probe check below
      } else {
        const remaining = this.cooldownMs - elapsed;
        return {
          allowed: false,
          reason: 'WAF cooldown active (' + Math.ceil(remaining / 1000) + 's remaining)',
        };
      }
    }

    if (this.halfOpenInFlight) {
      return { allowed: false, reason: 'half-open probe already in flight' };
    }
    this.halfOpenInFlight = true;
    return { allowed: true, probeOnly: true };
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.openedAt = null;
      this.halfOpenInFlight = false;
    }
  }

  recordWafPunishment(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.halfOpenInFlight = false;
    this.totalTrips += 1;
  }

  recordNonWafFailure(): void {
    if (this.state === 'half-open') {
      this.halfOpenInFlight = false;
      // Failed probe: back to OPEN with a fresh cooldown
      this.state = 'open';
      this.openedAt = Date.now();
      this.totalTrips += 1;
    }
  }

  isHealthy(): boolean {
    return this.state === 'closed';
  }

  snapshot(): WafBreakerSnapshot {
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
