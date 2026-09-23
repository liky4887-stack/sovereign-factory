// app/ide.tsx
// Lovable-style split-pane IDE shell.
// Wires to existing sovereign-core via services/sovereign. No backend changes.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IDE } from '@/constants/ideTheme';
import { sovereign } from '@/services/sovereign';

type HealthState =
  | { status: 'idle' }
  | { status: 'ok'; uptimeSeconds: number }
  | { status: 'error'; message: string };

export default function IDEScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [health, setHealth] = useState<HealthState>({ status: 'idle' });
  const [split, setSplit] = useState(0.5);
  const [containerWidth, setContainerWidth] = useState(0);

  const splitRef = useRef(0.5);
  const startSplitRef = useRef(0.5);
  const containerWidthRef = useRef(0);

  useEffect(() => { splitRef.current = split; }, [split]);
  useEffect(() => { containerWidthRef.current = containerWidth; }, [containerWidth]);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await sovereign.getHealth();
      setHealth({ status: 'ok', uptimeSeconds: h.uptimeSeconds });
    } catch (e) {
      setHealth({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => { void refreshHealth(); }, [refreshHealth]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startSplitRef.current = splitRef.current; },
      onPanResponderMove: (_e, g) => {
        const w = containerWidthRef.current;
        if (w <= 0) return;
        const next = startSplitRef.current + g.dx / w;
        setSplit(Math.max(0.25, Math.min(0.75, next)));
      },
    })
  ).current;

  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }, []);

  const leftPct = split * 100;
  const rightPct = 100 - leftPct;

  const statusColor =
    health.status === 'ok' ? IDE.color.success
    : health.status === 'error' ? IDE.color.danger
    : IDE.color.textDim;

  const statusText =
    health.status === 'ok' ? `connected · up ${Math.floor(health.uptimeSeconds / 60)}m`
    : health.status === 'error' ? `disconnected · ${health.message.slice(0, 40)}`
    : 'connecting…';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* TOP BAR */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.brandBtn}>
          <Text style={styles.brandBack}>←</Text>
        </Pressable>
        <Text style={styles.brandMark}>◆</Text>
        <Text style={styles.brandText}>SOVEREIGN</Text>
        <Text style={styles.brandMuted}>/ IDE</Text>

        <View style={styles.tabStrip}>
          <View style={[styles.tab, styles.tabActive]}>
            <Text style={styles.tabText}>workspace</Text>
          </View>
        </View>

        <View style={styles.topActions}>
          <Pressable style={styles.actionGhost}>
            <Text style={styles.actionGhostText}>Share</Text>
          </Pressable>
          <Pressable style={styles.actionPrimary}>
            <Text style={styles.actionPrimaryText}>Run ▸</Text>
          </Pressable>
        </View>
      </View>

      {/* SPLIT PANE */}
      <View style={styles.splitRow} onLayout={onLayout}>
        <View style={[styles.pane, { width: `${leftPct}%`, backgroundColor: IDE.color.editorBg }]}>
          <View style={styles.paneHeader}>
            <Text style={styles.paneLabel}>EDITOR</Text>
          </View>
          <View style={styles.paneBody}>
            <Text style={styles.placeholder}>Editor pane — next chunk</Text>
          </View>
        </View>

        <View {...pan.panHandlers} style={styles.divider}>
          <View style={styles.dividerKnob} />
        </View>

        <View style={[styles.pane, { width: `${rightPct}%`, backgroundColor: IDE.color.previewBg }]}>
          <View style={styles.paneHeader}>
            <Text style={styles.paneLabel}>PREVIEW</Text>
          </View>
          <View style={styles.paneBody}>
            <Text style={styles.placeholder}>Preview pane — next chunk</Text>
          </View>
        </View>
      </View>

      {/* STATUS BAR */}
      <View style={[styles.statusBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
        <Pressable onPress={refreshHealth} style={styles.statusRight}>
          <Text style={styles.statusTextMuted}>refresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    backgroundColor: IDE.color.surface,
  } as const,

  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: 44,
    paddingHorizontal: IDE.space.md,
    backgroundColor: IDE.color.panel,
    borderBottomWidth: 1,
    borderBottomColor: IDE.color.border,
    gap: IDE.space.sm,
  },
  brandBtn: {
    width: 28, height: 28,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderRadius: IDE.radius.sm,
  },
  brandBack: { color: IDE.color.text, fontSize: 18 },
  brandMark: { color: IDE.color.accent, fontSize: 14 },
  brandText: {
    color: IDE.color.text,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  brandMuted: {
    color: IDE.color.textDim,
    fontSize: 13,
    fontWeight: '500' as const,
    marginRight: IDE.space.lg,
  },
  tabStrip: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: IDE.space.xs,
  },
  tab: {
    paddingHorizontal: IDE.space.md,
    paddingVertical: 5,
    borderRadius: IDE.radius.sm,
    backgroundColor: IDE.color.panelAlt,
  },
  tabActive: {
    backgroundColor: IDE.color.accentSoft,
    borderWidth: 1,
    borderColor: IDE.color.accent,
  },
  tabText: {
    color: IDE.color.text,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  topActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: IDE.space.sm,
  },
  actionGhost: {
    paddingHorizontal: IDE.space.md,
    paddingVertical: 5,
    borderRadius: IDE.radius.sm,
    borderWidth: 1,
    borderColor: IDE.color.border,
  },
  actionGhostText: {
    color: IDE.color.textMuted,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  actionPrimary: {
    paddingHorizontal: IDE.space.md,
    paddingVertical: 5,
    borderRadius: IDE.radius.sm,
    backgroundColor: IDE.color.accent,
  },
  actionPrimaryText: {
    color: '#0B0D12',
    fontSize: 12,
    fontWeight: '700' as const,
  },

  splitRow: {
    flex: 1,
    flexDirection: 'row' as const,
    backgroundColor: IDE.color.surface,
  },
  pane: {
    height: '100%' as const,
  },
  paneHeader: {
    height: 28,
    paddingHorizontal: IDE.space.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: IDE.color.panel,
    borderBottomWidth: 1,
    borderBottomColor: IDE.color.borderSoft,
  },
  paneLabel: {
    color: IDE.color.textDim,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  paneBody: {
    flex: 1,
    padding: IDE.space.md,
  },
  placeholder: {
    color: IDE.color.textDim,
    fontSize: 12,
    fontFamily: IDE.font.mono,
  },

  divider: {
    width: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: IDE.color.surface,
  },
  dividerKnob: {
    width: 2,
    height: 40,
    borderRadius: 1,
    backgroundColor: IDE.color.border,
  },

  statusBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: IDE.space.md,
    paddingTop: 6,
    backgroundColor: IDE.color.panel,
    borderTopWidth: 1,
    borderTopColor: IDE.color.border,
  },
  statusLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: IDE.space.sm,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  statusText: {
    color: IDE.color.textMuted,
    fontSize: 11,
    fontFamily: IDE.font.mono,
  },
  statusRight: { padding: IDE.space.xs },
  statusTextMuted: {
    color: IDE.color.textDim,
    fontSize: 11,
    fontFamily: IDE.font.mono,
  },
};
