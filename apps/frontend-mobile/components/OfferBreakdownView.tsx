// components/OfferBreakdownView.tsx
// Renders a GrandSlamOffer: Value Equation (4 levers) + Grand Slam components.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { GrandSlamOffer, ValueLever } from '@shared/sales';
import { GhostMode } from '@/constants/theme';

const LEVER_META: Record<ValueLever, { label: string; inverse: boolean }> = {
  dream: { label: 'Dream Outcome', inverse: false },
  likelihood: { label: 'Perceived Likelihood', inverse: false },
  speed: { label: 'Time Delay', inverse: true },
  ease: { label: 'Effort & Sacrifice', inverse: true },
};

const GUARANTEE_LABEL: Record<string, string> = {
  unconditional: 'Unconditional',
  conditional: 'Conditional',
  anti: 'Anti-Guarantee',
  implied: 'Implied',
  win_money_back: 'Win Money Back',
  trial_with_penalty: 'Trial with Penalty',
};

export function OfferBreakdownView({ offer }: { offer: GrandSlamOffer }) {
  const { equation, inverse, netScore, strongestLever, weakestLever, recommendations } =
    offer.offerValueAssessment;

  return (
    <View style={styles.wrap}>
      <Section title="Value Equation">
        <Text style={styles.equation}>
          ({equation.dreamOutcome} × {equation.perceivedLikelihood}) ÷ ({equation.timeDelay} × {equation.effortSacrifice})
        </Text>
        <Text style={styles.score}>
          Score: {equation.valueScore.toFixed(2)} · Normalized: {equation.normalizedScore}/100
        </Text>
        <View style={styles.leverGrid}>
          <Lever label="Dream" value={equation.dreamOutcome} inverse={false} />
          <Lever label="Likelihood" value={equation.perceivedLikelihood} inverse={false} />
          <Lever label="Time Delay" value={equation.timeDelay} inverse />
          <Lever label="Effort" value={equation.effortSacrifice} inverse />
        </View>
        <Text style={styles.meta}>
          Strongest: {LEVER_META[strongestLever]?.label ?? strongestLever} ·
          Weakest: {LEVER_META[weakestLever]?.label ?? weakestLever}
        </Text>
      </Section>

      <Section title="Inverse Risk (Status Quo)">
        <Text style={styles.meta}>Nightmare {inverse.nightmareOutcome}/10 · Risk {inverse.perceivedRisk}/10</Text>
        <Text style={styles.meta}>Slowness {inverse.currentSlowness}/10 · Effort {inverse.currentEffort}/10</Text>
        <Text style={styles.meta}>Net Score: {netScore.toFixed(2)}</Text>
      </Section>

      {recommendations.length > 0 && (
        <Section title="Recommendations">
          {recommendations.map((r, i) => (
            <Text key={i} style={styles.bullet}>• {r}</Text>
          ))}
        </Section>
      )}

      <Section title="Core Deliverable">
        <Text style={styles.body}>{offer.coreDeliverable}</Text>
      </Section>

      <Section title={`Bonuses (${offer.bonuses.length})`}>
        {offer.bonuses.length === 0 && <Text style={styles.meta}>None yet.</Text>}
        {offer.bonuses.map((b, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowTitle}>{b.name}</Text>
              <Text style={styles.rowDesc} numberOfLines={2}>{b.description}</Text>
              <Text style={styles.rowMeta}>
                Boosts: {LEVER_META[b.boostsLever]?.label ?? b.boostsLever}
              </Text>
            </View>
            <Text style={styles.rowValue}>${b.statedValueUsd.toLocaleString()}</Text>
          </View>
        ))}
      </Section>

      <Section title="Guarantee">
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {GUARANTEE_LABEL[offer.guarantee.type] ?? offer.guarantee.type}
          </Text>
        </View>
        <Text style={styles.body}>{offer.guarantee.description}</Text>
        {offer.guarantee.conditions.map((c, i) => (
          <Text key={i} style={styles.bullet}>• {c}</Text>
        ))}
        <Text style={styles.meta}>
          Expected reversal: {(offer.guarantee.expectedReversalRate * 100).toFixed(1)}%
        </Text>
      </Section>

      <Section title="Scarcity & Urgency">
        <Text style={styles.meta}>Scarcity: {offer.scarcityUrgency.scarcityBy ?? 'none'}</Text>
        <Text style={styles.meta}>Urgency: {offer.scarcityUrgency.urgencyBy ?? 'none'}</Text>
        <Text style={[styles.meta, { color: offer.scarcityUrgency.isHonest ? GhostMode.colors.success : GhostMode.colors.danger }]}>
          {offer.scarcityUrgency.isHonest ? 'Honest constraint' : '⚠ Manufactured constraint'}
        </Text>
        <Text style={styles.body}>{offer.scarcityUrgency.details}</Text>
      </Section>

      <Section title="Pricing Anchor">
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>Stack Value</Text>
            <Text style={styles.priceValue}>${offer.statedStackValueUsd.toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.priceLabel}>Your Price</Text>
            <Text style={[styles.priceValue, { color: GhostMode.colors.accent }]}>
              ${offer.priceUsd.toLocaleString()}
            </Text>
          </View>
          <View>
            <Text style={styles.priceLabel}>ROI Multiple</Text>
            <Text style={styles.priceValue}>
              {offer.priceUsd > 0 ? `${(offer.statedStackValueUsd / offer.priceUsd).toFixed(1)}×` : '—'}
            </Text>
          </View>
        </View>
      </Section>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {children}
    </View>
  );
}

