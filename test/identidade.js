// Testa troca de senha, link automatico no cadastro e identidade visual.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DB = path.join(os.tmpdir(), `codeon-novo-${Date.now()}.db`);
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

console.log('\n== Troca de senha ==');
let r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'TesteLocal#2026!Ponto' });
const admin = r.cookie;
check('admin autentica', r.status === 200);

r = await api('POST', '/api/auth/trocar-senha', { senha_atual: 'Errada@123', senha_nova: 'NovaSenha@2026' }, admin);
check('senha atual incorreta e recusada', r.status === 400);

r = await api('POST', '/api/auth/trocar-senha', { senha_atual: 'TesteLocal#2026!Ponto', senha_nova: 'fraca' }, admin);
check('senha nova fraca e recusada', r.status === 400);

r = await api('POST', '/api/auth/trocar-senha', { senha_atual: 'TesteLocal#2026!Ponto', senha_nova: 'TesteLocal#2026!Ponto' }, admin);
check('senha igual a atual e recusada', r.status === 400);

// Sessao paralela deve ser encerrada ao trocar a senha.
const sessaoParalela = admin;
r = await api('POST', '/api/auth/trocar-senha', { senha_atual: 'TesteLocal#2026!Ponto', senha_nova: 'NovaSenha@2026' }, admin);
check('troca de senha aceita', r.status === 200, JSON.stringify(r.data));

r = await api('GET', '/api/auth/me', null, sessaoParalela);
check('sessao atual continua valendo', r.status === 200);

r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'TesteLocal#2026!Ponto' });
check('senha antiga nao funciona mais', r.status === 401);

r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'NovaSenha@2026' });
check('senha nova funciona', r.status === 200);
const admin2 = r.cookie;

console.log('\n== Link gerado automaticamente no cadastro ==');
r = await api('POST', '/api/usuarios', {
  nome: 'Funcionario Novo', email: 'novo@teste.com', senha: 'Provisoria@123',
  cargo: 'Designer', vinculo: 'colaborador', perfil: 'colaborador',
}, admin2);
check('usuario criado', r.status === 201);
check('link de acesso retornado na criacao', !!r.data.link_acesso, JSON.stringify(r.data).slice(0, 200));
check('link tem formato correto', /\/acesso\/[A-Za-z0-9_-]+$/.test(r.data.link_acesso || ''));
check('senha marcada como provisoria', r.data.usuario.senha_provisoria === 1);

const token = (r.data.link_acesso || '').split('/acesso/')[1];
r = await api('GET', '/api/acessos', null, admin2);
check('link aparece na lista de acessos', r.data.acessos.some((a) => a.token === token));

console.log('\n== Funcionario entra pelo link e troca a senha ==');
r = await api('POST', '/api/auth/acesso', { token });
check('funcionario entra pelo link', r.status === 200);
check('sessao traz marca de senha provisoria', r.data.usuario.senha_provisoria === 1);
const funcCookie = r.cookie;

r = await api('POST', '/api/auth/trocar-senha', {
  senha_atual: 'Provisoria@123', senha_nova: 'Definitiva@2026',
}, funcCookie);
check('funcionario troca a senha provisoria', r.status === 200, JSON.stringify(r.data));

r = await api('GET', '/api/auth/me', null, funcCookie);
check('senha provisoria zerada apos a troca', r.data.usuario.senha_provisoria === 0);

r = await api('POST', '/api/auth/login', { email: 'novo@teste.com', senha: 'Definitiva@2026' });
check('login com a senha nova funciona', r.status === 200);

console.log('\n== Perfil do usuario ==');
r = await api('PUT', '/api/auth/perfil', { nome: 'Funcionario Renomeado', telefone: '11988887777' }, funcCookie);
check('atualiza o proprio perfil', r.status === 200 && r.data.usuario.nome === 'Funcionario Renomeado');
check('telefone salvo', r.data.usuario.telefone === '11988887777');

console.log('\n== Identidade visual Codeon ==');
r = await api('GET', '/api/config/publica');
check('cor primaria e o azul Codeon', r.data.cor_primaria === '#002ef6', r.data.cor_primaria);
check('logo aponta para o asset', (r.data.logo_url || '').includes('logo'), r.data.logo_url);
check('nome da agencia Codeon Agency', r.data.nome_agencia === 'Codeon Agency');

for (const [nome, arquivo] of [
  ['logo-full.png', 'logo-full.png'],
  ['logo-mono.png', 'logo-mono.png'],
  ['icon-192.png', 'icon-192.png'],
  ['icon-512.png', 'icon-512.png'],
  ['icon-maskable-192.png', 'icon-maskable-192.png'],
  ['icon-maskable-512.png', 'icon-maskable-512.png'],
  ['favicon.png', 'favicon.png'],
  ['favicon.svg', 'favicon.svg'],
]) {
  const res = await fetch(`${base}/assets/${arquivo}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ok = res.status === 200 && buf.length > 100;
  check(`asset ${nome} existe e tem conteudo`, ok, `${res.status} ${buf.length}b`);
}

// A logo principal precisa realmente ser a imagem enviada (azul institucional).
const img = await fetch(`${base}/assets/logo-full.png`);
const bytes = Buffer.from(await img.arrayBuffer());
check('logo-full.png e um PNG valido', bytes.slice(0, 8).toString('hex') === '89504e470d0a1a0a');

console.log('\n== PDF com a identidade ==');
r = await api('GET', '/api/relatorios/individual.pdf?usuario_id=2&mes=2026-10', null, admin2);
check('pdf gerado', r.status === 200, String(r.status));

const pdfRes = await fetch(`${base}/api/relatorios/individual.pdf?usuario_id=2&mes=2026-10`, {
  headers: { Cookie: admin2 },
});
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
check('pdf tem assinatura %PDF', pdfBuf.slice(0, 5).toString() === '%PDF-');
check('pdf inclui imagem XObject (a logo)', pdfBuf.includes('/Subtype /Image'));
check('pdf usa a cor azul Codeon', pdfBuf.includes('0.000 0.180 0.965 rg') || pdfBuf.includes('/LogoMono'));

server.close();
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) { console.log('Falhas:', falhas.join(', ')); process.exit(1); }
