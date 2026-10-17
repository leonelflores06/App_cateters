import * as SQLite from 'expo-sqlite';

export type Catheter = {
  id: number;
  name: string; // ej: "Cateter 18G"
  stock: number;
  min_stock: number;
};

export type Movement = {
  id: number;
  catheter_id: number;
  delta: number; // negativo = uso, positivo = reposición
  note: string | null;
  created_at: string; // ISO
};

export type Stats = {
  used7: number;
  used30: number;
  dailyAvg: number; // promedio diario de uso (últimos 30 días)
  daysLeft: number | null; // null si no hay consumo registrado
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('stock.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS catheters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          stock INTEGER NOT NULL DEFAULT 0,
          min_stock INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          catheter_id INTEGER NOT NULL REFERENCES catheters(id),
          delta INTEGER NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function listCatheters(): Promise<Catheter[]> {
  const db = await getDb();
  return db.getAllAsync<Catheter>('SELECT * FROM catheters ORDER BY name');
}

export async function addCatheter(name: string, stock: number, minStock: number) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO catheters (name, stock, min_stock) VALUES (?, ?, ?)',
    [name.trim(), stock, minStock]
  );
}

/** Registra un movimiento y actualiza el stock de forma atómica. */
export async function applyMovement(catheterId: number, delta: number, note?: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE catheters SET stock = MAX(0, stock + ?) WHERE id = ?', [
      delta,
      catheterId,
    ]);
    await db.runAsync('INSERT INTO movements (catheter_id, delta, note) VALUES (?, ?, ?)', [
      catheterId,
      delta,
      note ?? null,
    ]);
  });
}

/** Límite "hace N días" en el mismo formato ISO que created_at (comparación de texto correcta). */
const since = (days: number) => `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${days} days')`;

export async function getStats(c: Catheter): Promise<Stats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ u7: number | null; u30: number | null }>(
    `SELECT
       SUM(CASE WHEN created_at >= ${since(7)}  THEN -delta END) AS u7,
       SUM(CASE WHEN created_at >= ${since(30)} THEN -delta END) AS u30
     FROM movements WHERE catheter_id = ? AND delta < 0`,
    [c.id]
  );
  const used7 = row?.u7 ?? 0;
  const used30 = row?.u30 ?? 0;
  const dailyAvg = used30 / 30;
  const daysLeft = dailyAvg > 0 ? Math.floor(c.stock / dailyAvg) : null;
  return { used7, used30, dailyAvg, daysLeft };
}

export async function recentMovements(limit = 20) {
  const db = await getDb();
  return db.getAllAsync<Movement & { name: string }>(
    `SELECT m.*, c.name FROM movements m
     JOIN catheters c ON c.id = m.catheter_id
     ORDER BY m.id DESC LIMIT ?`,
    [limit]
  );
}

export type CatheterRow = Catheter & { stats: Stats };

export async function listWithStats(): Promise<CatheterRow[]> {
  const list = await listCatheters();
  return Promise.all(list.map(async (c) => ({ ...c, stats: await getStats(c) })));
}

/** Fecha local "YYYY-MM-DD" (igual que date(..., 'localtime') de SQLite). */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Unidades usadas por día en los últimos `days` días (incluye hoy), con ceros en los días sin uso. */
export async function dailyUsage(days: number): Promise<{ day: string; used: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ day: string; used: number }>(
    `SELECT date(created_at, 'localtime') AS day, SUM(-delta) AS used
     FROM movements WHERE delta < 0 AND created_at >= ${since(days + 1)}
     GROUP BY day`
  );
  const byDay = new Map(rows.map((r) => [r.day, r.used]));
  const out: { day: string; used: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDay(d);
    out.push({ day: key, used: byDay.get(key) ?? 0 });
  }
  return out;
}
