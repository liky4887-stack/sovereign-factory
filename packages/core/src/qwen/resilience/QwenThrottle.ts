// Hard token-bucket throttle. Enforces a polite-client profile for Qwen:
// 2 requests per minute, burst capacity of 1.
// FIFO queue so concurrent callers are served in order, not starved.
export class QwenThrottle {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRatePerMs: number;
  private lastRefillAt: number;
  private queue: Array<{ resolve: () => void }> = [];
  private timerHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(requestsPerMinute: number = 2, burst: number = 1) {
    if (requestsPerMinute <= 0 || burst < 1) {
      throw new Error('invalid throttle config');
    }
    this.capacity = burst;
    this.tokens = burst;
    this.refillRatePerMs = requestsPerMinute / 60000;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefillAt = now;
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve });
      this.processQueue();
    });
  }

  private processQueue(): void {
    this.refill();
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const next = this.queue.shift()!;
      next.resolve();
    }
    if (this.queue.length > 0) this.scheduleNextFlush();
  }

  private scheduleNextFlush(): void {
    if (this.timerHandle) return;
    const needed = Math.max(0, 1 - this.tokens);
    const waitMs = Math.max(50, Math.ceil(needed / this.refillRatePerMs));
    this.timerHandle = setTimeout(() => {
      this.timerHandle = null;
      this.processQueue();
    }, waitMs);
  }

  snapshot(): { tokens: number; capacity: number; refillPerMinute: number; queued: number } {
    this.refill();
    return {
      tokens: Number(this.tokens.toFixed(4)),
      capacity: this.capacity,
      refillPerMinute: Math.round(this.refillRatePerMs * 60000),
      queued: this.queue.length,
    };
  }
}
