import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketize, daysIn, maskDayInput, parseDay, presetRange, validateRange } from '../src/period.ts';

const today = new Date(2026, 9, 17); // 17/10/2026

test('presets: 1, 7 y 30 días hacia atrás contando hoy', () => {
  assert.deepEqual(presetRange(1, today), { from: '2026-10-17', to: '2026-10-17' });
  assert.deepEqual(presetRange(7, today), { from: '2026-10-11', to: '2026-10-17' });
  assert.deepEqual(presetRange(30, today), { from: '2026-09-18', to: '2026-10-17' });
  assert.equal(daysIn(presetRange(30, today)), 30);
});

test('cruza fin de mes y de año', () => {
  assert.deepEqual(presetRange(7, new Date(2026, 0, 3)), { from: '2025-12-28', to: '2026-01-03' });
});

test('parseo y validación de fechas', () => {
  assert.equal(parseDay('01/02/2026'), '2026-02-01');
  assert.equal(parseDay('1/2/2026'), '2026-02-01');
  assert.equal(parseDay('31/02/2026'), null);
  assert.equal(parseDay('2026-02-01'), null);
  assert.deepEqual(validateRange('01/10/2026', '17/10/2026'), { from: '2026-10-01', to: '2026-10-17' });
  assert.equal(typeof validateRange('17/10/2026', '01/10/2026'), 'string');
  assert.equal(typeof validateRange('xx', '01/10/2026'), 'string');
});

test('máscara de escritura', () => {
  assert.equal(maskDayInput('17'), '17');
  assert.equal(maskDayInput('1710'), '17/10');
  assert.equal(maskDayInput('17102026'), '17/10/2026');
  assert.equal(maskDayInput('17/10/20261'), '17/10/2026');
});

test('agrupación del gráfico según el largo del período', () => {
  const perDay = new Map([['2026-10-17', 3], ['2026-10-11', 2]]);
  const week = bucketize(presetRange(7, today), perDay);
  assert.equal(week.granularity, 'día');
  assert.equal(week.buckets.length, 7);
  assert.equal(week.buckets.reduce((s, b) => s + b.value, 0), 5);

  const q = bucketize({ from: '2026-07-20', to: '2026-10-17' }, perDay);
  assert.equal(q.granularity, 'semana');
  assert.equal(q.buckets.reduce((s, b) => s + b.value, 0), 5);

  const y = bucketize({ from: '2025-10-18', to: '2026-10-17' }, perDay);
  assert.equal(y.granularity, 'mes');
  assert.equal(y.buckets.length, 13);
  assert.equal(y.buckets.reduce((s, b) => s + b.value, 0), 5);
});
