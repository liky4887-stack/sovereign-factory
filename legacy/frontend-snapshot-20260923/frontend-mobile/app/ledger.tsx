// app/ledger.tsx
// Truth Ledger. Two tabs:
//   Audit     — sovereign-core's hash-chained audit trail (live)
//   Decisions — CEO's curated decisions (local AsyncStorage)

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { truthLedger as truthLedgerService, type LedgerEntry as DecisionEntry } from '@/services/truthLedger';
import { sovereign, type LedgerEntry as AuditEntry } from '@/services/sovereign';

type Tab = 'audit' | 'decisions';

const DECISION_COLORS: Record<DecisionEntry['type'], string> = {
  decision: '#6366F1',
  bug: '#EF4444',
  pivot: '#F59E0B',
  architectural: '#10B981',
};

const AUDIT_COLORS: Record<string, string> = {
  COMMAND_EXECUTED: GhostMode.colors.accent,
  COMMAND_BLOCKED: GhostMode.colors.danger,
  POLICY_DENIED: GhostMode.colors.danger,
  ERROR: GhostMode.colors.danger,
  TASK_COMPLETED: GhostMode.colors.success,
  TASK_FAILED: GhostMode.colors.danger,
  SERVER_START: GhostMode.colors.success,
  SERVER_STOP: GhostMode.colors.textSecondary,
  FILE_READ: GhostMode.colors.textSecondary,
  FILE_WRITTEN: GhostMode.colors.accent,
  HEALTH_CHECK: GhostMode.colors.textTertiary,
};

export default function TruthLedgerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('audit');

  // Decisions tab
  const [decisions, setDecisions] = useState<DecisionEntry[]>([]);
  const [decisionQuery, setDecisionQuery] = useState('');

  // Audit tab
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    truthLedgerService.load().then(setDecisions);
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await sovereign.listLedger({ limit: 100 });
      setAudit(res.entries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setAuditError(msg);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'audit') loadAudit();
  }, [tab, loadAudit]);

  const handleDecisionSearch = async (text: string) => {
    setDecisionQuery(text);
    if (text.trim()) {
      const results = await truthLedgerService.search(text);
      setDecisions(results);
    } else {
      const all = await truthLedgerService.load();
      setDecisions(all);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Truth Ledger</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabRow}>
        {(['audit', 'decisions'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'audit' ? 'Audit' : 'Decisions'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'audit' && (
        <>
          {auditLoading && audit.length === 0 && (
            <View style={styles.center}><ActivityIndicator color={GhostMode.colors.accent} /></View>
          )}

          {auditError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Unreachable: {auditError}</Text>
              <Pressable onPress={loadAudit} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {!auditLoading && !auditError && audit.length === 0 && (
              <Text style={styles.empty}>No audit entries yet.</Text>
            )}

            {audit.map((e) => {
              const color = AUDIT_COLORS[e.type] ?? GhostMode.colors.textSecondary;
              const summary =
                typeof e.payload === 'object' && e.payload !== null && 'command' in e.payload
                  ? String((e.payload as { command: unknown }).command)
                  : typeof e.payload === 'object' && e.payload !== null && 'path' in e.payload
                  ? String((e.payload as { path: unknown }).path)
                  : typeof e.payload === 'object' && e.payload !== null && 'id' in e.payload
                  ? `id=${String((e.payload as { id: unknown }).id).slice(0, 12)}`
                  : '';
              return (
                <View key={e.id} style={styles.auditCard}>
                  <View style={styles.entryHeader}>
                    <View style={[styles.typeBadge, { backgroundColor: color + '20' }]}>
                      <Text style={[styles.typeText, { color }]}>{e.type}</Text>
                    </View>
                    <Text style={styles.entryTime}>
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.auditSource}>{e.source}</Text>
                  {summary.length > 0 && (
                    <Text style={styles.auditPayload} numberOfLines={2}>{summary}</Text>
                  )}
                  {e.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {e.tags.map((tag) => (
                        <View key={tag} style={styles.tag}>
                          <Text style={styles.tagText}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </>
      )}

      {tab === 'decisions' && (
        <>
          <TextInput
            value={decisionQuery}
            onChangeText={handleDecisionSearch}
            placeholder="Search decisions, bugs, pivots…"
            placeholderTextColor={GhostMode.colors.textTertiary}
            style={styles.searchInput}
          />

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {decisions.map((entry) => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: DECISION_COLORS[entry.type] + '20' }]}>
                    <Text style={[styles.typeText, { color: DECISION_COLORS[entry.type] }]}>
                      {entry.type.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.entryTime}>
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.entryTitle}>{entry.title}</Text>
                <Text style={styles.entryContent}>{entry.content}</Text>
                <View style={styles.tagRow}>
                  {entry.tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.entryAuthor}>— {entry.author}</Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GhostMode.colors.background,
    paddingHorizontal: GhostMode.space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: GhostMode.space.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...GhostMode.shadow.soft,
  },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  tabRow: {
    flexDirection: 'row',
    gap: GhostMode.space.sm,
    marginBottom: GhostMode.space.lg,
  },
  tab: {
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.sm,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
  },
  tabActive: {
    backgroundColor: GhostMode.colors.accent,
    borderColor: GhostMode.colors.accent,
  },
  tabText: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: { color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchInput: {
    height: 48,
    paddingHorizontal: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    ...GhostMode.typography.body,
    color: GhostMode.colors.text,
    marginBottom: GhostMode.space.lg,
    ...GhostMode.shadow.soft,
  },
  scrollContent: {
    paddingBottom: GhostMode.space.xxxl,
    gap: GhostMode.space.md,
  },

  // Audit card
  auditCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.lg,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.xs,
    ...GhostMode.shadow.soft,
  },
  auditSource: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textSecondary,
    fontFamily: 'Courier',
    fontSize: 12,
  },
  auditPayload: {
    ...GhostMode.typography.mono,
    color: GhostMode.colors.text,
    fontSize: 12,
  },

  // Decisions card
  entryCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.lg,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    ...GhostMode.shadow.soft,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: GhostMode.space.sm,
  },
  typeBadge: {
    paddingHorizontal: GhostMode.space.sm,
    paddingVertical: 2,
    borderRadius: GhostMode.radius.sm,
  },
  typeText: {
    ...GhostMode.typography.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  entryTime: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
  },
  entryTitle: {
    ...GhostMode.typography.heading,
    color: GhostMode.colors.text,
    marginBottom: GhostMode.space.xs,
  },
  entryContent: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.textSecondary,
    marginBottom: GhostMode.space.md,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GhostMode.space.xs,
  },
  tag: {
    paddingHorizontal: GhostMode.space.sm,
    paddingVertical: 2,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.ledgerTag,
  },
  tagText: {
    ...GhostMode.typography.caption,
    fontSize: 11,
    color: GhostMode.colors.textSecondary,
  },
  entryAuthor: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
    marginTop: GhostMode.space.sm,
    textAlign: 'right',
  },

  // Errors + empty
  errorBox: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    marginBottom: GhostMode.space.lg,
  },
  errorText: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.textSecondary,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.sm,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.accent,
  },
  retryText: {
    ...GhostMode.typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  empty: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.textTertiary,
    textAlign: 'center',
    marginTop: GhostMode.space.xl,
  },
});
