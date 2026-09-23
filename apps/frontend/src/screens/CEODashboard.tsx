import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFactory } from '../store/FactoryContext';
import { StatCard } from '../components/StatCard';
import { SectionHeader } from '../components/SectionHeader';
import { StatusIndicator } from '../components/StatusIndicator';
import { IncidentRow } from '../components/IncidentRow';
import { theme } from '../theme';
import type { LedgerEntry } from '../types';

export function CEODashboard({ navigation }: { navigation: any }) {
  const { projects, activeProjectId, agents, ledger, loading, error, refreshAll } = useFactory();
  const [refreshing, setRefreshing] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const activeAgents = agents.filter((a) => a.status === 'busy' || a.status === 'idle');
  const recentIncidents = ledger.slice(0, 5);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>CEO Dashboard</Text>
          <Text style={styles.subtitle}>
            {activeProject ? activeProject.name : 'All projects'}
          </Text>
        </View>
        <StatusIndicator status={error ? 'disconnected' : 'connected'} label={error ? 'Offline' : 'Online'} />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Bridge: {error}</Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard label="Projects" value={projects.length} accent={theme.accent} />
        <StatCard label="Active Agents" value={activeAgents.length} accent={theme.success} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Ledger Entries" value={ledger.length} accent="#8B5CF6" />
        <StatCard label="Tasks" value={agents.filter((a) => a.currentTaskId).length} accent={theme.warning} />
      </View>

      <SectionHeader
        title="Recent Ledger"
        action={{ label: 'View all', onPress: () => navigation.navigate('ledger') }}
      />
      {recentIncidents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No ledger entries.</Text>
        </View>
      ) : (
        recentIncidents.map((entry: LedgerEntry) => (
          <IncidentRow
            key={entry.id}
            kind={entry.kind}
            title={entry.title}
            meta={entry.body.slice(0, 80)}
            timestamp={entry.createdAt}
          />
        ))
      )}

      <SectionHeader
        title="Agents"
        action={{ label: 'View swarm', onPress: () => navigation.navigate('swarm') }}
      />
      {agents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No agents detected.</Text>
        </View>
      ) : (
        agents.slice(0, 4).map((agent) => (
          <View key={agent.id} style={styles.agentRow}>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{agent.name}</Text>
              <Text style={styles.agentRole}>{agent.role.replace('_', ' ')}</Text>
            </View>
            <StatusIndicator status={agent.status} />
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  title: { fontSize: 18, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  errorBanner: { backgroundColor: theme.dangerBg, borderRadius: theme.radius, padding: 10, marginBottom: 14 },
  errorText: { fontSize: 13, color: theme.danger },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  empty: { padding: 16, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  emptyText: { fontSize: 13, color: theme.textMuted },
  agentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 6 },
  agentInfo: { flex: 1 },
  agentName: { fontSize: 13, fontWeight: '500', color: theme.text },
  agentRole: { fontSize: 12, color: theme.textMuted, marginTop: 2, textTransform: 'capitalize' },
});
