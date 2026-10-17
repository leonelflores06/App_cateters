import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ColumnChart, HBar } from '../components/Charts';
import {
  getSetting,
  movementsInRange,
  setSetting,
  totalsByCatheter,
  usageByDay,
  usageByHour,
  type CatheterRow,
  type CatheterTotals,
  type Movement,
} from '../db';
import {
  bucketize,
  daysIn,
  formatDay,
  maskDayInput,
  presetRange,
  validateRange,
  type Bucket,
  type Range,
} from '../period';
import { sharedStyles, useStyles, useTheme, type Palette } from '../theme';

/** Períodos predeterminados (días hacia atrás contando hoy). */
const PRESETS = [
  { key: '1', days: 1, label: 'Hoy' },
  { key: '7', days: 7, label: '7 días' },
  { key: '30', days: 30, label: '30 días' },
] as const;
type PeriodKey = (typeof PRESETS)[number]['key'] | 'custom';
const DEFAULT_PERIOD: PeriodKey = '7';

/** Apartado "Panel": reporte del período elegido + stock actual. */
export default function DashboardScreen({ rows }: { rows: CatheterRow[] }) {
  const styles = useStyles(makeStyles);
  const ui = useStyles(sharedStyles);
  const { c: colors } = useTheme();

  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [custom, setCustom] = useState<Range>(() => presetRange(30));
  const [fromText, setFromText] = useState(() => formatDay(presetRange(30).from));
  const [toText, setToText] = useState(() => formatDay(presetRange(30).to));
  const [rangeError, setRangeError] = useState('');

  const [chart, setChart] = useState<{ title: string; buckets: Bucket[] }>({ title: '', buckets: [] });
  const [totals, setTotals] = useState<CatheterTotals[]>([]);
  const [movs, setMovs] = useState<(Movement & { name: string })[]>([]);

  // Recordar el último período elegido.
  useEffect(() => {
    Promise.all([getSetting('period'), getSetting('periodFrom'), getSetting('periodTo')]).then(([p, f, t]) => {
      if (p === 'custom' && f && t) {
        setCustom({ from: f, to: t });
        setFromText(formatDay(f));
        setToText(formatDay(t));
        setPeriod('custom');
      } else if (PRESETS.some((x) => x.key === p)) {
        setPeriod(p as PeriodKey);
      }
    });
  }, []);

  const preset = PRESETS.find((x) => x.key === period);
  const range: Range = preset ? presetRange(preset.days) : custom;
  const nDays = daysIn(range);

  // rows cambia cada vez que se guarda un movimiento: recargar el reporte.
  useEffect(() => {
    let alive = true;
    const r = { from: range.from, to: range.to };
    (async () => {
      const [t, m] = await Promise.all([totalsByCatheter(r), movementsInRange(r, 30)]);
      let nextChart: { title: string; buckets: Bucket[] };
      if (r.from === r.to) {
        const hours = await usageByHour(r.from);
        nextChart = { title: 'Uso por hora', buckets: hours.map((v, h) => ({ label: `${h}`, value: v })) };
      } else {
        const { granularity, buckets } = bucketize(r, await usageByDay(r));
        nextChart = { title: `Uso por ${granularity}`, buckets };
      }
      if (!alive) return;
      setTotals(t);
      setMovs(m);
      setChart(nextChart);
    })();
    return () => {
      alive = false;
    };
  }, [rows, range.from, range.to]);

  const choosePreset = (key: PeriodKey) => {
    setPeriod(key);
    setRangeError('');
    setSetting('period', key);
  };

  const applyCustom = () => {
    const r = validateRange(fromText, toText);
    if (typeof r === 'string') {
      setRangeError(r);
      return;
    }
    setRangeError('');
    setCustom(r);
    setSetting('period', 'custom');
    setSetting('periodFrom', r.from);
    setSetting('periodTo', r.to);
  };

  const used = totals.reduce((n, t) => n + t.used, 0);
  const added = totals.reduce((n, t) => n + t.added, 0);
  const totalStock = rows.reduce((n, r) => n + r.stock, 0);
  const low = rows.filter((r) => r.stock === 0 || (r.min_stock > 0 && r.stock <= r.min_stock));
  const byUse = totals.filter((t) => t.used > 0 || t.added > 0);
  const maxUse = Math.max(1, ...byUse.map((t) => t.used));
  const maxStock = Math.max(1, ...rows.map((r) => Math.max(r.stock, r.min_stock * 2)));

  if (!rows.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>Cargá catéteres en “Cargar” para ver estadísticas.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Período del reporte</Text>
        <View style={styles.chips}>
          {PRESETS.map((p) => (
            <Chip key={p.key} label={p.label} active={period === p.key} onPress={() => choosePreset(p.key)} />
          ))}
          <Chip label="Elegir fechas" active={period === 'custom'} onPress={() => choosePreset('custom')} />
        </View>

        {period === 'custom' && (
          <View style={styles.customBox}>
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <Text style={ui.muted}>Desde</Text>
                <TextInput
                  style={[ui.input, styles.dateInput]}
                  value={fromText}
                  onChangeText={(t) => setFromText(maskDayInput(t))}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
              <View style={styles.dateCol}>
                <Text style={ui.muted}>Hasta</Text>
                <TextInput
                  style={[ui.input, styles.dateInput]}
                  value={toText}
                  onChangeText={(t) => setToText(maskDayInput(t))}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>
            {!!rangeError && <Text style={styles.error}>{rangeError}</Text>}
            <Pressable style={styles.apply} onPress={applyCustom}>
              <Text style={styles.applyTxt}>Aplicar fechas</Text>
            </Pressable>
          </View>
        )}

        <Text style={[ui.muted, styles.rangeTxt]}>
          {nDays === 1 ? `Día ${formatDay(range.from)}` : `Del ${formatDay(range.from)} al ${formatDay(range.to)}`} ·{' '}
          {nDays} {nDays === 1 ? 'día' : 'días'}
        </Text>
      </View>

      <View style={styles.tiles}>
        <Tile label="Usados en el período" value={used} />
        <Tile label="Repuestos en el período" value={added} />
        <Tile label="Promedio por día" value={(used / nDays).toFixed(1)} />
        <Tile label="Stock total actual" value={totalStock} />
      </View>

      {low.length > 0 && (
        <View style={[ui.card, styles.alertCard]}>
          <Text style={styles.alertTitle}>Reponer ({low.length})</Text>
          {low.map((r) => (
            <Text key={r.id} style={styles.alertLine}>
              • {r.name}: {r.stock === 0 ? 'sin stock' : `${r.stock} (mín. ${r.min_stock})`}
            </Text>
          ))}
        </View>
      )}

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>{chart.title}</Text>
        {used === 0 ? (
          <Text style={ui.muted}>Sin consumo registrado en este período.</Text>
        ) : (
          <ColumnChart data={chart.buckets} />
        )}
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Uso por catéter</Text>
        {byUse.length === 0 ? (
          <Text style={ui.muted}>Sin movimientos en este período.</Text>
        ) : (
          byUse.map((t) => (
            <HBar
              key={t.id}
              label={t.name}
              value={t.used}
              max={maxUse}
              right={`${t.used} usados${t.added ? ` · +${t.added} repuestos` : ''}`}
            />
          ))
        )}
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Stock actual vs mínimo</Text>
        {rows.map((r) => {
          const isLow = r.stock === 0 || (r.min_stock > 0 && r.stock <= r.min_stock);
          const soon = !isLow && r.stats.daysLeft !== null && r.stats.daysLeft <= 7;
          const days = r.stats.daysLeft === null ? 'sin consumo' : `~${r.stats.daysLeft} días`;
          return (
            <HBar
              key={r.id}
              label={r.name}
              value={r.stock}
              max={maxStock}
              marker={r.min_stock}
              color={isLow ? colors.danger : soon ? colors.warn : colors.ok}
              right={`${r.stock} u. · ${days}`}
            />
          );
        })}
        <Text style={ui.muted}>La rayita marca el mínimo. Los días restantes usan el ritmo de los últimos 30 días.</Text>
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Movimientos del período</Text>
        {movs.length === 0 && <Text style={ui.muted}>No hay movimientos en este período.</Text>}
        {movs.map((m) => (
          <View key={m.id} style={styles.mov}>
            <Text style={[styles.movDelta, { color: m.delta < 0 ? colors.dangerText : colors.ok }]}>
              {m.delta > 0 ? '+' : '−'}
              {Math.abs(m.delta)}
            </Text>
            <View style={styles.movBody}>
              <Text style={styles.movName}>{m.name}</Text>
              <Text style={ui.muted} numberOfLines={1}>
                {formatWhen(m.created_at)}
                {m.note ? ` · ${m.note}` : ''}
              </Text>
            </View>
          </View>
        ))}
        {movs.length === 30 && <Text style={ui.muted}>Se muestran los 30 más recientes.</Text>}
      </View>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={[styles.chip, active && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  const styles = useStyles(makeStyles);
  const ui = useStyles(sharedStyles);
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { padding: 16, paddingBottom: 32 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipTxt: { color: colors.text, fontWeight: '600' },
    chipTxtOn: { color: colors.onPrimary },
    customBox: { marginTop: 10, gap: 8 },
    dateRow: { flexDirection: 'row', gap: 8 },
    dateCol: { flex: 1 },
    dateInput: { flex: 0, marginTop: 4 },
    error: { color: colors.dangerText, fontSize: 13 },
    apply: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
    applyTxt: { color: colors.onPrimary, fontWeight: '700' },
    rangeTxt: { marginTop: 10 },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderRadius: 12, padding: 12 },
    tileValue: { fontSize: 26, fontWeight: '700', color: colors.text },
    alertCard: { borderWidth: 2, borderColor: colors.danger },
    alertTitle: { fontWeight: '700', color: colors.dangerText, marginBottom: 4 },
    alertLine: { color: colors.text },
    mov: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    movDelta: { width: 40, fontSize: 16, fontWeight: '700', textAlign: 'right' },
    movBody: { flex: 1 },
    movName: { fontWeight: '600', color: colors.text },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    empty: { color: colors.muted, textAlign: 'center' },
  });
