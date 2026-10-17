import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addCatheter, applyMovement, listWithStats, type CatheterRow } from '../db';
import { parseCommand, type ParsedItem } from '../parser';
import { explain, explainChange } from '../reasoning';
import { sharedStyles, useStyles, useTheme, type Palette } from '../theme';
import { cancelListening, MAX_SECONDS, startListening, stopAndTranscribe, warmUp } from '../voice';

type Draft = { items: ParsedItem[]; unknown: string[] };

/** Apartado "Cargar": registrar uso/reposición por voz o texto, revisar y Actualizar o Descartar. */
export default function LoadScreen({ rows, reload }: { rows: CatheterRow[]; reload: () => Promise<void> }) {
  const styles = useStyles(makeStyles);
  const ui = useStyles(sharedStyles);
  const { c: colors } = useTheme();
  const [cmd, setCmd] = useState('');
  const [phase, setPhase] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [min, setMin] = useState('');

  useEffect(() => {
    warmUp();
    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      cancelListening();
    };
  }, []);

  const interpret = (text: string) => {
    setSummary([]);
    setDraft(text.trim() ? parseCommand(text, rows) : null);
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
      setDraft(parseCommand(text, rows));
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
      setDraft(null);
      setSummary([]);
      await startListening();
      setPhase('listening');
      stopTimer.current = setTimeout(finishListening, MAX_SECONDS * 1000);
    } catch (e: any) {
      Alert.alert('Voz', e?.message ?? 'No se pudo iniciar el micrófono.');
    }
  };

  /** Corrige la cantidad de una línea (si llega a 0 se quita). */
  const adjust = (id: number, step: number) => {
    setDraft((d) => {
      if (!d) return d;
      const items = d.items
        .map((it) => {
          if (it.catheterId !== id) return it;
          const qty = Math.abs(it.delta) + step;
          return { ...it, delta: Math.sign(it.delta) * qty };
        })
        .filter((it) => it.delta !== 0);
      return { ...d, items };
    });
  };
  const removeItem = (id: number) =>
    setDraft((d) => (d ? { ...d, items: d.items.filter((it) => it.catheterId !== id) } : d));
  /** Da vuelta uso <-> reposición por si entendió al revés. */
  const flip = (id: number) =>
    setDraft((d) =>
      d ? { ...d, items: d.items.map((it) => (it.catheterId === id ? { ...it, delta: -it.delta } : it)) } : d
    );

  const discard = () => {
    setDraft(null);
    setCmd('');
    setSummary([]);
  };

  const commit = async () => {
    if (!draft?.items.length || saving) return;
    setSaving(true);
    try {
      const before = new Map(rows.map((r) => [r.id, r.stock]));
      for (const it of draft.items) {
        await applyMovement(it.catheterId, it.delta, `Voz/texto: "${cmd.trim()}"`);
      }
      const fresh = await listWithStats();
      await reload();
      setSummary(
        draft.items.flatMap((it) => {
          const c = fresh.find((r) => r.id === it.catheterId);
          return c ? [explainChange(c, before.get(c.id) ?? 0, c.stock, c.stats)] : [];
        })
      );
      setDraft(null);
      setCmd('');
    } finally {
      setSaving(false);
    }
  };

  const onAdd = async () => {
    if (!name.trim()) return;
    try {
      await addCatheter(name, parseInt(stock || '0', 10), parseInt(min || '0', 10));
      setName('');
      setStock('');
      setMin('');
      reload();
    } catch {
      Alert.alert('Error', 'Ya existe un catéter con ese nombre.');
    }
  };

  const move = async (id: number, delta: number) => {
    await applyMovement(id, delta, delta < 0 ? 'Uso manual' : 'Reposición manual');
    reload();
  };

  const header = (
    <View>
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Registrar uso o reposición</Text>
        <View style={styles.row}>
          <TextInput
            style={ui.input}
            placeholderTextColor={colors.placeholder}
            placeholder='Decí o escribí: "usé 3 de 18G y 1 de 20G"'
            value={cmd}
            onChangeText={(t) => {
              setCmd(t);
              interpret(t);
            }}
          />
          <Pressable
            style={[styles.mic, phase === 'listening' && styles.micOn]}
            onPress={onMic}
            disabled={phase === 'transcribing'}
          >
            {phase === 'transcribing' ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.micTxt}>{phase === 'listening' ? '■' : '🎤'}</Text>
            )}
          </Pressable>
        </View>
        {phase === 'listening' && <Text style={[ui.muted, styles.gapTop]}>Escuchando… tocá ■ para terminar.</Text>}
        {phase === 'transcribing' && <Text style={[ui.muted, styles.gapTop]}>Transcribiendo en el celular…</Text>}

        {draft && (
          <View style={styles.preview}>
            <Text style={ui.muted}>Revisá antes de guardar:</Text>
            {draft.items.map((it) => (
              <View key={it.catheterId} style={styles.item}>
                <Pressable onPress={() => flip(it.catheterId)} style={[styles.tag, it.delta < 0 ? styles.tagUse : styles.tagAdd]}>
                  <Text style={styles.tagTxt}>{it.delta < 0 ? 'Uso' : 'Repone'}</Text>
                </Pressable>
                <Text style={styles.itemName} numberOfLines={1}>
                  {it.name}
                </Text>
                <Pressable style={styles.step} onPress={() => adjust(it.catheterId, -1)}>
                  <Text style={styles.stepTxt}>−</Text>
                </Pressable>
                <Text style={styles.qty}>{Math.abs(it.delta)}</Text>
                <Pressable style={styles.step} onPress={() => adjust(it.catheterId, +1)}>
                  <Text style={styles.stepTxt}>+</Text>
                </Pressable>
                <Pressable style={styles.remove} onPress={() => removeItem(it.catheterId)}>
                  <Text style={styles.removeTxt}>×</Text>
                </Pressable>
              </View>
            ))}
            {draft.unknown.map((u, i) => (
              <Text key={i} style={styles.unknown}>
                No entendí: “{u}”
              </Text>
            ))}
            {!draft.items.length && !draft.unknown.length && (
              <Text style={styles.unknown}>No encontré ningún catéter en la frase.</Text>
            )}
            <View style={styles.actions}>
              <Pressable style={[styles.action, styles.discard]} onPress={discard}>
                <Text style={styles.discardTxt}>Descartar</Text>
              </Pressable>
              <Pressable
                style={[styles.action, styles.confirm, (!draft.items.length || saving) && styles.disabled]}
                onPress={commit}
                disabled={!draft.items.length || saving}
              >
                <Text style={styles.confirmTxt}>{saving ? 'Guardando…' : 'Actualizar stock'}</Text>
              </Pressable>
            </View>
            <Text style={[ui.muted, styles.gapTop]}>Tocá “Uso” o “Repone” para invertirlo.</Text>
          </View>
        )}

        {summary.map((line, i) => (
          <Text key={i} style={styles.summary}>
            ✓ {line}
          </Text>
        ))}
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Nuevo catéter</Text>
        <View style={styles.row}>
          <TextInput
            style={[ui.input, { flex: 2 }]}
            placeholderTextColor={colors.placeholder}
            placeholder="Nombre (ej. 18G)"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={ui.input}
            placeholderTextColor={colors.placeholder}
            placeholder="Stock"
            keyboardType="numeric"
            value={stock}
            onChangeText={setStock}
          />
          <TextInput
            style={ui.input}
            placeholderTextColor={colors.placeholder}
            placeholder="Mín."
            keyboardType="numeric"
            value={min}
            onChangeText={setMin}
          />
          <Pressable style={styles.addBtn} onPress={onAdd}>
            <Text style={styles.addTxt}>+</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[ui.sectionTitle, { marginLeft: 4 }]}>Stock</Text>
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => String(r.id)}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Todavía no cargaste catéteres.</Text>}
      renderItem={({ item }) => {
        const low = item.min_stock > 0 && item.stock <= item.min_stock;
        return (
          <View style={[styles.card, low && styles.cardLow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.stock}>{item.stock} u.</Text>
              <Text style={ui.muted}>{explain(item, item.stats)}</Text>
            </View>
            <View style={styles.btns}>
              <Pressable style={styles.btn} onPress={() => move(item.id, -1)}>
                <Text style={styles.btnTxt}>−1</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={() => move(item.id, +1)}>
                <Text style={styles.btnTxt}>+1</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    list: { padding: 16, paddingBottom: 32 },
    row: { flexDirection: 'row', gap: 6 },
    gapTop: { marginTop: 8 },
    mic: { backgroundColor: colors.primary, borderRadius: 8, width: 46, alignItems: 'center', justifyContent: 'center' },
    micOn: { backgroundColor: colors.danger },
    micTxt: { color: colors.onPrimary, fontSize: 20 },
    preview: { backgroundColor: colors.bg, borderRadius: 8, padding: 10, gap: 8, marginTop: 10 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    tagUse: { backgroundColor: colors.useBg },
    tagAdd: { backgroundColor: colors.addBg },
    tagTxt: { fontSize: 12, fontWeight: '700', color: colors.text },
    itemName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
    step: { backgroundColor: colors.card, borderRadius: 6, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    stepTxt: { fontSize: 18, fontWeight: '700', color: colors.text },
    qty: { minWidth: 26, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text },
    remove: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    removeTxt: { fontSize: 22, color: colors.dangerText },
    unknown: { color: colors.dangerText, fontSize: 13 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    action: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
    discard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    discardTxt: { fontWeight: '700', color: colors.text },
    confirm: { backgroundColor: colors.primary },
    confirmTxt: { color: colors.onPrimary, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    summary: { color: colors.ok, fontSize: 13, marginTop: 8 },
    addBtn: { backgroundColor: colors.primary, borderRadius: 8, width: 42, alignItems: 'center', justifyContent: 'center' },
    addTxt: { color: colors.onPrimary, fontSize: 22, fontWeight: '700' },
    empty: { textAlign: 'center', color: colors.muted, marginTop: 20 },
    card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, gap: 10 },
    cardLow: { borderWidth: 2, borderColor: colors.danger },
    name: { fontSize: 16, fontWeight: '600', color: colors.text },
    stock: { fontSize: 22, fontWeight: '700', marginVertical: 2, color: colors.text },
    btns: { justifyContent: 'center', gap: 6 },
    btn: { backgroundColor: colors.track, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
    btnTxt: { fontWeight: '700', color: colors.text },
  });
