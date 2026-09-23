import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useFactory } from '../store/FactoryContext';
import { api } from '../services/api';
import { SectionHeader } from '../components/SectionHeader';
import { StatusIndicator } from '../components/StatusIndicator';
import { theme } from '../theme';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  status: string;
  description: string;
  capabilities: string[];
}

export function LLMCookies() {
  const { error, refreshAll } = useFactory();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsCookies, setAnalyticsCookies] = useState(false);
  const [sessionCookies, setSessionCookies] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const status = await api.status();
        const modelList: ModelInfo[] = (status.activeModelTypes || []).map((type: string, i: number) => ({
          id: type,
          name: type.toUpperCase(),
          provider: type.includes('gpt') ? 'OpenAI' : type.includes('claude') ? 'Anthropic' : type.includes('gemini') ? 'Google' : 'Local',
          status: 'online',
          description: `${type} model active on the bridge`,
          capabilities: ['text-generation', 'code-completion'],
        }));
        if (mounted) {
          setModels(modelList);
          if (modelList.length > 0) setSelectedModel(modelList[0].id);
        }
      } catch {
        if (mounted) setModels([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const selected = models.find((m) => m.id === selectedModel);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>LLM & Cookies</Text>
      <Text style={styles.pageSubtitle}>Manage models and session preferences</Text>

      <SectionHeader title="Active Models" />
      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Name</Text>
          <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Provider</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Status</Text>
        </View>
        {loading ? (
          <View style={styles.tableRow}>
            <Text style={styles.loadingText}>Loading models...</Text>
          </View>
        ) : models.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={styles.noDataText}>No models detected. Bridge may be offline.</Text>
          </View>
        ) : (
          models.map((model) => (
            <Pressable
              key={model.id}
              onPress={() => setSelectedModel(model.id)}
              style={[styles.tableRow, selectedModel === model.id && styles.tableRowSelected]}
            >
              <Text style={[styles.tableCell, { flex: 2 }, selectedModel === model.id && styles.tableCellSelected]}>{model.name}</Text>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{model.provider}</Text>
              <View style={{ flex: 1 }}>
                <StatusIndicator status={model.status === 'online' ? 'connected' : 'offline'} label={model.status} />
              </View>
            </Pressable>
          ))
        )}
      </View>

      {selected ? (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>{selected.name}</Text>
          <Text style={styles.detailDesc}>{selected.description}</Text>
          <View style={styles.capRow}>
            {selected.capabilities.map((cap) => (
              <View key={cap} style={styles.capBadge}>
                <Text style={styles.capText}>{cap}</Text>
              </View>
            ))}
          </View>
          <View style={styles.detailMeta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Provider</Text>
              <Text style={styles.metaValue}>{selected.provider}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>ID</Text>
              <Text style={styles.metaValueMono}>{selected.id}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <SectionHeader title="Cookie & Session Settings" />
      <View style={styles.settingsPanel}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Analytics Cookies</Text>
            <Text style={styles.settingDesc}>Allow usage analytics and tracking</Text>
          </View>
          <Switch
            value={analyticsCookies}
            onValueChange={setAnalyticsCookies}
            trackColor={{ false: theme.surface3, true: theme.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.settingDivider} />

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Session Persistence</Text>
            <Text style={styles.settingDesc}>Remember preferences across sessions</Text>
          </View>
          <Switch
            value={sessionCookies}
            onValueChange={setSessionCookies}
            trackColor={{ false: theme.surface3, true: theme.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.settingDivider} />

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Offline Mode</Text>
            <Text style={styles.settingDesc}>Use cached data when bridge is unavailable</Text>
          </View>
          <Switch
            value={offlineMode}
            onValueChange={setOfflineMode}
            trackColor={{ false: theme.surface3, true: theme.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.settingDivider} />

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Bridge Status</Text>
            <Text style={styles.settingDesc}>{error ? 'Disconnected' : 'Connected to bridge'}</Text>
          </View>
          <StatusIndicator status={error ? 'disconnected' : 'connected'} label={error ? 'Offline' : 'Online'} />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 2 },
  pageSubtitle: { fontSize: 13, color: theme.textMuted },
  tableContainer: {
    borderRadius: theme.radiusLg,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.surface2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tableRowSelected: {
    backgroundColor: theme.accentBg,
  },
  tableCell: {
    fontSize: 13,
    color: theme.textSecondary,
    fontFamily: 'monospace',
    marginRight: 8,
  },
  tableCellSelected: {
    color: theme.accent,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 13,
    color: theme.textMuted,
  },
  noDataText: {
    fontSize: 13,
    color: theme.warning,
  },
  detailPanel: {
    marginTop: 16,
    padding: 16,
    borderRadius: theme.radiusLg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 6,
  },
  detailDesc: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  capRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  capBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: theme.surface3,
  },
  capText: {
    fontSize: 11,
    color: theme.textSecondary,
    fontFamily: 'monospace',
  },
  detailMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 13,
    color: theme.text,
    marginTop: 2,
  },
  metaValueMono: {
    fontSize: 13,
    color: theme.text,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  settingsPanel: {
    borderRadius: theme.radiusLg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.text,
  },
  settingDesc: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  settingDivider: {
    height: 1,
    backgroundColor: theme.border,
  },
});
