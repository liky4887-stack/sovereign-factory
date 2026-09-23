import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { useGhostStore } from '@/store/useGhostStore';

export default function LiveConsole() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lines = useGhostStore((s) => s.consoleLines);
  const appendConsole = useGhostStore((s) => s.appendConsole);
  const clearConsole = useGhostStore((s) => s.clearConsole);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const seed = [
      '$ sovereign-core start --bridge-port 8790',
      '[sovereign-core] awaiting connections on port 8790',
      '[vault] mounted /data/data/com.termux/files/home/.ghost-bridge',
      '$ deepseek --model fable-5.1 --mode agent',
      '[fable-5.1] context window: 1M tokens',
      '[fable-5.1] awaiting CEO directive…',
    ];
    seed.forEach((l) => appendConsole(l));
    const interval = setInterval(() => appendConsole(`[${new Date().toLocaleTimeString()}] heartbeat ok`), 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [lines]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.title}>Live Console</Text>
        <Pressable onPress={clearConsole} style={styles.clearButton}><Text style={styles.clearText}>Clear</Text></Pressable>
      </View>
      <View style={styles.console}>
        <View style={styles.consoleHeader}>
          <View style={styles.consoleDot} />
          <View style={[styles.consoleDot, { backgroundColor: '#F59E0B' }]} />
          <View style={[styles.consoleDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.consoleTitle}>termux://bridge</Text>
        </View>
        <ScrollView ref={scrollRef} style={styles.consoleBody} contentContainerStyle={styles.consoleContent}>
          {lines.map((line, i) => (<Text key={i} style={styles.consoleLine}>{line}</Text>))}
          <Text style={styles.cursor}>▊</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GhostMode.colors.background, paddingHorizontal: GhostMode.space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: GhostMode.space.xl },
  backButton: { width: 40, height: 40, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surface, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.soft },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  clearButton: { paddingHorizontal: GhostMode.space.md, paddingVertical: GhostMode.space.xs, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surfaceSunken },
  clearText: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  console: { flex: 1, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.consoleBg, overflow: 'hidden', ...GhostMode.shadow.lifted },
  consoleHeader: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.sm, paddingHorizontal: GhostMode.space.lg, paddingVertical: GhostMode.space.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  consoleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  consoleTitle: { ...GhostMode.typography.caption, color: '#9CA3AF', marginLeft: GhostMode.space.sm, fontFamily: 'Courier' },
  consoleBody: { flex: 1 },
  consoleContent: { padding: GhostMode.space.lg, gap: GhostMode.space.xs },
  consoleLine: { ...GhostMode.typography.mono, color: GhostMode.colors.consoleText },
  cursor: { ...GhostMode.typography.mono, color: GhostMode.colors.consoleAccent },
});
