import { truthLedger } from './truthLedger';

export interface AuditResult {
  passed: boolean;
  confidence: number;
  conflicts: string[];
  auditedAt: number;
}

class AntiHallucinationFirewall {
  async audit(claim: string, context: string[]): Promise<AuditResult> {
    const entries = await truthLedger.search(claim.split(' ').slice(0, 5).join(' '));
    const conflicts: string[] = [];
    for (const entry of entries) {
      if (entry.type === 'pivot' &&
          context.some((c) => c.toLowerCase().includes(entry.tags[0]?.toLowerCase() ?? ''))) {
        conflicts.push(`Potential conflict with ledger entry: ${entry.title}`);
      }
    }
    const confidence = conflicts.length === 0 ? 0.95 : 0.6;
    return { passed: conflicts.length === 0, confidence, conflicts, auditedAt: Date.now() };
  }

  async silentAudit(output: string): Promise<AuditResult> {
    const entries = await truthLedger.load();
    const keywords = output.toLowerCase().split(/\s+/).filter((w) => w.length > 6);
    const conflicts: string[] = [];
    for (const entry of entries) {
      const entryText = `${entry.title} ${entry.content}`.toLowerCase();
      const overlap = keywords.filter((k) => entryText.includes(k)).length;
      if (overlap > 5 && entry.type === 'pivot') conflicts.push(entry.title);
    }
    return {
      passed: conflicts.length === 0,
      confidence: conflicts.length === 0 ? 0.92 : 0.55,
      conflicts,
      auditedAt: Date.now(),
    };
  }
}

export const antiHallucination = new AntiHallucinationFirewall();
