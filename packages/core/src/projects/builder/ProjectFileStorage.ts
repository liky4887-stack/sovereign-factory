import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../../config';
import { log } from '../../shared/logger';

export interface StoredFile {
  path: string;
  bytes: number;
}

export class ProjectFileStorage {
  constructor(private readonly rootDir: string) {}

  projectDir(projectId: string): string {
    const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.rootDir, safe);
  }

  /** Reject paths that escape the project folder. */
  private resolveSafe(projectId: string, relPath: string): string {
    if (!relPath || typeof relPath !== 'string') {
      throw new Error('file path is required');
    }
    const cleaned = relPath.replace(/^\/+/, '');
    if (cleaned.includes('..')) throw new Error('path traversal not allowed');
    const base = this.projectDir(projectId);
    const target = path.resolve(base, cleaned);
    if (!target.startsWith(base + path.sep) && target !== base) {
      throw new Error('path escapes project folder');
    }
    return target;
  }

  /** Wipe a project's folder before a fresh build. */
  clearProject(projectId: string): void {
    const dir = this.projectDir(projectId);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(dir, { recursive: true });
  }

  writeFile(projectId: string, relPath: string, content: string): StoredFile {
    const target = this.resolveSafe(projectId, relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { encoding: 'utf8' });
    const bytes = Buffer.byteLength(content, 'utf8');
    log.info('project.file.written', { projectId, path: relPath, bytes });
    return { path: relPath, bytes };
  }

  listFiles(projectId: string): StoredFile[] {
    const base = this.projectDir(projectId);
    const out: StoredFile[] = [];
    if (!fs.existsSync(base)) return out;

    const walk = (dir: string, prefix: string) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const rel = prefix ? prefix + '/' + name : name;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, rel);
        else if (stat.isFile()) out.push({ path: rel, bytes: stat.size });
      }
    };
    walk(base, '');
    return out;
  }

  readFile(projectId: string, relPath: string): string {
    const target = this.resolveSafe(projectId, relPath);
    return fs.readFileSync(target, 'utf8');
  }

  exists(projectId: string): boolean {
    return fs.existsSync(this.projectDir(projectId));
  }

  hasIndex(projectId: string): boolean {
    return fs.existsSync(path.join(this.projectDir(projectId), 'index.html'));
  }

  getRootDir(): string {
    return this.rootDir;
  }
}
