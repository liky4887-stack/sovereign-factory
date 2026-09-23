// app/sessions.tsx
// Sessions list. Backed by chatSessions (AsyncStorage).
// Tap a session → opens /chat with that session as current.
// Create + delete supported.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { chatSessions, type ChatSession } from '@/services/chatSessions';

export default function SessionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await chatSessions.list();
    setSessions(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onCreate = async () => {
    const s = await chatSessions.create('New session');
    await load();
    router.push('/chat' as any);
  };

  const onDelete = (session: ChatSession) => {
    Alert.alert(
      'Delete session',
      `Delete "${session.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await chatSessions.remove(session.id);
            await load();
          },
        },
      ]
    );
  };

  const formatDate = (ts: number): string => {
    const d = new Date(ts);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Sessions</Text>
        <Pressable onPress={onCreate} style={styles.newButton}>
          <Text style={styles.newText}>+ New</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {!loading && sessions.length === 0 && (
          <Text style={styles.empty}>No sessions yet. Tap + New to start one.</Text>
        )}

        {sessions.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => router.push('/chat' as any)}
            onLongPress={() => onDelete(s)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle} numberOfLines={1}>{s.title}</Text>
              <Text style={styles.cardTime}>{formatDate(s.updatedAt)}</Text>
            </View>
            <Text style={styles.cardMeta}>
              {s.messages.length} {s.messages.length === 1 ? 'message' : 'messages'}
            </Text>
            {s.messages.length > 0 && (
              <Text style={styles.cardPreview} numberOfLines={1}>
                {s.messages[s.messages.length - 1].content}
              </Text>
            )}
          </Pressable>
        ))}

        {sessions.length > 0 && (
          <Text style={styles.hint}>Long-press a session to delete it.</Text>
        )}
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
  newButton: {
    paddingHorizontal: GhostMode.space.lg,
    paddingVertical: GhostMode.space.sm,
    borderRadius: GhostMode.radius.pill,
    backgroundColor: GhostMode.colors.accent,
  },
  newText: {
    ...GhostMode.typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    gap: GhostMode.space.md,
    paddingBottom: GhostMode.space.xl,
  },
  card: {
    padding: GhostMode.space.lg,
    borderRadius: GhostMode.radius.xl,
    backgroundColor: GhostMode.colors.surface,
    borderWidth: 1,
    borderColor: GhostMode.colors.border,
    gap: GhostMode.space.xs,
    ...GhostMode.shadow.soft,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: GhostMode.space.sm,
  },
  cardTitle: {
    ...GhostMode.typography.heading,
    color: GhostMode.colors.text,
    flex: 1,
  },
  cardTime: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
    fontSize: 11,
  },
  cardMeta: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
  },
  cardPreview: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.textSecondary,
    marginTop: GhostMode.space.xs,
  },
  empty: {
    ...GhostMode.typography.body,
    color: GhostMode.colors.textTertiary,
    textAlign: 'center',
    marginTop: GhostMode.space.xl,
  },
  hint: {
    ...GhostMode.typography.caption,
    color: GhostMode.colors.textTertiary,
    textAlign: 'center',
    marginTop: GhostMode.space.md,
  },
});
