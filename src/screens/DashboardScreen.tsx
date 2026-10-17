import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ColumnChart, HBar } from '../components/Charts';
import { dailyUsage, recentMovements, type CatheterRow, type Movement } from '../db';
import { sharedStyles, useStyles, useTheme, type Palette } from '../theme';

const DAYS = 14;
const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Apartado "Panel": totales, gráfico de uso diario, uso por catéter, stock vs mínimo y últimos movimientos. */
export default function DashboardScreen({ rows }: { rows: CatheterRow[] }) {
  const styles = useStyles(makeStyles);
  const ui = useStyles(sharedStyles);
  const { c: colors } = useTheme();
  const [daily, setDaily] = useState<{ day: string; used: number }[]>([]);
  const [recent, setRecent] = useState<(Movement & { name: string })[]>([]);

  // rows cambia cada vez que se guarda un movimiento: recargar lo que depende de movements.
  useEffect(() => {
    dailyUsage(DAYS).then(setDaily);
    recentMovements(8).then(setRecent);
  }, [rows]);

  const totalStock = rows.reduce((n, r) => n + r.stock, 0);
  const used7 = rows.reduce((n, r) => n + r.stats.used7, 0);
  const used30 = rows.reduce((n, r) => n + r.stats.used30, 0);
  const low = rows.filter((r) => r.stock === 0 || (r.min_stock > 0 && r.stock <= r.min_stock));
  const usedDays = daily.reduce((n, d) => n + d.used, 0);

  const byUse = [...rows].sort((a, b) => b.stats.used30 - a.stats.used30).filter((r) => r.stats.used30 > 0);
  const maxUse = Math.max(1, ...byUse.map((r) => r.stats.used30));
  const maxStock = Math.max(1, ...rows.map((r) => Math.max(r.stock, r.min_stock * 2)));

  const chartData = daily.map((d) => {
    const [y, m, dd] = d.day.split('-').map(Number);
    const wd = new Date(y, m - 1, dd).getDay();
    return { label: `${WEEKDAY[wd]}${dd}`, value: d.used };
  });

  if (!rows.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>Cargá catéteres en “Cargar” para ver estadísticas.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.tiles}>
        <Tile label="Stock total" value={totalStock} />
        <Tile label="Usados 7 días" value={used7} />
        <Tile label="Usados 30 días" value={used30} />
        <Tile label="Para reponer" value={low.length} alert={low.length > 0} />
      </View>

      {low.length > 0 && (
        <View style={[ui.card, styles.alertCard]}>
          <Text style={styles.alertTitle}>Reponer</Text>
          {low.map((r) => (
            <Text key={r.id} style={styles.alertLine}>
              • {r.name}: {r.stock === 0 ? 'sin stock' : `${r.stock} (mín. ${r.min_stock})`}
            </Text>
          ))}
        </View>
      )}

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Uso diario · últimos {DAYS} días</Text>
        {usedDays === 0 ? (
          <Text style={ui.muted}>Sin consumo registrado en este período.</Text>
        ) : (
          <ColumnChart data={chartData} />
        )}
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Uso por catéter · 30 días</Text>
        {byUse.length === 0 ? (
          <Text style={ui.muted}>Sin consumo en 30 días.</Text>
        ) : (
          byUse.map((r) => (
            <HBar
              key={r.id}
              label={r.name}
              value={r.stats.used30}
              max={maxUse}
              right={`${r.stats.used30} u. · ${r.stats.dailyAvg.toFixed(1)}/día`}
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
        <Text style={ui.muted}>La rayita negra marca el stock mínimo.</Text>
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Últimos movimientos</Text>
        {recent.length === 0 && <Text style={ui.muted}>Todavía no hay movimientos.</Text>}
        {recent.map((m) => (
          <View key={m.id} style={styles.mov}>
            <Text style={[styles.movDelta, { color: m.delta < 0 ? colors.dangerText : colors.ok }]}>
              {m.delta > 0 ? '+' : '−'}
              {Math.abs(m.delta)}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.movName}>{m.name}</Text>
              <Text style={ui.muted} numberOfLines={1}>
                {formatWhen(m.created_at)}
                {m.note ? ` · ${m.note}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Tile({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  const styles = useStyles(makeStyles);
  const ui = useStyles(sharedStyles);
  const { c: colors } = useTheme();
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, alert && { color: colors.danger }]}>{value}</Text>
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
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderRadius: 12, padding: 12 },
    tileValue: { fontSize: 26, fontWeight: '700', color: colors.text },
    alertCard: { borderWidth: 2, borderColor: colors.danger },
    alertTitle: { fontWeight: '700', color: colors.dangerText, marginBottom: 4 },
    alertLine: { color: colors.text },
    mov: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    movDelta: { width: 40, fontSize: 16, fontWeight: '700', textAlign: 'right' },
    movName: { fontWeight: '600', color: colors.text },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    empty: { color: colors.muted, textAlign: 'center' },
  });
