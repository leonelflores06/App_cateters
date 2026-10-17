import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  addCatheter,
  applyMovement,
  getStats,
  listCatheters,
  type Catheter,
  type Stats,
} from './src/db';
import { parseCommand, type ParseResult } from './src/parser';
import { explain, explainChange } from './src/reasoning';
import { cancelListening, MAX_SECONDS, startListening, stopAndTranscribe, warmUp } from './src/voice';

type Row = Catheter & { stats: Stats };

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [min, setMin] = useState('');

  // Registro por voz / texto
  const [cmd, setCmd] = useState('');
  const [phase, setPhase] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const list = await listCatheters();
    const withStats = await Promise.all(list.map(async (c) => ({ ...c, stats: await getStats(c) })));
    setRows(withStats);
  }, []);

  useEffect(() => {
    load();
    warmUp();
  }, [load]);

  const interpret = (text: string) => {
    setSummary([]);
    setParsed(text.trim() ? parseCommand(text, rows) : null);
  };

  const finishListening = useCallback(async () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    setPhase('transcribing');
    try {
      const text = await stopAndTranscribe();
      if (!text) {
        Alert.alert('No te escuché', 'Probá de nuevo, hablando más cerca del micrófono.');
        return;
      }
      setCmd(text);
      setSummary([]);
      setParsed(parseCommand(text, rows));
    } catch (e: any) {
      Alert.alert('Voz', e?.message ?? 'No se pudo transcribir.');
    } finally {
      setPhase('idle');
    }
  }, [rows]);

  const onMic = async () => {
    if (phase === 'transcribing') return;
    if (phase === 'listening') return finishListening();
    try {
      setParsed(null);
      setSummary([]);
      await startListening();
      setPhase('listening');
      stopTimer.current = setTimeout(finishListening, MAX_SECONDS * 1000);
    } catch (e: any) {
      Alert.alert('Voz', e?.message ?? 'No se pudo iniciar el micrófono.');
    }
  };

  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    cancelListening();
  }, []);

  const confirm = async () => {
    if (!parsed?.items.length) return;
    const before = new Map(rows.map((r) => [r.id, r.stock]));
    for (const it of parsed.items) {
      await applyMovement(it.catheterId, it.delta, `Voz/texto: "${cmd.trim()}"`);
    }
    const list = await listCatheters();
    const withStats = await Promise.all(list.map(async (c) => ({ ...c, stats: await getStats(c) })));
    setRows(withStats);
    setSummary(
      parsed.items.flatMap((it) => {
        const c = withStats.find((r) => r.id === it.catheterId);
        return c ? [explainChange(c, before.get(c.id) ?? 0, c.stock, c.stats)] : [];
      })
    );
    setParsed(null);
    setCmd('');
  };

  const onAdd = async () => {
    if (!name.trim()) return;
    try {
      await addCatheter(name, parseInt(stock || '0', 10), parseInt(min || '0', 10));
      setName('');
      setStock('');
      setMin('');
      load();
    } catch {
      Alert.alert('Error', 'Ya existe un catéter con ese nombre.');
    }
  };

  const move = async (c: Catheter, delta: number) => {
    await applyMovement(c.id, delta, delta < 0 ? 'Uso manual' : 'Reposición manual');
    load();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Stock de catéteres</Text>

      <View style={styles.form}>
        <TextInput style={[styles.input, { flex: 2 }]} placeholder="Nombre (ej. 18G)" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Stock" keyboardType="numeric" value={stock} onChangeText={setStock} />
        <TextInput style={styles.input} placeholder="Mín." keyboardType="numeric" value={min} onChangeText={setMin} />
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addTxt}>+</Text>
        </Pressable>
      </View>

      <View style={styles.voiceBox}>
        <View style={styles.voiceRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder='Decí o escribí: "usé 3 de 18G y 1 de 20G"'
            value={cmd}
            onChangeText={(t) => {
              setCmd(t);
              interpret(t);
            }}
            multiline={false}
          />
          <Pressable
            style={[styles.mic, phase === 'listening' && styles.micOn]}
            onPress={onMic}
            disabled={phase === 'transcribing'}
          >
            {phase === 'transcribing' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.micTxt}>{phase === 'listening' ? '■' : '🎤'}</Text>
            )}
          </Pressable>
        </View>
        {phase === 'listening' && <Text style={styles.hint}>Escuchando… tocá ■ para terminar.</Text>}
        {phase === 'transcribing' && <Text style={styles.hint}>Transcribiendo en el celular…</Text>}
        {parsed && (
          <View style={styles.preview}>
            {parsed.items.map((it) => (
              <Text key={it.catheterId} style={styles.previewLine}>
                {it.delta < 0 ? '−' : '+'}
                {Math.abs(it.delta)} · {it.name}
              </Text>
            ))}
            {parsed.unknown.map((u, i) => (
              <Text key={i} style={styles.unknown}>
                No entendí: "{u}"
              </Text>
            ))}
            {!parsed.items.length && !parsed.unknown.length && (
              <Text style={styles.unknown}>No encontré ningún catéter en la frase.</Text>
            )}
            {!!parsed.items.length && (
              <Pressable style={styles.confirm} onPress={confirm}>
                <Text style={styles.confirmTxt}>Confirmar</Text>
              </Pressable>
            )}
          </View>
        )}
        {summary.map((line, i) => (
          <Text key={i} style={styles.summary}>
            ✓ {line}
          </Text>
        ))}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        ListEmptyComponent={<Text style={styles.empty}>Todavía no cargaste catéteres.</Text>}
        renderItem={({ item }) => {
          const low = item.min_stock > 0 && item.stock <= item.min_stock;
          return (
            <View style={[styles.card, low && styles.cardLow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.stock}>{item.stock} u.</Text>
                <Text style={styles.note}>{explain(item, item.stats)}</Text>
              </View>
              <View style={styles.btns}>
                <Pressable style={styles.btn} onPress={() => move(item, -1)}>
                  <Text style={styles.btnTxt}>−1</Text>
                </Pressable>
                <Pressable style={styles.btn} onPress={() => move(item, +1)}>
                  <Text style={styles.btnTxt}>+1</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8', padding: 16, paddingTop: 48 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  form: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, height: 42 },
  addBtn: { backgroundColor: '#0a7ea4', borderRadius: 8, width: 42, alignItems: 'center', justifyContent: 'center' },
  addTxt: { color: '#fff', fontSize: 22, fontWeight: '700' },
  voiceBox: { backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 12, gap: 8 },
  voiceRow: { flexDirection: 'row', gap: 6 },
  mic: { backgroundColor: '#0a7ea4', borderRadius: 8, width: 46, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: '#e5484d' },
  micTxt: { color: '#fff', fontSize: 20 },
  hint: { color: '#555', fontSize: 13 },
  preview: { backgroundColor: '#f4f6f8', borderRadius: 8, padding: 10, gap: 4 },
  previewLine: { fontSize: 16, fontWeight: '600' },
  unknown: { color: '#b3261e', fontSize: 13 },
  confirm: { backgroundColor: '#0a7ea4', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 6 },
  confirmTxt: { color: '#fff', fontWeight: '700' },
  summary: { color: '#1a7f37', fontSize: 13 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, gap: 10 },
  cardLow: { borderWidth: 2, borderColor: '#e5484d' },
  name: { fontSize: 16, fontWeight: '600' },
  stock: { fontSize: 22, fontWeight: '700', marginVertical: 2 },
  note: { color: '#555', fontSize: 13 },
  btns: { justifyContent: 'center', gap: 6 },
  btn: { backgroundColor: '#e8eef2', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnTxt: { fontWeight: '700' },
});
