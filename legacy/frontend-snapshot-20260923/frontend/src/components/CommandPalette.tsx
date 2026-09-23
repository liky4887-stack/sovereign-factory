import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Command {
  id: string;
  label: string;
  hint: string;
  section: string;
  action: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ visible, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.section.toLowerCase().includes(query.toLowerCase())
  );

  const executeSelected = useCallback(() => {
    if (filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      onClose();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [filtered, selectedIndex, onClose]);

  const grouped = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    if (!acc[cmd.section]) acc[cmd.section] = [];
    acc[cmd.section].push(cmd);
    return acc;
  }, {});

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>{'>'}</Text>
            <TextInput
              autoFocus
              value={query}
              onChangeText={(t) => { setQuery(t); setSelectedIndex(0); }}
              placeholder="Type a command..."
              placeholderTextColor={theme.textMuted}
              style={styles.input}
              onSubmitEditing={executeSelected}
            />
          </View>

          <View style={styles.divider} />

          <FlatList
            data={Object.entries(grouped)}
            keyExtractor={([section]) => section}
            renderItem={({ item: [section, cmds] }) => (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{section}</Text>
                {cmds.map((cmd) => {
                  const idx = filtered.indexOf(cmd);
                  return (
                    <Pressable
                      key={cmd.id}
                      onPress={() => { cmd.action(); onClose(); setQuery(''); }}
                      onHoverIn={() => setSelectedIndex(idx)}
                      style={[styles.cmdItem, idx === selectedIndex && styles.cmdItemActive]}
                    >
                      <Text style={[styles.cmdLabel, idx === selectedIndex && styles.cmdLabelActive]}>{cmd.label}</Text>
                      <Text style={[styles.cmdHint, idx === selectedIndex && styles.cmdHintActive]}>{cmd.hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            style={styles.list}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 120,
  },
  panel: {
    width: '90%',
    maxWidth: 560,
    backgroundColor: theme.surface2,
    borderRadius: theme.radiusLg,
    borderWidth: 1,
    borderColor: theme.borderLight,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
    color: theme.textMuted,
    fontFamily: 'monospace',
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
    padding: 0,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
  },
  list: {
    maxHeight: 320,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  section: {
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cmdItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cmdItemActive: {
    backgroundColor: theme.accentBg,
  },
  cmdLabel: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  cmdLabelActive: {
    color: theme.text,
  },
  cmdHint: {
    fontSize: 11,
    color: theme.textMuted,
    fontFamily: 'monospace',
  },
  cmdHintActive: {
    color: theme.accent,
  },
});
