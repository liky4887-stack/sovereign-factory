import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGhostStore } from '@/store/useGhostStore';
import { GhostMode } from '@/constants/theme';

export default function RootLayout() {
  const init = useGhostStore((s) => s.init);
  useEffect(() => { init(); }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: GhostMode.colors.background }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: GhostMode.colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="missions" />
          <Stack.Screen name="missions/[id]" />
          <Stack.Screen name="agents" />
          <Stack.Screen name="tools" />
          <Stack.Screen name="offers" />
          <Stack.Screen name="offers/[id]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="sessions" />
          <Stack.Screen name="ide" />
          <Stack.Screen name="console" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="preview" />
          <Stack.Screen name="ledger" />
          <Stack.Screen name="skills" />
          <Stack.Screen name="autopilot" />
          <Stack.Screen name="(god)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
