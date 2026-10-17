/**
 * Lógica pura de recordatorios (sin módulos nativos) para poder probarla con node --test.
 * Fechas locales "YYYY-MM-DD" y horas "HH:MM".
 */
import { formatDay, parseDay } from './period.ts';

export type Repeat = 'once' | 'daily' | 'weekly';

export type ReminderInput = {
  title: string;
  day: string; // YYYY-MM-DD (para 'weekly' define el día de la semana; para 'daily' solo el inicio)
  time: string; // HH:MM
  repeat: Repeat;
};

export const REPEAT_LABEL: Record<Repeat, string> = {
  once: 'Una vez',
  daily: 'Todos los días',
  weekly: 'Todas las semanas',
};

const WEEKDAY_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "0930" -> "09:30" mientras se escribe. */
export function maskTimeInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** "9:30" / "09:30" -> { hour: 9, minute: 30 }; null si no es una hora válida. */
export function parseTime(text: string): { hour: number; minute: number } | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function at(day: string, time: string): Date {
  const [y, mo, d] = day.split('-').map(Number);
  const t = parseTime(time)!;
  return new Date(y, mo - 1, d, t.hour, t.minute, 0, 0);
}

/** Próxima vez que suena el recordatorio a partir de `now`; null si era de una vez y ya pasó. */
export function nextOccurrence(r: Pick<ReminderInput, 'day' | 'time' | 'repeat'>, now: Date = new Date()): Date | null {
  const first = at(r.day, r.time);
  if (r.repeat === 'once') return first > now ? first : null;
  if (first > now) return first;
  const t = parseTime(r.time)!;
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.hour, t.minute, 0, 0);
  if (r.repeat === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  // semanal: mismo día de la semana que la fecha elegida
  const diff = (first.getDay() - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + diff);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next;
}

/** Valida lo escrito en el formulario. Devuelve el recordatorio listo o un mensaje de error. */
export function validateReminder(
  form: { title: string; dayText: string; timeText: string; repeat: Repeat },
  now: Date = new Date()
): ReminderInput | string {
  const title = form.title.trim();
  if (!title) return 'Escribí qué te tiene que recordar.';
  const day = parseDay(form.dayText);
  if (!day) return 'La fecha no es válida (DD/MM/AAAA).';
  const time = parseTime(form.timeText);
  if (!time) return 'La hora no es válida (HH:MM, de 00:00 a 23:59).';
  const hhmm = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
  const r: ReminderInput = { title, day, time: hhmm, repeat: form.repeat };
  if (form.repeat === 'once' && !nextOccurrence(r, now)) return 'Esa fecha y hora ya pasaron.';
  return r;
}

/** Texto corto de cuándo suena: "Todos los días a las 09:30", "Los lunes a las 08:00", "17/10/2026 a las 21:00". */
export function describeSchedule(r: Pick<ReminderInput, 'day' | 'time' | 'repeat'>): string {
  if (r.repeat === 'daily') return `Todos los días a las ${r.time}`;
  if (r.repeat === 'weekly') return `Los ${WEEKDAY_NAME[at(r.day, r.time).getDay()]} a las ${r.time}`;
  return `${formatDay(r.day)} a las ${r.time}`;
}

/** Día de la semana como lo pide expo-notifications (1 = domingo … 7 = sábado). */
export function expoWeekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() + 1;
}
