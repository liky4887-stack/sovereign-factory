// app/missions/[id].tsx
// Mission detail. Renders a Project as a Mission with its Goals and Tasks.

import React, { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { useFactoryStore } from '@/store/useFactoryStore';
import type { Goal, Task } from '@shared/factory';

const PRIORITY_COLOR: Record<string, string> = {
  P0: GhostMode.colors.danger,
  P1: GhostMode.colors.warning,
  P2: GhostMode.colors.accent,
  P3: GhostMode.colors.textTertiary,
};

const STATUS_COLOR: Record<string, string> = {
  draft: GhostMode.colors.textTertiary,
  planning: GhostMode.colors.textTertiary,
  active: GhostMode.colors.accent,
  blocked: GhostMode.colors.danger,
  done: GhostMode.colors.success,
  abandoned: GhostMode.colors.textTertiary,
  backlog: GhostMode.colors.textTertiary,
  ready: GhostMode.colors.accent,
  in_progress: GhostMode.colors.warning,
  review: GhostMode.colors.accent,
  failed: GhostMode.colors.danger,
};

export default function MissionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;

  const project = useFactoryStore((s) => s.projects.find((p) => p.id === id));
  const goals = useFactoryStore((s) => (id ? s.goals[id] : undefined)) ?? [];
  const tasks = useFactoryStore((s) => (id ? s.tasks[id] : undefined)) ?? [];
  const loadGoals = useFactoryStore((s) => s.loadGoals);
  const loadTasks = useFactoryStore((s) => s.loadTasks);

  useEffect(() => {
    if (id) {
      loadGoals(id);
      loadTasks(id);
    }
  }, [id]);

  if (!project) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.title}>Mission</Text>
          <View style={styles.backButton} />
        </View>
        <Text style={styles.empty}>Mission not in store. Return to the list and try again.</Text>
      </View>
    );
  }

  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'failed');
  const doneTasks = tasks.length - openTasks.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{project.name}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{project.description}</Text>

        <View style={styles.statsRow}>
          <Stat label="Goals" value={goals.length} />
          <Stat label="Open" value={openTasks.length} />
          <Stat label="Done" value={doneTasks} />
          <Stat label="Agents" value={project.metrics.activeAgentCount} />
        </View>

        <Text style={styles.sectionHeader}>{`Goals (${goals.length})`}</Text>
        {goals.length === 0 && <Text style={styles.empty}>No goals yet.</Text>}
        {goals.map((g) => <GoalRow key={g.id} goal={g} />)}

        <Text style={styles.sectionHeader}>{`Tasks (${tasks.length})`}</Text>
        {tasks.length === 0 && <Text style={styles.empty}>No tasks yet.</Text>}
        {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle} numberOfLines={1}>{goal.title}</Text>
        <View style={[styles.pill, { backgroundColor: PRIORITY_COLOR[goal.priority] + '22' }]}>
          <Text style={[styles.pillText, { color: PRIORITY_COLOR[goal.priority] }]}>{goal.priority}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: STATUS_COLOR[goal.status] + '22' }]}>
          <Text style={[styles.pillText, { color: STATUS_COLOR[goal.status] }]}>{goal.status}</Text>
        </View>
      </View>
      {goal.description.length > 0 && (
        <Text style={styles.rowDesc} numberOfLines={2}>{goal.description}</Text>
      )}
    </View>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle} numberOfLines={1}>{task.title}</Text>
        <View style={[styles.pill, { backgroundColor: STATUS_COLOR[task.status] + '22' }]}>
          <Text style={[styles.pillText, { color: STATUS_COLOR[task.status] }]}>{task.status}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: GhostMode.colors.background, paddingHorizontal: GhostMode.space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: GhostMode.space.xl, gap: GhostMode.space.sm },
  backButton: { width: 40, height: 40, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surface, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.soft },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text, flex: 1, textAlign: 'center' },
  content: { gap: GhostMode.space.md, paddingBottom: GhostMode.space.xl },
  description: { ...GhostMode.typography.body, color: GhostMode.colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: GhostMode.space.sm, marginTop: GhostMode.space.sm },
  stat: { flex: 1, padding: GhostMode.space.md, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, alignItems: 'center', ...GhostMode.shadow.soft },
  statValue: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  statLabel: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary, marginTop: 2 },
  sectionHeader: { ...GhostMode.typography.heading, color: GhostMode.colors.text, marginTop: GhostMode.space.lg },
  row: { padding: GhostMode.space.lg, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, gap: GhostMode.space.xs, ...GhostMode.shadow.soft },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.sm },
  rowTitle: { ...GhostMode.typography.body, color: GhostMode.colors.text, flex: 1, fontWeight: '500' },
  rowDesc: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  pill: { paddingHorizontal: GhostMode.space.sm, paddingVertical: 2, borderRadius: GhostMode.radius.sm },
  pillText: { ...GhostMode.typography.caption, fontSize: 11, fontWeight: '700' },
  empty: { ...GhostMode.typography.body, color: GhostMode.colors.textTertiary },
});
