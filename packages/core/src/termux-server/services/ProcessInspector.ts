import * as os from 'os';
import { log } from '../../shared/logger';

export interface ProcessStatus {
  pid: number;
  uptimeSeconds: number;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  cpuCount: number;
  loadAvg: [number, number, number];
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    processRssBytes: number;
    processHeapUsedBytes: number;
  };
  timestamp: string;
}

export class ProcessInspector {
  snapshot(): ProcessStatus {
    const total = os.totalmem();
    const free = os.freemem();
    const mem = process.memoryUsage();

    const status: ProcessStatus = {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: os.cpus().length,
      loadAvg: os.loadavg() as [number, number, number],
      memory: {
        totalBytes: total,
        freeBytes: free,
        usedBytes: total - free,
        processRssBytes: mem.rss,
        processHeapUsedBytes: mem.heapUsed,
      },
      timestamp: new Date().toISOString(),
    };

    log.debug('process.status', { pid: status.pid, uptime: status.uptimeSeconds });
    return status;
  }
}

export const processInspector = new ProcessInspector();
