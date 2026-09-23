// app/index.tsx
// Dashboard. Active Mission, Today's Focus, Alerts & Risks, Quick Actions.
// The CEO chat now lives at /chat.

import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { useFactoryStore } from '@/store/useFactoryStore';
import { useGhostStore } from '@/store/useGhostStore';
import type { Task } from '@shared/factory';

const QUICK_ACTIONS: { label: string; route: string }[] = [
  { label: 'Missions', route: '/missions' },
  { label: 'Agents', route: '/agents' },
  { label: 'Tools', route: '/tools' },
  { label: 'Offers', route: '/offers' },
  { label: 'Chat', route: '/chat' },
  { label: 'Sessions', route: '/sessions' },
  { label: 'IDE', route: '/ide' },
  { label: 'Console', route: '/console' },
];

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const session = useGhostStore((s) => s.session);
  const projects = useFactoryStore((s) => s.projects);
  const tasks = useFactoryStore((s) => s.tasks);
  const loadProjects = useFactoryStore((s) => s.loadProjects);
  const loadAgents = useFactoryStore((s) => s.loadAgents);
  const loadTasks = useFactoryStore((s) => s.loadTasks);

  useEffect(() => {
    loadProjects();
    loadAgents();
  }, []);

  useEffect(() => {
    for (const p of projects) {
      if (!tasks[p.id]) loadTasks(p.id);
    }
  }, [projects]);

  const activeMission = useMemo(
    () =>
      [...projects].sort((a, b) => b.metrics.lastActivityAt.localeCompare(a.metrics.lastActivityAt))[0],
    [projects]
  );

  const allTasks: Task[] = useMemo(() => Object.values(tasks).flat(), [tasks]);

  const focus = useMemo(
    () =>
      allTasks
        .filter((t) => t.status === 'in_progress' || t.status === 'ready')
        .slice(0, 3),
    [allTasks]
  );

  const alerts = useMemo(
    () => allTasks.filter((t) => t.status === 'blocked' || t.status === 'failed'),
    [allTasks]
  );

  const projectNameFor = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name ?? 'Unknown';

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.display}>Ghost Mode</Text>
          <Text style={styles.caption}>
            {session ? `Signed in as ${session.user.name}` : 'Orchestrating swarm…'}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/settings' as any)} style={styles.avatar}>
          <Text style={styles.avatarText}>GM</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>Active Mission</Text>
        {activeMission ? (
          <Pressable
            onPress={() => router.push((`/missions/${activeMission.id}`) as any)}
            style={({ pressed }) => [styles.missionCard, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.missionName} numberOfLines={1}>{activeMission.name}</Text>
            <Text style={styles.missionDesc} numberOfLines={2}>
              {activeMission.description}
            </Text>
            <View style={styles.missionMeta}>
              <Text style={styles.metaText}>{activeMission.metrics.openTaskCount} open</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{activeMission.metrics.activeAgentCount} agents</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{activeMission.metrics.goalCount} goals</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No active missions. Direct the swarm from Chat.
            </Text>
          </View>
        )}

        <Text style={styles.sectionHeader}>Today's Focus</Text>
        {focus.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nothing in progress.</Text>
          </View>
        ) : (
          focus.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => router.push((`/missions/${t.projectId}`) as any)}
              style={({ pressed }) => [styles.taskRow, pressed && { opacity: 0.9 }]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      t.status === 'in_progress'
                        ? GhostMode.colors.warning
                        : GhostMode.colors.accent,
                  },
                ]}
              />
              <View style={styles.taskBody}>
                <Text style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.taskMeta} numberOfLines={1}>
                  {projectNameFor(t.projectId)} · {t.priority}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionHeader}>Alerts & Risks</Text>
        {alerts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No blockers. Clean run.</Text>
          </View>
        ) : (
          alerts.slice(0, 5).map((t) => (
            <Pressable
              key={t.id}
              onPress={() => router.push((`/missions/${t.projectId}`) as any)}
              style={({ pressed }) => [styles.taskRow, pressed && { opacity: 0.9 }]}
            >
              <View style={[styles.statusDot, { backgroundColor: GhostMode.colors.danger }]} />
              <View style={styles.taskBody}>
                <Text style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.taskMeta} numberOfLines={1}>
                  {projectNameFor(t.projectId)} · {t.status}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.route}
              onPress={() => router.push(a.route as any)}
              style={({ pressed }) => [styles.actionChip, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: GhostMode.colors.background,
    paddingHorizontal: GhostMode.space.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: GhostMode.space.xl,
  },
  display: { ...GhostMode.typography.display, color: GhostMode.colors.text },
  caption: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textSecondary,
    marginTop: GhostMode.space.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    ...GhostMode.shadow.soft,
  },
  avatarText: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.accent,
    fontWeight: '700',
  },
  content: { gap: GhostMode.space.md, paddingBottom: GhostMode.space.xxxl },
  sectionHeader: {
    ...GhostMode.typography.heading,
    color: GhostMode.colors.text,
    marginTop: GhostMode.space.md,
  },
  missionCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  missionName: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  missionDesc: { ...GhostMode.typography.body, color: GhostMode.colors.textSecondary },
  missionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GhostMode.space.xs,
    marginTop: GhostMode.space.xs,
  },
  metaText: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  metaDot: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  emptyCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
  },
  emptyText: { ...GhostMode.typography.body, color: GhostMode.colors.textTertiary },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GhostMode.space.md,
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.lg,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    ...GhostMode.shadow.soft,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  taskBody: { flex: 1, gap: 2 },
  taskTitle: { ...GhostMode.typography.body, color: GhostMode.colors.text, fontWeight: '500' },
  taskMeta: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GhostMode.space.sm,
  },
  actionChip: {
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.sm,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    ...GhostMode.shadow.soft,
  },
  actionText: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.text,
    fontWeight: '500',
  },
});
