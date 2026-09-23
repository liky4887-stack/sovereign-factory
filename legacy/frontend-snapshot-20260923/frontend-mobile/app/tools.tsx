// app/tools.tsx
// Tools & Bridges. Sovereign-core status + direct command execution.
// Replaces the old propose/approve flow — sovereign-core's command allowlist
// is the approval gate. All calls go through services/sovereign.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { sovereign, type HealthResponse, type RunResult } from '@/services/sovereign';
import { sovereignClient } from '@/services/sovereignClient';

export default function ToolsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Status
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Execution form
  const [command, setCommand] = useState('pwd');
  const [argsText, setArgsText] = useState('');
  const [cwd, setCwd] = useState('');
  const [timeoutMsText, setTimeoutMsText] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>('');

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const h = await sovereign.getHealth();
      setHealth(h);
    } catch (e: any) {
      setStatusError(e?.message ?? 'unknown error');
      setHealth(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    sovereignClient.getBaseUrl().then(setBaseUrl).catch(() => setBaseUrl(''));
  }, [refreshStatus]);

  const onExecute = async () => {
    setRunError(null);
    setResult(null);

    if (!command.trim()) {
      setRunError('Command is required.');
      return;
    }

    const args = argsText.trim().length > 0
      ? argsText.trim().split(/\s+/)
      : [];

    let timeoutMs: number | undefined;
    if (timeoutMsText.trim().length > 0) {
      const parsed = parseInt(timeoutMsText.trim(), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setRunError('Timeout must be a positive number of milliseconds.');
        return;
      }
      timeoutMs = parsed;
    }

    setRunning(true);
    try {
      const res = await sovereign.executeCommand({
        command: command.trim(),
        args,
        cwd: cwd.trim().length > 0 ? cwd.trim() : undefined,
        timeoutMs,
      });
      setResult(res.result);
    } catch (e: any) {
      setRunError(e?.message ?? 'unknown error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.title}>Tools & Bridges</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionHeader}>Sovereign-Core Status</Text>
          <Text style={styles.endpoint}>{baseUrl}</Text>

          {loadingStatus && <ActivityIndicator color={GhostMode.colors.accent} style={styles.loader} />}

          {statusError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Unreachable: {statusError}</Text>
              <Pressable onPress={refreshStatus} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {health && (
            <View style={styles.statusCard}>
              <StatusRow label="Service" value={health.service} />
              <StatusRow label="Uptime" value={`${Math.floor(health.uptimeSeconds / 60)}m ${health.uptimeSeconds % 60}s`} />
              <StatusRow label="PID" value={String(health.snapshot.pid)} />
              <StatusRow label="Node" value={health.snapshot.nodeVersion} />
              <StatusRow label="Platform" value={`${health.snapshot.platform} · ${health.snapshot.arch}`} />
              <StatusRow label="CPU Cores" value={String(health.snapshot.cpuCount)} />
              <StatusRow
                label="Memory (proc)"
                value={`${(health.snapshot.memory.processRssBytes / 1024 / 1024).toFixed(1)} MB RSS`}
              />
            </View>
          )}

          <Text style={styles.sectionHeader}>Execute Command</Text>
          <Text style={styles.hint}>
            Command allowlist and path restrictions enforced by sovereign-core.
            Shell metacharacters (; | &amp; $ `) are rejected server-side.
          </Text>

          <TextInput
            value={command}
            onChangeText={setCommand}
            placeholder="command (e.g. ls, git, node)"
            placeholderTextColor={GhostMode.colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            value={argsText}
            onChangeText={setArgsText}
            placeholder="args (space-separated, optional)"
            placeholderTextColor={GhostMode.colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            value={cwd}
            onChangeText={setCwd}
            placeholder="cwd (optional)"
            placeholderTextColor={GhostMode.colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            value={timeoutMsText}
            onChangeText={setTimeoutMsText}
            placeholder="timeout ms (optional, default 30000)"
            placeholderTextColor={GhostMode.colors.textTertiary}
            style={styles.input}
            keyboardType="number-pad"
          />

          {runError && <Text style={styles.formError}>{runError}</Text>}

          <Pressable
            onPress={onExecute}
            disabled={running}
            style={[styles.submitButton, running && styles.buttonDisabled]}
          >
            <Text style={styles.submitText}>{running ? 'Executing…' : 'Execute'}</Text>
          </Pressable>

          {result && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultLabel}>exit</Text>
                <Text style={[styles.resultValue, { color: result.exitCode === 0 ? GhostMode.colors.success : GhostMode.colors.danger }]}>
                  {result.exitCode ?? 'killed'}
                </Text>
                <Text style={styles.resultLabel}>·</Text>
                <Text style={styles.resultLabel}>{result.durationMs} ms</Text>
                {result.truncated && (
                  <>
                    <Text style={styles.resultLabel}>·</Text>
                    <Text style={[styles.resultLabel, { color: GhostMode.colors.warning }]}>truncated</Text>
                  </>
                )}
              </View>

              {result.stdout.length > 0 && (
                <>
                  <Text style={styles.resultLabel}>stdout</Text>
                  <View style={styles.resultOutput}>
                    <Text style={styles.resultMono}>{result.stdout}</Text>
                  </View>
                </>
              )}

              {result.stderr.length > 0 && (
                <>
                  <Text style={styles.resultLabel}>stderr</Text>
                  <View style={[styles.resultOutput, { borderLeftColor: GhostMode.colors.danger }]}>
                    <Text style={[styles.resultMono, { color: GhostMode.colors.danger }]}>{result.stderr}</Text>
                  </View>
                </>
              )}

              {result.stdout.length === 0 && result.stderr.length === 0 && (
                <Text style={styles.resultLabel}>(no output)</Text>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue} numberOfLines={1}>{value}</Text>
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
  content: { gap: GhostMode.space.md, paddingBottom: GhostMode.space.xxl },
  sectionHeader: {
    ...GhostMode.typography.heading,
    color: GhostMode.colors.text,
    marginTop: GhostMode.space.lg,
  },
  endpoint: {
    ...GhostMode.typography.mono,
    color: GhostMode.colors.textTertiary,
    fontSize: 12,
    marginTop: -GhostMode.space.xs,
  },
  hint: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
    marginBottom: GhostMode.space.xs,
  },
  loader: { marginTop: GhostMode.space.md },
  statusCard: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: GhostMode.space.sm,
  },
  statusLabel: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
  },
  statusValue: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.text,
    flexShrink: 1,
    textAlign: 'right',
    fontWeight: '500',
  },
  input: {
    minHeight: 48,
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.md,
    borderRadius: GhostMode.radius.lg,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    ...GhostMode.typography.body,
    color: GhostMode.colors.text,
    ...GhostMode.shadow.soft,
  },
  formError: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.danger,
  },
  submitButton: {
    paddingVertical: GhostMode.space.md,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.accent,
    alignItems: 'center',
    marginTop: GhostMode.space.xs,
    ...GhostMode.shadow.medium,
  },
  submitText: {
    ...GhostMode.typography.body,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.4 },
  resultCard: {
    marginTop: GhostMode.space.md,
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.sm,
    ...GhostMode.shadow.soft,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GhostMode.space.sm,
  },
  resultLabel: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
    textTransform: 'uppercase',
    fontWeight: '700',
    fontSize: 11,
  },
  resultValue: {
    ...GhostMode.typography.body,
    fontWeight: '700',
  },
  resultOutput: {
    padding: GhostMode.space.md,
    borderRadius: GhostMode.radius.md,
    backgroundColor: GhostMode.colors.consoleBg,
    borderLeftWidth: 3,
    borderLeftColor: GhostMode.colors.accent,
  },
  resultMono: {
    ...GhostMode.typography.mono,
    color: GhostMode.colors.consoleText,
    fontSize: 12,
  },
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
  retryText: {
    ...GhostMode.typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
