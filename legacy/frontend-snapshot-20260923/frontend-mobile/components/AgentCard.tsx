// components/AgentCard.tsx
// Renders a @shared/factory Agent as a swarm card.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Agent } from '@shared/factory';
import { GhostMode } from '@/constants/theme';

const ROLE_LABEL: Record<string, string> = {
  ceo: 'CEO',
  architect: 'Architect',
  builder: 'Builder',
  reviewer: 'Reviewer',
  chaos_monkey: 'Chaos Monkey',
  scout: 'Scout',
  librarian: 'Librarian',
};

const STATUS_COLOR: Record<string, string> = {
  idle: GhostMode.colors.textTertiary,
  busy: GhostMode.colors.warning,
  paused: GhostMode.colors.textSecondary,
  offline: GhostMode.colors.danger,
};

interface Props {
  agent: Agent;
  onPress?: (agent: Agent) => void;
}

export function AgentCard({ agent, onPress }: Props) {
  const statusColor = STATUS_COLOR[agent.status] ?? GhostMode.colors.textTertiary;
  const successRate = agent.stats.tasksCompleted + agent.stats.tasksFailed > 0
    ? Math.round((agent.stats.tasksCompleted / (agent.stats.tasksCompleted + agent.stats.tasksFailed)) * 100)
    : null;

  return (
    <Pressable
      onPress={() => onPress?.(agent)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>{agent.name}</Text>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{agent.status}</Text>
      </View>

      <View style={styles.rolePill}>
        <Text style={styles.roleText}>{ROLE_LABEL[agent.role] ?? agent.role}</Text>
      </View>

      {agent.persona.length > 0 && (
        <Text style={styles.persona} numberOfLines={2}>{agent.persona}</Text>
      )}

      <View style={styles.statsRow}>
        <Text style={styles.stat}>✓ {agent.stats.tasksCompleted}</Text>
        <Text style={styles.statDot}>·</Text>
        <Text style={styles.stat}>✕ {agent.stats.tasksFailed}</Text>
        {successRate !== null && (
          <>
            <Text style={styles.statDot}>·</Text>
            <Text style={styles.stat}>{successRate}%</Text>
          </>
        )}
        {agent.skills.length > 0 && (
          <>
            <Text style={styles.statDot}>·</Text>
            <Text style={styles.stat}>{agent.skills.length} skills</Text>
          </>
        )}
      </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.sm },
  name: { ...GhostMode.typography.title, color: GhostMode.colors.text, flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...GhostMode.typography.caption, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  rolePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: GhostMode.space.sm,
    paddingVertical: 2,
    borderRadius: GhostMode.radius.sm,
    backgroundColor: GhostMode.colors.accentSoft,
  },
  roleText: { ...GhostMode.typography.caption, fontSize: 11, fontWeight: '700', color: GhostMode.colors.accent },
  persona: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.xs },
  stat: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  statDot: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
});
