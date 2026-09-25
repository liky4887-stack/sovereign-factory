import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../shared/logger';

export interface Skill {
  id: string;
  label: string;
  description: string;
  content: string;
  source: string;
}

export interface SkillLoaderOptions {
  repos: string[];
  branch: string;
  token?: string;
  cacheFile: string;
  cacheTtlMs: number;
  maxTotalBytes: number;
  localDir?: string;
}

export class SkillLoader {
  private skills: Skill[] = [];
  private loadedAt = 0;
  private loading: Promise<Skill[]> | null = null;
  private lastError: string | null = null;

  constructor(private readonly opts: SkillLoaderOptions) {}

  isConfigured(): boolean {
    return Array.isArray(this.opts.repos) && this.opts.repos.length > 0;
  }

  getCached(): Skill[] { return this.skills; }
  getLastError(): string | null { return this.lastError; }
  getLoadedAt(): number { return this.loadedAt; }

  async load(force = false): Promise<Skill[]> {
    if (!this.isConfigured()) return [];
    const fresh = this.skills.length > 0 && Date.now() - this.loadedAt < this.opts.cacheTtlMs;
    if (!force && fresh) return this.skills;
    if (this.loading) return this.loading;
    this.loading = this.doLoad().finally(() => { this.loading = null; });
    return this.loading;
  }

  private parseRepo(input: string): { owner: string; name: string } | null {
    const t = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
    if (/^[^/\s]+\/[^/\s]+$/.test(t)) {
      const parts = t.split('/');
      return { owner: parts[0], name: parts[1] };
    }
    const m = t.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
    if (m) return { owner: m[1], name: m[2] };
    return null;
  }

