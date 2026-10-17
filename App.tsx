import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { listWithStats, type CatheterRow } from './src/db';
import DashboardScreen from './src/screens/DashboardScreen';
import LoadScreen from './src/screens/LoadScreen';
import { colors } from './src/ui';

type Tab = 'cargar' | 'panel';

export default function App() {
  const [tab, setTab] = useState<Tab>('cargar');
  const [rows, setRows] = useState<CatheterRow[]>([]);

  const reload = useCallback(async () => {
    setRows(await listWithStats());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Stock de catéteres</Text>

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
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={styles.tabIcon}>{icon}</Text>
      <Text style={[styles.tabTxt, active && styles.tabTxtOn]}>{label}</Text>
      {active && <View style={styles.tabBar} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 40 },
  title: { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 4 },
  screen: { flex: 1 },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#dde', paddingBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8 },
  tabIcon: { fontSize: 20 },
  tabTxt: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabTxtOn: { color: colors.primary, fontWeight: '700' },
  tabBar: { position: 'absolute', top: 0, height: 3, width: 40, backgroundColor: colors.primary, borderRadius: 2 },
});
