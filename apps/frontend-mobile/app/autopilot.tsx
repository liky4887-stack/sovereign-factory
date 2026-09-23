import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { autopilot } from '@/services/autopilot';
import { useGhostStore } from '@/store/useGhostStore';

export default function AutopilotMonitor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const events = useGhostStore((s) => s.autopilotEvents);

  useEffect(() => {
    autopilot.startMonitoring();
    autopilot.shoutOut('Autopilot armed. Watching for crashes and repetitive tasks.');
  }, []);

  const simulateCrash = () => {
    autopilot.reportCrash('TypeError: undefined is not an object', 'app/preview.tsx');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.title}>Autopilot</Text>
        <Pressable onPress={simulateCrash} style={styles.simButton}><Text style={styles.simText}>Sim Crash</Text></Pressable>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusDot} />
        <View style={styles.statusInfo}>
          <Text style={styles.statusTitle}>Self-Healing Active</Text>
          <Text style={styles.statusCaption}>Spawning repair agents on crash detection</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {events.map((event) => (
          <View key={event.id} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <View style={[styles.eventBadge, event.type === 'self_heal' && styles.badgeHeal, event.type === 'shout_out' && styles.badgeShout, event.type === 'intervention' && styles.badgeIntervene, event.type === 'repetitive_task' && styles.badgeRepetitive]}>
                <Text style={styles.eventBadgeText}>{event.type.replace('_', ' ').toUpperCase()}</Text>
              </View>
              <Text style={styles.eventAgent}>{event.agent}</Text>
            </View>
            <Text style={styles.eventMessage}>{event.message}</Text>
            <Text style={styles.eventTime}>{new Date(event.timestamp).toLocaleTimeString()}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GhostMode.colors.background, paddingHorizontal: GhostMode.space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: GhostMode.space.lg },
  backButton: { width: 40, height: 40, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surface, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.soft },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  simButton: { paddingHorizontal: GhostMode.space.md, paddingVertical: GhostMode.space.xs, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.danger + '20' },
  simText: { ...GhostMode.typography.caption, color: GhostMode.colors.danger, fontWeight: '600' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.md, padding: GhostMode.space.lg, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, marginBottom: GhostMode.space.lg, ...GhostMode.shadow.soft },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: GhostMode.colors.success },
  statusInfo: { flex: 1 },
  statusTitle: { ...GhostMode.typography.heading, color: GhostMode.colors.text },
  statusCaption: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  scrollContent: { paddingBottom: GhostMode.space.xxxl, gap: GhostMode.space.sm },
  eventCard: { padding: GhostMode.space.lg, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, ...GhostMode.shadow.soft },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: GhostMode.space.sm },
  eventBadge: { paddingHorizontal: GhostMode.space.sm, paddingVertical: 2, borderRadius: GhostMode.radius.sm },
  badgeHeal: { backgroundColor: GhostMode.colors.danger + '20' },
  badgeShout: { backgroundColor: GhostMode.colors.accentSoft },
  badgeIntervene: { backgroundColor: GhostMode.colors.warning + '20' },
  badgeRepetitive: { backgroundColor: GhostMode.colors.surfaceSunken },
  eventBadgeText: { ...GhostMode.typography.caption, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: GhostMode.colors.text },
  eventAgent: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  eventMessage: { ...GhostMode.typography.body, color: GhostMode.colors.text },
  eventTime: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary, marginTop: GhostMode.space.xs, textAlign: 'right' },
});
