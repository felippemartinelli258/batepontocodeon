// Bootstrap da aplicacao: sessao, shell, rotas e navegacao.
import { el, clear, icon, ICONS, get, post, toast, state, initials, mesBR } from './api.js';
import {
  telaLogin, telaPonto, telaHistorico, telaSolicitacoes, telaDashboard,
  telaEquipe, telaSolicitacoesEquipe, telaAusencias, telaInconsistencias,
} from './telas.js';
import {
  telaUsuarios, telaTurnos, telaConfig, telaAuditoria, telaAvisos, telaAcessos, telaMinhaConta,
} from './admin.js';

const app = document.getElementById('app');

const ROTAS = {
  ponto: { titulo: 'Registrar ponto', sub: 'Controle do expediente de hoje', tela: telaPonto, grupo: 'Meu trabalho' },
  conta: { titulo: 'Minha conta', sub: 'Dados e senha de acesso', tela: telaMinhaConta, grupo: 'Meu trabalho' },
  historico: { titulo: 'Meu historico', sub: 'Frequencia e horas trabalhadas', tela: telaHistorico, grupo: 'Meu trabalho' },
  solicitacoes: { titulo: 'Minhas solicitacoes', sub: 'Correcoes de registro', tela: telaSolicitacoes, grupo: 'Meu trabalho' },
  dashboard: { titulo: 'Visao geral', sub: 'Indicadores da equipe', tela: telaDashboard, grupo: 'Gestao', gestor: true },
  equipe: { titulo: 'Registros da equipe', sub: 'Frequencia por colaborador', tela: telaEquipe, grupo: 'Gestao', gestor: true },
  solicitacoes_equipe: { titulo: 'Solicitacoes de correcao', sub: 'Aprovacao e rejeicao', tela: telaSolicitacoesEquipe, grupo: 'Gestao', gestor: true },
  ausencias: { titulo: 'Ausencias e faltas', sub: 'Justificativas da equipe', tela: telaAusencias, grupo: 'Gestao', gestor: true },
  inconsistencias: { titulo: 'Inconsistencias', sub: 'Registros a regularizar', tela: telaInconsistencias, grupo: 'Gestao', gestor: true },
  usuarios: { titulo: 'Usuarios', sub: 'Gestão de acessos e jornadas', tela: telaUsuarios, grupo: 'Administracao', admin: true },
  acessos: { titulo: 'Links de acesso', sub: 'Acesso rapido para funcionarios', tela: telaAcessos, grupo: 'Administracao', gestor: true },
  turnos: { titulo: 'Turnos', sub: 'Manutencao de faixas de trabalho', tela: telaTurnos, grupo: 'Administracao', admin: true },
  avisos: { titulo: 'Comunicados', sub: 'Avisos internos', tela: telaAvisos, grupo: 'Administracao', gestor: true },
  config: { titulo: 'Configuracoes', sub: 'Identidade visual e backup', tela: telaConfig, grupo: 'Administracao', admin: true },
  auditoria: { titulo: 'Auditoria', sub: 'Historico de alteracoes', tela: telaAuditoria, grupo: 'Administracao', admin: true },
};

function podeVer(rota) {
  const u = state.usuario;
  if (!u) return false;
  if (rota.admin) return u.perfil === 'admin';
  if (rota.gestor) return u.perfil === 'admin' || u.perfil === 'gestor';
  return true;
}

function rotasVisiveis() {
  return Object.entries(ROTAS).filter(([, r]) => podeVer(r));
}

function rotaInicial() {
  const u = state.usuario;
  if (u.perfil === 'admin') return 'dashboard';
  if (u.perfil === 'gestor') return 'dashboard';
  return 'ponto';
}

// ------------------------------------------------------------------ shell

let shell = null;

