import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { getSetting, setSetting } from './db';

const light = {
  bg: '#f4f6f8',
  card: '#ffffff',
  input: '#f4f6f8',
  border: '#d7dde3',
  primary: '#0a7ea4',
  onPrimary: '#ffffff',
  danger: '#e5484d',
  dangerText: '#b3261e',
  ok: '#1a7f37',
  warn: '#d97706',
  text: '#11181c',
  muted: '#667080',
  placeholder: '#8a94a0',
  track: '#e8eef2',
  useBg: '#fde8e8',
  addBg: '#e3f5e8',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0f1417',
  card: '#1a2228',
  input: '#232d34',
  border: '#2f3a42',
  primary: '#2ea6cf',
  onPrimary: '#ffffff',
  danger: '#f2555a',
  dangerText: '#ff8f8f',
  ok: '#3fb950',
  warn: '#f0a020',
  text: '#e6edf3',
  muted: '#9aa5b1',
  placeholder: '#6f7b86',
  track: '#2a343b',
  useBg: '#4a2023',
  addBg: '#1c3a26',
};

/** "system" sigue el modo del celular. */
export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeValue = { c: Palette; isDark: boolean; mode: ThemeMode; setMode: (m: ThemeMode) => void };

const ThemeContext = createContext<ThemeValue>({ c: light, isDark: false, mode: 'system', setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    getSetting('theme').then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
    return {
      c: isDark ? dark : light,
      isDark,
      mode,
      setMode: (m) => {
        setModeState(m);
        setSetting('theme', m);
      },
    };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Estilos que dependen de la paleta; se recalculan solo al cambiar de tema. */
export function useStyles<T>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  return useMemo(() => factory(c), [c, factory]);
}

/** Estilos comunes a varias pantallas. */
export const sharedStyles = (c: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: c.card, borderRadius: 12, padding: 12, marginBottom: 12 },
    sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, color: c.text },
    input: { flex: 1, backgroundColor: c.input, color: c.text, borderRadius: 8, paddingHorizontal: 10, height: 42 },
    muted: { color: c.muted, fontSize: 13 },
  });
