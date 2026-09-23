// src/screens/IDE.tsx
// Lovable-style split-pane IDE. Talks to sovereign-core via services/api.
// Left pane: file tree + editor. Right pane: run output (stdout/stderr).
// All primitives exist in sovereign-core /file/* and /executeCommand.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  PanResponder, ActivityIndicator,
} from 'react-native';
import { api } from '../services/api';
import { theme } from '../theme';

type DirEntry = { name: string; path: string; type: string; size: number };
type PreviewTab = 'stdout' | 'stderr' | 'info';

const DEFAULT_ROOT = '/data/data/com.termux/files/home/sovereign-core-data';

export function IDE() {
  // ── workspace
  const [rootPath, setRootPath] = useState(DEFAULT_ROOT);
  const [files, setFiles] = useState<DirEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  // ── editor
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const dirty = content !== originalContent;

  // ── run
  const [command, setCommand] = useState('pwd');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    stdout: string; stderr: string; exitCode: number | null;
    durationMs: number; truncated: boolean; command: string;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('stdout');

  // ── split pane
  const [split, setSplit] = useState(0.5);
  const [width, setWidth] = useState(0);
  const splitRef = useRef(0.5);
  const startRef = useRef(0.5);
  const widthRef = useRef(0);
  useEffect(() => { splitRef.current = split; }, [split]);
  useEffect(() => { widthRef.current = width; }, [width]);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startRef.current = splitRef.current; },
    onPanResponderMove: (_e, g) => {
      const w = widthRef.current;
      if (w <= 0) return;
      const next = startRef.current + g.dx / w;
      setSplit(Math.max(0.25, Math.min(0.75, next)));
    },
  })).current;

  // ── loaders
  const loadFiles = useCallback(async (path: string) => {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const entries = await api.listFiles(path);
      const sorted = [...entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
    } catch (e) {
      setFilesError(e instanceof Error ? e.message : 'Failed to list files');
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => { void loadFiles(rootPath); }, [loadFiles, rootPath]);

  const openFile = useCallback(async (path: string) => {
    setSaveMsg(null);
    try {
      const f = await api.readFile(path);
      setActivePath(path);
      setContent(f.content);
      setOriginalContent(f.content);
    } catch (e) {
      setSaveMsg(`open failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!activePath) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await api.writeFile(activePath, content);
      setOriginalContent(content);
      setSaveMsg(`saved · ${r.bytesWritten} bytes`);
      void loadFiles(rootPath);
    } catch (e) {
      setSaveMsg(`save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [activePath, content, loadFiles, rootPath]);

  const runCommand = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const r = await api.executeCommand({ command, cwd: rootPath });
      setRunResult(r);
      setPreviewTab(r.stderr.length > 0 ? 'stderr' : 'stdout');
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setRunResult(null);
    } finally {
      setRunning(false);
    }
  }, [command, rootPath]);

  const leftPct = split * 100;
  const rightPct = 100 - leftPct;

  const statusColor = runError ? theme.danger
    : running ? theme.warning
    : runResult ? (runResult.exitCode === 0 ? theme.success : theme.danger)
    : theme.textMuted;

  const statusText = runError ? 'error'
    : running ? 'running'
    : runResult ? `exit ${runResult.exitCode ?? 'killed'} · ${runResult.durationMs}ms`
    : 'idle';

  return (
    <View style={styles.root}>
      {/* TOOLBAR */}
      <View style={styles.toolbar}>
        <Text style={styles.pathLabel} numberOfLines={1}>{rootPath}</Text>
        <View style={styles.toolbarRight}>
          {dirty && <Text style={styles.dirtyBadge}>● unsaved</Text>}
          <Pressable
            onPress={() => void loadFiles(rootPath)}
            style={styles.toolbarBtn}
          >
            <Text style={styles.toolbarBtnText}>⟳</Text>
          </Pressable>
          <Pressable
            onPress={saveFile}
            disabled={!dirty || saving || !activePath}
            style={[styles.toolbarBtn, (!dirty || saving || !activePath) && styles.toolbarBtnDisabled]}
          >
            <Text style={styles.toolbarBtnText}>{saving ? '…' : 'Save'}</Text>
          </Pressable>
        </View>
      </View>

      {/* SPLIT */}
      <View style={styles.splitRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* LEFT: files + editor */}
        <View style={[styles.pane, { width: `${leftPct}%` }]}>
          <View style={styles.paneHeader}>
            <Text style={styles.paneLabel}>FILES</Text>
            {filesLoading && <ActivityIndicator size="small" color={theme.accent} />}
          </View>
          <ScrollView style={styles.fileList} contentContainerStyle={styles.fileListContent}>
            {filesError && <Text style={styles.errorText} numberOfLines={3}>{filesError}</Text>}
            {!filesLoading && !filesError && files.length === 0 && (
              <Text style={styles.muted}>empty</Text>
            )}
            {files.map((f) => {
              const isActive = f.path === activePath;
              const isDir = f.type === 'dir';
              return (
                <Pressable
                  key={f.path}
                  onPress={() => { if (isDir) setRootPath(f.path); else void openFile(f.path); }}
                  style={[styles.fileRow, isActive && styles.fileRowActive]}
                >
                  <Text style={styles.fileGlyph}>{isDir ? '▸' : '·'}</Text>
                  <Text style={[styles.fileName, isActive && styles.fileNameActive]} numberOfLines={1}>
                    {f.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.editorHeader}>
            <Text style={styles.paneLabel}>EDITOR</Text>
            <Text style={styles.muted} numberOfLines={1}>
              {activePath ? activePath.split('/').slice(-2).join('/') : 'no file open'}
            </Text>
          </View>
          <TextInput
            value={content}
            onChangeText={setContent}
            multiline
            editable={!!activePath}
            placeholder={activePath ? '' : 'select a file from the tree above'}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.editor}
          />
          {saveMsg && (
            <Text style={saveMsg.startsWith('saved') ? styles.saveOk : styles.saveErr} numberOfLines={1}>
              {saveMsg}
            </Text>
          )}
        </View>

        {/* DIVIDER */}
        <View {...pan.panHandlers} style={styles.divider}>
          <View style={styles.dividerKnob} />
        </View>

        {/* RIGHT: preview */}
        <View style={[styles.pane, { width: `${rightPct}%` }]}>
          <View style={styles.paneHeader}>
            <Text style={styles.paneLabel}>RUN</Text>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>

          <View style={styles.commandRow}>
            <TextInput
              value={command}
              onChangeText={setCommand}
              placeholder="shell command"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.commandInput}
            />
            <Pressable
              onPress={runCommand}
              disabled={running || !command.trim()}
              style={[styles.runBtn, (running || !command.trim()) && styles.runBtnDisabled]}
            >
              <Text style={styles.runBtnText}>{running ? '…' : 'Run ▸'}</Text>
            </Pressable>
          </View>

          <View style={styles.previewTabs}>
            {(['stdout', 'stderr', 'info'] as PreviewTab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setPreviewTab(t)}
                style={[styles.previewTab, previewTab === t && styles.previewTabActive]}
              >
                <Text style={[styles.previewTabText, previewTab === t && styles.previewTabTextActive]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={styles.previewBody} contentContainerStyle={styles.previewContent}>
            {runError && <Text style={styles.errorText}>{runError}</Text>}

            {!runError && !runResult && (
              <Text style={styles.muted}>run a command to see output</Text>
            )}

            {runResult && previewTab === 'stdout' && (
              runResult.stdout.length > 0
                ? <Text style={styles.mono}>{runResult.stdout}</Text>
                : <Text style={styles.muted}>(empty)</Text>
            )}

            {runResult && previewTab === 'stderr' && (
              runResult.stderr.length > 0
                ? <Text style={[styles.mono, { color: theme.danger }]}>{runResult.stderr}</Text>
                : <Text style={styles.muted}>(empty)</Text>
            )}

            {runResult && previewTab === 'info' && (
              <>
                <Text style={styles.infoLine}>command:   <Text style={styles.mono}>{runResult.command}</Text></Text>
                <Text style={styles.infoLine}>exit:      <Text style={styles.mono}>{runResult.exitCode ?? 'killed'}</Text></Text>
                <Text style={styles.infoLine}>duration:  <Text style={styles.mono}>{runResult.durationMs} ms</Text></Text>
                <Text style={styles.infoLine}>truncated: <Text style={styles.mono}>{String(runResult.truncated)}</Text></Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },

  toolbar: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  pathLabel: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: 11,
    fontFamily: theme.mono,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dirtyBadge: {
    color: theme.warning,
    fontSize: 11,
    fontFamily: theme.mono,
    marginRight: 4,
  },
  toolbarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.surface3,
    borderWidth: 1,
    borderColor: theme.border,
  },
  toolbarBtnDisabled: { opacity: 0.4 },
  toolbarBtnText: {
    color: theme.text,
    fontSize: 11,
    fontWeight: '600',
  },

  splitRow: { flex: 1, flexDirection: 'row' },
  pane: { flexDirection: 'column' },

  paneHeader: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: theme.surface2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  paneLabel: {
    color: theme.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {
    color: theme.textMuted,
    fontSize: 10,
    fontFamily: theme.mono,
  },

  fileList: {
    maxHeight: 180,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  fileListContent: { paddingVertical: 4 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  fileRowActive: { backgroundColor: theme.accentBg },
  fileGlyph: {
    color: theme.textMuted,
    fontSize: 10,
    width: 12,
  },
  fileName: {
    color: theme.textSecondary,
    fontSize: 12,
    fontFamily: theme.mono,
    flex: 1,
  },
  fileNameActive: { color: theme.text, fontWeight: '600' },

  editorHeader: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    backgroundColor: theme.surface2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  editor: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.text,
    fontFamily: theme.mono,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: theme.bg,
    textAlignVertical: 'top',
  },
  saveOk: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: theme.success,
    fontSize: 11,
    fontFamily: theme.mono,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  saveErr: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: theme.danger,
    fontSize: 11,
    fontFamily: theme.mono,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },

  divider: {
    width: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
  },
  dividerKnob: {
    width: 2,
    height: 40,
    borderRadius: 1,
    backgroundColor: theme.borderLight,
  },

  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  commandInput: {
    flex: 1,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontFamily: theme.mono,
    fontSize: 12,
  },
  runBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 6,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBtnDisabled: { opacity: 0.4 },
  runBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  previewTabs: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: theme.surface,
  },
  previewTab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: theme.surface3,
  },
  previewTabActive: { backgroundColor: theme.accentBg, borderWidth: 1, borderColor: theme.accent },
  previewTabText: {
    color: theme.textMuted,
    fontSize: 11,
    fontFamily: theme.mono,
  },
  previewTabTextActive: { color: theme.text, fontWeight: '600' },

  previewBody: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  previewContent: { padding: 10 },
  mono: {
    color: theme.text,
    fontFamily: theme.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  muted: {
    color: theme.textMuted,
    fontSize: 12,
    fontFamily: theme.mono,
  },
  errorText: {
    color: theme.danger,
    fontSize: 12,
    fontFamily: theme.mono,
  },
  infoLine: {
    color: theme.textSecondary,
    fontSize: 12,
    fontFamily: theme.mono,
    lineHeight: 18,
  },
});
