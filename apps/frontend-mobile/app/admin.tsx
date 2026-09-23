// app/admin.tsx
// Admin gate. Sovereign-core connection config behind PIN.
// Replaces the legacy cookie vault / bridge config.
// sovereign-core uses Bearer tokens; no cookie endpoint exists.

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { sovereignClient } from '@/services/sovereignClient';

const ADMIN_PIN = '4242';

export default function AdminGate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');

  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [scheme, setScheme] = useState<'http' | 'https'>('http');
  const [token, setToken] = useState('');

  const [baseUrl, setBaseUrl] = useState('');
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      setHost(await sovereignClient.getHost());
      setPort(await sovereignClient.getPort());
      setScheme(await sovereignClient.getScheme());
      setBaseUrl(await sovereignClient.getBaseUrl());
      setHasToken(await sovereignClient.hasToken());
    })();
  }, [unlocked]);

  const handleUnlock = () => {
    if (pin === ADMIN_PIN) setUnlocked(true);
    else Alert.alert('Access Denied', 'Invalid admin PIN.');
    setPin('');
  };

  const refreshSummary = async () => {
    setBaseUrl(await sovereignClient.getBaseUrl());
    setHasToken(await sovereignClient.hasToken());
  };

  const handleSaveHost = async () => {
    if (!host.trim()) return;
    await sovereignClient.setHost(host.trim());
    await refreshSummary();
    Alert.alert('Saved', `Host set to ${host.trim()}`);
  };

  const handleSavePort = async () => {
    const p = port.trim();
    if (!p || !/^\d+$/.test(p)) {
      Alert.alert('Invalid', 'Port must be a number.');
      return;
    }
    await sovereignClient.setPort(p);
    await refreshSummary();
    Alert.alert('Saved', `Port set to ${p}`);
  };

  const handleSaveScheme = async (s: 'http' | 'https') => {
    setScheme(s);
    await sovereignClient.setScheme(s);
    await refreshSummary();
  };

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    await sovereignClient.setToken(token.trim());
    setToken('');
    await refreshSummary();
    Alert.alert('Saved', 'Bearer token stored in SecureStore.');
  };

  const handleClearToken = () => {
    Alert.alert(
      'Clear Token',
      'Remove the sovereign-core bearer token?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await sovereignClient.clearToken();
            await refreshSummary();
          },
        },
      ]
    );
  };

  if (!unlocked) {
    return (
      <View style={[styles.lockContainer, { paddingTop: insets.top + 120 }]}>
        <Text style={styles.lockIcon}>⛨</Text>
        <Text style={styles.lockTitle}>Admin Gate</Text>
        <Text style={styles.lockCaption}>Enter administrative PIN to continue</Text>
        <TextInput
          value={pin}
          onChangeText={setPin}
          placeholder="••••"
          placeholderTextColor={GhostMode.colors.textTertiary}
          keyboardType="number-pad"
          secureTextEntry
          style={styles.pinInput}
          maxLength={4}
        />
        <Pressable onPress={handleUnlock} style={styles.unlockButton}>
          <Text style={styles.unlockButtonText}>Unlock</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Current Base URL</Text>
          <Text style={styles.summaryValue}>{baseUrl || '—'}</Text>
          <Text style={styles.summaryLabel}>Bearer Token</Text>
          <Text style={styles.summaryValue}>{hasToken ? 'set' : 'not set'}</Text>
        </View>

        <Text style={styles.sectionTitle}>Host</Text>
        <TextInput
          value={host}
          onChangeText={setHost}
          placeholder="192.168.43.101"
          placeholderTextColor={GhostMode.colors.textTertiary}
          style={styles.fieldInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={handleSaveHost} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Save Host</Text>
        </Pressable>

        <Text style={[styles.sectionTitle, { marginTop: GhostMode.space.xxl }]}>Port</Text>
        <TextInput
          value={port}
          onChangeText={setPort}
          placeholder="8790"
          placeholderTextColor={GhostMode.colors.textTertiary}
          style={styles.fieldInput}
          keyboardType="number-pad"
        />
        <Pressable onPress={handleSavePort} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Save Port</Text>
        </Pressable>

        <Text style={[styles.sectionTitle, { marginTop: GhostMode.space.xxl }]}>Scheme</Text>
        <View style={styles.schemeRow}>
          {(['http', 'https'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => handleSaveScheme(s)}
              style={[styles.schemePill, scheme === s && styles.schemePillActive]}
            >
              <Text style={[styles.schemeText, scheme === s && styles.schemeTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: GhostMode.space.xxl }]}>Bearer Token</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="paste token"
          placeholderTextColor={GhostMode.colors.textTertiary}
          style={styles.fieldInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={handleSaveToken} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Save Token</Text>
        </Pressable>
        {hasToken && (
          <Pressable
            onPress={handleClearToken}
            style={[styles.primaryButton, { backgroundColor: GhostMode.colors.danger, marginTop: GhostMode.space.sm }]}
          >
            <Text style={styles.primaryButtonText}>Clear Token</Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, { marginTop: GhostMode.space.xxl }]}>Notes</Text>
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            · Sovereign-core expects Authorization: Bearer &lt;token&gt; on all authenticated routes.
          </Text>
          <Text style={styles.noteText}>
            · Set REQUIRE_AUTH=true and BRIDGE_TOKEN in the sovereign-core environment to enforce.
          </Text>
          <Text style={styles.noteText}>
            · Cookie vault removed — sovereign-core has no cookie endpoint.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GhostMode.colors.background, paddingHorizontal: GhostMode.space.lg },
  lockContainer: { flex: 1, backgroundColor: GhostMode.colors.background, alignItems: 'center', paddingHorizontal: GhostMode.space.xxl },
  lockIcon: { fontSize: 48, marginBottom: GhostMode.space.lg },
  lockTitle: { ...GhostMode.typography.title, color: GhostMode.colors.text, marginBottom: GhostMode.space.xs },
  lockCaption: { ...GhostMode.typography.body, color: GhostMode.colors.textSecondary, textAlign: 'center', marginBottom: GhostMode.space.xxl },
  pinInput: { width: '100%', height: 56, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, textAlign: 'center', fontSize: 24, letterSpacing: 12, color: GhostMode.colors.text, ...GhostMode.shadow.soft },
  unlockButton: { width: '100%', height: 52, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: GhostMode.space.lg, ...GhostMode.shadow.medium },
  unlockButtonText: { ...GhostMode.typography.body, color: '#FFFFFF', fontWeight: '600' },
  cancelText: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary, marginTop: GhostMode.space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: GhostMode.space.xl },
  backButton: { width: 40, height: 40, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surface, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.soft },
  backText: { fontSize: 20, color: GhostMode.colors.text },
  title: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  scrollContent: { paddingBottom: GhostMode.space.xxxl },
  summaryCard: { padding: GhostMode.space.lg, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.surfaceSunken, borderWidth: 1, borderColor: GhostMode.colors.border, gap: GhostMode.space.xs, marginBottom: GhostMode.space.xl },
  summaryLabel: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 },
  summaryValue: { ...GhostMode.typography.body, color: GhostMode.colors.text, fontWeight: '600' },
  sectionTitle: { ...GhostMode.typography.heading, color: GhostMode.colors.text, marginBottom: GhostMode.space.md },
  fieldInput: { height: 48, paddingHorizontal: GhostMode.space.lg, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, ...GhostMode.typography.body, color: GhostMode.colors.text },
  primaryButton: { height: 48, borderRadius: GhostMode.radius.lg, backgroundColor: GhostMode.colors.text, alignItems: 'center', justifyContent: 'center', marginTop: GhostMode.space.md },
  primaryButtonText: { ...GhostMode.typography.body, color: '#FFFFFF', fontWeight: '600' },
  schemeRow: { flexDirection: 'row', gap: GhostMode.space.sm },
  schemePill: { paddingHorizontal: GhostMode.space.lg, paddingVertical: GhostMode.space.sm, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surfaceSunken, borderWidth: 1, borderColor: GhostMode.colors.border },
  schemePillActive: { backgroundColor: GhostMode.colors.accent, borderColor: GhostMode.colors.accent },
  schemeText: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary, fontWeight: '600' },
  schemeTextActive: { color: '#FFFFFF' },
  noteCard: { padding: GhostMode.space.lg, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, gap: GhostMode.space.sm, ...GhostMode.shadow.soft },
  noteText: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
});
