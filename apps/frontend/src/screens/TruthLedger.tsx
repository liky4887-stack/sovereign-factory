import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useFactory } from '../store/FactoryContext';
import { SectionHeader } from '../components/SectionHeader';
import { PillBadge } from '../components/PillBadge';
import { theme } from '../theme';
import type { LedgerEntry, LedgerKind } from '../types';

const KIND_COLORS: Record<string, string> = {
  decision: theme.accent,
  schema_change: '#8B5CF6',
  prompt_change: '#8B5CF6',
  deploy: '#3B82F6',
  bug: theme.danger,
  pivot: theme.warning,
  omega_action: theme.danger,
  compliance_review: '#8B5CF6',
  skill_install: theme.success,
  skill_remove: theme.warning,
  agent_action: theme.success,
};

const ALL_KINDS: (LedgerKind | 'all')[] = [
  'all', 'decision', 'schema_change', 'prompt_change', 'deploy',
  'bug', 'pivot', 'omega_action', 'compliance_review',
  'skill_install', 'skill_remove', 'agent_action',
];

export function TruthLedger() {
  const { ledger, activeProjectId, loadLedger } = useFactory();
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<LedgerKind | 'all'>('all');
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLedger(activeProjectId ?? undefined);
    setRefreshing(false);
  }, [loadLedger, activeProjectId]);

  const filtered = ledger.filter((e) => {
    if (filterKind !== 'all' && e.kind !== filterKind) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.body.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (selected) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={styles.backLink}>← Back to ledger</Text>
        </Pressable>
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <PillBadge label={selected.kind.replace('_', ' ')} color={KIND_COLORS[selected.kind] ?? theme.textMuted} />
            <Text style={styles.detailTime}>{new Date(selected.createdAt).toLocaleString()}</Text>
          </View>
          <Text style={styles.detailTitle}>{selected.title}</Text>
          <Text style={styles.detailBody}>{selected.body}</Text>
          <View style={styles.metaGrid}>
            <View style={styles.metaBox}><Text style={styles.metaLabel}>Source</Text><Text style={styles.metaValue}>{selected.agentId ?? 'system'}</Text></View>
            <View style={styles.metaBox}><Text style={styles.metaLabel}>Project</Text><Text style={styles.metaValue}>{selected.projectId ?? 'global'}</Text></View>
            <View style={styles.metaBox}><Text style={styles.metaLabel}>Refs</Text><Text style={styles.metaValue}>{selected.refs.length}</Text></View>
            <View style={styles.metaBox}><Text style={styles.metaLabel}>Tags</Text><Text style={styles.metaValue}>{selected.tags.length}</Text></View>
          </View>
          {selected.refs.length > 0 ? (
            <><Text style={styles.refsLabel}>References</Text>{selected.refs.map((ref, i) => (<Text key={i} style={styles.refItem}>{ref}</Text>))}</>
          ) : null}
          {selected.tags.length > 0 ? (
            <><Text style={styles.refsLabel}>Tags</Text><View style={styles.tagRow}>{selected.tags.map((tag) => (<PillBadge key={tag} label={tag} color={theme.textMuted} />))}</View></>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search ledger entries..." style={styles.searchInput} placeholderTextColor={theme.textMuted} />
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterRow}>
            {ALL_KINDS.map((k) => (
              <Pressable key={k} onPress={() => setFilterKind(k)} style={({ hovered }: any) => [styles.filterPill, filterKind === k && styles.filterPillActive, hovered && filterKind !== k && styles.filterPillHover]}>
                <Text style={[styles.filterText, filterKind === k && styles.filterTextActive]}>{k === 'all' ? 'All' : k.replace('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        {filtered.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>No ledger entries match your filters.</Text></View>
        ) : (
          filtered.map((entry) => (
            <Pressable key={entry.id} onPress={() => setSelected(entry)} style={({ hovered }: any) => [styles.entryCard, hovered && styles.entryCardHover]}>
              <View style={styles.entryHeader}>
                <PillBadge label={entry.kind.replace('_', ' ')} color={KIND_COLORS[entry.kind] ?? theme.textMuted} />
                <Text style={styles.entryTime}>{new Date(entry.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.entryTitle}>{entry.title}</Text>
              <Text style={styles.entryBody} numberOfLines={2}>{entry.body}</Text>
            </Pressable>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  searchContainer: { padding: 16, paddingBottom: 0 },
  searchInput: { height: 40, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, fontSize: 13, color: theme.text },
  filterScroll: { marginBottom: 8, maxHeight: 50 },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  filterPillActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  filterPillHover: { backgroundColor: theme.surface2 },
  filterText: { fontSize: 12, fontWeight: '500', color: theme.textSecondary },
  filterTextActive: { color: '#FFFFFF' },
  entryCard: { padding: 12, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 6 },
  entryCardHover: { backgroundColor: theme.surface2 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  entryTime: { fontSize: 11, color: theme.textMuted, fontFamily: 'monospace' },
  entryTitle: { fontSize: 13, fontWeight: '500', color: theme.text },
  entryBody: { fontSize: 12, color: theme.textSecondary, marginTop: 3 },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: theme.textMuted },
  backLink: { fontSize: 13, color: theme.accent, fontWeight: '500', marginBottom: 14 },
  detailCard: { padding: 16, borderRadius: theme.radiusLg, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 14 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  detailTime: { fontSize: 12, color: theme.textMuted, fontFamily: 'monospace' },
  detailTitle: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 6 },
  detailBody: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  metaBox: { flex: 1, minWidth: 130, padding: 10, borderRadius: theme.radius, backgroundColor: theme.surface2 },
  metaLabel: { fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 13, fontWeight: '500', color: theme.text, marginTop: 2, fontFamily: 'monospace' },
  refsLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 5 },
  refItem: { fontSize: 12, color: theme.textSecondary, fontFamily: 'monospace', marginBottom: 2 },
  tagRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
});
