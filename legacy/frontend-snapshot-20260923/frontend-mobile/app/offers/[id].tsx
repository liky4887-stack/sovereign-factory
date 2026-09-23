// app/offers/[id].tsx
// Offer detail. Fetches from sovereign-core /offers/:id and renders OfferBreakdownView.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { sovereign } from '@/services/sovereign';
import { OfferBreakdownView } from '@/components/OfferBreakdownView';
import type { GrandSlamOffer } from '@shared/sales';

export default function OfferDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;

  const [offer, setOffer] = useState<GrandSlamOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await sovereign.getOffer(id);
      setOffer(res.offer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{offer?.name ?? 'Offer'}</Text>
        <View style={styles.backButton} />
      </View>

      {loading && <ActivityIndicator color={GhostMode.colors.accent} style={styles.loader} />}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Failed to load offer: {error}</Text>
          <Pressable onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {offer && (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <OfferBreakdownView offer={offer} />
        </ScrollView>
      )}
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
    gap: GhostMode.space.sm,
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
  title: {
    ...GhostMode.typography.title,
    color: GhostMode.colors.text,
    flex: 1,
    textAlign: 'center',
  },
  loader: { marginTop: GhostMode.space.xl },
  content: { paddingBottom: GhostMode.space.xl },
  errorBox: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
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
});
