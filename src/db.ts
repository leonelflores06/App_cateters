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

export async function getStats(c: Catheter): Promise<Stats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ u7: number | null; u30: number | null }>(
    `SELECT
       SUM(CASE WHEN created_at >= datetime('now','-7 days')  THEN -delta END) AS u7,
       SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN -delta END) AS u30
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
