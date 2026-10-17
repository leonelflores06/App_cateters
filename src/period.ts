/**
 * Períodos de reporte: fechas locales "YYYY-MM-DD", rango inclusivo [from, to].
 * Sin dependencias para poder probarlo con node --test.
 */

export type Range = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local "YYYY-MM-DD" (igual que date(..., 'localtime') de SQLite). */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** Últimos `days` días contando hoy: 1 = solo hoy, 7 = hoy y los 6 anteriores. */
export function presetRange(days: number, today: Date = new Date()): Range {
  const to = localDay(today);
  return { from: addDays(to, -(days - 1)), to };
}

/** Cantidad de días del rango, inclusive. */
export function daysIn(r: Range): number {
  return Math.round((toDate(r.to).getTime() - toDate(r.from).getTime()) / 86400000) + 1;
}

export function eachDay(r: Range): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "2026-10-17" -> "17/10/2026" */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/** "17/10/2026" -> "2026-10-17"; null si no es una fecha real. */
export function parseDay(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return localDay(date);
}

/** Mientras se escribe: deja solo dígitos y pone las barras ("17102026" -> "17/10/2026"). */
export function maskDayInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Valida un rango escrito a mano. Devuelve el rango o un mensaje de error. */
export function validateRange(fromText: string, toText: string): Range | string {
  const from = parseDay(fromText);
  const to = parseDay(toText);
  if (!from) return 'La fecha "Desde" no es válida (DD/MM/AAAA).';
  if (!to) return 'La fecha "Hasta" no es válida (DD/MM/AAAA).';
  if (from > to) return '"Desde" tiene que ser anterior o igual a "Hasta".';
  return { from, to };
}

export type Bucket = { label: string; value: number };
export type Granularity = 'día' | 'semana' | 'mes';

const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTH = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Agrupa el uso diario para el gráfico: por día hasta 31 días, por semana hasta 26 semanas, si no por mes. */
export function bucketize(r: Range, perDay: Map<string, number>): { granularity: Granularity; buckets: Bucket[] } {
  const days = eachDay(r);
  const n = days.length;
  if (n <= 31) {
    return {
      granularity: 'día',
      buckets: days.map((d) => {
        const dt = toDate(d);
        return { label: `${WEEKDAY[dt.getDay()]}${dt.getDate()}`, value: perDay.get(d) ?? 0 };
      }),
    };
  }
  if (n <= 26 * 7) {
    const buckets: Bucket[] = [];
    for (let i = 0; i < n; i += 7) {
      const chunk = days.slice(i, i + 7);
      const first = toDate(chunk[0]);
      buckets.push({
        label: `${first.getDate()}/${first.getMonth() + 1}`,
        value: chunk.reduce((s, d) => s + (perDay.get(d) ?? 0), 0),
      });
    }
    return { granularity: 'semana', buckets };
  }
  const byMonth = new Map<string, number>();
  for (const d of days) {
    const key = d.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + (perDay.get(d) ?? 0));
  }
  return {
    granularity: 'mes',
    buckets: [...byMonth].map(([key, value]) => {
      const [y, m] = key.split('-').map(Number);
      return { label: `${MONTH[m - 1]}${String(y).slice(2)}`, value };
    }),
  };
}
