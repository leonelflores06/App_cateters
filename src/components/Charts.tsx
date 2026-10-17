import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui';

/** Gráfico de columnas simple (sin librerías nativas): una columna por valor. */
export function ColumnChart({
  data,
  height = 140,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      <View style={[styles.cols, { height }]}>
        {data.map((d, i) => (
          <View key={i} style={styles.col}>
            {d.value > 0 && <Text style={styles.colValue}>{d.value}</Text>}
            <View
              style={[
                styles.colBar,
                { height: Math.max(d.value > 0 ? 3 : 1, ((height - 18) * d.value) / max) },
                d.value === 0 && styles.colBarEmpty,
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.colLabels}>
        {data.map((d, i) => (
          <Text key={i} style={styles.colLabel} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Barra horizontal con etiqueta, valor y marca opcional (ej. stock mínimo). */
export function HBar({
  label,
  value,
  max,
  right,
  marker,
  color = colors.primary,
}: {
  label: string;
  value: number;
  max: number;
  right?: string;
  marker?: number;
  color?: string;
}) {
  const pct = (v: number) => `${Math.min(100, (100 * v) / Math.max(1, max))}%` as const;
  return (
    <View style={styles.hRow}>
      <View style={styles.hHead}>
        <Text style={styles.hLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.hRight}>{right ?? value}</Text>
      </View>
      <View style={styles.hTrack}>
        <View style={[styles.hFill, { width: pct(value), backgroundColor: color }]} />
        {marker !== undefined && marker > 0 && <View style={[styles.hMarker, { left: pct(marker) }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  colValue: { fontSize: 10, color: colors.muted, marginBottom: 2 },
  colBar: { width: '100%', backgroundColor: colors.primary, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  colBarEmpty: { backgroundColor: colors.track },
  colLabels: { flexDirection: 'row', gap: 3, marginTop: 4 },
  colLabel: { flex: 1, textAlign: 'center', fontSize: 9, color: colors.muted },
  hRow: { marginBottom: 10 },
  hHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  hLabel: { fontWeight: '600', flex: 1, marginRight: 8 },
  hRight: { color: colors.muted, fontSize: 13 },
  hTrack: { height: 10, backgroundColor: colors.track, borderRadius: 5, overflow: 'hidden' },
  hFill: { height: '100%', borderRadius: 5 },
  hMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text },
});
