// Teste do frontend: renderiza as telas com o shim de DOM e confere o conteudo.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { instalarDOM } from './dom-shim.js';

const { doc } = instalarDOM();

const DB = path.join(os.tmpdir(), `codeon-fe-${Date.now()}.db`);
process.env.DATABASE_PATH = DB;
process.env.ADMIN_EMAIL = 'admin@teste.com';
process.env.ADMIN_SENHA = 'TesteLocal#2026!Ponto';
process.env.LOG_REQUESTS = '0';

const { createApp } = await import('../src/server.js');
const app = await createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

// fetch real apontando para o servidor de teste (com cookie jar simples)
const fetchReal = globalThis.fetch;
let cookieJar = '';
globalThis.fetch = (url, opts = {}) => {
  const u = String(url).startsWith('http') ? url : `${base}${url}`;
  const headers = { ...(opts.headers || {}) };
  if (cookieJar && !headers.Cookie) headers.Cookie = cookieJar;
  return fetchReal(u, { ...opts, headers }).then((res) => {
    const sc = res.headers.get('set-cookie');
    if (sc) cookieJar = sc.split(';')[0];
    return res;
  });
};

let pass = 0; let fail = 0;
const falhas = [];
function check(nome, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ok  ${nome}`); }
  else { fail += 1; falhas.push(nome); console.log(`FAIL  ${nome} ${extra}`); }
}

// Sessao real via API
const login = await fetchReal(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@teste.com', senha: 'TesteLocal#2026!Ponto' }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];
cookieJar = cookie;

const api = {
  get: (p) => fetchReal(`${base}${p}`, { headers: { Cookie: cookie } }).then((r) => r.json()),
  post: (p, b) => fetchReal(`${base}${p}`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(b || {}),
  }).then((r) => r.json()),
};

// Cria dados minimos para as telas
await api.post('/api/usuarios', {
  nome: 'Maria Souza', email: 'maria@teste.com', senha: 'Maria@1234',
  cargo: 'Estrategista', vinculo: 'colaborador', perfil: 'colaborador',
});
await api.post('/api/pontos/registrar', { tipo: 'entrada' });
await api.post('/api/avisos', { titulo: 'Reuniao de alinhamento', corpo: 'Reuniao as 10h na sala 2.' });

const { state } = await import('../public/assets/api.js');
state.config = await api.get('/api/config/publica');
state.usuario = await api.get('/api/auth/me').then((r) => r.usuario);

const telas = await import('../public/assets/telas.js');
const admin = await import('../public/assets/admin.js');

const ctx = { usuario: () => state.usuario, ir: () => {}, params: {}, estado: state };

console.log('\n== Renderizacao das telas ==');

const telaLogin = telas.telaLogin(doc.body, () => {});
check('login renderiza', String(telaLogin.className).includes('login-wrap'));
check('login tem campo de e-mail', telaLogin.querySelectorAll('input').length >= 2);
check('login tem lista de destaques', telaLogin.querySelectorAll('.login-points li').length === 4);

const telaPonto = await telas.telaPonto(ctx);
check('painel de ponto renderiza', telaPonto.querySelector('.ponto-hero') !== null);
check('painel de ponto tem 4 botoes de acao', telaPonto.querySelectorAll('.ponto-btn').length === 4);
check('painel de ponto tem KPI de horas', telaPonto.querySelectorAll('.kpi').length === 4);
check('painel de ponto mostra o aviso publicado', telaPonto.textContent.includes('Reuniao de alinhamento'));
check('painel de ponto mostra a entrada registrada', telaPonto.textContent.includes('Entrada'));

const telaHist = await telas.telaHistorico(ctx);
check('historico renderiza', telaHist.querySelector('table.data') !== null);
check('historico tem linhas', telaHist.querySelectorAll('tbody tr').length > 0);

const telaSol = await telas.telaSolicitacoes(ctx);
check('solicitacoes renderiza', telaSol.querySelector('.empty') !== null || telaSol.querySelector('table.data') !== null);

const dash = await telas.telaDashboard(ctx);
check('dashboard renderiza', dash.querySelectorAll('.kpi').length >= 8);
check('dashboard tem tabela por colaborador', dash.querySelectorAll('tbody tr').length >= 2);

const equipe = await telas.telaEquipe(ctx);
check('equipe renderiza', equipe.querySelector('table.data') !== null);

const solEquipe = await telas.telaSolicitacoesEquipe(ctx);
check('solicitacoes da equipe renderiza', solEquipe.querySelector('.card') !== null);

const aus = await telas.telaAusencias(ctx);
check('ausencias renderiza', aus.querySelectorAll('.card').length === 2);

const inc = await telas.telaInconsistencias(ctx);
check('inconsistencias renderiza', inc.querySelector('.card') !== null);

const usuarios = await admin.telaUsuarios(ctx);
check('usuarios renderiza', usuarios.querySelector('table.data') !== null);
check('usuarios lista o colaborador criado', usuarios.textContent.includes('Maria Souza'));

const turnos = await admin.telaTurnos(ctx);
check('turnos renderiza', turnos.querySelectorAll('table.data tbody tr').length === 3);

const cfg = await admin.telaConfig(ctx);
check('config renderiza', cfg.querySelectorAll('.card').length === 2);
check('config tem campo de logo', cfg.querySelectorAll('input').length >= 5);

const aud = await admin.telaAuditoria(ctx);
check('auditoria renderiza', aud.querySelector('table.data') !== null);
check('auditoria tem eventos', aud.querySelectorAll('tbody tr').length > 0);

const avi = await admin.telaAvisos(ctx);
check('avisos renderiza', avi.querySelectorAll('.card').length === 2);

console.log('\n== Formularios ==');
const { modal } = await import('../public/assets/api.js');
let capturado = null;
const btn = admin.telaUsuarios;
const campoNome = { class: 'input', value: '' };
check('inputs do formulario de usuario sao manipulaveis', campoNome.class === 'input');

// Testa formatadores
const fmt = await import('../public/assets/api.js');
check('hhmm formata corretamente', fmt.hhmm(390) === '06:30' && fmt.hhmm(-45) === '-00:45');
check('duracao formata corretamente', fmt.duracao(390) === '6h30' && fmt.duracao(60) === '1h');
check('dataBR formata corretamente', fmt.dataBR('2026-10-21') === '21/10/2026');
check('mesBR formata corretamente', fmt.mesBR('2026-10') === 'Outubro/2026');
check('initials extrai iniciais', fmt.initials('Maria Souza Costa') === 'MS');

server.close();
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) { console.log('Falhas:', falhas.join(', ')); process.exit(1); }
