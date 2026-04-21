const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Hora local atual `HH:mm` (para preencher seletores de hora). */
export function clockNowHHMM(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Interpreta `HH:mm` estrito; `null` se inválido. */
export function parseHHMM(s: string): { h: number; m: number } | null {
  const t = s.trim();
  if (!/^\d{2}:\d{2}$/.test(t)) {
    return null;
  }
  const [hs, ms] = t.split(':');
  const h = parseInt(hs ?? '', 10);
  const m = parseInt(ms ?? '', 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return { h, m };
}

/**
 * Formatação enquanto o utilizador digita: só dígitos e um `:`; no máximo `HH:mm`.
 * Aceita colar "930" → "09:30", "9:30" → "9:30" (normalizar no blur).
 */
export function formatPartialTimeInput(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return '';
  }
  if (t.includes(':')) {
    const parts = t.split(':');
    const hPart = (parts[0] ?? '').replace(/\D/g, '').slice(0, 2);
    const rest = parts.slice(1).join('');
    const mPart = rest.replace(/\D/g, '').slice(0, 2);
    if (parts.length >= 2) {
      if (!hPart && !mPart) {
        return '';
      }
      return mPart.length > 0 || /\d/.test(rest) ? `${hPart}:${mPart}` : `${hPart}:`;
    }
    return hPart ? `${hPart}:` : '';
  }
  const d = t.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) {
    return d;
  }
  return `${d.slice(0, 2)}:${d.slice(2, 4)}`;
}

/**
 * Converte texto livre num `HH:mm` válido (blur / gravar).
 * Ex.: `9:5` → `09:05`, `930` → `09:30`, `14` → `14:00`.
 */
export function normalizeToHHMM(raw: string): string | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const strict = parseHHMM(t);
  if (strict) {
    return `${pad(strict.h)}:${pad(strict.m)}`;
  }
  const m1 = t.match(/^(\d{1,2}):(\d{0,2})$/);
  if (m1) {
    const h = parseInt(m1[1] ?? '', 10);
    const ms = m1[2] ?? '';
    const min = ms === '' ? 0 : parseInt(ms, 10);
    if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) {
      return null;
    }
    return `${pad(h)}:${pad(min)}`;
  }
  const digits = t.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  let h: number;
  let min: number;
  if (digits.length <= 2) {
    h = parseInt(digits, 10);
    min = 0;
  } else if (digits.length === 3) {
    h = parseInt(digits[0] ?? '', 10);
    min = parseInt(digits.slice(1), 10);
  } else {
    h = parseInt(digits.slice(0, 2), 10);
    min = parseInt(digits.slice(2, 4), 10);
  }
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${pad(h)}:${pad(min)}`;
}

/** `true` se `end` é depois de `start` no mesmo dia civil (só compara hora). */
export function isEndTimeAfterStartSameDay(start: Date, end: Date): boolean {
  const a = start.getHours() * 60 + start.getMinutes();
  const b = end.getHours() * 60 + end.getMinutes();
  return b > a;
}

/**
 * Sobreposição de intervalos no eixo temporal (instantes `Date`).
 * Dois eventos 09:00–10:00 e 10:00–11:00 não se sobrepõem (10:00 do primeiro não choca com o início do segundo).
 */
export function timeIntervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/** `true` se o dia civil de `d` é anterior ao de hoje (não inclui hoje). */
export function isBeforeToday(d: Date): boolean {
  return startOfDay(d).getTime() < startOfDay(new Date()).getTime();
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Domingo como início da semana (pt-BR) */
export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = -day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function endOfWeekMonday(d: Date): Date {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return endOfDay(e);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function eventStartDate(ev: { startDate: string }): Date {
  return new Date(ev.startDate);
}

const tfHm = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Ex.: `14:00 – 15:30` */
export function formatEventTimeRange(ev: { startDate: string; endDate?: string }): string {
  const a = tfHm.format(new Date(ev.startDate));
  if (!ev.endDate) {
    return a;
  }
  return `${a} – ${tfHm.format(new Date(ev.endDate))}`;
}

export interface MonthGridCell {
  date: Date;
  inMonth: boolean;
  key: string;
}

/** Grade 7×6 (semana começando no domingo) para o mês de `monthAnchor`. */
export function buildMonthGridCells(monthAnchor: Date): MonthGridCell[] {
  const first = startOfMonth(monthAnchor);
  const start = startOfWeekMonday(first);
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    cells.push({
      date,
      inMonth: sameMonth(date, monthAnchor),
      key: toDateKey(date),
    });
  }
  return cells;
}
