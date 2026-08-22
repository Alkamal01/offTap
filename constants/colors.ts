export interface ThemeColors {
  background: string;
  surface: string;
  surfaceSolid: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  border: string;
  inputBg: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  statusBar: 'dark' | 'light';
}

export const colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    background: '#F5F6F8',
    surface: '#FFFFFF',
    surfaceSolid: '#FFFFFF',
    card: '#FFFFFF',
    text: '#111827',
    textSecondary: '#46556F',
    textMuted: '#7C8DA6',
    accent: '#111827',
    accentFg: '#FFFFFF',
    accentSoft: 'rgba(17, 24, 39, 0.08)',
    border: '#E4E7EC',
    inputBg: '#F1F2F5',
    success: '#16A34A',
    successSoft: 'rgba(22, 163, 74, 0.12)',
    warning: '#D97706',
    warningSoft: 'rgba(217, 119, 6, 0.12)',
    danger: '#DC2626',
    dangerSoft: 'rgba(220, 38, 38, 0.12)',
    statusBar: 'dark' as const,
  },
  dark: {
    background: '#080A0F',
    surface: '#111827',
    surfaceSolid: '#0D1017',
    card: '#111827',
    text: '#F5F6F8',
    textSecondary: '#A7B0C0',
    textMuted: '#7C8DA6',
    accent: '#7C8DA6',
    accentFg: '#080A0F',
    accentSoft: 'rgba(124, 141, 166, 0.14)',
    border: 'rgba(124, 141, 166, 0.16)',
    inputBg: '#0D1017',
    success: '#22C55E',
    successSoft: 'rgba(34, 197, 94, 0.16)',
    warning: '#F59E0B',
    warningSoft: 'rgba(245, 158, 11, 0.16)',
    danger: '#EF4444',
    dangerSoft: 'rgba(239, 68, 68, 0.16)',
    statusBar: 'light' as const,
  },
};

export type ThemeMode = 'light' | 'dark' | 'system';
