import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeSchedule,
  expoWeekday,
  maskTimeInput,
  nextOccurrence,
  parseTime,
  validateReminder,
} from '../src/reminders.ts';

// sábado 17/10/2026 10:00
const now = new Date(2026, 9, 17, 10, 0);

test('hora: máscara y parseo', () => {
  assert.equal(maskTimeInput('9'), '9');
  assert.equal(maskTimeInput('0930'), '09:30');
  assert.equal(maskTimeInput('09:305'), '09:30');
  assert.deepEqual(parseTime('9:05'), { hour: 9, minute: 5 });
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('12:60'), null);
  assert.equal(parseTime('1230'), null);
});

test('una vez: futuro sí, pasado no', () => {
  assert.deepEqual(nextOccurrence({ day: '2026-10-17', time: '21:00', repeat: 'once' }, now), new Date(2026, 9, 17, 21, 0));
  assert.equal(nextOccurrence({ day: '2026-10-17', time: '09:59', repeat: 'once' }, now), null);
});

test('diario: hoy si todavía no pasó, si no mañana', () => {
  assert.deepEqual(nextOccurrence({ day: '2026-10-01', time: '11:00', repeat: 'daily' }, now), new Date(2026, 9, 17, 11, 0));
  assert.deepEqual(nextOccurrence({ day: '2026-10-01', time: '08:00', repeat: 'daily' }, now), new Date(2026, 9, 18, 8, 0));
  // fecha de inicio futura: arranca ese día
  assert.deepEqual(nextOccurrence({ day: '2026-10-20', time: '08:00', repeat: 'daily' }, now), new Date(2026, 9, 20, 8, 0));
});

test('semanal: mismo día de la semana que la fecha elegida', () => {
  // 12/10/2026 es lunes -> próximo lunes 19/10
  assert.deepEqual(nextOccurrence({ day: '2026-10-12', time: '08:00', repeat: 'weekly' }, now), new Date(2026, 9, 19, 8, 0));
  // sábado (hoy) a las 09:00 ya pasó -> sábado siguiente
  assert.deepEqual(nextOccurrence({ day: '2026-10-10', time: '09:00', repeat: 'weekly' }, now), new Date(2026, 9, 24, 9, 0));
  // sábado (hoy) a las 18:00 -> hoy
  assert.deepEqual(nextOccurrence({ day: '2026-10-10', time: '18:00', repeat: 'weekly' }, now), new Date(2026, 9, 17, 18, 0));
  assert.equal(expoWeekday('2026-10-12'), 2); // lunes
  assert.equal(expoWeekday('2026-10-18'), 1); // domingo
});

test('validación del formulario', () => {
  const ok = validateReminder({ title: ' Reponer 18G ', dayText: '17/10/2026', timeText: '9:30', repeat: 'daily' }, now);
  assert.deepEqual(ok, { title: 'Reponer 18G', day: '2026-10-17', time: '09:30', repeat: 'daily' });
  assert.equal(typeof validateReminder({ title: '', dayText: '17/10/2026', timeText: '21:00', repeat: 'once' }, now), 'string');
  assert.equal(typeof validateReminder({ title: 'x', dayText: '32/10/2026', timeText: '21:00', repeat: 'once' }, now), 'string');
  assert.equal(typeof validateReminder({ title: 'x', dayText: '17/10/2026', timeText: '25:00', repeat: 'once' }, now), 'string');
  assert.equal(validateReminder({ title: 'x', dayText: '17/10/2026', timeText: '09:00', repeat: 'once' }, now), 'Esa fecha y hora ya pasaron.');
});

test('descripción', () => {
  assert.equal(describeSchedule({ day: '2026-10-17', time: '21:00', repeat: 'once' }), '17/10/2026 a las 21:00');
  assert.equal(describeSchedule({ day: '2026-10-17', time: '09:30', repeat: 'daily' }), 'Todos los días a las 09:30');
  assert.equal(describeSchedule({ day: '2026-10-12', time: '08:00', repeat: 'weekly' }), 'Los lunes a las 08:00');
});
