// components/MissionCard.tsx
// Renders a @shared/factory Project as a "Mission" card.
// Blueprint term "Mission" maps to entity Project. UI copy does the translation.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Project } from '@shared/factory';
import { GhostMode } from '@/constants/theme';

interface Props {
  project: Project;
  onPress?: (project: Project) => void;
}

export function MissionCard({ project, onPress }: Props) {
  const { metrics } = project;
  const total = metrics.openTaskCount + metrics.doneTaskCount;
  const completion = total > 0 ? Math.round((metrics.doneTaskCount / total) * 100) : 0;

  return (
    <Pressable
      onPress={() => onPress?.(project)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>{project.name}</Text>
        {project.archived && (
          <View style={styles.archivedPill}>
            <Text style={styles.archivedText}>ARCHIVED</Text>
          </View>
        )}
      </View>

      <Text style={styles.description} numberOfLines={2}>{project.description}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.meta}>{metrics.goalCount} goals</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.meta}>{metrics.openTaskCount} open</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.meta}>{metrics.activeAgentCount} agents</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${completion}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{completion}% complete</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: GhostMode.space.sm },
  name: { ...GhostMode.typography.title, color: GhostMode.colors.text, flex: 1 },
  archivedPill: {
    paddingHorizontal: GhostMode.space.sm,
    paddingVertical: 2,
    borderRadius: GhostMode.radius.sm,
    backgroundColor: GhostMode.colors.surfaceSunken,
  },
  archivedText: { ...GhostMode.typography.caption, fontSize: 10, color: GhostMode.colors.textSecondary, fontWeight: '700' },
  description: { ...GhostMode.typography.body, color: GhostMode.colors.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.xs },
  meta: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  metaDot: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: GhostMode.colors.surfaceSunken,
    overflow: 'hidden',
    marginTop: GhostMode.space.xs,
  },
  progressFill: { height: 4, backgroundColor: GhostMode.colors.accent },
  progressLabel: { ...GhostMode.typography.caption, fontSize: 11, color: GhostMode.colors.textTertiary },
});
