// Invisible Man throttle — hard rate limiting for Kimi.
// No fake jitter. No UA rotation. Just genuinely slow, low-volume traffic
// with a persistent state file so restarts don't reset the counters.
//
// Policy (all configurable via KimiServiceOptions):
//   - minimum gap between any two requests
//   - rolling 24h request cap
//   - hard concurrency limit of 1
//   - persistent cooldown after a WAF event (raised gap + lowered cap)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../../shared/logger';
import { KimiThrottledError, KimiWafBlockedError } from '../models/KimiErrors';

interface ThrottleState {
  recentRequests: number[];   // epoch ms
  cooldownUntil: number;      // epoch ms, 0 when not in cooldown
  raisedGapSeconds: number;   // set when WAF cooldown expires
  raisedGapUntil: number;     // epoch ms
  totalTrips: number;
}

export class KimiThrottle {
  private state: ThrottleState = {
    recentRequests: [],
    cooldownUntil: 0,
    raisedGapSeconds: 0,
    raisedGapUntil: 0,
    totalTrips: 0,
  };
  private inFlight = false;

  constructor(
    private readonly stateFile: string,
    private readonly baseGapSeconds: number = 900,       // 15 min default
    private readonly maxRequestsPerDay: number = 30,
    private readonly wafCooldownMs: number = 3 * 60 * 60 * 1000,   // 3 hours
    private readonly wafRaisedGapSeconds: number = 1800,           // 30 min after WAF
    private readonly wafRaisedGapDurationMs: number = 24 * 60 * 60 * 1000,
  ) {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.stateFile)) return;
      const raw = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      this.state = {
        recentRequests: Array.isArray(raw.recentRequests) ? raw.recentRequests : [],
        cooldownUntil: typeof raw.cooldownUntil === 'number' ? raw.cooldownUntil : 0,
        raisedGapSeconds: typeof raw.raisedGapSeconds === 'number' ? raw.raisedGapSeconds : 0,
        raisedGapUntil: typeof raw.raisedGapUntil === 'number' ? raw.raisedGapUntil : 0,
        totalTrips: typeof raw.totalTrips === 'number' ? raw.totalTrips : 0,
      };
    } catch (e) {
      log.warn('kimi.throttle.load_failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      log.warn('kimi.throttle.save_failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  private effectiveGapSeconds(): number {
    const now = Date.now();
    if (this.state.raisedGapUntil > now && this.state.raisedGapSeconds > 0) {
      return Math.max(this.baseGapSeconds, this.state.raisedGapSeconds);
    }
    return this.baseGapSeconds;
  }

  private pruneOld(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.state.recentRequests = this.state.recentRequests.filter((t) => t > cutoff);
  }

  // Called before every request. Throws if not allowed.
  async acquire(): Promise<void> {
    this.pruneOld();
    const now = Date.now();

    // 1. WAF cooldown — hard block
    if (this.state.cooldownUntil > now) {
      const remaining = this.state.cooldownUntil - now;
      throw new KimiWafBlockedError(
        'Kimi WAF cooldown active (' + Math.ceil(remaining / 1000) + 's remaining)',
        remaining,
      );
    }

    // 2. Concurrency — one in flight at a time
    if (this.inFlight) {
      const remaining = this.effectiveGapSeconds() * 1000;
      throw new KimiThrottledError('Kimi already has a request in flight', remaining);
    }

    // 3. Daily cap
    if (this.state.recentRequests.length >= this.maxRequestsPerDay) {
      const oldest = this.state.recentRequests[0];
      const remaining = oldest + 24 * 60 * 60 * 1000 - now;
      throw new KimiThrottledError(
        'Kimi daily cap reached (' + this.maxRequestsPerDay + '/24h, next slot in ' + Math.ceil(remaining / 60000) + 'min)',
        remaining,
      );
    }

    // 4. Minimum gap since last request
    const last = this.state.recentRequests[this.state.recentRequests.length - 1] ?? 0;
    const gapMs = this.effectiveGapSeconds() * 1000;
    if (last > 0 && now - last < gapMs) {
      const remaining = gapMs - (now - last);
      throw new KimiThrottledError(
        'Kimi gap not elapsed (' + Math.ceil(remaining / 60000) + 'min remaining)',
        remaining,
      );
    }

    // Allowed — mark in-flight. recordSuccess() will commit the timestamp.
    this.inFlight = true;
  }

  recordSuccess(): void {
    this.state.recentRequests.push(Date.now());
    this.inFlight = false;
    this.save();
  }

  recordWafPunishment(): void {
    this.inFlight = false;
    const now = Date.now();
    this.state.cooldownUntil = now + this.wafCooldownMs;
    this.state.raisedGapSeconds = this.wafRaisedGapSeconds;
    this.state.raisedGapUntil = now + this.wafRaisedGapDurationMs;
    this.state.totalTrips += 1;
    this.save();
    log.warn('kimi.throttle.waf_cooldown', {
      cooldownMin: Math.round(this.wafCooldownMs / 60000),
      raisedGapSec: this.wafRaisedGapSeconds,
      totalTrips: this.state.totalTrips,
    });
  }

  recordNonWafFailure(): void {
    this.inFlight = false;
  }

  snapshot() {
    this.pruneOld();
    const now = Date.now();
    const gap = this.effectiveGapSeconds();
    const last = this.state.recentRequests[this.state.recentRequests.length - 1] ?? 0;
    const nextAllowedAt = last > 0 ? last + gap * 1000 : now;
    return {
      inFlight: this.inFlight,
      recentCount: this.state.recentRequests.length,
      maxPerDay: this.maxRequestsPerDay,
      effectiveGapSeconds: gap,
      nextAllowedAt: Math.max(nextAllowedAt, now),
      nextAllowedInMs: Math.max(0, nextAllowedAt - now),
      cooldownUntil: this.state.cooldownUntil,
      cooldownRemainingMs: Math.max(0, this.state.cooldownUntil - now),
      totalTrips: this.state.totalTrips,
    };
  }
}