function montarShell() {
  const u = state.usuario;
  const conteudo = el('main', { class: 'content' }, el('div', { class: 'container' }));
  const titulo = el('h1', { text: '' });
  const sub = el('span', { class: 'sub', text: '' });
  const nav = el('nav', { class: 'nav' });

  const clock = el('span', { class: 'clock', text: '' });
  function tick() {
    clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 20000);

  const cfg = state.config || {};
  // Na barra lateral usa o monograma; a logo completa aparece no login.
  const marca = el('img', { src: '/assets/logo-mono.png', alt: cfg.nome_agencia || 'Codeon Agency', class: 'marca-mono' });

  const sidebar = el('aside', { class: 'sidebar' },
    el('div', { class: 'sidebar-head' },
      el('div', { class: 'logo' }, marca, cfg.nome_agencia || 'CODEON')),
    nav,
    el('div', { class: 'sidebar-foot' },
      el('div', { class: 'sidebar-user' },
        el('div', { class: 'avatar dark', text: initials(u.nome) }),
        el('div', { class: 'meta' },
          el('b', { text: u.nome }),
          el('span', { text: u.perfil === 'prestador' ? 'Prestador de servicos' : u.perfil })),
        el('button', {
          class: 'icon-btn-dark', title: 'Sair',
          onclick: async () => {
            try { await post('/api/auth/logout', {}); } catch { /* ignore */ }
            state.usuario = null;
            app.className = '';
            clear(app);
            app.appendChild(telaLogin(app, aoEntrar));
          },
        }, icon(ICONS.logout, 17)))));

  const scrim = el('div', { class: 'scrim', onclick: () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); } });

  const topbar = el('header', { class: 'topbar' },
    el('button', {
      class: 'burger', 'aria-label': 'Menu',
      onclick: () => { sidebar.classList.add('open'); scrim.classList.add('show'); },
    }, icon(ICONS.menu, 18)),
    el('div', {}, titulo, ' ', sub),
    el('div', { class: 'topbar-actions' }, clock));

  shell = { conteudo, titulo, sub, nav, sidebar, scrim };
  app.appendChild(el('div', { class: 'shell' }, sidebar, el('div', { class: 'main' }, topbar, conteudo)));
  app.appendChild(scrim);

  montarNav();
}

function montarNav() {
  const { nav } = shell;
  clear(nav);
  let grupoAtual = null;
  for (const [chave, r] of rotasVisiveis()) {
    if (r.grupo !== grupoAtual) {
      grupoAtual = r.grupo;
      nav.appendChild(el('div', { class: 'nav-label', text: r.grupo }));
    }
    const item = el('button', {
      class: 'nav-item', dataset: { rota: chave },
      onclick: () => { ir(chave); shell.sidebar.classList.remove('open'); shell.scrim.classList.remove('show'); },
    }, icon(iconeDaRota(chave), 17), el('span', { text: r.titulo }));
    nav.appendChild(item);
  }
}

function iconeDaRota(chave) {
  return {
    ponto: ICONS.clock,
    conta: ICONS.user,
    historico: ICONS.history,
    solicitacoes: ICONS.request,
    dashboard: ICONS.chart,
    equipe: ICONS.users,
    solicitacoes_equipe: ICONS.request,
    ausencias: ICONS.calendar,
    inconsistencias: ICONS.alert,
    usuarios: ICONS.users,
    acessos: ICONS.link,
    turnos: ICONS.clock,
    avisos: ICONS.bell,
    config: ICONS.settings,
    auditoria: ICONS.audit,
  }[chave] || ICONS.home;
}

// -------------------------------------------------------------- navegacao

export function ir(chave, params = {}) {
  state.rota = chave;
  state.params = params;
  const r = ROTAS[chave];
  if (!r) return;
  if (!podeVer(r)) { toast('Sem permissao para acessar esta area.', 'bad'); return; }
  history.replaceState(null, '', `#/${chave}`);

  shell.titulo.textContent = r.titulo;
  shell.sub.textContent = r.sub;
  for (const item of shell.nav.querySelectorAll('.nav-item')) {
    item.classList.toggle('active', item.dataset.rota === chave);
  }

  clear(shell.conteudo);
  const host = el('div', { class: 'container' });
  shell.conteudo.appendChild(host);
  host.appendChild(el('div', { class: 'skeleton', style: 'height:150px;border-radius:12px' }));

  const ctx = {
    usuario: () => state.usuario,
    ir,
    params,
    estado: state,
  };

  Promise.resolve(r.tela(ctx)).then((node) => {
    if (state.rota !== chave) return;
    clear(host);
    host.appendChild(node);
  }).catch((e) => {
    if (state.rota !== chave) return;
    clear(host);
    host.appendChild(el('div', { class: 'card' }, el('div', { class: 'card-body' },
      el('div', { class: 'alert alert-error', text: e.message || 'Erro ao carregar a tela.' }))));
  });
}

// --------------------------------------------------------------- acesso

