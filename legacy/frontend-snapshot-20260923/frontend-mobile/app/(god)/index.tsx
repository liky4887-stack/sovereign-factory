import React, { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { useFactoryStore } from '@/store/useFactoryStore';

export default function GodView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const projects = useFactoryStore((s) => s.projects);
  const connected = useFactoryStore((s) => s.connected);
  const loadProjects = useFactoryStore((s) => s.loadProjects);
  const connect = useFactoryStore((s) => s.connect);
  const disconnect = useFactoryStore((s) => s.disconnect);
  const setActiveProject = useFactoryStore((s) => s.setActiveProject);

  useEffect(() => {
    loadProjects();
    connect();
    return () => disconnect();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>God View</Text>
        <View style={[styles.dot, { backgroundColor: connected ? GhostMode.colors.success : GhostMode.colors.danger }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {projects.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No factories yet</Text>
            <Text style={styles.emptyCaption}>Create your first project from the CEO dashboard.</Text>
          </View>
        )}

        {projects.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => { setActiveProject(p.id); router.push(`/god/${p.id}/board` as any); }}
            style={styles.projectCard}
          >
            <View style={styles.projectHeader}>
              <Text style={styles.projectName}>{p.name}</Text>
              <View style={styles.metricPill}>
                <Text style={styles.metricText}>{p.metrics.openTaskCount} open</Text>
              </View>
            </View>
            <Text style={styles.projectDesc} numberOfLines={2}>{p.description || 'No description'}</Text>
            <View style={styles.projectStats}>
              <Text style={styles.statLabel}>agents {p.metrics.activeAgentCount}</Text>
              <Text style={styles.statLabel}>goals {p.metrics.goalCount}</Text>
              <Text style={styles.statLabel}>ledger {p.metrics.ledgerEntryCount}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GhostMode.colors.background, paddingHorizontal: GhostMode.space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: GhostMode.space.xl },
  backButton: { width: 40, height: 40, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surface, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.soft },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text, flex: 1, marginLeft: GhostMode.space.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  scrollContent: { paddingBottom: GhostMode.space.xxxl, gap: GhostMode.space.md },
  emptyCard: { padding: GhostMode.space.xl, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surfaceSunken, alignItems: 'center' },
  emptyTitle: { ...GhostMode.typography.heading, color: GhostMode.colors.text },
  emptyCaption: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary, marginTop: GhostMode.space.xs },
  projectCard: { padding: GhostMode.space.lg, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, ...GhostMode.shadow.soft },
  projectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: GhostMode.space.xs },
  projectName: { ...GhostMode.typography.heading, color: GhostMode.colors.text },
  metricPill: { paddingHorizontal: GhostMode.space.sm, paddingVertical: 2, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.accentSoft },
  metricText: { ...GhostMode.typography.caption, fontSize: 11, color: GhostMode.colors.accent, fontWeight: '600' },
  projectDesc: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  projectStats: { flexDirection: 'row', gap: GhostMode.space.lg, marginTop: GhostMode.space.md },
  statLabel: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary, fontFamily: 'Courier', fontSize: 11 },
});
