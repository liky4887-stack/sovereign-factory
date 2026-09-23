import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useFactory } from '../store/FactoryContext';
import { SectionHeader } from '../components/SectionHeader';
import { StatusIndicator } from '../components/StatusIndicator';
import { PillBadge } from '../components/PillBadge';
import { theme } from '../theme';
import type { Project } from '../types';

const STATUS_MAP: Record<string, string> = {
  active: 'connected',
  idle: 'idle',
  error: 'offline',
  archived: 'idle',
};

export function GodView() {
  const { projects, activeProjectId, setActiveProject, refreshAll } = useFactory();
  const [refreshing, setRefreshing] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

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
      <Text style={styles.title}>God View</Text>
      <Text style={styles.subtitle}>Select and manage active factory projects</Text>

      {activeProject ? (
        <View style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <Text style={styles.activeName}>{activeProject.name}</Text>
            <StatusIndicator status={activeProject.archived ? 'idle' : 'connected'} label={activeProject.archived ? 'Archived' : 'Active'} />
          </View>
          <Text style={styles.activeDesc}>{activeProject.description}</Text>
          <View style={styles.badgeRow}>
            <PillBadge label={`${activeProject.metrics.goalCount} goals`} color={theme.accent} />
            <PillBadge label={`${activeProject.metrics.openTaskCount} open`} color={theme.warning} />
            <PillBadge label={`${activeProject.metrics.activeAgentCount} agents`} color={theme.success} />
          </View>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No project selected.</Text>
        </View>
      )}

      <SectionHeader title={`All Projects (${projects.length})`} />
      {projects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No projects available.</Text>
        </View>
      ) : (
        projects.map((p: Project) => {
          const isActive = p.id === activeProjectId;
          return (
            <Pressable
              key={p.id}
              onPress={() => setActiveProject(p.id)}
              style={({ hovered }: any) => [styles.projectCard, isActive && styles.projectCardActive, hovered && !isActive && styles.projectCardHover]}
            >
              <View style={styles.projectHeader}>
                <Text style={styles.projectName}>{p.name}</Text>
                <StatusIndicator status={STATUS_MAP[p.archived ? 'archived' : 'active'] ?? 'idle'} />
              </View>
              <Text style={styles.projectDesc}>{p.description}</Text>
              <View style={styles.projectMeta}>
                <Text style={styles.metaText}>{p.metrics.goalCount} goals</Text>
                <Text style={styles.metaText}>{p.metrics.openTaskCount} tasks</Text>
                <Text style={styles.metaText}>{p.metrics.activeAgentCount} agents</Text>
              </View>
            </Pressable>
          );
        })
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 13, color: theme.textMuted, marginTop: 2, marginBottom: 18 },
  activeCard: { padding: 16, borderRadius: theme.radiusLg, backgroundColor: theme.accentBg, borderWidth: 1, borderColor: theme.accent + '40', marginBottom: 18 },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  activeName: { fontSize: 15, fontWeight: '600', color: theme.text },
  activeDesc: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  empty: { padding: 16, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  emptyText: { fontSize: 13, color: theme.textMuted },
  projectCard: { padding: 14, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 8 },
  projectCardActive: { borderColor: theme.accent, backgroundColor: theme.accentBg },
  projectCardHover: { backgroundColor: theme.surface2 },
  projectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  projectName: { fontSize: 14, fontWeight: '500', color: theme.text },
  projectDesc: { fontSize: 12, color: theme.textSecondary, marginBottom: 6 },
  projectMeta: { flexDirection: 'row', gap: 12 },
  metaText: { fontSize: 11, color: theme.textMuted, fontFamily: 'monospace' },
});
