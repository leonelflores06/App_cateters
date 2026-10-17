/**
 * Intérprete por reglas (sin internet, sin modelo): convierte una frase en español
 * como "usé 3 catéteres 18G y 1 de 20G" en movimientos de stock.
 * Es puro (sin dependencias de React ni de SQLite) para poder probarlo solo.
 */

export type CatheterRef = { id: number; name: string };

export type ParsedItem = {
  catheterId: number;
  name: string;
  delta: number; // negativo = uso, positivo = reposición
};

export type ParseResult = {
  items: ParsedItem[];
  /** Fragmentos que no se pudieron asignar a un catéter. */
  unknown: string[];
};

const UNITS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

const USE_VERBS = /\b(us[eo]|usamos|usaron|gast[eo]|gastamos|saque|sacamos|saco|retire|consumi|consumimos|descarte|descartamos|tire|se usaron|se uso|se gasto|se gastaron|salieron|salio)\b/;
const ADD_VERBS = /\b(repuse|repusimos|repone|reponer|agregue|agregamos|agrego|sume|sumamos|sumo|ingrese|ingresamos|ingreso|llegaron|llego|recibi|recibimos|compre|compramos|cargue|cargamos|devolvi|devolvimos|reposicion)\b/;

/** Minúsculas, sin tildes ni puntuación (deja letras, números y espacios). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s,.;]/g, ' ')
    .replace(/(\d)\s*[.,]\s*(?=\d)/g, '$1') // "1.000" -> "1000"
    .replace(/(\d)([a-z])/g, '$1 $2') // "18g" -> "18 g"
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[\s]+/g, ' ')
    .trim();
}

type Tok = { text: string; num: number | null };

/** Tokeniza y convierte números escritos con palabras ("treinta y dos", "veinte") a dígitos. */
function tokenize(norm: string): Tok[] {
  const raw = norm.split(/[\s,.;]+/).filter(Boolean);
  const out: Tok[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (/^\d+$/.test(w)) {
      out.push({ text: w, num: parseInt(w, 10) });
    } else if (w in TENS) {
      // "treinta y dos": decena + "y" + unidad (1-9)
      const unit = UNITS[raw[i + 2]];
      if (raw[i + 1] === 'y' && unit !== undefined && unit < 10) {
        out.push({ text: `${w} y ${raw[i + 2]}`, num: TENS[w] + unit });
        i += 2;
      } else {
        out.push({ text: w, num: TENS[w] });
      }
    } else if (w in UNITS) {
      out.push({ text: w, num: UNITS[w] });
    } else {
      out.push({ text: w, num: null });
    }
  }
  return out;
}

/** Texto de un catéter sin la palabra genérica: "Catéter 18G" -> "18g". */
function catheterKey(name: string): string {
  return normalize(name).replace(/\bcateter(es)?\b/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Calibres (números) que aparecen en el nombre: "18G" -> 18. */
function nameNumbers(name: string): number[] {
  return (normalize(name).match(/\d+/g) ?? []).map((n) => parseInt(n, 10));
}

const FILLER = new Set(['de', 'del', 'el', 'la', 'los', 'las', 'cateter', 'cateteres', 'catetere', 'g', 'ge', 'gauge', 'calibre', 'numero', 'n', 'unidades', 'unidad', 'u', 'tambien', 'ademas', 'mas']);

/** Separa en cláusulas por "y" (entre cantidades), coma, punto y coma. */
function splitClauses(toks: Tok[]): Tok[][] {
  const clauses: Tok[][] = [];
  let cur: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const isSep = t.text === 'y' && cur.some((c) => c.num !== null) && toks.slice(i + 1).some((c) => c.num !== null);
    // Un "y" dentro de "treinta y dos" ya fue absorbido por tokenize().
    if (isSep) {
      clauses.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  if (cur.length) clauses.push(cur);
  return clauses;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchCatheter(clause: Tok[], catheters: CatheterRef[]): { c: CatheterRef; usedIdx: number } | null {
  // 1) por número (calibre): el número del nombre que aparezca en la cláusula.
  const candidates: { c: CatheterRef; idx: number; score: number }[] = [];
  clause.forEach((t, idx) => {
    if (t.num === null) return;
    for (const c of catheters) {
      if (!nameNumbers(c.name).includes(t.num)) continue;
      const next = clause[idx + 1]?.text;
      const prev = clause[idx - 1]?.text;
      // "18 g", "de 20", "calibre 18" refuerzan que es un calibre y no una cantidad
      let score = 1;
      if (next === 'g' || next === 'ge' || next === 'gauge') score += 2;
      if (prev === 'de' || prev === 'calibre' || prev === 'numero') score += 1;
      candidates.push({ c, idx, score });
    }
  });
  if (candidates.length) {
    // Si hay varios números que coinciden (ej. "18 de 18G"), el de mayor score; empate -> el último.
    candidates.sort((a, b) => b.score - a.score || b.idx - a.idx);
    return { c: candidates[0].c, usedIdx: candidates[0].idx };
  }
  // 2) por texto: el nombre normalizado (sin "cateter") aparece como palabra en la cláusula.
  const joined = clause.map((t) => t.text).join(' ');
  for (const c of catheters) {
    const key = catheterKey(c.name);
    if (key && !/^\d/.test(key) && new RegExp(`\\b${escapeRegex(key)}(s|es)?\\b`).test(joined)) {
      return { c, usedIdx: -1 };
    }
  }
  return null;
}

export function parseCommand(text: string, catheters: CatheterRef[]): ParseResult {
  const norm = normalize(text);
  const result: ParseResult = { items: [], unknown: [] };
  if (!norm) return result;

  const isAdd = ADD_VERBS.test(norm) && !USE_VERBS.test(norm);
  const sign = isAdd ? 1 : -1; // por defecto es "uso"

  for (const clause of splitClauses(tokenize(norm))) {
    const hasNumber = clause.some((t) => t.num !== null);
    const hasWords = clause.some((t) => t.num === null && !FILLER.has(t.text) && !USE_VERBS.test(t.text) && !ADD_VERBS.test(t.text));
    if (!hasNumber && !hasWords) continue;

    const m = matchCatheter(clause, catheters);
    if (!m) {
      const frag = clause.map((t) => t.text).join(' ');
      if (hasNumber) result.unknown.push(frag);
      continue;
    }
    // Cantidad: primer número que no sea el que identificó al catéter; si no hay, 1.
    const qtyTok = clause.find((t, idx) => t.num !== null && idx !== m.usedIdx);
    const qty = qtyTok?.num ?? 1;
    if (qty <= 0) continue;

    const existing = result.items.find((it) => it.catheterId === m.c.id);
    if (existing) existing.delta += sign * qty;
    else result.items.push({ catheterId: m.c.id, name: m.c.name, delta: sign * qty });
  }
  return result;
}
