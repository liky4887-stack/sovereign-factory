import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props {
  title: string;
  online: boolean;
  onCommandPalette: () => void;
}

export function TopBar({ title, online, onCommandPalette }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.right}>
        <Pressable onPress={onCommandPalette} style={({ hovered }: any) => [styles.cmdBtn, hovered && styles.cmdBtnHover]}>
          <Text style={styles.cmdIcon}>⌘K</Text>
        </Pressable>
        <View style={[styles.statusPill, online ? styles.statusOnline : styles.statusOffline]}>
          <View style={[styles.statusDot, { backgroundColor: online ? theme.success : theme.warning }]} />
          <Text style={[styles.statusText, { color: online ? theme.success : theme.warning }]}>
            {online ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: theme.topbarHeight,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.text,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cmdBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.borderLight,
    backgroundColor: theme.surface2,
  },
  cmdBtnHover: {
    backgroundColor: theme.surface3,
    borderColor: theme.accent,
  },
  cmdIcon: {
    fontSize: 11,
    color: theme.textMuted,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusOnline: {
    backgroundColor: theme.successBg,
  },
  statusOffline: {
    backgroundColor: theme.warningBg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
