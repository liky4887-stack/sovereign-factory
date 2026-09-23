// app/offers.tsx
// Sales & Offers list. Fetches from sovereign-core /offers.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { sovereign } from '@/services/sovereign';
import type { GrandSlamOffer } from '@shared/sales';

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [offers, setOffers] = useState<GrandSlamOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sovereign.listOffers();
      setOffers(res.offers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Sales & Offers</Text>
        <View style={styles.backButton} />
      </View>

      {loading && offers.length === 0 && (
        <View style={styles.center}>
          <ActivityIndicator color={GhostMode.colors.accent} />
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Unreachable: {error}</Text>
          <Pressable onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {!loading && !error && offers.length === 0 && (
          <Text style={styles.empty}>No offers yet.</Text>
        )}

        {offers.map((o) => {
          const score = o.offerValueAssessment.equation.normalizedScore;
          return (
            <Pressable
              key={o.id}
              onPress={() => router.push((`/offers/${o.id}`) as any)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.cardName} numberOfLines={1}>{o.name}</Text>
              <Text style={styles.cardCore} numberOfLines={2}>{o.coreDeliverable}</Text>

              <View style={styles.scoreRow}>
                <View style={styles.scoreTrack}>
                  <View style={[styles.scoreFill, { width: `${score}%` }]} />
                </View>
                <Text style={styles.scoreLabel}>{score}/100</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.meta}>{o.bonuses.length} bonuses</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.meta}>Stack ${o.statedStackValueUsd.toLocaleString()}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.price}>${o.priceUsd.toLocaleString()}</Text>
              </View>
            </Pressable>
          );
        })}
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
  listContent: { gap: GhostMode.space.md, paddingBottom: GhostMode.space.xl },
  card: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  cardName: { ...GhostMode.typography.title, color: GhostMode.colors.text },
  cardCore: { ...GhostMode.typography.body, color: GhostMode.colors.textSecondary },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GhostMode.space.sm,
    marginTop: GhostMode.space.xs,
  },
  scoreTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: GhostMode.colors.surfaceSunken,
    overflow: 'hidden',
  },
  scoreFill: { height: 4, backgroundColor: GhostMode.colors.accent },
  scoreLabel: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary, fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: GhostMode.space.xs, flexWrap: 'wrap' },
  meta: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  metaDot: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  price: { ...GhostMode.typography.caption, color: GhostMode.colors.accent, fontWeight: '700' },
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
  empty: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.textTertiary,
    textAlign: 'center',
    marginTop: GhostMode.space.xl,
  },
});
