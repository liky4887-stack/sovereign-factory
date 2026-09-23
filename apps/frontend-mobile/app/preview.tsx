import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';

const SAMPLE_DIFF = 'diff --git a/components/Button.tsx b/components/Button.tsx\nindex 3a4f2c1..8b9e0d4 100644\n--- a/components/Button.tsx\n+++ b/components/Button.tsx\n@@ -12,7 +12,7 @@ export function Button({ label, onPress }: Props) {\n   return (\n     <Pressable\n-      style={styles.button}\n+      style={[styles.button, { opacity: pressed ? 0.8 : 1 }]}\n       onPress={onPress}\n     >\n       <Text style={styles.label}>{label}</Text>\n     </Pressable>\n   );\n }';

export default function CodePreview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'diff' | 'files'>('diff');

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.title}>Code Preview</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        {(['diff', 'files'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === 'diff' ? 'Live Diff' : 'Changed Files'}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <View style={styles.previewDot} />
          <Text style={styles.previewTitle}>github.com/ghostmode/app</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {activeTab === 'diff' ? (
          <ScrollView horizontal style={styles.diffScroll}>
            <ScrollView style={styles.diffBody}>
              <Text style={styles.diffText}>{SAMPLE_DIFF}</Text>
            </ScrollView>
          </ScrollView>
        ) : (
          <ScrollView style={styles.fileList}>
            {[
              { path: 'components/Button.tsx', status: 'M', changes: '+2 -1' },
              { path: 'app/index.tsx', status: 'M', changes: '+14 -3' },
              { path: 'services/vault.ts', status: 'A', changes: '+48' },
              { path: 'constants/theme.ts', status: 'A', changes: '+92' },
            ].map((file) => (
              <View key={file.path} style={styles.fileRow}>
                <View style={[styles.statusBadge, file.status === 'A' && styles.statusAdded, file.status === 'M' && styles.statusModified]}>
                  <Text style={styles.statusText}>{file.status}</Text>
                </View>
                <Text style={styles.filePath}>{file.path}</Text>
                <Text style={styles.fileChanges}>{file.changes}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GhostMode.colors.background, paddingHorizontal: GhostMode.space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: GhostMode.space.lg },
  backButton: { width: 40, height: 40, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surface, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.soft },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  tabs: { flexDirection: 'row', gap: GhostMode.space.sm, marginBottom: GhostMode.space.lg },
  tab: { paddingHorizontal: GhostMode.space.lg, paddingVertical: GhostMode.space.sm, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surfaceSunken },
  tabActive: { backgroundColor: GhostMode.colors.accent },
  tabText: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  previewCard: { flex: 1, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.consoleBg, overflow: 'hidden', ...GhostMode.shadow.lifted },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.sm, paddingHorizontal: GhostMode.space.lg, paddingVertical: GhostMode.space.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  previewDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GhostMode.colors.accent },
  previewTitle: { ...GhostMode.typography.caption, color: '#9CA3AF', fontFamily: 'Courier', flex: 1 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GhostMode.space.sm, paddingVertical: 2, borderRadius: GhostMode.radius.pill, backgroundColor: 'rgba(16,185,129,0.15)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GhostMode.colors.success },
  liveText: { fontSize: 10, color: GhostMode.colors.success, fontWeight: '700', letterSpacing: 0.5 },
  diffScroll: { flex: 1 },
  diffBody: { padding: GhostMode.space.lg },
  diffText: { ...GhostMode.typography.mono, color: GhostMode.colors.consoleText },
  fileList: { flex: 1 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.md, paddingHorizontal: GhostMode.space.lg, paddingVertical: GhostMode.space.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  statusBadge: { width: 24, height: 24, borderRadius: GhostMode.radius.sm, alignItems: 'center', justifyContent: 'center' },
  statusAdded: { backgroundColor: 'rgba(16,185,129,0.2)' },
  statusModified: { backgroundColor: 'rgba(245,158,11,0.2)' },
  statusText: { ...GhostMode.typography.caption, fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  filePath: { ...GhostMode.typography.mono, color: GhostMode.colors.consoleText, flex: 1 },
  fileChanges: { ...GhostMode.typography.caption, color: '#9CA3AF', fontFamily: 'Courier' },
});
