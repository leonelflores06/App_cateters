import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/parser.ts';

const C = [
  { id: 1, name: '18G' },
  { id: 2, name: '20G' },
  { id: 3, name: 'Catéter 22G' },
  { id: 4, name: 'Mariposa' },
];
const run = (t: string) => parseCommand(t, C).items.map((i) => [i.catheterId, i.delta]);

test('ejemplo del enunciado', () => {
  assert.deepEqual(run('usé 3 catéteres 18G y 1 de 20G'), [[1, -3], [2, -1]]);
});
test('variantes de dictado de Whisper', () => {
  assert.deepEqual(run('Usé 3 catéteres 18 G y 1 de 20 G.'), [[1, -3], [2, -1]]);
  assert.deepEqual(run('use tres cateteres dieciocho g y uno de veinte g'), [[1, -3], [2, -1]]);
  assert.deepEqual(run('gasté dos de 22'), [[3, -2]]);
  assert.deepEqual(run('usé 2 de calibre 20'), [[2, -2]]);
});
test('sin cantidad vale 1', () => {
  assert.deepEqual(run('usé un 20G'), [[2, -1]]);
  assert.deepEqual(run('usé 18G'), [[1, -1]]);
});
test('cantidad igual al calibre', () => {
  assert.deepEqual(run('usé 18 catéteres 18G'), [[1, -18]]);
  assert.deepEqual(run('usé 20 de 20G'), [[2, -20]]);
});
test('reposición', () => {
  assert.deepEqual(run('repuse 10 de 18G y 5 de 20G'), [[1, 10], [2, 5]]);
  assert.deepEqual(run('llegaron veinte catéteres 22G'), [[3, 20]]);
});
test('por nombre y números compuestos', () => {
  assert.deepEqual(run('usé dos mariposas'), [[4, -2]]);
  assert.deepEqual(run('usé 2 mariposa'), [[4, -2]]);
  assert.deepEqual(run('repuse treinta y dos de 18G'), [[1, 32]]);
});
test('acumula repetidos y reporta lo no entendido', () => {
  assert.deepEqual(run('usé 1 de 18G y 2 de 18G'), [[1, -3]]);
  const r = parseCommand('usé 4 de 24G', C);
  assert.deepEqual(r.items, []);
  assert.equal(r.unknown.length, 1);
});
test('texto vacío o sin sentido', () => {
  assert.deepEqual(parseCommand('', C), { items: [], unknown: [] });
  assert.deepEqual(parseCommand('hola buen día', C).items, []);
});
