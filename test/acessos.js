// Testa o link individual de acesso (sem senha) e o PWA.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DB = path.join(os.tmpdir(), `codeon-acesso-${Date.now()}.db`);
process.env.DATABASE_PATH = DB;
process.env.ADMIN_EMAIL = 'admin@teste.com';
process.env.ADMIN_SENHA = 'TesteLocal#2026!Ponto';
process.env.LOG_REQUESTS = '0';

const { createApp } = await import('../src/server.js');
const app = await createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0; let fail = 0;
const falhas = [];
function check(nome, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ok  ${nome}`); }
  else { fail += 1; falhas.push(nome); console.log(`FAIL  ${nome} ${extra}`); }
}

async function api(method, p, body, cookie = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, cookie: sc ? sc.split(';')[0] : '' };
}

console.log('\n== Link individual de acesso ==');

let r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'TesteLocal#2026!Ponto' });
const admin = r.cookie;
check('admin autentica', r.status === 200);

r = await api('POST', '/api/usuarios', {
  nome: 'Joao Funcionario', email: 'joao@teste.com', senha: 'Joao@1234',
  cargo: 'Designer', vinculo: 'colaborador', perfil: 'colaborador',
}, admin);
check('colaborador criado', r.status === 201);
const joaoId = r.data.usuario.id;

r = await api('POST', '/api/acessos', { usuario_id: joaoId, rotulo: 'celular pessoal' }, admin);
check('gera link de acesso', r.status === 201, JSON.stringify(r.data).slice(0, 200));
const token = r.data.acesso.token;
check('link tem o formato /acesso/<token>', /\/acesso\/[A-Za-z0-9_-]+$/.test(r.data.link), r.data.link);

console.log('\n== Entrada pelo link (sem senha) ==');
r = await api('POST', '/api/auth/acesso', { token });
check('entra pelo link sem senha', r.status === 200, JSON.stringify(r.data).slice(0, 200));
check('sessao do colaborador criada', r.data.usuario?.id === joaoId);
check('cookie emitido', r.cookie.length > 0);
const cookieFuncionario = r.cookie;

r = await api('GET', '/api/auth/me', null, cookieFuncionario);
check('sessao vale na API seguinte', r.status === 200 && r.data.usuario.id === joaoId);

r = await api('POST', '/api/pontos/registrar', { tipo: 'entrada' }, cookieFuncionario);
check('funcionario bate o ponto pelo link', r.status === 201, JSON.stringify(r.data).slice(0, 200));

console.log('\n== Seguranca ==');
r = await api('POST', '/api/auth/acesso', { token: 'tokeninvalido123456' });
check('token invalido e recusado', r.status === 401);

r = await api('POST', '/api/auth/acesso', { token: '' });
check('token vazio e recusado', r.status === 400);

r = await api('GET', '/api/acessos', null, cookieFuncionario);
check('colaborador nao lista acessos', r.status === 403);

r = await api('POST', '/api/acessos', { usuario_id: joaoId }, cookieFuncionario);
check('colaborador nao gera acesso', r.status === 403);

console.log('\n== Revogacao ==');
r = await api('DELETE', `/api/acessos/${token}`, null, admin);
check('admin revoga o link', r.status === 200);

r = await api('POST', '/api/auth/acesso', { token });
check('link revogado nao funciona mais', r.status === 403, JSON.stringify(r.data).slice(0, 150));

console.log('\n== Expiracao ==');
r = await api('POST', '/api/acessos', { usuario_id: joaoId, expira_dias: 1 }, admin);
const token2 = r.data.acesso.token;
check('link com validade criado', r.status === 201 && r.data.acesso.expira_em);
r = await api('POST', '/api/auth/acesso', { token: token2 });
check('link dentro da validade funciona', r.status === 200);

console.log('\n== Contabilizacao de uso ==');
r = await api('GET', '/api/acessos', null, admin);
const uso = r.data.acessos.find((a) => a.token === token2);
check('uso do link registrado', uso && uso.usos >= 1, JSON.stringify(uso));
check('ultimo uso registrado', uso && uso.ultimo_uso_em);

console.log('\n== PWA ==');
const manifest = await fetch(`${base}/manifest.webmanifest`);
check('manifest disponivel', manifest.status === 200);
const mJson = await manifest.json();
check('manifest tem nome e icones', !!mJson.name && mJson.icons.length >= 2);
check('manifest em modo standalone', mJson.display === 'standalone');
check('manifest tem cor de tema', !!mJson.theme_color);

const sw = await fetch(`${base}/sw.js`);
check('service worker disponivel', sw.status === 200);
const swTexto = await sw.text();
check('sw ignora API no cache', swTexto.includes("startsWith('/api/')"));
check('sw faz cache dos assets', swTexto.includes('CACHE_ASSETS'));

for (const icone of ['/assets/icon-192.png', '/assets/icon-512.png']) {
  const res = await fetch(`${base}${icone}`);
  const buf = Buffer.from(await res.arrayBuffer());
  check(`icone ${icone} servido`, res.status === 200 && buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a');
}

const html = await (await fetch(`${base}/`)).text();
check('html referencia o manifest', html.includes('manifest.webmanifest'));
check('html tem apple-touch-icon', html.includes('apple-touch-icon'));
check('html tem meta theme-color', html.includes('theme-color'));

console.log('\n== Link individual no frontend ==');
const appJs = await (await fetch(`${base}/assets/app.js`)).text();
check('app.js reconhece a rota /acesso/', appJs.includes('/acesso/'));
check('app.js registra o service worker', appJs.includes("serviceWorker.register('/sw.js')"));
check('app.js trata o prompt de instalacao', appJs.includes('beforeinstallprompt'));

server.close();
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) { console.log('Falhas:', falhas.join(', ')); process.exit(1); }
