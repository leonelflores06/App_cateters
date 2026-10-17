import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { listWithStats, type CatheterRow } from './src/db';
import DashboardScreen from './src/screens/DashboardScreen';
import LoadScreen from './src/screens/LoadScreen';
import { ThemeProvider, useStyles, useTheme, type Palette, type ThemeMode } from './src/theme';

type Tab = 'cargar' | 'panel';

const NEXT_MODE: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
const MODE_LABEL: Record<ThemeMode, string> = { system: '◐ Auto', light: '☀️ Claro', dark: '🌙 Oscuro' };

export default function App() {
  return (
    <ThemeProvider>
      <Main />
    </ThemeProvider>
  );
}

function Main() {
  const styles = useStyles(makeStyles);
  const { c, isDark, mode, setMode } = useTheme();
  const [tab, setTab] = useState<Tab>('cargar');
  const [rows, setRows] = useState<CatheterRow[]>([]);

  const reload = useCallback(async () => {
    setRows(await listWithStats());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Fondo nativo (detrás de la app y al rotar/abrir el teclado) acorde al tema.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>Stock de catéteres</Text>
          <Text style={styles.version}>v{Constants.expoConfig?.version ?? '?'}</Text>
        </View>
        <Pressable style={styles.modeBtn} onPress={() => setMode(NEXT_MODE[mode])}>
          <Text style={styles.modeTxt}>{MODE_LABEL[mode]}</Text>
        </Pressable>
      </View>

      {/* Las dos pantallas quedan montadas para no perder lo que se estaba cargando al cambiar de apartado. */}
      <View style={[styles.screen, tab !== 'cargar' && styles.hidden]}>
        <LoadScreen rows={rows} reload={reload} />
      </View>
      <View style={[styles.screen, tab !== 'panel' && styles.hidden]}>
        <DashboardScreen rows={rows} />
      </View>

      <View style={styles.tabs}>
        <TabButton label="Cargar" icon="🎤" active={tab === 'cargar'} onPress={() => setTab('cargar')} />
        <TabButton label="Panel" icon="📊" active={tab === 'panel'} onPress={() => setTab('panel')} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={styles.tabIcon}>{icon}</Text>
      <Text style={[styles.tabTxt, active && styles.tabTxtOn]}>{label}</Text>
      {active && <View style={styles.tabBar} />}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, paddingTop: 40 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
    titleBox: { flex: 1 },
    title: { fontSize: 22, fontWeight: '700', color: c.text },
    version: { fontSize: 11, color: c.muted },
    modeBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
    modeTxt: { fontSize: 13, color: c.text },
    screen: { flex: 1 },
    hidden: { display: 'none' },
    tabs: { flexDirection: 'row', backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border, paddingBottom: 8 },
    tab: { flex: 1, alignItems: 'center', paddingTop: 8 },
    tabIcon: { fontSize: 20 },
    tabTxt: { fontSize: 12, color: c.muted, marginTop: 2 },
    tabTxtOn: { color: c.primary, fontWeight: '700' },
    tabBar: { position: 'absolute', top: 0, height: 3, width: 40, backgroundColor: c.primary, borderRadius: 2 },
  });