  private async doLoad(): Promise<Skill[]> {
    const collected: Skill[] = [];
    const seen = new Set<string>();
    let total = 0;

    // ─── Local folder first ───────────────────────────────
    if (this.opts.localDir) {
      try {
        const localSkills = this.loadLocal(this.opts.localDir);
        for (const skill of localSkills) {
          if (seen.has(skill.id)) continue;
          seen.add(skill.id);
          collected.push(skill);
          total += skill.content.length;
        }
        log.info('skills.local.loaded', { count: localSkills.length, dir: this.opts.localDir });
      } catch (e) {
        log.warn('skills.local.error', {
          dir: this.opts.localDir,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // If a local folder exists and produced skills, skip remote repos.
    // Set SKILLS_INCLUDE_REMOTE=1 to merge both.
    const includeRemote = process.env.SKILLS_INCLUDE_REMOTE === '1';
    const repos = (this.opts.localDir && collected.length > 0 && !includeRemote)
      ? []
      : this.opts.repos.filter(Boolean);

    if (repos.length === 0 && collected.length === 0) {
      this.lastError = 'no repos or local dir configured';
      return this.skills;
    }

    const headers: Record<string, string> = {
      'user-agent': 'sovereign-skills',
      'accept': 'application/vnd.github+json',
    };
    if (this.opts.token) headers['authorization'] = 'token ' + this.opts.token;

    for (const repo of repos) {
      if (total >= this.opts.maxTotalBytes) break;
      const parsed = this.parseRepo(repo);
      if (!parsed) {
        log.warn('skills.repo.unparsed', { repo });
        continue;
      }

      const treeUrl = 'https://api.github.com/repos/' + parsed.owner + '/' + parsed.name +
        '/git/trees/' + encodeURIComponent(this.opts.branch) + '?recursive=1';

      let tree: any;
      try {
        const r = await fetch(treeUrl, { headers });
        if (!r.ok) {
          log.warn('skills.tree.http', { repo, status: r.status });
          continue;
        }
        tree = await r.json();
      } catch (e) {
        log.warn('skills.tree.error', {
          repo,
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }

      const NOISE = /(^|\/)(changelog|code[_-]?of[_-]?conduct|contributing|license|security|readme|installation|install|publish|store|conventions|authoring|pipeline|skill[_-]?pipeline|claude\.md|gemini|faq|roadmap|acknowledg)/i;
      const blobs = (tree.tree || []).filter((n: any) =>
        n.type === 'blob' &&
        /\.(md|markdown)$/i.test(n.path) &&
        !n.path.startsWith('.') &&
        !NOISE.test(n.path)
      );

      const base = 'https://raw.githubusercontent.com/' + parsed.owner + '/' +
        parsed.name + '/' + this.opts.branch + '/';

      for (const b of blobs) {
        if (total >= this.opts.maxTotalBytes) break;
        try {
          const r = await fetch(base + b.path);
          if (!r.ok) continue;
          const text = await r.text();
          if (!text) continue;
          total += text.length;
          const skill = this.parseFile(b.path, text, parsed.name);
          if (!skill || seen.has(skill.id)) continue;
          seen.add(skill.id);
          collected.push(skill);
        } catch {}
      }
    }

    if (collected.length > 0) {
      this.skills = collected;
      this.loadedAt = Date.now();
      this.lastError = null;
      try {
        fs.mkdirSync(path.dirname(this.opts.cacheFile), { recursive: true });
        fs.writeFileSync(
          this.opts.cacheFile,
          JSON.stringify({ loadedAt: this.loadedAt, skills: collected }),
        );
      } catch {}
      log.info('skills.load.done', {
        count: collected.length,
        bytes: total,
        repos: repos.length,
      });
    } else {
      this.tryDiskCache();
    }
    return this.skills;
  }

  private tryDiskCache(): void {
    try {
      const raw = fs.readFileSync(this.opts.cacheFile, 'utf8');
      const j = JSON.parse(raw);
      if (j && Array.isArray(j.skills)) {
        this.skills = j.skills;
        this.loadedAt = j.loadedAt || 0;
        log.info('skills.load.from_disk', { count: this.skills.length });
      }
    } catch {}
  }

  private parseFile(relPath: string, raw: string, repoPrefix?: string): Skill | null {
    // When the filename is generic (SKILL.md, README.md), use the parent
    // folder name instead so each skill gets a distinct id.
    const fileName = path.basename(relPath).replace(/\.[^.]+$/, '').toLowerCase();
    const parent = path.basename(path.dirname(relPath)).toLowerCase();
    const isGeneric = /^(skill|readme|index)$/.test(fileName);
    const rawBase = (isGeneric && parent && parent !== '.') ? parent : fileName;
    const base = rawBase.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    const id = repoPrefix ? (repoPrefix + '-' + base) : base;
    if (!id || id === '-') return null;

    let title = '';
    let description = '';
    let body = raw;

    const fm = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (fm) {
      body = raw.slice(fm[0].length);
      for (const line of fm[1].split('\n')) {
        const t = line.match(/^\s*(?:title|name)\s*:\s*(.+)$/i);
        if (t) title = t[1].trim().replace(/^["']|["']$/g, '');
        const d = line.match(/^\s*(?:description|summary)\s*:\s*(.+)$/i);
        if (d) description = d[1].trim().replace(/^["']|["']$/g, '');
      }
    }

    if (!title) {
      const h = body.match(/^#\s+(.+)$/m);
      if (h) title = h[1].trim();
    }
    if (!title) title = id;

    if (!description) {
      const lines = body.split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l !== '---');
      if (lines[0]) description = lines[0].slice(0, 160);
    }

    return { id, label: title, description, content: body.trim(), source: relPath };
  }

  private loadLocal(dir: string): Skill[] {
    const out: Skill[] = [];
    if (!fs.existsSync(dir)) return out;
    const walk = (current: string) => {
      let names: string[];
      try { names = fs.readdirSync(current); } catch { return; }
      for (const name of names) {
        if (name.startsWith('.')) continue;
        const full = path.join(current, name);
        let stat: fs.Stats;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile() && /\.(md|markdown)$/i.test(name)) {
          try {
            const raw = fs.readFileSync(full, 'utf8');
            const rel = path.relative(dir, full);
            const skill = this.parseFile(rel, raw, 'local');
            if (skill) out.push(skill);
          } catch {}
        }
      }
    };
    walk(dir);
    return out;
  }

  /**
   * Fetch a markdown skill from a public URL, save it to
   * <localDir>/<slug>/SKILL.md, and reload. Returns the new skill.
   */
  async importFromUrl(url: string): Promise<Skill> {
    if (!this.opts.localDir) throw new Error('SKILLS_LOCAL_DIR not configured');

    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('invalid URL'); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('only http(s) URLs are allowed');

    // Convert github blob links to raw.
    let fetchUrl = url;
    const gh = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (gh) {
      fetchUrl = 'https://raw.githubusercontent.com/' + gh[1] + '/' + gh[2] + '/' + gh[3] + '/' + gh[4];
    }

    const r = await fetch(fetchUrl, {
      headers: { 'user-agent': 'sovereign-skills', 'accept': 'text/*' },
    });
    if (!r.ok) throw new Error('fetch failed HTTP ' + r.status);
    const text = await r.text();
    if (!text || text.length < 20) throw new Error('empty or too-short response');

    // Derive a slug from the last path segment or frontmatter title.
    let slug = '';
    const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (fm) {
      const titleMatch = fm[1].match(/^\s*title\s*:\s*(.+)$/im);
      if (titleMatch) {
        slug = titleMatch[1].trim().replace(/^["']|["']$/g, '').toLowerCase()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
      }
    }
    if (!slug) {
      const segs = parsed.pathname.split('/').filter(Boolean);
      const last = segs[segs.length - 1] || 'skill';
      slug = last.replace(/\.[^.]+$/, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'skill';
    }

    const dir = path.join(this.opts.localDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), text, 'utf8');
    log.info('skills.imported', { url, fetchUrl, slug, bytes: text.length });

    // Reload to include the new skill.
    await this.load(true);

    const found = this.skills.find((sk) => sk.id === 'local-' + slug);
    if (!found) throw new Error('imported but not parseable — check frontmatter');
    return found;
  }
}
