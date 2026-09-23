import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PillBadge } from './PillBadge';
import { theme } from '../theme';

interface Props { kind: string; title: string; meta?: string; timestamp: string; }

const KIND_COLORS: Record<string, string> = {
  decision: theme.accent,
  bug: theme.danger,
  pivot: theme.warning,
  omega_action: theme.danger,
  agent_action: theme.success,
  compliance_review: '#8B5CF6',
  deploy: '#3B82F6',
  schema_change: '#8B5CF6',
};

export function IncidentRow({ kind, title, meta, timestamp }: Props) {
  const color = KIND_COLORS[kind] ?? theme.textMuted;
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <PillBadge label={kind.replace('_', ' ')} color={color} />
        <Text style={styles.time}>{new Date(timestamp).toLocaleString()}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {meta ? <Text style={styles.meta} numberOfLines={2}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: 12, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  time: { fontSize: 11, color: theme.textMuted, fontFamily: 'monospace' },
  title: { fontSize: 13, fontWeight: '500', color: theme.text },
  meta: { fontSize: 12, color: theme.textSecondary, marginTop: 3 },
});
