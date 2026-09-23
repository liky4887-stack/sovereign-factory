// app/missions.tsx
// Missions screen. Lists Projects as Missions via useFactoryStore.

import React, { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { useFactoryStore } from '@/store/useFactoryStore';
import { MissionCard } from '@/components/MissionCard';

export default function MissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const projects = useFactoryStore((s) => s.projects);
  const loading = useFactoryStore((s) => s.loading);
  const error = useFactoryStore((s) => s.error);
  const loadProjects = useFactoryStore((s) => s.loadProjects);

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Missions</Text>
        <View style={styles.backButton} />
      </View>

      {loading && projects.length === 0 && (
        <View style={styles.center}>
          <ActivityIndicator color={GhostMode.colors.accent} />
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Bridge unreachable: {error}</Text>
          <Pressable onPress={loadProjects} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {projects.length === 0 && !loading && !error && (
          <Text style={styles.empty}>No missions yet. The swarm awaits direction.</Text>
        )}
        {projects.map((p) => (
          <MissionCard key={p.id} project={p} onPress={(proj) => router.push(('/missions/' + proj.id) as any)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: GhostMode.colors.background,
    paddingHorizontal: GhostMode.space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: GhostMode.space.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...GhostMode.shadow.soft,
  },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    marginBottom: GhostMode.space.lg,
    gap: GhostMode.space.sm,
  },
  errorText: { ...GhostMode.typography.body, color: GhostMode.colors.textSecondary },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.sm,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.accent,
  },
  retryText: { ...GhostMode.typography.caption, color: '#FFFFFF', fontWeight: '700' },
  listContent: { gap: GhostMode.space.md, paddingBottom: GhostMode.space.xl },
  empty: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.textTertiary,
    textAlign: 'center',
    marginTop: GhostMode.space.xl,
  },
});
