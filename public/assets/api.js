// Cliente da API + utilidades de estado.
export const state = {
  usuario: null,
  config: {},
  rota: 'ponto',
  params: {},
};

export async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) data = await res.json();
  else data = await res.text();
  if (!res.ok) {
    const err = new Error((data && data.erro) || `Erro ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);

// --------------------------------------------------------------- helpers

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(3)) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function icon(path, size = 17) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = path;
  return svg;
}

export const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  request: '<path d="M9 3h6l1 3h4v15H4V6h4z"/><path d="M9 13h6M9 17h4"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 20c0-2.4-.8-3.8-2-4.6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.5"/>',
  audit: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  logout: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  coffee: '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M6 2v3M10 2v3"/>',
  logoutIn: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18.5h2"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-3.6 3.4-5.6 7.5-5.6s7.5 2 7.5 5.6"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="m11 11 8-8M17 5l2 2M14 8l2 2"/>',
};

export function toast(mensagem, tipo = '') {
  const box = document.getElementById('toasts');
  const node = el('div', { class: `toast ${tipo}` },
    icon(tipo === 'bad' ? ICONS.alert : tipo === 'ok' ? ICONS.checkCircle : ICONS.bell, 16),
    el('span', { text: mensagem }));
  box.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateX(16px)';
    setTimeout(() => node.remove(), 260);
  }, 3600);
}

export function modal(titulo, conteudo, acoes = []) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const fechar = () => { backdrop.remove(); document.body.style.overflow = ''; };
  const box = el('div', { class: 'modal' },
    el('div', { class: 'modal-head' },
      el('h3', { text: titulo }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'icon-btn', onclick: fechar, 'aria-label': 'Fechar' }, icon(ICONS.x, 18))),
    el('div', { class: 'modal-body' }, conteudo),
    acoes.length ? el('div', { class: 'modal-foot' },
      ...acoes.map((a) => el('button', {
        class: `btn ${a.classe || 'btn-outline'}`,
        onclick: async () => {
          if (a.onClick) {
            const ok = await a.onClick(fechar);
            if (ok === false) return;
          }
          if (a.fechar !== false) fechar();
        },
      }, a.texto))) : null);
  backdrop.appendChild(box);
  backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) fechar(); });
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  return { node: box, fechar };
}

export function confirmar(titulo, texto, aoConfirmar, rotulo = 'Confirmar') {
  modal(titulo, el('p', { text: texto, style: 'color:var(--ink-2);font-size:13.5px' }), [
    { texto: 'Cancelar', classe: 'btn-outline' },
    { texto: rotulo, classe: 'btn-primary', onClick: async () => { await aoConfirmar(); } },
  ]);
}

export function initials(nome) {
  return String(nome || '?')
    .trim().split(/\s+/).slice(0, 2)
    .map((p) => p[0]).join('').toUpperCase();
}

// ------------------------------------------------------------- formatacao

export function hhmm(minutos) {
  if (minutos == null) return '—';
  const neg = minutos < 0;
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${neg ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function duracao(minutos) {
  if (minutos == null) return '—';
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const s = h > 0 && m > 0 ? `${h}h${String(m).padStart(2, '0')}` : h > 0 ? `${h}h` : `${m}min`;
  return minutos < 0 ? `-${s}` : s;
}

export function dataBR(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function dataHoraBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function mesBR(mes) {
  if (!mes) return '';
  const [y, m] = mes.split('-');
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${nomes[Number(m) - 1] || m}/${y}`;
}

export const STATUS_BADGE = {
  completo: 'ok', em_andamento: 'info', incompleto: 'bad', inconsistente: 'bad',
  divergente: 'warn', horas_pendentes: 'warn', folga: 'neutral', falta: 'bad', ausencia: 'warn',
};

export function statusBadge(status, label) {
  return el('span', { class: `badge ${STATUS_BADGE[status] || 'neutral'} dot`, text: label || status });
}
