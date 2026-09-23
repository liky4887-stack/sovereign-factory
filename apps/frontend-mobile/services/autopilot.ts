export interface AutopilotEvent {
  id: string;
  type: 'self_heal' | 'shout_out' | 'intervention' | 'repetitive_task';
  message: string;
  agent: string;
  timestamp: number;
  resolved: boolean;
}

class Autopilot {
  private events: AutopilotEvent[] = [];
  private listeners: Set<(events: AutopilotEvent[]) => void> = new Set();

  startMonitoring(): void {
    console.log('[Autopilot] Monitoring started');
  }

  reportCrash(stack: string, file: string): AutopilotEvent {
    const event: AutopilotEvent = {
      id: `ap-${Date.now()}`,
      type: 'self_heal',
      message: `Crash detected in ${file}. Spawning repair agent.`,
      agent: 'Chaos Monkey',
      timestamp: Date.now(),
      resolved: false,
    };
    this.events = [event, ...this.events];
    this.notify();
    return event;
  }

  shoutOut(message: string): AutopilotEvent {
    const event: AutopilotEvent = {
      id: `ap-${Date.now()}`,
      type: 'shout_out',
      message,
      agent: 'CEO',
      timestamp: Date.now(),
      resolved: true,
    };
    this.events = [event, ...this.events];
    this.notify();
    return event;
  }

  getEvents(): AutopilotEvent[] { return this.events; }
  subscribe(fn: (events: AutopilotEvent[]) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private notify() { this.listeners.forEach((fn) => fn(this.events)); }
}

export const autopilot = new Autopilot();
