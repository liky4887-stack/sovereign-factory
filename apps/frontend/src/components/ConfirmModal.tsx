import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  destructive = false, onConfirm, onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ hovered }: any) => [styles.btn, styles.btnGhost, hovered && styles.btnGhostHover]}>
              <Text style={styles.btnGhostText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={({ hovered }: any) => [styles.btn, destructive ? styles.btnDanger : styles.btnPrimary, hovered && styles.btnPrimaryHover]}>
              <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, backgroundColor: theme.surface2, borderRadius: theme.radiusLg, borderWidth: 1, borderColor: theme.borderLight, padding: 20 },
  title: { fontSize: 15, fontWeight: '600', color: theme.text, marginBottom: 8 },
  message: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, marginBottom: 18 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 6 },
  btnGhost: { backgroundColor: theme.surface3 },
  btnGhostHover: { backgroundColor: theme.border },
  btnPrimary: { backgroundColor: theme.accent },
  btnPrimaryHover: { backgroundColor: theme.accentHover },
  btnDanger: { backgroundColor: theme.danger },
  btnGhostText: { fontSize: 13, fontWeight: '500', color: theme.textSecondary },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
});
