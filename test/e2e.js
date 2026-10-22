// Teste ponta a ponta: sobe o servidor em porta efemera e exercita a API.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DB = path.join(os.tmpdir(), `codeon-test-${Date.now()}.db`);
process.env.DATABASE_PATH = DB;
process.env.ADMIN_EMAIL = 'admin@teste.com';
process.env.ADMIN_SENHA = 'TesteLocal#2026!Ponto';
process.env.LOG_REQUESTS = '0';

const { createApp } = await import('../src/server.js');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); }
  else { fail += 1; failures.push(name); console.log(`FAIL  ${name} ${extra}`); }
}

const app = await createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function api(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie && !opts.noAuth) headers.Cookie = cookie;
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  if (opts.raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

console.log('\n== Autenticacao ==');
let r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'Errada@1' });
check('login invalido retorna 401', r.status === 401, JSON.stringify(r.data));

r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'TesteLocal#2026!Ponto' });
check('login valido retorna 200', r.status === 200);
check('retorna perfil admin', r.data?.usuario?.perfil === 'admin');

r = await api('GET', '/api/config/publica');
check('config publica acessivel sem login', r.status === 200);

console.log('\n== Usuarios ==');
r = await api('POST', '/api/usuarios', {
  nome: 'Joao Teste', email: 'joao@teste.com', senha: 'Joao@1234',
  cargo: 'Designer', vinculo: 'colaborador', perfil: 'colaborador',
  escala: {
    jornadaMin: 360, dias: [1, 2, 3, 4, 5],
    turnos: [{ nome: 'Padrao', inicio: '08:00', fim: '14:00', descansoMin: 60, periods: 2 }],
  },
});
check('cria usuario', r.status === 201, JSON.stringify(r.data));
const joaoId = r.data?.usuario?.id;

r = await api('POST', '/api/usuarios', { nome: 'Duplicado', email: 'joao@teste.com', senha: 'Joao@1234' });
check('bloqueia e-mail duplicado', r.status === 400);

r = await api('POST', '/api/usuarios', { nome: 'Fraco', email: 'fraco@teste.com', senha: 'abc' });
check('bloqueia senha fraca', r.status === 400);

r = await api('GET', '/api/usuarios');
check('lista usuarios', r.status === 200 && r.data.usuarios.length === 2);

console.log('\n== Registro de ponto ==');
r = await api('POST', '/api/pontos/registrar', { tipo: 'entrada' });
check('registra entrada', r.status === 201, JSON.stringify(r.data));
check('dia em andamento', r.data?.dia?.status === 'em_andamento');

r = await api('POST', '/api/pontos/registrar', { tipo: 'entrada' });
check('bloqueia segunda entrada com expediente aberto', r.status === 400);

r = await api('POST', '/api/pontos/registrar', { tipo: 'intervalo_inicio' });
check('bloqueia intervalo com expediente aberto', r.status === 400);

r = await api('POST', '/api/pontos/registrar', { tipo: 'saida' });
check('registra saida', r.status === 201);
check('dia completo', r.data?.dia?.completo === true);
check('saldo calculado', typeof r.data?.dia?.saldo_min === 'number');

r = await api('POST', '/api/pontos/registrar', { tipo: 'entrada' });
check('bloqueia registro apos expediente fechado', r.status === 400);

console.log('\n== Permissoes ==');
const cookieAdmin = cookie;
r = await api('POST', '/api/auth/login', { email: 'joao@teste.com', senha: 'Joao@1234' });
check('login de colaborador', r.status === 200);
check('perfil colaborador', r.data?.usuario?.perfil === 'colaborador');

r = await api('GET', '/api/usuarios');
check('colaborador nao ve lista de usuarios', r.status === 200 && r.data.usuarios.length === 0);

r = await api('GET', `/api/pontos/historico?usuario_id=${joaoId}`);
check('colaborador acessa o proprio historico', r.status === 200);

r = await api('GET', '/api/pontos/historico?usuario_id=1');
check('colaborador nao acessa registro de terceiro', r.status === 403);

r = await api('GET', '/api/relatorios/dashboard');
check('colaborador nao acessa dashboard admin', r.status === 403);

