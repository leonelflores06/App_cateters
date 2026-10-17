import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addReminder, deleteReminder, type Reminder } from '../db';
import {
  cancelReminder,
  ensureNotificationPermission,
  hasExactAlarms,
  requestExactAlarms,
  resyncReminders,
  scheduleReminder,
  setupNotifications,
} from '../notifications';
import { formatDay, localDay, maskDayInput } from '../period';
import { describeSchedule, maskTimeInput, nextOccurrence, REPEAT_LABEL, validateReminder, type Repeat } from '../reminders';
import { sharedStyles, useStyles, useTheme, type Palette } from '../theme';

const QUICK_TITLES = ['Reponer catéteres', 'Contar stock', 'Pedir catéteres'];
const REPEATS: Repeat[] = ['once', 'daily', 'weekly'];

function defaultTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

function formatNext(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Apartado "Recordatorios": avisos con notificación en la fecha y hora elegidas. */
export default function RemindersScreen() {
  const styles = useStyles(makeStyles);
  const ui = useStyles(sharedStyles);
  const { c: colors } = useTheme();

  const [items, setItems] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [dayText, setDayText] = useState(() => formatDay(localDay(new Date())));
  const [timeText, setTimeText] = useState(defaultTime);
  const [repeat, setRepeat] = useState<Repeat>('once');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exact, setExact] = useState(true);

  const reload = useCallback(async () => {
    setItems(await resyncReminders());
    setExact(await hasExactAlarms());
  }, []);

  useEffect(() => {
    let alive = true;
    setupNotifications().catch(() => {});
    Promise.all([resyncReminders(), hasExactAlarms()]).then(([list, ok]) => {
      if (!alive) return;
      setItems(list);
      setExact(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const add = async () => {
    const r = validateReminder({ title, dayText, timeText, repeat });
    if (typeof r === 'string') {
      setError(r);
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (!(await ensureNotificationPermission())) {
        Alert.alert(
          'Notificaciones desactivadas',
          'Para recibir los recordatorios, permití las notificaciones en Ajustes > Apps > Stock Catéteres > Notificaciones.'
        );
        return;
      }
      const notifId = await scheduleReminder(r);
      await addReminder(r, notifId);
      setTitle('');
      await reload();
    } catch (e: any) {
      Alert.alert('Recordatorios', e?.message ?? 'No se pudo programar el recordatorio.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (r: Reminder) => {
    Alert.alert('Borrar recordatorio', `¿Borrar “${r.title}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await cancelReminder(r.notif_id);
          await deleteReminder(r.id);
          reload();
        },
      },
    ]);
  };

  const testNow = async () => {
    if (!(await ensureNotificationPermission())) {
      Alert.alert('Notificaciones desactivadas', 'Permití las notificaciones en los ajustes del celular.');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Prueba de recordatorio', body: 'Si ves esto, las notificaciones funcionan.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: 'recordatorios' },
    });
    Alert.alert('Listo', 'En 5 segundos te llega una notificación de prueba. Podés salir de la app.');
  };

  const now = new Date();
  const sorted = items
    .map((r) => ({ r, next: nextOccurrence(r, now) }))
    .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Nuevo recordatorio</Text>
        <TextInput
          style={[ui.input, styles.full]}
          placeholder="¿Qué te recuerdo? (ej. Reponer 18G)"
          placeholderTextColor={colors.placeholder}
          value={title}
          onChangeText={setTitle}
        />
        <View style={styles.chips}>
          {QUICK_TITLES.map((t) => (
            <Pressable key={t} style={styles.chip} onPress={() => setTitle(t)}>
              <Text style={styles.chipTxt}>{t}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={ui.muted}>{repeat === 'daily' ? 'Desde el día' : 'Día'}</Text>
            <TextInput
              style={[ui.input, styles.full]}
              value={dayText}
              onChangeText={(t) => setDayText(maskDayInput(t))}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          <View style={styles.colSmall}>
            <Text style={ui.muted}>Hora</Text>
            <TextInput
              style={[ui.input, styles.full]}
              value={timeText}
              onChangeText={(t) => setTimeText(maskTimeInput(t))}
              placeholder="HH:MM"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>
        </View>

        <Text style={[ui.muted, styles.gapTop]}>Repetir</Text>
        <View style={styles.chips}>
          {REPEATS.map((k) => (
            <Pressable key={k} style={[styles.chip, repeat === k && styles.chipOn]} onPress={() => setRepeat(k)}>
              <Text style={[styles.chipTxt, repeat === k && styles.chipTxtOn]}>{REPEAT_LABEL[k]}</Text>
            </Pressable>
          ))}
        </View>
        {repeat === 'weekly' && <Text style={ui.muted}>Se repite el mismo día de la semana que la fecha elegida.</Text>}

        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.primary, saving && styles.disabled]} onPress={add} disabled={saving}>
          <Text style={styles.primaryTxt}>{saving ? 'Guardando…' : 'Agregar recordatorio'}</Text>
        </Pressable>
        <Pressable onPress={testNow} style={styles.link}>
          <Text style={styles.linkTxt}>Probar notificación (llega en 5 s)</Text>
        </Pressable>
      </View>

      {!exact && items.length > 0 && (
        <View style={[ui.card, styles.warnCard]}>
          <Text style={styles.warnTitle}>Puede llegar con demora</Text>
          <Text style={styles.warnTxt}>
            Android no le dio permiso de “alarmas exactas” a la app, así que el aviso puede llegar unos minutos tarde.
          </Text>
          <Pressable style={styles.primary} onPress={async () => setExact(await requestExactAlarms())}>
            <Text style={styles.primaryTxt}>Permitir hora exacta</Text>
          </Pressable>
        </View>
      )}

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Mis recordatorios</Text>
        {sorted.length === 0 && <Text style={ui.muted}>Todavía no hay recordatorios.</Text>}
        {sorted.map(({ r, next }) => (
          <View key={r.id} style={[styles.item, !next && styles.itemDone]}>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{r.title}</Text>
              <Text style={ui.muted}>{describeSchedule(r)}</Text>
              <Text style={[ui.muted, next ? styles.next : null]}>
                {next ? `Próximo aviso: ${formatNext(next)}` : 'Ya pasó'}
              </Text>
            </View>
            <Pressable style={styles.remove} onPress={() => remove(r)} hitSlop={8}>
              <Text style={styles.removeTxt}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { padding: 16, paddingBottom: 32 },
    full: { flex: 0, marginTop: 4 },
    row: { flexDirection: 'row', gap: 8, marginTop: 10 },
    col: { flex: 3 },
    colSmall: { flex: 2 },
    gapTop: { marginTop: 10 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip: { borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 6 },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipTxt: { color: c.text, fontWeight: '600', fontSize: 13 },
    chipTxtOn: { color: c.onPrimary },
    error: { color: c.dangerText, fontSize: 13, marginTop: 8 },
    primary: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
    primaryTxt: { color: c.onPrimary, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    link: { alignItems: 'center', paddingTop: 12 },
    linkTxt: { color: c.primary, fontWeight: '600' },
    warnCard: { borderWidth: 2, borderColor: c.warn },
    warnTitle: { fontWeight: '700', color: c.text, marginBottom: 4 },
    warnTxt: { color: c.text },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
    itemDone: { opacity: 0.5 },
    itemBody: { flex: 1, gap: 2 },
    itemTitle: { fontSize: 16, fontWeight: '600', color: c.text },
    next: { color: c.primary },
    remove: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    removeTxt: { fontSize: 24, color: c.dangerText },
  });