// Link individual: /acesso/<token>. Entra direto, sem digitar senha.
async function entrarPorLink(token) {
  app.className = '';
  clear(app);
  app.appendChild(el('div', { class: 'app-loading' },
    el('div', { class: 'boot' },
      el('div', { class: 'boot-mark', text: 'CODEON' }),
      el('div', { class: 'boot-bar' }, el('span')))));

  try {
    const r = await post('/api/auth/acesso', { token });
    await aoEntrar(r.usuario);
    history.replaceState(null, '', '/#/ponto');
  } catch (e) {
    app.className = '';
    clear(app);
    app.appendChild(el('div', { class: 'login-wrap' },
      el('main', { class: 'login-main' },
        el('div', { class: 'login-card' },
          el('div', { class: 'login-logo-mobile' },
            el('span', { class: 'logo-dot' }),
            (state.config?.nome_agencia || 'CODEON AGENCY')),
          el('h2', { text: 'Link invalido' }),
          el('p', { text: 'Este link de acesso nao e valido ou expirou. Peca um novo link ao seu gestor.' }),
          el('div', { class: 'alert alert-error', text: e.message }),
          el('a', { class: 'btn btn-outline btn-block', href: '/', style: 'margin-top:14px' },
            'Ir para o login')))));
  }
}

// --------------------------------------------------------------- inicio

async function aoEntrar(usuario) {
  state.usuario = usuario;
  app.className = '';
  clear(app);
  montarShell();
  const hash = (location.hash || '').replace('#/', '');

  // Senha provisoria: força a troca no primeiro acesso.
  if (usuario.senha_provisoria) {
    ir('conta');
    setTimeout(() => {
      toast('Defina uma senha definitiva para sua conta.', 'ok');
    }, 400);
    return;
  }

  ir(ROTAS[hash] && podeVer(ROTAS[hash]) ? hash : rotaInicial());
}

async function iniciar() {
  try {
    state.config = await get('/api/config/publica');
    aplicarMarca(state.config);
  } catch { /* usa o padrao */ }

  // Link individual tem prioridade sobre a sessao existente.
  const m = (location.pathname || '').match(/^\/acesso\/([A-Za-z0-9_-]{8,})$/);
  if (m) {
    await entrarPorLink(m[1]);
    return;
  }

  try {
    const r = await get('/api/auth/me');
    await aoEntrar(r.usuario);
  } catch {
    app.className = '';
    clear(app);
    app.appendChild(telaLogin(app, aoEntrar));
  }
}

function aplicarMarca(cfg) {
  if (!cfg) return;
  const root = document.documentElement.style;
  if (cfg.cor_primaria) root.setProperty('--brand', cfg.cor_primaria);
  if (cfg.cor_destaque) root.setProperty('--accent', cfg.cor_destaque);
  document.title = `${cfg.nome_agencia || 'Codeon Agency'} - Registro de Ponto`;
}

window.addEventListener('hashchange', () => {
  if (!state.usuario) return;
  const hash = (location.hash || '').replace('#/', '');
  if (hash && ROTAS[hash] && hash !== state.rota) ir(hash);
});

// ------------------------------------------------------------------- PWA

let promptInstalacao = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem service worker (ex.: aberto via file://) o app funciona normalmente.
    });
  });
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  promptInstalacao = ev;
  if (state.usuario) mostrarBarraInstalacao();
});

window.addEventListener('appinstalled', () => {
  promptInstalacao = null;
  document.querySelector('.install-bar')?.remove();
});

function mostrarBarraInstalacao() {
  if (!promptInstalacao) return;
  if (document.querySelector('.install-bar')) return;
  const barra = el('div', { class: 'install-bar show' },
    el('div', { class: 'txt' },
      el('b', { text: 'Instalar o Codeon Ponto' }),
      el('span', { text: 'Abre direto na tela inicial, como um aplicativo.' })),
    el('button', {
      class: 'btn-install',
      onclick: async () => {
        const ev = promptInstalacao;
        promptInstalacao = null;
        barra.remove();
        if (ev) { ev.prompt(); try { await ev.userChoice; } catch { /* cancelado */ } }
      },
    }, 'Instalar'),
    el('button', {
      class: 'btn-dismiss', 'aria-label': 'Agora nao',
      onclick: () => { promptInstalacao = null; barra.remove(); },
    }, icon(ICONS.x, 16)));
  app.appendChild(barra);
}

iniciar();