r = await api('GET', '/api/auditoria');
check('colaborador nao acessa auditoria', r.status === 403);

r = await api('POST', '/api/usuarios', { nome: 'X', email: 'x@t.com', senha: 'X@12345' });
check('colaborador nao cria usuario', r.status === 403);

console.log('\n== Solicitacoes ==');
r = await api('POST', '/api/solicitacoes', {
  data: '2026-10-01', justificativa: 'Esquec de bater o ponto na saida do dia 01.',
});
check('cria solicitacao', r.status === 201, JSON.stringify(r.data));
const solId = r.data?.solicitacao?.id;

r = await api('POST', '/api/solicitacoes', { data: '2026-10-01', justificativa: 'curta' });
check('exige justificativa com 10+ caracteres', r.status === 400);

r = await api('POST', `/api/solicitacoes/${solId}/decisao`, { status: 'aprovado' });
check('colaborador nao aprova solicitacao', r.status === 403);

cookie = cookieAdmin;
r = await api('GET', '/api/solicitacoes');
check('admin lista solicitacoes', r.status === 200 && r.data.solicitacoes.length === 1);

r = await api('POST', `/api/solicitacoes/${solId}/decisao`, { status: 'aprovado', comentario: 'OK' });
check('admin aprova solicitacao', r.status === 200 && r.data.solicitacao.status === 'aprovado');

console.log('\n== Ausencias ==');
r = await api('POST', '/api/ausencias', {
  usuario_id: joaoId, data: '2026-10-02', tipo: 'falta', justificativa: 'Atestado medico',
});
check('admin registra ausencia', r.status === 201);
r = await api('GET', '/api/ausencias?mes=2026-10');
check('lista ausencias', r.status === 200 && r.data.ausencias.length === 1);

console.log('\n== Avisos ==');
r = await api('POST', '/api/avisos', { titulo: 'Reuniao', corpo: 'Reuniao de alinhamento as 10h.' });
check('cria aviso', r.status === 201);
r = await api('GET', '/api/avisos');
check('lista avisos', r.status === 200 && r.data.avisos.length === 1);

console.log('\n== Dashboard e relatorios ==');
r = await api('GET', '/api/relatorios/dashboard?mes=2026-10');
check('dashboard responde', r.status === 200);
check('dashboard conta colaboradores', r.data?.totais?.colaboradores === 2);
check('dashboard soma horas previstas', r.data?.totais?.horas_previstas_min > 0);

r = await api('GET', '/api/relatorios/inconsistencias?mes=2026-10');
check('lista inconsistencias', r.status === 200 && Array.isArray(r.data.inconsistencias));

r = await api('GET', `/api/relatorios/individual.pdf?usuario_id=${joaoId}&mes=2026-10`, null, { raw: true });
check('pdf individual gerado', r.status === 200 && r.buffer.length > 1000);
check('pdf tem cabecalho %PDF', r.buffer.slice(0, 5).toString() === '%PDF-');
fs.writeFileSync(path.join(os.tmpdir(), 'rel-individual.pdf'), r.buffer);

r = await api('GET', '/api/relatorios/consolidado.pdf?mes=2026-10', null, { raw: true });
check('pdf consolidado gerado', r.status === 200 && r.buffer.length > 1000);
fs.writeFileSync(path.join(os.tmpdir(), 'rel-consolidado.pdf'), r.buffer);

r = await api('GET', '/api/backup', null, { raw: true });
check('backup gerado', r.status === 200 && r.buffer.length > 100);
fs.writeFileSync(path.join(os.tmpdir(), 'backup.json'), r.buffer);

console.log('\n== Auditoria ==');
r = await api('GET', '/api/auditoria');
check('auditoria registra acoes', r.status === 200 && r.data.registros.length > 5);
check('auditoria tem login registrado', r.data.registros.some((x) => x.acao === 'login.sucesso'));

console.log('\n== Estaticos ==');
const res = await fetch(`${base}/`);
const html = await res.text();
check('index.html servido', res.status === 200 && html.includes('<html'));
const res404 = await fetch(`${base}/api/nao-existe`);
check('endpoint inexistente retorna 404', res404.status === 404);

server.close();
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) { console.log('Falhas:', failures.join(', ')); process.exit(1); }
