import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useFactory } from '../store/FactoryContext';
import { api } from '../services/api';
import { SectionHeader } from '../components/SectionHeader';
import { PillBadge } from '../components/PillBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import { theme } from '../theme';
import type { Agent as AgentType } from '../types';

const STATUS_ORDER = ['busy', 'idle', 'paused', 'offline'] as const;

const STATUS_VARIANT: Record<string, string> = {
  busy: theme.success,
  idle: theme.textMuted,
  paused: theme.accent,
  offline: theme.danger,
};

export function AgentSwarm() {
  const { agents, activeProjectId, loadAgents } = useFactory();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | 'all'>('all');
  const [selected, setSelected] = useState<AgentType | null>(null);
  const [confirm, setConfirm] = useState<{ action: string; agent: AgentType } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAgents();
    setRefreshing(false);
  }, [loadAgents]);

  const filtered = agents.filter((a) => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.role.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: filtered.filter((a) => a.status === s),
  })).filter((g) => g.items.length > 0);

  const handleAction = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === 'pause') await api.pauseAgent(confirm.agent.id);
      else await api.resumeAgent(confirm.agent.id);
      await loadAgents();
    } catch {
      // silent
    }
    setBusy(false);
    setConfirm(null);
  };

  if (selected) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={styles.backLink}>← Back to swarm</Text>
        </Pressable>
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailName}>{selected.name}</Text>
            <PillBadge label={selected.status} color={STATUS_VARIANT[selected.status] ?? theme.textMuted} />
          </View>
          <View style={styles.detailMeta}>
            <PillBadge label={selected.role.replace('_', ' ')} color={theme.accent} />
            <Text style={styles.detailText}>Skills: {selected.skills.join(', ') || 'none'}</Text>
          </View>
          <Text style={styles.detailLabel}>Persona</Text>
          <Text style={styles.detailBody}>{selected.persona}</Text>
          {selected.currentTaskId ? (
            <>
              <Text style={styles.detailLabel}>Current Task</Text>
              <Text style={styles.detailBodyMono}>{selected.currentTaskId}</Text>
            </>
          ) : null}
          <Text style={styles.detailLabel}>Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}><Text style={styles.statValue}>{selected.stats.tasksCompleted}</Text><Text style={styles.statLabel}>Completed</Text></View>
            <View style={styles.statBox}><Text style={styles.statValue}>{selected.stats.tasksFailed}</Text><Text style={styles.statLabel}>Failed</Text></View>
            <View style={styles.statBox}><Text style={styles.statValue}>{(selected.stats.avgTaskDurationMs / 1000).toFixed(1)}s</Text><Text style={styles.statLabel}>Avg Time</Text></View>
          </View>
        </View>
        <View style={styles.actionRow}>
          {selected.status === 'paused' ? (
            <Pressable style={({ hovered }: any) => [styles.actionBtn, hovered && styles.actionBtnHover]} onPress={() => setConfirm({ action: 'resume', agent: selected })}>
              <Text style={styles.actionBtnText}>Resume</Text>
            </Pressable>
          ) : (
            <Pressable style={({ hovered }: any) => [styles.actionBtn, hovered && styles.actionBtnHover]} onPress={() => setConfirm({ action: 'pause', agent: selected })}>
              <Text style={styles.actionBtnText}>Pause</Text>
            </Pressable>
          )}
        </View>
        <ConfirmModal
          visible={!!confirm}
          title={`Confirm ${confirm?.action ?? ''}`}
          message={`Are you sure you want to ${confirm?.action} agent ${confirm?.agent.name}?`}
          confirmLabel={confirm?.action ? confirm.action.charAt(0).toUpperCase() + confirm.action.slice(1) : ''}
          destructive={confirm?.action === 'pause'}
          onConfirm={handleAction}
          onCancel={() => setConfirm(null)}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search agents..." style={styles.searchInput} placeholderTextColor={theme.textMuted} />
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
        <View style={styles.filterRow}>
          <Pressable onPress={() => setFilterStatus('all')} style={({ hovered }: any) => [styles.filterPill, filterStatus === 'all' && styles.filterPillActive, hovered && filterStatus !== 'all' && styles.filterPillHover]}>
            <Text style={[styles.filterText, filterStatus === 'all' && styles.filterTextActive]}>All</Text>
          </Pressable>
          {STATUS_ORDER.map((s) => (
            <Pressable key={s} onPress={() => setFilterStatus(s)} style={({ hovered }: any) => [styles.filterPill, filterStatus === s && styles.filterPillActive, hovered && filterStatus !== s && styles.filterPillHover]}>
              <Text style={[styles.filterText, filterStatus === s && styles.filterTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>
        {grouped.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>No agents match your filters.</Text></View>
        ) : (
          grouped.map((group) => (
            <View key={group.status}>
              <SectionHeader title={group.status.charAt(0).toUpperCase() + group.status.slice(1)} />
              {group.items.map((agent) => (
                <Pressable key={agent.id} onPress={() => setSelected(agent)} style={({ hovered }: any) => [styles.agentCard, hovered && styles.agentCardHover]}>
                  <View style={styles.agentHeader}>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    <PillBadge label={agent.status} color={STATUS_VARIANT[agent.status] ?? theme.textMuted} />
                  </View>
                  <Text style={styles.agentRole}>{agent.role.replace('_', ' ')}</Text>
                  <Text style={styles.agentTask} numberOfLines={1}>{agent.currentTaskId ? `Task: ${agent.currentTaskId}` : 'No active task'}</Text>
                </Pressable>
              ))}
            </View>
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
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  filterPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  filterPillActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  filterPillHover: { backgroundColor: theme.surface2 },
  filterText: { fontSize: 12, fontWeight: '500', color: theme.textSecondary, textTransform: 'capitalize' },
  filterTextActive: { color: '#FFFFFF' },
  agentCard: { padding: 12, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 6 },
  agentCardHover: { backgroundColor: theme.surface2 },
  agentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  agentName: { fontSize: 14, fontWeight: '500', color: theme.text },
  agentRole: { fontSize: 12, color: theme.textMuted, textTransform: 'capitalize' },
  agentTask: { fontSize: 11, color: theme.textMuted, marginTop: 3, fontFamily: 'monospace' },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: theme.textMuted },
  backLink: { fontSize: 13, color: theme.accent, fontWeight: '500', marginBottom: 14 },
  detailCard: { padding: 16, borderRadius: theme.radiusLg, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 14 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  detailName: { fontSize: 16, fontWeight: '600', color: theme.text },
  detailMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  detailText: { fontSize: 12, color: theme.textSecondary },
  detailLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 3 },
  detailBody: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  detailBodyMono: { fontSize: 13, color: theme.text, fontFamily: 'monospace' },
  statsGrid: { flexDirection: 'row', gap: 8, marginTop: 6 },
  statBox: { flex: 1, padding: 10, borderRadius: theme.radius, backgroundColor: theme.surface2, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700', color: theme.text },
  statLabel: { fontSize: 10, color: theme.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, height: 44, borderRadius: theme.radius, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  actionBtnHover: { backgroundColor: theme.accentHover },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
});
