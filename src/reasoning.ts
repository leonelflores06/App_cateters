import type { Catheter, Stats } from './db';

/** Razonamiento local (sin internet): explica el estado del stock a partir de las estadísticas. */
export function explain(c: Catheter, s: Stats): string {
  if (c.stock === 0) return `Sin stock de ${c.name}. Hay que reponer ya.`;
  if (c.min_stock > 0 && c.stock <= c.min_stock) {
    return `${c.name} está en el mínimo (${c.stock}/${c.min_stock}). Conviene reponer.`;
  }
  if (s.daysLeft !== null && s.daysLeft <= 7) {
    return `Al ritmo actual (${s.dailyAvg.toFixed(1)}/día) alcanza para ~${s.daysLeft} días.`;
  }
  if (s.used30 === 0) return `Sin consumo en 30 días. Stock estable.`;
  return `Consumo normal: ${s.used7} en 7 días, ${s.used30} en 30. Stock para ~${s.daysLeft} días.`;
}

/** Una línea que explica un cambio de stock recién aplicado por voz o texto. */
export function explainChange(c: Catheter, before: number, after: number, s: Stats): string {
  if (after === before) return `${c.name}: sin cambios (${after}).`;
  const verb = after < before ? `usaste ${before - after}` : `repusiste ${after - before}`;
  const head = `${c.name}: ${verb} (${before} → ${after}).`;
  if (after === 0) return `${head} Te quedaste sin stock, hay que reponer ya.`;
  if (c.min_stock > 0 && after <= c.min_stock) return `${head} Quedó en el mínimo (${c.min_stock}), conviene reponer.`;
  if (after > before) return `${head} Alcanza para ~${s.daysLeft ?? '—'} días al ritmo actual.`;
  if (s.daysLeft !== null && s.daysLeft <= 7) return `${head} Al ritmo de ${s.dailyAvg.toFixed(1)}/día alcanza ~${s.daysLeft} días.`;
  return s.daysLeft !== null ? `${head} Stock para ~${s.daysLeft} días.` : head;
}
