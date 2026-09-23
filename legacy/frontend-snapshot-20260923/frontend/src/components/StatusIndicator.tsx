import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

const COLORS: Record<string, string> = {
  idle: theme.textMuted,
  busy: theme.warning,
  paused: theme.accent,
  offline: theme.danger,
  connected: theme.success,
  disconnected: theme.danger,
};

interface Props { status: string; label?: string; }

export function StatusIndicator({ status, label }: Props) {
  const color = COLORS[status] ?? theme.textMuted;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{label ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
});
