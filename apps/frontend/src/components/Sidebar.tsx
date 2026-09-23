import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface NavItem {
  key: string;
  label: string;
  icon: string;
}

interface Props {
  active: string;
  onNavigate: (key: string) => void;
  items: NavItem[];
  bottomItems?: NavItem[];
}

function NavButton({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [
      styles.navItem,
      active && styles.navItemActive,
      hovered && !active && styles.navItemHover,
    ]}>
      <Text style={[styles.navIcon, active && styles.navIconActive]}>{item.icon}</Text>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
    </Pressable>
  );
}

export function Sidebar({ active, onNavigate, items, bottomItems }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoMark}>AI</Text>
        </View>
        <Text style={styles.logoText}>Factory</Text>
      </View>

      <View style={styles.navSection}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => onNavigate(item.key)}
            onHoverIn={() => setHovered(item.key)}
            onHoverOut={() => setHovered(null)}
          >
            <NavButton item={item} active={active === item.key || hovered === item.key} onPress={() => onNavigate(item.key)} />
          </Pressable>
        ))}
      </View>

      {bottomItems ? (
        <View style={styles.bottomSection}>
          {bottomItems.map((item) => (
            <NavButton key={item.key} item={item} active={active === item.key} onPress={() => onNavigate(item.key)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: theme.sidebarWidth,
    backgroundColor: theme.surface,
    borderRightWidth: 1,
    borderRightColor: theme.border,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: theme.topbarHeight,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 8,
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.text,
  },
  navSection: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    marginBottom: 2,
  },
  navItemActive: {
    backgroundColor: theme.accentBg,
  },
  navItemHover: {
    backgroundColor: theme.surface2,
  },
  navIcon: {
    fontSize: 14,
    marginRight: 10,
    color: theme.textMuted,
    fontFamily: 'monospace',
    textAlign: 'center',
    width: 18,
  },
  navIconActive: {
    color: theme.accent,
  },
  navLabel: {
    fontSize: 13,
    color: theme.textSecondary,
    fontWeight: '400',
  },
  navLabelActive: {
    color: theme.text,
    fontWeight: '500',
  },
  bottomSection: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
});
