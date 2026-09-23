import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { useFactory } from '../store/FactoryContext';
import { api } from '../services/api';
import { SectionHeader } from '../components/SectionHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { PillBadge } from '../components/PillBadge';
import { theme } from '../theme';
import type { ComplianceReview } from '../types';

export function OmegaSwitch() {
  const { tasks, activeProjectId, loadTasks } = useFactory();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [command, setCommand] = useState('');
  const [review, setReview] = useState<ComplianceReview | null>(null);
  const [omegaReason, setOmegaReason] = useState('');
  const [confirmFire, setConfirmFire] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks(activeProjectId ?? undefined);
    setRefreshing(false);
  }, [loadTasks, activeProjectId]);

  useEffect(() => {
    loadTasks(activeProjectId ?? undefined);
  }, [loadTasks, activeProjectId]);

  const runReview = async () => {
    if (!selectedTaskId || !command.trim()) {
      Alert.alert('Missing input', 'Select a task and enter a command.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api.reviewCommand(selectedTaskId, command.trim());
      setReview(r);
    } catch (e: unknown) {
      Alert.alert('Review failed', e instanceof Error ? e.message : 'Unknown error');
    }
    setBusy(false);
  };

  const fireOmega = async () => {
    setConfirmFire(false);
    setBusy(true);
    try {
      const r = await api.fireOmega({
        taskId: selectedTaskId,
        agentId: 'ceo',
        command: command.trim(),
        omegaAcknowledged: true,
        omegaReason: omegaReason.trim() || 'No reason provided',
      });
      setResult(`Execution: ${r.executionLogId}\nLedger: ${r.ledgerEntryId}`);
      setReview(null);
      setCommand('');
      setOmegaReason('');
    } catch (e: unknown) {
      Alert.alert('Omega failed', e instanceof Error ? e.message : 'Unknown error');
    }
    setBusy(false);
  };

  const verdictColor: Record<string, string> = {
    clear: theme.success,
    needs_clarification: theme.warning,
    conflicts_with_ledger: theme.danger,
    high_risk: theme.danger,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
      <Text style={styles.title}>Omega Switch</Text>
      <Text style={styles.subtitle}>Critical command execution with compliance review</Text>

      <SectionHeader title="Select Task" />
      {tasks.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>No tasks available.</Text></View>
      ) : (
        <View style={styles.taskList}>
          {tasks.slice(0, 20).map((task) => (
            <Pressable key={task.id} onPress={() => setSelectedTaskId(task.id)} style={({ hovered }: any) => [styles.taskItem, selectedTaskId === task.id && styles.taskItemActive, hovered && selectedTaskId !== task.id && styles.taskItemHover]}>
              <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
              <PillBadge label={task.status} color={task.status === 'done' ? theme.success : theme.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      <SectionHeader title="Command" />
      <TextInput value={command} onChangeText={setCommand} placeholder="Enter shell command..." style={styles.commandInput} placeholderTextColor={theme.textMuted} multiline autoCapitalize="none" autoCorrect={false} />

      <Pressable onPress={runReview} disabled={busy || !selectedTaskId || !command.trim()} style={({ hovered }: any) => [styles.reviewBtn, (busy || !selectedTaskId || !command.trim()) && styles.btnDisabled, hovered && !(busy || !selectedTaskId || !command.trim()) && styles.reviewBtnHover]}>
        <Text style={styles.btnText}>{busy ? 'Working...' : 'Run Compliance Review'}</Text>
      </Pressable>

      {review ? (
        <View style={styles.reviewCard}>
          <View style={styles.reviewHeader}>
            <PillBadge label={review.verdict.replace('_', ' ')} color={verdictColor[review.verdict] ?? theme.textMuted} />
            <Text style={styles.reviewTime}>{new Date(review.createdAt).toLocaleString()}</Text>
          </View>
          {review.concerns.length > 0 ? (
            <><Text style={styles.reviewLabel}>Concerns</Text>{review.concerns.map((c, i) => (<Text key={i} style={styles.reviewItem}>- {c}</Text>))}</>
          ) : null}
          {review.suggestedAlternatives.length > 0 ? (
            <><Text style={styles.reviewLabel}>Suggested Alternatives</Text>{review.suggestedAlternatives.map((a, i) => (<Text key={i} style={styles.reviewItem}>- {a}</Text>))}</>
          ) : null}
          {review.followUpQuestions.length > 0 ? (
            <><Text style={styles.reviewLabel}>Follow-up Questions</Text>{review.followUpQuestions.map((q, i) => (<Text key={i} style={styles.reviewItem}>- {q}</Text>))}</>
          ) : null}
          {review.verdict === 'clear' ? (
            <>
              <SectionHeader title="Omega Acknowledgment" />
              <TextInput value={omegaReason} onChangeText={setOmegaReason} placeholder="Why are you firing this omega action?" style={styles.reasonInput} placeholderTextColor={theme.textMuted} multiline />
              <Pressable onPress={() => setConfirmFire(true)} style={({ hovered }: any) => [styles.fireBtn, hovered && styles.fireBtnHover]}>
                <Text style={styles.fireBtnText}>FIRE OMEGA</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      {result ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Execution Complete</Text>
          <Text style={styles.resultText}>{result}</Text>
        </View>
      ) : null}

      <View style={{ height: 40 }} />
      <ConfirmModal visible={confirmFire} title="Fire Omega Action?" message="This will execute the command on the Termux bridge. A ledger entry will be created. This action cannot be undone." confirmLabel="Fire" destructive onConfirm={fireOmega} onCancel={() => setConfirmFire(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  empty: { padding: 16, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  emptyText: { fontSize: 13, color: theme.textMuted },
  taskList: { gap: 6 },
  taskItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  taskItemActive: { borderColor: theme.accent, backgroundColor: theme.accentBg },
  taskItemHover: { backgroundColor: theme.surface2 },
  taskTitle: { flex: 1, fontSize: 13, fontWeight: '500', color: theme.text, marginRight: 8 },
  commandInput: { minHeight: 72, borderRadius: theme.radius, backgroundColor: '#0A0A0B', borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.text, fontFamily: 'monospace', marginBottom: 10 },
  reviewBtn: { height: 44, borderRadius: theme.radius, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  reviewBtnHover: { backgroundColor: theme.accentHover },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  reviewCard: { padding: 16, borderRadius: theme.radiusLg, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginTop: 14 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reviewTime: { fontSize: 11, color: theme.textMuted, fontFamily: 'monospace' },
  reviewLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 5 },
  reviewItem: { fontSize: 12, color: theme.textSecondary, lineHeight: 18, marginBottom: 2 },
  reasonInput: { minHeight: 54, borderRadius: theme.radius, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: theme.text, marginBottom: 10 },
  fireBtn: { height: 48, borderRadius: theme.radius, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' },
  fireBtnHover: { backgroundColor: '#DC2626' },
  fireBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1 },
  resultCard: { padding: 14, borderRadius: theme.radius, backgroundColor: theme.successBg, borderWidth: 1, borderColor: theme.success + '40', marginTop: 14 },
  resultLabel: { fontSize: 10, fontWeight: '600', color: theme.success, textTransform: 'uppercase', letterSpacing: 0.5 },
  resultText: { fontSize: 12, color: theme.text, fontFamily: 'monospace', marginTop: 5 },
});
