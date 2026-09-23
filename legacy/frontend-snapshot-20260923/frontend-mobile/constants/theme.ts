export const GhostMode = {
  colors: {
    background: '#FCFCFD', surface: '#FFFFFF', surfaceElevated: '#FFFFFF',
    surfaceSunken: '#F7F8FA', border: '#EEF0F4', borderStrong: '#E2E5EB',
    text: '#0B0D12', textSecondary: '#5C6472', textTertiary: '#9AA1AE',
    accent: '#6366F1', accentSoft: '#EEF0FF', success: '#10B981',
    warning: '#F59E0B', danger: '#EF4444', consoleBg: '#0B0D12',
    consoleText: '#E5E7EB', consoleAccent: '#818CF8', ledgerTag: '#F3F4F6',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  shadow: {
    soft: { shadowColor: '#0B0D12', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 },
    medium: { shadowColor: '#0B0D12', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 4 },
    lifted: { shadowColor: '#0B0D12', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 32, elevation: 8 },
  },
  typography: {
    display: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.5 },
    title: { fontSize: 22, lineHeight: 30, fontWeight: '600' as const, letterSpacing: -0.3 },
    heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
    body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
    caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
    mono: { fontSize: 13, lineHeight: 20, fontFamily: 'Courier', fontWeight: '400' as const },
  },
};
