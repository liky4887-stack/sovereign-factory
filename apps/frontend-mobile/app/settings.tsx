// app/settings.tsx
// Settings & Rules. CEO preferences, system rules (read-only), data & privacy.
// Bridge URL + handshake + cookie vault live in /admin — linked from here.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import {
  preferences, DEFAULT_PREFERENCES,
  type RiskTolerance, type ApprovalThreshold, type CommStyle,
} from '@/services/preferences';

const RISK_OPTIONS: { value: RiskTolerance; label: string; hint: string }[] = [
  { value: 'low', label: 'Low', hint: 'Conservative — approve before any external action' },
  { value: 'medium', label: 'Medium', hint: 'Balanced — approve mutating actions only' },
  { value: 'high', label: 'High', hint: 'Aggressive — autonomous within stated constraints' },
];

const APPROVAL_OPTIONS: { value: ApprovalThreshold; label: string; hint: string }[] = [
  { value: 'all_actions', label: 'All Actions', hint: 'Approve every proposed step' },
  { value: 'mutating_only', label: 'Mutating Only', hint: 'Approve writes, pushes, CLI exec' },
  { value: 'autonomous', label: 'Autonomous', hint: 'Approval only on explicitly flagged ops' },
];

const COMM_OPTIONS: { value: CommStyle; label: string; hint: string }[] = [
  { value: 'concise', label: 'Concise', hint: 'TL;DR first, minimal detail' },
  { value: 'detailed', label: 'Detailed', hint: 'Full breakdowns, options, rationale' },
];

const SYSTEM_RULES = [
  'Clarity over cleverness. Actionable steps over vague advice.',
  'Ask targeted questions instead of guessing.',
  'Never contradict or overwrite System State; extend it.',
  'No destructive actions without explicit CEO approval.',
  'For scripts: output Plan, Commands, and Rollback.',
  'Never fabricate access to systems. State when manual action is required.',
  'Communicate as CEO: TL;DR, breakdown, next 3 actions.',
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [risk, setRisk] = useState<RiskTolerance>(DEFAULT_PREFERENCES.riskTolerance);
  const [approval, setApproval] = useState<ApprovalThreshold>(DEFAULT_PREFERENCES.approvalThreshold);
  const [comm, setComm] = useState<CommStyle>(DEFAULT_PREFERENCES.commStyle);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await preferences.getAll();
      setRisk(p.riskTolerance);
      setApproval(p.approvalThreshold);
      setComm(p.commStyle);
      setLoaded(true);
    })();
  }, []);

  const onRisk = async (v: RiskTolerance) => { setRisk(v); await preferences.setRisk(v); };
  const onApproval = async (v: ApprovalThreshold) => { setApproval(v); await preferences.setApproval(v); };
  const onComm = async (v: CommStyle) => { setComm(v); await preferences.setComm(v); };

  const onReset = () => {
    Alert.alert(
      'Reset Preferences',
      'Revert all CEO preferences to defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await preferences.reset();
            setRisk(DEFAULT_PREFERENCES.riskTolerance);
            setApproval(DEFAULT_PREFERENCES.approvalThreshold);
            setComm(DEFAULT_PREFERENCES.commStyle);
          },
        },
      ]
    );
  };

  const onShareRules = async () => {
    const text = [
      'SOVEREIGN SYSTEM RULES v0.5',
      '',
      ...SYSTEM_RULES.map((r, i) => `${i + 1}. ${r}`),
    ].join('\n');
    await Share.share({ message: text });
  };

  const onOpenAdmin = () => router.push('/admin');

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Settings & Rules</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>CEO Preferences</Text>
        {!loaded && <Text style={styles.meta}>Loading…</Text>}

        {loaded && (
          <>
            <OptionGroup
              label="Risk Tolerance"
              options={RISK_OPTIONS}
              value={risk}
              onChange={onRisk}
            />
            <OptionGroup
              label="Approval Threshold"
              options={APPROVAL_OPTIONS}
              value={approval}
              onChange={onApproval}
            />
            <OptionGroup
              label="Communication Style"
              options={COMM_OPTIONS}
              value={comm}
              onChange={onComm}
            />

            <Pressable onPress={onReset} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Reset to defaults</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.sectionHeader}>Bridge & Session Admin</Text>
        <View style={styles.linkCard}>
          <Text style={styles.linkTitle}>Cookie Vault · Handshake · Bridge URL</Text>
          <Text style={styles.linkBody}>
            Credentials and session cookies live behind the admin PIN gate.
          </Text>
          <Pressable onPress={onOpenAdmin} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Open Admin</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionHeader}>System Rules</Text>
        <View style={styles.rulesCard}>
          {SYSTEM_RULES.map((r, i) => (
            <Text key={i} style={styles.ruleText}>• {r}</Text>
          ))}
        </View>
        <Pressable onPress={onShareRules} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Share rules as prompt</Text>
        </Pressable>

        <Text style={styles.sectionHeader}>Data & Privacy</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoBody}>
            · Session cookies are stored locally via SecureStore, never written to prompts.
          </Text>
          <Text style={styles.infoBody}>
            · Bridge commands are proposed by AI and approved by the CEO before execution.
          </Text>
          <Text style={styles.infoBody}>
            · The Truth Ledger is append-only and immutable.
          </Text>
          <Text style={styles.infoBody}>
            · No cookie values are transmitted to model providers; only session handles are.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function OptionGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string; hint: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.optionRow, selected && styles.optionRowSelected]}
          >
            <View style={[styles.radio, selected && styles.radioSelected]} />
            <View style={styles.optionText}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {opt.label}
              </Text>
              <Text style={styles.optionHint}>{opt.hint}</Text>
            </View>
          </Pressable>
        );
      })}
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
  content: { gap: GhostMode.space.md, paddingBottom: GhostMode.space.xxxl },
  sectionHeader: {
    ...GhostMode.typography.heading,
    color: GhostMode.colors.text,
    marginTop: GhostMode.space.lg,
  },
  meta: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  group: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  groupLabel: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
    fontWeight: '600',
    marginBottom: GhostMode.space.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: GhostMode.space.md,
    paddingVertical: GhostMode.space.sm,
    paddingHorizontal: GhostMode.space.md,
    borderRadius: GhostMode.radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionRowSelected: {
    backgroundColor: GhostMode.colors.accentSoft,
    borderColor: GhostMode.colors.accent,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: GhostMode.colors.borderStrong,
    marginTop: 2,
  },
  radioSelected: {
    borderColor: GhostMode.colors.accent,
    backgroundColor: GhostMode.colors.accent,
  },
  optionText: { flex: 1, gap: 2 },
  optionLabel: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.text,
    fontWeight: '500',
  },
  optionLabelSelected: { color: GhostMode.colors.accent, fontWeight: '700' },
  optionHint: { ...GhostMode.typography.caption, color: GhostMode.colors.textTertiary },
  linkCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  linkTitle: { ...GhostMode.typography.body, color: GhostMode.colors.text, fontWeight: '600' },
  linkBody: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  rulesCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
  },
  ruleText: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  infoCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  infoBody: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary },
  primaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.md,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.accent,
    ...GhostMode.shadow.medium,
  },
  primaryText: { ...GhostMode.typography.body, color: '#FFFFFF', fontWeight: '700' },
  secondaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.sm,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
  },
  secondaryText: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textSecondary,
    fontWeight: '600',
  },
});
