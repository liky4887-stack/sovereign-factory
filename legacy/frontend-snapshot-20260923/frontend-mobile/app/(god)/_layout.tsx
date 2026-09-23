import { Stack } from 'expo-router';
import { GhostMode } from '@/constants/theme';

export default function GodLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: GhostMode.colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
