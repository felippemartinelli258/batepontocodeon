// Testa o driver Turso/libSQL (usado em hospedagem serverless) contra um
// mock da API HTTP do Turso, com o mesmo formato de resposta do servico real.
import { iniciarMockTurso } from './mock-turso.js';

const mock = await iniciarMockTurso();
process.env.TURSO_URL = mock.url;
process.env.TURSO_TOKEN = mock.token;
process.env.ADMIN_EMAIL = 'admin@teste.com';
process.env.ADMIN_SENHA = 'TesteLocal#2026!Ponto';
process.env.LOG_REQUESTS = '0';

let pass = 0; let fail = 0;
const falhas = [];
function check(nome, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ok  ${nome}`); }
  else { fail += 1; falhas.push(nome); console.log(`FAIL  ${nome} ${extra}`); }
}

const { driver, all, get, run, getConfig } = await import('../src/db.js');
check('driver selecionado e Turso', driver.nome === 'turso', driver.nome);

console.log('\n== Bootstrap sobre Turso ==');
const { bootstrap } = await import('../src/bootstrap.js');
await bootstrap();
const admins = await all('SELECT * FROM usuarios');
check('bootstrap cria o administrador', admins.length === 1 && admins[0].perfil === 'admin', JSON.stringify(admins).slice(0, 150));
await bootstrap(); // deve ser idempotente
const admins2 = await all('SELECT * FROM usuarios');
check('bootstrap e idempotente', admins2.length === 1, `(${admins2.length} usuarios)`);

console.log('\n== Driver Turso ==');
const tabela = await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
check('schema foi criado', tabela.length >= 9, `(${tabela.length} tabelas)`);
check('tabela usuarios existe', tabela.some((t) => t.name === 'usuarios'));
check('tabela pontos existe', tabela.some((t) => t.name === 'pontos'));

const { lastInsertRowid } = await run(
  'INSERT INTO usuarios (nome, email, senha_hash, senha_salt, cargo, vinculo, perfil, escala_json, status, criado_em, atualizado_em) '
  + 'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  'Teste Turso', 'turso@teste.com', 'h', 's', 'Cargo', 'colaborador', 'colaborador',
  JSON.stringify({ jornadaMin: 360, dias: [1, 2, 3, 4, 5], turnos: [] }), 'ativo', '2026-01-01', '2026-01-01',
);
check('insert retorna lastInsertRowid', Number.isInteger(lastInsertRowid) && lastInsertRowid > 0, String(lastInsertRowid));

const u = await get('SELECT * FROM usuarios WHERE email = ?', 'turso@teste.com');
check('select retorna a linha', !!u && u.nome === 'Teste Turso');
check('colunas tipadas corretamente', u && u.perfil === 'colaborador' && u.status === 'ativo');
check('texto com acento preservado', u && u.cargo === 'Cargo');

await run('UPDATE usuarios SET cargo = ? WHERE id = ?', 'Cargo Atualizado', lastInsertRowid);
const u2 = await get('SELECT cargo FROM usuarios WHERE id = ?', lastInsertRowid);
check('update aplicado', u2.cargo === 'Cargo Atualizado');

const n = await get('SELECT COUNT(*) AS n FROM usuarios');
check('aggregate retorna numero', Number(n.n) === 2, JSON.stringify(n));

console.log('\n== Fluxo completo da aplicacao sobre Turso ==');
const { createApp } = await import('../src/server.js');
const app = await createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

let r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'TesteLocal#2026!Ponto' });
check('login funciona sobre Turso', r.status === 200 && r.data.usuario?.perfil === 'admin', JSON.stringify(r.data).slice(0, 200));

r = await api('POST', '/api/usuarios', {
  nome: 'Joao Silva', email: 'joao@turso.com', senha: 'Joao@1234',
  cargo: 'Analista', vinculo: 'colaborador', perfil: 'colaborador',
});
check('criacao de usuario sobre Turso', r.status === 201, JSON.stringify(r.data).slice(0, 200));
const joaoId = r.data?.usuario?.id;

r = await api('POST', '/api/pontos/registrar', { tipo: 'entrada' });
check('registro de ponto sobre Turso', r.status === 201, JSON.stringify(r.data).slice(0, 200));

r = await api('POST', '/api/pontos/lancar', {
  usuario_id: joaoId, data: '2026-10-01', hora: '08:00', tipo: 'entrada', justificativa: 'Lancamento retroativo',
});
check('lancamento retroativo sobre Turso', r.status === 201, JSON.stringify(r.data).slice(0, 200));

r = await api('GET', '/api/pontos/historico?usuario_id=' + joaoId);
check('historico lido do Turso', r.status === 200 && r.data.dias.length > 0);

r = await api('GET', '/api/relatorios/dashboard');
check('dashboard calculado sobre Turso', r.status === 200 && r.data.totais.colaboradores >= 1,
  JSON.stringify(r.data?.totais || {}).slice(0, 200));

r = await api('GET', '/api/relatorios/individual.pdf?usuario_id=' + joaoId + '&mes=2026-10', null);
check('PDF gerado sobre Turso', r.status === 200);

r = await api('GET', '/api/auditoria');
check('auditoria gravada no Turso', r.status === 200 && r.data.registros.length > 0);

const cfg = await getConfig('nome_agencia');
check('config persistida no Turso', cfg === 'Codeon Agency', String(cfg));

server.close();
await mock.fechar();

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) { console.log('Falhas:', falhas.join(', ')); process.exit(1); }
