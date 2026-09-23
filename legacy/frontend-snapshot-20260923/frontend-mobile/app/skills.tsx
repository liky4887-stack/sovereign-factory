import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { Skill, skillSystem } from '@/services/skillSystem';

export default function SkillForge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');
  const [fusedName, setFusedName] = useState('');

  useEffect(() => { skillSystem.load().then(setSkills); }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const handleImport = async () => {
    if (!importUrl.trim() || !importName.trim()) return;
    await skillSystem.importFromGitHub(importUrl, importName, ['imported']);
    const updated = await skillSystem.load();
    setSkills(updated);
    setImportUrl(''); setImportName('');
    Alert.alert('Imported', `Skill "${importName}" added from GitHub.`);
  };

  const handleFuse = async () => {
    if (selected.length < 2) { Alert.alert('Fusion Error', 'Select at least two skills to fuse.'); return; }
    if (!fusedName.trim()) { Alert.alert('Fusion Error', 'Enter a name for the fused skill.'); return; }
    try {
      await skillSystem.fuse(selected, fusedName);
      const updated = await skillSystem.load();
      setSkills(updated);
      setSelected([]); setFusedName('');
      Alert.alert('Fusion Complete', `"${fusedName}" is now available.`);
    } catch (e: any) {
      Alert.alert('Fusion Failed', e.message);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.title}>Skill Forge</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Installed Skills</Text>
        {skills.map((skill) => (
          <Pressable key={skill.id} onPress={() => toggleSelect(skill.id)} style={[styles.skillCard, selected.includes(skill.id) && styles.skillCardSelected]}>
            <View style={styles.skillHeader}>
              <Text style={styles.skillName}>{skill.name}</Text>
              <Text style={styles.skillVersion}>v{skill.version}</Text>
            </View>
            <Text style={styles.skillDesc}>{skill.description}</Text>
            <View style={styles.capRow}>
              {skill.capabilities.map((cap) => (
                <View key={cap} style={styles.capBadge}><Text style={styles.capText}>{cap}</Text></View>
              ))}
            </View>
          </Pressable>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: GhostMode.space.xxl }]}>Import from GitHub</Text>
        <TextInput value={importUrl} onChangeText={setImportUrl} placeholder="https://github.com/…" placeholderTextColor={GhostMode.colors.textTertiary} style={styles.fieldInput} autoCapitalize="none" />
        <TextInput value={importName} onChangeText={setImportName} placeholder="Skill name" placeholderTextColor={GhostMode.colors.textTertiary} style={[styles.fieldInput, { marginTop: GhostMode.space.sm }]} />
        <Pressable onPress={handleImport} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Import Skill</Text></Pressable>

        <Text style={[styles.sectionTitle, { marginTop: GhostMode.space.xxl }]}>CEO Skill Fusion</Text>
        <Text style={styles.fusionHint}>Select two or more skills above, then name the fused result.</Text>
        <TextInput value={fusedName} onChangeText={setFusedName} placeholder="Fused skill name" placeholderTextColor={GhostMode.colors.textTertiary} style={styles.fieldInput} />
        <Pressable onPress={handleFuse} style={styles.fusionButton}>
          <Text style={styles.fusionButtonText}>Fuse {selected.length} Skill{selected.length !== 1 ? 's' : ''}</Text>
        </Pressable>
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
  scrollContent: { paddingBottom: GhostMode.space.xxxl },
  sectionTitle: { ...GhostMode.typography.heading, color: GhostMode.colors.text, marginBottom: GhostMode.space.md },
  skillCard: { padding: GhostMode.space.lg, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, marginBottom: GhostMode.space.sm, borderWidth: 2, borderColor: 'transparent', ...GhostMode.shadow.soft },
  skillCardSelected: { borderColor: GhostMode.colors.accent, backgroundColor: GhostMode.colors.accentSoft },
  skillHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skillName: { ...GhostMode.typography.heading, color: GhostMode.colors.text },
  skillVersion: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  skillDesc: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary, marginTop: GhostMode.space.xs },
  capRow: { flexDirection: 'row', flexWrap: 'wrap', gap: GhostMode.space.xs, marginTop: GhostMode.space.sm },
  capBadge: { paddingHorizontal: GhostMode.space.sm, paddingVertical: 2, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.ledgerTag },
  capText: { ...GhostMode.typography.caption, fontSize: 11, color: GhostMode.colors.textSecondary, fontFamily: 'Courier' },
  fieldInput: { height: 48, paddingHorizontal: GhostMode.space.lg, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, ...GhostMode.typography.body, color: GhostMode.colors.text },
  primaryButton: { height: 48, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.text, alignItems: 'center', justifyContent: 'center', marginTop: GhostMode.space.md },
  primaryButtonText: { ...GhostMode.typography.body, color: '#FFFFFF', fontWeight: '600' },
  fusionHint: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary, marginBottom: GhostMode.space.md },
  fusionButton: { height: 48, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: GhostMode.space.md, ...GhostMode.shadow.medium },
  fusionButtonText: { ...GhostMode.typography.body, color: '#FFFFFF', fontWeight: '600' },
});
