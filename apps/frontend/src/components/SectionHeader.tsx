import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props { title: string; action?: { label: string; onPress: () => void }; }

export function SectionHeader({ title, action }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        <Pressable onPress={action.onPress} style={({ hovered }: any) => [styles.actionBtn, hovered && styles.actionBtnHover]}>
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  actionBtnHover: { backgroundColor: theme.surface3, borderColor: theme.accent },
  actionText: { fontSize: 12, fontWeight: '500', color: theme.accent },
});
