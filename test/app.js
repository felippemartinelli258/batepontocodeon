// Testa o bootstrap da aplicacao (app.js): sessao, shell, rotas e navegacao.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { instalarDOM } from './dom-shim.js';

const { doc } = instalarDOM();

const DB = path.join(os.tmpdir(), `codeon-app-${Date.now()}.db`);
process.env.DATABASE_PATH = DB;
process.env.ADMIN_EMAIL = 'admin@teste.com';
process.env.ADMIN_SENHA = 'TesteLocal#2026!Ponto';
process.env.LOG_REQUESTS = '0';

const { createApp } = await import('../src/server.js');
const app = await createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

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
const esperar = (ms = 60) => new Promise((r) => setTimeout(r, ms));

console.log('\n== Bootstrap sem sessao ==');

// index.html simulado
const appEl = doc.createElement('div');
appEl.id = 'app';
doc.body.appendChild(appEl);
doc.getElementById = (id) => (id === 'app' ? appEl : doc.descendants().find((n) => n.id === id) || null);
doc.getElementById('toasts') || doc.body.appendChild(Object.assign(doc.createElement('div'), { id: 'toasts' }));

await import('../public/assets/app.js');
await esperar(300);

check('app monta a tela de login sem sessao', String(appEl.className).includes('login-wrap') || appEl.querySelector('.login-wrap') !== null);
check('login tem botao de envio', appEl.querySelectorAll('button').length >= 1);

console.log('\n== Bootstrap com sessao ==');
const login = await fetchReal(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@teste.com', senha: 'TesteLocal#2026!Ponto' }),
});
cookieJar = login.headers.get('set-cookie').split(';')[0];

// Recarrega o app.js com a sessao ja ativa
const app2 = doc.createElement('div');
app2.id = 'app';
doc.body.appendChild(app2);
doc.getElementById = (id) => (id === 'app' ? app2 : doc.descendants().find((n) => n.id === id) || null);
await import(`../public/assets/app.js?v=${Date.now()}`);
await esperar(400);

check('app monta o shell do sistema', app2.querySelector('.shell') !== null);
check('shell tem barra lateral', app2.querySelector('.sidebar') !== null);
check('shell tem topbar', app2.querySelector('.topbar') !== null);

const nav = app2.querySelectorAll('.nav-item');
check('menu de admin tem todos os itens', nav.length >= 13, `(${nav.length} itens)`);
check('menu tem agrupamentos', app2.querySelectorAll('.nav-label').length === 3);
check('titulo da rota inicial preenchido', app2.querySelector('.topbar h1').textContent.length > 0);

console.log('\n== Navegacao entre rotas ==');
const rotas = ['ponto', 'conta', 'historico', 'dashboard', 'equipe', 'solicitacoes_equipe', 'ausencias', 'inconsistencias', 'usuarios', 'acessos', 'turnos', 'avisos', 'config', 'auditoria', 'solicitacoes'];
for (const rota of rotas) {
  const item = nav.find((n) => n.dataset.rota === rota);
  if (!item) { check(`rota ${rota} presente no menu`, false); continue; }
  item.dispatch('click');
  await esperar(220);
  const temConteudo = app2.querySelector('.content .container') !== null
    && !app2.querySelector('.content .skeleton');
  check(`rota ${rota} renderiza`, temConteudo,
    app2.querySelector('.content .alert-error')?.textContent || '');
}

check('sem erros de API durante a navegacao',
  !app2.querySelectorAll('.alert-error').length,
  app2.querySelector('.alert-error')?.textContent || '');

server.close();
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) { console.log('Falhas:', falhas.join(', ')); process.exit(1); }
