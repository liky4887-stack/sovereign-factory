// constants/ideTheme.ts
// IDE-specific dark-first tokens. Additive — does not modify GhostMode.

export const IDE = {
  color: {
    surface:    '#0B0D12',
    panel:      '#0F1219',
    panelAlt:   '#131722',
    border:     '#1F242E',
    borderSoft: '#161A22',
    text:       '#E5E7EB',
    textMuted:  '#9AA1AE',
    textDim:    '#6B7280',
    accent:     '#818CF8',
    accentSoft: '#1E1B4B',
    success:    '#10B981',
    danger:     '#EF4444',
    warning:    '#F59E0B',
    editorBg:   '#0A0B10',
    gutterBg:   '#0F1219',
    previewBg:  '#07080C',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 4, md: 6, lg: 8, xl: 12 },
  font: {
    mono:  'Courier',
    ui:    undefined as string | undefined,
    sizeCode: 13,
    sizeUI:   13,
    sizeLabel: 11,
    lineHeightCode: 20,
  },
} as const;
