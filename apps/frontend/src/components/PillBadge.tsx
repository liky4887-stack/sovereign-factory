import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props { label: string; color?: string; }

export function PillBadge({ label, color = theme.accent }: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '20' }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
});
