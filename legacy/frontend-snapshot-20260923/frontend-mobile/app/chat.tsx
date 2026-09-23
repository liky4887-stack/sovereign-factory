import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostMode } from '@/constants/theme';
import { useGhostStore } from '@/store/useGhostStore';
import { antiHallucination } from '@/services/antiHallucination';
import { truthLedger } from '@/services/truthLedger';
import { chatSessions, type ChatSession } from '@/services/chatSessions';

interface Message {
  id: string;
  role: 'ceo' | 'system' | 'agent';
  agentName?: string;
  content: string;
  timestamp: number;
}

export default function CEODashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useGhostStore((s) => s.session);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'm1', role: 'ceo', content: 'Welcome back. The swarm is idle. What shall we build today?', timestamp: Date.now() - 60000 },
  ]);
  const [input, setInput] = useState('');
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const s = await chatSessions.ensureCurrent();
      setChatSession(s);
      // Hydrate messages from persisted session if any
      if (s.messages.length > 0) {
        setMessages(s.messages);
      } else {
        // Persist the welcome message into the new session
        const welcome = messages[0];
        if (welcome) {
          await chatSessions.appendMessage(s.id, welcome);
        }
      }
    })();
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: `m-${Date.now()}`, role: 'ceo', content: input.trim(), timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (chatSession) {
      await chatSessions.appendMessage(chatSession.id, userMsg);
    }
    const audit = await antiHallucination.audit(input, messages.map((m) => m.content));
    const systemMsg: Message = {
      id: `m-${Date.now()}-sys`,
      role: 'system',
      content: audit.passed
        ? `Audit passed (${(audit.confidence * 100).toFixed(0)}% confidence). Delegating to swarm.`
        : `Audit flagged ${audit.conflicts.length} conflict(s). Resolving against Truth Ledger.`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, systemMsg]);
    if (chatSession) {
      await chatSessions.appendMessage(chatSession.id, systemMsg);
    }
    await truthLedger.record({
      type: 'decision',
      title: `CEO directive: ${input.slice(0, 60)}`,
      content: input,
      tags: ['ceo', 'directive'],
      author: 'CEO',
    });
    setTimeout(() => {
      const agentMsg: Message = {
        id: `m-${Date.now()}-agent`,
        role: 'agent',
        agentName: 'Architect',
        content: 'Scaffolding the module now. Chaos Monkey is spinning up parallel stress tests.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);
      if (chatSession) {
        void chatSessions.appendMessage(chatSession.id, agentMsg);
      }
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 1200);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + GhostMode.space.lg }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.display}>Ghost Mode</Text>
            <Text style={styles.caption}>{session ? `Signed in as ${session.user.name}` : 'Orchestrating swarm…'}</Text>
          </View>
          <Pressable onPress={() => router.push('/admin')} style={styles.avatar}>
            <Text style={styles.avatarText}>GM</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll} contentContainerStyle={styles.actionsContent}>
          {[
            { label: 'Missions', route: '/missions' },
            { label: 'Agents', route: '/agents' },
            { label: 'Tools', route: '/tools' },
            { label: 'Offers', route: '/offers' },
            { label: 'Settings', route: '/settings' },
            { label: 'God View', route: '/(god)' },
            { label: 'Live Console', route: '/console' },
            { label: 'Code Preview', route: '/preview' },
            { label: 'Truth Ledger', route: '/ledger' },
            { label: 'Skill Forge', route: '/skills' },
            { label: 'Autopilot', route: '/autopilot' },
          ].map((action) => (
            <Pressable key={action.route} onPress={() => router.push(action.route as any)} style={styles.actionChip}>
              <Text style={styles.actionChipText}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.threadContent} showsVerticalScrollIndicator={false}>
          {messages.map((msg) => (
            <View key={msg.id} style={[styles.messageRow, msg.role === 'ceo' && styles.messageRowCEO]}>
              {msg.role !== 'ceo' && (
                <View style={styles.agentBadge}>
                  <Text style={styles.agentBadgeText}>{msg.agentName ?? 'System'}</Text>
                </View>
              )}
              <View style={[styles.bubble, msg.role === 'ceo' && styles.bubbleCEO, msg.role === 'system' && styles.bubbleSystem]}>
                <Text style={[styles.bubbleText, msg.role === 'ceo' && styles.bubbleTextCEO, msg.role === 'system' && styles.bubbleTextSystem]}>
                  {msg.content}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + GhostMode.space.sm }]}>
          <TextInput value={input} onChangeText={setInput} placeholder="Direct the swarm…" placeholderTextColor={GhostMode.colors.textTertiary} style={styles.input} multiline maxLength={500} />
          <Pressable onPress={sendMessage} style={styles.sendButton}>
            <Text style={styles.sendButtonText}>↑</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: GhostMode.colors.background, paddingHorizontal: GhostMode.space.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: GhostMode.space.xl },
  display: { ...GhostMode.typography.display, color: GhostMode.colors.text },
  caption: { ...GhostMode.typography.caption, color: GhostMode.colors.textSecondary, marginTop: GhostMode.space.xs },
  avatar: { width: 44, height: 44, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.accentSoft, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.soft },
  avatarText: { ...GhostMode.typography.caption, color: GhostMode.colors.accent, fontWeight: '700' },
  actionsScroll: { maxHeight: 44, marginBottom: GhostMode.space.lg },
  actionsContent: { gap: GhostMode.space.sm, paddingRight: GhostMode.space.lg },
  actionChip: { paddingHorizontal: GhostMode.space.lg, paddingVertical: GhostMode.space.sm, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, ...GhostMode.shadow.soft },
  actionChipText: { ...GhostMode.typography.caption, color: GhostMode.colors.text, fontWeight: '500' },
  threadContent: { paddingBottom: GhostMode.space.xl, gap: GhostMode.space.lg },
  messageRow: { alignItems: 'flex-start', gap: GhostMode.space.xs },
  messageRowCEO: { alignItems: 'flex-end' },
  agentBadge: { paddingHorizontal: GhostMode.space.sm, paddingVertical: 2, borderRadius: GhostMode.radius.sm, backgroundColor: GhostMode.colors.ledgerTag },
  agentBadgeText: { ...GhostMode.typography.caption, fontSize: 11, color: GhostMode.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
  bubble: { maxWidth: '85%', padding: GhostMode.space.lg, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.surface, ...GhostMode.shadow.soft },
  bubbleCEO: { backgroundColor: GhostMode.colors.accent },
  bubbleSystem: { backgroundColor: GhostMode.colors.surfaceSunken, borderWidth: 1, borderColor: GhostMode.colors.border },
  bubbleText: { ...GhostMode.typography.body, color: GhostMode.colors.text },
  bubbleTextCEO: { color: '#FFFFFF' },
  bubbleTextSystem: { color: GhostMode.colors.textSecondary, fontStyle: 'italic' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: GhostMode.space.sm, paddingTop: GhostMode.space.md },
  input: { flex: 1, minHeight: 48, maxHeight: 120, paddingHorizontal: GhostMode.space.lg, paddingVertical: GhostMode.space.md, borderRadius: GhostMode.radius.xl, backgroundColor: GhostMode.colors.surface, borderWidth: 1, borderColor: GhostMode.colors.border, ...GhostMode.typography.body, color: GhostMode.colors.text, ...GhostMode.shadow.soft },
  sendButton: { width: 48, height: 48, borderRadius: GhostMode.radius.pill, backgroundColor: GhostMode.colors.accent, alignItems: 'center', justifyContent: 'center', ...GhostMode.shadow.medium },
  sendButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
});
