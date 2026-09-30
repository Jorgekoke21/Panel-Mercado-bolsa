import { looksLikeSplit, UNEXPLAINED_JUMP } from "./price-quality";

/**
 * Índices SINTÉTICOS de MarketRadar (no son índices oficiales) por grupo: sector, grupo de industria,
 * industria, sub-industria y el conjunto de constituyentes del índice.
 *
 * Metodología (price return, cierres ajustados por splits):
 *   * Equal weight: rebalanceo diario. Nivel_t = Nivel_{t−1} × (1 + media de los rendimientos del día).
 *   * Cap weight: pesos = capitalización del cierre ANTERIOR de cada miembro (precio sin ajustar ×
 *     acciones en circulación vigentes ese día, re-expresadas por splits posteriores). Solo miembros
 *     con capitalización actual VERIFICADA.
 *   * Miembros = constituyentes ACTUALES (sesgo de supervivencia: no se reconstruye la composición
 *     histórica). Un miembro entra desde su primera sesión con cotización.
 *   * Un rendimiento diario con forma de split no registrado (≥ 5×, ≈ 1/n…) se excluye de ese día.
 *   * Base 100 en la primera sesión. Series alineadas con el calendario oficial de sesiones.
 */

export interface IndexMember {
  /** Claves de los grupos a los que pertenece (p. ej. "sector:<id>", "index:sp500"). */
  groups: readonly string[];
  /** Barras en orden cronológico: fecha, cierre ajustado por splits y capitalización al cierre (o null). */
  bars: readonly { date: string; adjClose: number; marketCap: number | null }[];
  /** Participa en la versión cap-weighted (capitalización actual verificada). */
  capWeighted: boolean;
}

export interface GroupIndexSeries {
  key: string;
  startDate: string;
  /** Niveles alineados con las sesiones desde startDate (base 100). */
  equal: number[];
  /** null si ningún miembro tiene capitalización fiable. */
  cap: number[] | null;
  /** Miembros que aportan en la última sesión. */
  equalMembers: number;
  capMembers: number;
  /** Total de miembros del grupo (con o sin datos). */
  totalMembers: number;
}

interface Acc {
  ewSum: Float64Array;
  ewN: Uint16Array;
  cwSum: Float64Array;
  cwCap: Float64Array;
  cwN: Uint16Array;
  members: number;
}

export class GroupIndexAccumulator {
  private readonly position: Map<string, number>;
  private readonly groups = new Map<string, Acc>();
  excludedReturns = 0;

  constructor(private readonly sessions: readonly string[]) {
    this.position = new Map(sessions.map((d, i) => [d, i]));
  }

  private acc(key: string): Acc {
    let a = this.groups.get(key);
    if (!a) {
      const n = this.sessions.length;
      a = { ewSum: new Float64Array(n), ewN: new Uint16Array(n), cwSum: new Float64Array(n), cwCap: new Float64Array(n), cwN: new Uint16Array(n), members: 0 };
      this.groups.set(key, a);
    }
    return a;
  }

  /** Registra un grupo aunque ningún miembro tenga datos (para contar el total). */
  touch(groups: readonly string[]) {
    for (const g of groups) this.acc(g).members++;
  }

  add(member: IndexMember) {
    const accs = member.groups.map((g) => this.acc(g));
    for (const a of accs) a.members++;
    for (let i = 1; i < member.bars.length; i++) {
      const prev = member.bars[i - 1] as IndexMember["bars"][number];
      const bar = member.bars[i] as IndexMember["bars"][number];
      const pos = this.position.get(bar.date);
      if (pos === undefined || !(prev.adjClose > 0)) continue;
      const ratio = bar.adjClose / prev.adjClose;
      if (Math.abs(ratio - 1) > UNEXPLAINED_JUMP && looksLikeSplit(ratio)) {
        this.excludedReturns++;
        continue;
      }
      const r = ratio - 1;
      const cap = member.capWeighted && prev.marketCap !== null && prev.marketCap > 0 ? prev.marketCap : null;
      for (const a of accs) {
        a.ewSum[pos] = (a.ewSum[pos] as number) + r;
        a.ewN[pos] = (a.ewN[pos] as number) + 1;
        if (cap !== null) {
          a.cwSum[pos] = (a.cwSum[pos] as number) + cap * r;
          a.cwCap[pos] = (a.cwCap[pos] as number) + cap;
          a.cwN[pos] = (a.cwN[pos] as number) + 1;
        }
      }
    }
  }

  /** Fecha de la sesión `offset` posiciones después de `start`. */
  sessionAt(start: string, offset: number): string {
    return this.sessions[(this.position.get(start) ?? 0) + offset] as string;
  }

  keys(): string[] {
    return [...this.groups.keys()];
  }

  build(key: string): GroupIndexSeries | null {
    const a = this.groups.get(key);
    if (!a) return null;
    // Base: la sesión ANTERIOR al primer rendimiento.
    let first = a.ewN.findIndex((n) => n > 0);
    if (first < 0) return null;
    first = Math.max(0, first - 1);
    const equal: number[] = [];
    const cap: number[] = [];
    let ew = 100;
    let cw = 100;
    let anyCap = false;
    for (let i = first; i < this.sessions.length; i++) {
      if (i > first) {
        const n = a.ewN[i] as number;
        if (n > 0) ew *= 1 + (a.ewSum[i] as number) / n;
        const c = a.cwCap[i] as number;
        if (c > 0) {
          cw *= 1 + (a.cwSum[i] as number) / c;
          anyCap = true;
        }
      }
      equal.push(ew);
      cap.push(cw);
    }
    // Recorta sesiones finales sin ningún dato (futuras en el calendario).
    let last = this.sessions.length - 1;
    while (last > first && (a.ewN[last] as number) === 0) last--;
    const length = last - first + 1;
    return {
      key,
      startDate: this.sessions[first] as string,
      equal: equal.slice(0, length),
      cap: anyCap ? cap.slice(0, length) : null,
      equalMembers: a.ewN[last] as number,
      capMembers: a.cwN[last] as number,
      totalMembers: a.members,
    };
  }
}

/**
 * Acciones en circulación vigentes en una fecha: última cifra con fecha ≤ date (o la primera si la
 * fecha es anterior a todas), re-expresada por los splits con fecha ex en (fecha de la cifra, date].
 * Así precio sin ajustar × acciones = capitalización de ese día.
 */
export function sharesOn(
  date: string,
  history: readonly { asOfDate: string; shares: number }[],
  splits: readonly { exDate: string; shareFactor: number }[],
): number | null {
  if (history.length === 0) return null;
  let point = history[0] as { asOfDate: string; shares: number };
  for (const h of history) if (h.asOfDate <= date) point = h;
  let shares = point.shares;
  for (const s of splits) {
    if (point.asOfDate <= date ? s.exDate > point.asOfDate && s.exDate <= date : s.exDate > date && s.exDate <= point.asOfDate) {
      shares = point.asOfDate <= date ? shares * s.shareFactor : shares / s.shareFactor;
    }
  }
  return shares;
}

/** Rebase a 100 en la primera fecha ≥ from (para comparar series en un periodo). */
export function rebase(points: readonly { time: string; value: number }[], from: string): { time: string; value: number }[] {
  const start = points.findIndex((p) => p.time >= from);
  if (start < 0) return [];
  const base = (points[start] as { value: number }).value;
  if (!(base > 0)) return [];
  return points.slice(start).map((p) => ({ time: p.time, value: (p.value / base) * 100 }));
}
