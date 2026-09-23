import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props { label: string; value: string | number; accent?: string; }

export function StatCard({ label, value, accent = theme.accent }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={styles.value}>{String(value)}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 130, padding: 14, borderRadius: theme.radiusLg, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  dot: { width: 6, height: 6, borderRadius: 3, marginBottom: 8 },
  value: { fontSize: 22, fontWeight: '700', color: theme.text },
  label: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
});