function Lever({ label, value, inverse }: { label: string; value: number; inverse: boolean }) {
  // For direct levers, high = good (accent). For inverse, high = bad (danger).
  const pct = Math.max(0, Math.min(100, value * 10));
  const color = inverse ? GhostMode.colors.danger : GhostMode.colors.accent;
  return (
    <View style={styles.lever}>
      <Text style={styles.leverLabel}>{label}</Text>
      <View style={styles.leverTrack}>
        <View style={[styles.leverFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.leverValue}>{value}/10</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: GhostMode.space.md },
  section: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  sectionHeader: {
    ...GhostMode.typography.heading,
    color: GhostMode.colors.text,
    marginBottom: GhostMode.space.xs,
  },
  equation: {
    ...GhostMode.typography.mono,
    color: GhostMode.colors.text,
    fontSize: 13,
  },
  score: { ...GhostMode.typography.body, color: GhostMode.colors.text, fontWeight: '600' },
  meta: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  body: { ...GhostMode.typography.body, color: GhostMode.colors.text },
  bullet: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  leverGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GhostMode.space.sm,
    marginTop: GhostMode.space.xs,
  },
  lever: {
    flexBasis: '48%',
    padding: GhostMode.space.md,
    borderRadius: GhostMode.radius.lg,
    backgroundColor: GhostMode.colors.surfaceSunken,
    gap: GhostMode.space.xs,
  },
  leverLabel: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  leverTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: GhostMode.colors.border,
    overflow: 'hidden',
  },
  leverFill: { height: 4 },
  leverValue: { ...GhostMode.typography.caption, color: GhostMode.colors.text, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: GhostMode.space.sm,
    paddingVertical: GhostMode.space.sm,
    borderTopWidth: 1,
    borderTopColor: GhostMode.colors.border,
  },
  rowLeft: { flex: 1, gap: 2 },
  rowTitle: { ...GhostMode.typography.body, color: GhostMode.colors.text, fontWeight: '600' },
  rowDesc: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  rowMeta: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary, fontSize: 11 },
  rowValue: { ...GhostMode.typography.body, color: GhostMode.colors.accent, fontWeight: '700' },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: GhostMode.space.sm,
    paddingVertical: 2,
    borderRadius: GhostMode.radius.sm,
    backgroundColor: GhostMode.colors.accentSoft,
  },
  pillText: {
    ...GhostMode.typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: GhostMode.colors.accent,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: GhostMode.space.md,
  },
  priceLabel: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  priceValue: { ...GhostMode.typography.title, color: GhostMode.colors.text },
});
