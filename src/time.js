// Utilitarios de tempo: fuso horario da agencia, datas locais e minutos.

export const DEFAULT_TZ = 'America/Sao_Paulo';

const partsCache = new Map();
function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }));
  }
  return partsCache.get(tz);
}

/** Quebra uma data em componentes locais do fuso da agencia. */
export function localParts(date = new Date(), tz = DEFAULT_TZ) {
  const parts = {};
  for (const { type, value } of formatter(tz).formatToParts(date)) parts[type] = value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}:${parts.second}`,
    hour: Number(hour),
    minute: Number(parts.minute),
    weekday: Number(parts.weekday),
  };
}

/** Data local (YYYY-MM-DD) e hora local (HH:MM) do instante atual. */
export function nowLocal(tz = DEFAULT_TZ) {
  const p = localParts(new Date(), tz);
  return { data: p.date, hora: p.time.slice(0, 5), seg: p.time };
}

/** 'HH:MM' -> minutos desde a meia-noite. */
export function toMinutes(hhmm) {
  if (hhmm == null) return null;
  const s = String(hhmm).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47 || min > 59) return null;
  return h * 60 + min;
}

/** Minutos -> 'HH:MM' (ou 'H:MM' quando negativo/absoluto em horas). */
export function toHHMM(minutes) {
  const neg = minutes < 0;
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${neg ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Minutos -> '6h30' / '6h' / '30min'. */
export function humanMinutes(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const body = h > 0 && m > 0 ? `${h}h${String(m).padStart(2, '0')}` : h > 0 ? `${h}h` : `${m}min`;
  return minutes < 0 ? `-${body}` : body;
}

/** '2026-10-21' -> Date UTC do inicio do dia (apenas para calculos de dia da semana). */
export function parseDate(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** 0 = domingo ... 6 = sabado */
export function weekdayOf(dateStr) {
  const d = parseDate(dateStr);
  return d ? d.getUTCDay() : null;
}

export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function monthLabel(month) {
  const [y, m] = String(month).split('-');
  return `${MONTH_NAMES[Number(m) - 1]} de ${y}`;
}

export function monthBounds(month) {
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    month,
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, '0')}`,
    days: last,
  };
}

export function daysOfMonth(month) {
  const b = monthBounds(month);
  if (!b) return [];
  const out = [];
  for (let d = 1; d <= b.days; d++) out.push(`${month}-${String(d).padStart(2, '0')}`);
  return out;
}

export function monthKey(dateStr) {
  return String(dateStr || '').slice(0, 7);
}

/** Deslocamento do fuso em milissegundos respecto ao UTC no instante informado. */
export function tzOffsetMs(ts, tz = DEFAULT_TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(new Date(ts))) p[type] = value;
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return asUTC - Math.floor(ts / 1000) * 1000;
}

/**
 * Converte data + hora local do fuso da agencia em epoch (ms).
 * Usado para ordenar pontos que atravessam a meia-noite.
 */
export function epochMs(dateStr, hhmm, tz = DEFAULT_TZ) {
  const dm = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!dm || !tm) return null;
  const guess = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0);
  const off = tzOffsetMs(guess, tz);
  let ts = guess - off;
  const off2 = tzOffsetMs(ts, tz);
  if (off2 !== off) ts = guess - off2;
  return ts;
}
