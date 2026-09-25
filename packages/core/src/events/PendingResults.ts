type Resolver<T> = (value: T) => void;
type Rejecter = (reason: Error) => void;

interface Waiter {
  resolve: Resolver<any>;
  reject: Rejecter;
  timer: NodeJS.Timeout;
}

class PendingResults {
  private waiters = new Map<string, Waiter>();
  private early = new Map<string, any>();

  wait<T>(correlation_id: string, timeoutMs: number): Promise<T> {
    if (this.early.has(correlation_id)) {
      const v = this.early.get(correlation_id);
      this.early.delete(correlation_id);
      return Promise.resolve(v as T);
    }
    if (this.waiters.has(correlation_id)) {
      // Second wait for same id — reject the new one; existing waiter wins.
      return Promise.reject(new Error('duplicate wait for ' + correlation_id));
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(correlation_id);
        reject(new Error('timeout waiting for result ' + correlation_id));
      }, timeoutMs);
      this.waiters.set(correlation_id, { resolve, reject, timer });
    });
  }

  resolve<T>(correlation_id: string, value: T): void {
    const w = this.waiters.get(correlation_id);
    if (w) {
      clearTimeout(w.timer);
      this.waiters.delete(correlation_id);
      w.resolve(value);
      return;
    }
    // No waiter yet — stash for the next wait() call.
    this.early.set(correlation_id, value);
    setTimeout(() => this.early.delete(correlation_id), 60000);
  }

  size(): number {
    return this.waiters.size + this.early.size;
  }
}

export const pendingResults = new PendingResults();
