import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config';
import { PolicyError, NotFoundError, ValidationError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

function normalizeAllowed(p: string): string {
  return path.resolve(p);
}

function isPathAllowed(absPath: string): boolean {
  const target = path.resolve(absPath);
  return config.ALLOWED_PATHS.some((allowed) => {
    const root = normalizeAllowed(allowed);
    return target === root || target.startsWith(root + path.sep);
  });
}

export interface FileReadResult {
  path: string;
  size: number;
  content: string;
  encoding: 'utf8';
}

export interface FileWriteResult {
  path: string;
  bytesWritten: number;
}

export interface FileListEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  modifiedAt: string;
}

export interface FileListResult {
  path: string;
  entries: FileListEntry[];
}

export class FileOperator {
  private assertAllowed(inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new ValidationError('path is required');
    }
    const abs = path.resolve(inputPath);
    if (!isPathAllowed(abs)) {
      throw new PolicyError('path not in allowlist', {
        path: abs,
        allowed: config.ALLOWED_PATHS,
      });
    }
    return abs;
  }

  async read(inputPath: string): Promise<FileReadResult> {
    const abs = this.assertAllowed(inputPath);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(abs);
    } catch {
      throw new NotFoundError('file not found: ' + abs);
    }
    if (!stat.isFile()) {
      throw new ValidationError('not a regular file: ' + abs);
    }
    if (stat.size > 5 * 1024 * 1024) {
      throw new PolicyError('file exceeds 5MB read limit', { path: abs, size: stat.size });
    }
    const content = await fs.promises.readFile(abs, 'utf8');
    log.info('file.read', { path: abs, size: stat.size });
    return { path: abs, size: stat.size, content, encoding: 'utf8' };
  }

  async write(inputPath: string, content: string): Promise<FileWriteResult> {
    const abs = this.assertAllowed(inputPath);
    if (typeof content !== 'string') {
      throw new ValidationError('content must be a string');
    }
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, content, { encoding: 'utf8', mode: 0o600 });
    const stat = await fs.promises.stat(abs);
    log.info('file.write', { path: abs, bytesWritten: stat.size });
    return { path: abs, bytesWritten: stat.size };
  }

  async list(inputPath: string): Promise<FileListResult> {
    const abs = this.assertAllowed(inputPath);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(abs);
    } catch {
      throw new NotFoundError('directory not found: ' + abs);
    }
    if (!stat.isDirectory()) {
      throw new ValidationError('not a directory: ' + abs);
    }
    const names = await fs.promises.readdir(abs);
    const entries: FileListEntry[] = [];
    for (const name of names) {
      const full = path.join(abs, name);
      try {
        const s = await fs.promises.lstat(full);
        entries.push({
          name,
          path: full,
          type: s.isFile() ? 'file' : s.isDirectory() ? 'dir' : s.isSymbolicLink() ? 'symlink' : 'other',
          size: s.size,
          modifiedAt: s.mtime.toISOString(),
        });
      } catch {
        // skip unreadable entries
      }
    }
    log.info('file.list', { path: abs, count: entries.length });
    return { path: abs, entries };
  }
}

export const fileOperator = new FileOperator();
