import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { FactoryProvider, useFactory } from './store/FactoryContext';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { CommandPalette } from './components/CommandPalette';
import { CEODashboard } from './screens/CEODashboard';
import { GodView } from './screens/GodView';
import { AgentSwarm } from './screens/AgentSwarm';
import { TruthLedger } from './screens/TruthLedger';
import { OmegaSwitch } from './screens/OmegaSwitch';
import { LLMCookies } from './screens/LLMCookies';
import { IDE } from './screens/IDE';
import { theme } from './theme';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◆' },
  { key: 'godview', label: 'God View', icon: '◇' },
  { key: 'swarm', label: 'Agent Swarm', icon: '⬡' },
  { key: 'ledger', label: 'Truth Ledger', icon: '☰' },
  { key: 'omega', label: 'Omega Switch', icon: '⚡' },
  { key: 'ide', label: 'IDE', icon: '⌘' },
];

const BOTTOM_ITEMS = [
  { key: 'llm', label: 'LLM & Cookies', icon: '⚙' },
];

const TITLES: Record<string, string> = {
  dashboard: 'CEO Dashboard',
  godview: 'God View',
  swarm: 'Agent Swarm',
  ledger: 'Truth Ledger',
  omega: 'Omega Switch',
  ide: 'IDE',
  llm: 'LLM & Cookies',
};

function Shell() {
  const [active, setActive] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { error } = useFactory();
  const online = !error;

  const navigate = useCallback((key: string) => {
    setActive(key);
  }, []);

  const commands = [
    ...NAV_ITEMS.map((item) => ({
      id: `nav-${item.key}`,
      label: `Go to ${item.label}`,
      hint: item.icon,
      section: 'Navigation',
      action: () => navigate(item.key),
    })),
    ...BOTTOM_ITEMS.map((item) => ({
      id: `nav-${item.key}`,
      label: `Go to ${item.label}`,
      hint: item.icon,
      section: 'Navigation',
      action: () => navigate(item.key),
    })),
  ];

  const renderScreen = () => {
    switch (active) {
      case 'dashboard': return <CEODashboard navigation={{ navigate }} />;
      case 'godview': return <GodView />;
      case 'swarm': return <AgentSwarm />;
      case 'ledger': return <TruthLedger />;
      case 'omega': return <OmegaSwitch />;
      case 'ide': return <IDE />;
      case 'llm': return <LLMCookies />;
      default: return <CEODashboard navigation={{ navigate }} />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.inner}>
        <Sidebar active={active} onNavigate={navigate} items={NAV_ITEMS} bottomItems={BOTTOM_ITEMS} />
        <View style={styles.main}>
          <TopBar title={TITLES[active]} online={online} onCommandPalette={() => setPaletteOpen(true)} />
          <View style={styles.content}>
            {renderScreen()}
          </View>
        </View>
        <CommandPalette
          visible={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={commands}
        />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FactoryProvider>
        <StatusBar style="light" />
        <Shell />
      </FactoryProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
  },
  main: {
    flex: 1,
    flexDirection: 'column',
  },
  content: {
    flex: 1,
    backgroundColor: theme.bg,
  },
});
