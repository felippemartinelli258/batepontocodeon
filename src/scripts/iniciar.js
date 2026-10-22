// Inicializa o banco de dados do Codeon Ponto ja pronto para uso.
//
// Cria: configuracoes, turnos padrao, administrador e (opcionalmente) uma
// equipe inicial a partir de um arquivo JSON.
//
// Uso:
//   node src/scripts/iniciar.js
//   node src/scripts/iniciar.js equipe.json
//
// Formato do arquivo de equipe (opcional):
// {
//   "admin": { "nome": "...", "email": "...", "senha": "..." },
//   "usuarios": [
//     { "nome": "...", "email": "...", "senha": "...", "cargo": "...",
//       "vinculo": "colaborador", "perfil": "colaborador", "gestor": "email@gestor.com" }
//   ]
// }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { get, run, all, getConfig, setConfig, auditar } from '../db.js';
import { hashSenha } from '../auth.js';
import { bootstrap } from '../bootstrap.js';
import { TURNOS_PADRAO } from '../jornada.js';

const arquivo = process.argv[2];
let dados = {};
if (arquivo) {
  const p = path.resolve(arquivo);
  if (!fs.existsSync(p)) {
    console.error(`Arquivo nao encontrado: ${p}`);
    process.exit(1);
  }
  dados = JSON.parse(fs.readFileSync(p, 'utf8'));
}

// As credenciais do arquivo JSON precisam estar no ambiente ANTES do
// bootstrap, senao ele cria um administrador com os valores padrao.
if (dados.admin?.email) process.env.ADMIN_EMAIL = dados.admin.email;
if (dados.admin?.senha) process.env.ADMIN_SENHA = dados.admin.senha;
if (dados.admin?.nome) process.env.ADMIN_NOME = dados.admin.nome;

await bootstrap();

const escalaPadrao = {
  jornadaMin: 360,
  dias: [1, 2, 3, 4, 5],
  turnos: [{ nome: 'Padrao', inicio: '08:00', fim: '14:00', descansoMin: 0, periods: 1 }],
  toleranciaAtrasoMin: 10,
  toleranciaSaidaMin: 10,
};

// --------------------------------------------------------------- admin

const adminExistente = await get("SELECT * FROM usuarios WHERE perfil = 'admin' ORDER BY id LIMIT 1");
if (adminExistente) {
  console.log(`Administrador ja existe: ${adminExistente.nome} <${adminExistente.email}>`);
  if (dados.admin?.senha) {
    const { hash, salt } = hashSenha(dados.admin.senha);
    await run(
      'UPDATE usuarios SET senha_hash = ?, senha_salt = ?, senha_provisoria = 0, senha_trocada_em = ?, atualizado_em = ? WHERE id = ?',
      hash, salt, new Date().toISOString(), new Date().toISOString(), adminExistente.id,
    );
    console.log('  Senha do administrador redefinida.');
  }
} else {
  const a = dados.admin || {};
  const email = (a.email || process.env.ADMIN_EMAIL || 'admin@codeon.agency').toLowerCase();
  const senha = a.senha || process.env.ADMIN_SENHA || 'Codeon@2026';
  const nome = a.nome || process.env.ADMIN_NOME || 'Administrador Codeon';
  const { hash, salt } = hashSenha(senha);
  const agora = new Date().toISOString();
  await run(
    'INSERT INTO usuarios (nome, email, senha_hash, senha_salt, cargo, vinculo, perfil, escala_json, status, senha_provisoria, criado_em, atualizado_em) '
    + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    nome, email, hash, salt, 'Administrador', 'colaborador', 'admin',
    JSON.stringify(escalaPadrao), 'ativo', 0, agora, agora,
  );
  console.log(`Administrador criado: ${nome} <${email}>`);
}

// -------------------------------------------------------------- usuarios

const equipe = Array.isArray(dados.usuarios) ? dados.usuarios : [];
const idsPorEmail = {};

for (const u of equipe) {
  const email = String(u.email || '').trim().toLowerCase();
  if (!email) continue;
  const existente = await get('SELECT * FROM usuarios WHERE lower(email) = ?', email);
  if (existente) {
    idsPorEmail[email] = existente.id;
    console.log(`  Usuario ja existe: ${u.nome} <${email}>`);
    continue;
  }
  const senha = u.senha || crypto.randomBytes(6).toString('base64url');
  const { hash, salt } = hashSenha(senha);
  const agora = new Date().toISOString();
  const { lastInsertRowid } = await run(
    'INSERT INTO usuarios (nome, email, senha_hash, senha_salt, cargo, vinculo, perfil, escala_json, status, senha_provisoria, criado_em, atualizado_em) '
    + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    u.nome || email, email, hash, salt, u.cargo || null,
    u.vinculo || 'colaborador', u.perfil || 'colaborador',
    JSON.stringify(u.escala || escalaPadrao), 'ativo', 1, agora, agora,
  );
  idsPorEmail[email] = lastInsertRowid;

  // Link de acesso individual, pronto para envio.
  const token = crypto.randomBytes(24).toString('base64url');
  await run(
    'INSERT INTO acessos (token, usuario_id, rotulo, criado_por, criado_em, expira_em, usos) '
    + 'VALUES (?,?,?,?,?,?,0)',
    token, lastInsertRowid, 'Link inicial', adminExistente?.id ?? lastInsertRowid, agora, null,
  );

  console.log(`  Usuario criado: ${u.nome} <${email}>`);
  console.log(`     senha provisoria: ${senha}`);
  console.log(`     link de acesso:   /acesso/${token}`);
}

// ---------------------------------------------- vinculo gestor/colaborador

for (const u of equipe) {
  if (!u.gestor) continue;
  const gestorId = idsPorEmail[String(u.gestor).toLowerCase()];
  const colaboradorId = idsPorEmail[String(u.email || '').toLowerCase()];
  if (!gestorId || !colaboradorId) continue;
  await run(
    'INSERT OR IGNORE INTO usuarios_equipe (gestor_id, colaborador_id) VALUES (?,?)',
    gestorId, colaboradorId,
  );
  console.log(`  Equipe: colaborador ${u.email} vinculado ao gestor ${u.gestor}`);
}

// --------------------------------------------------------------- resumo

console.log('\n--- Estado do banco ---');
console.log(`Usuarios: ${(await get('SELECT COUNT(*) AS n FROM usuarios')).n}`);
console.log(`Turnos:   ${(await get('SELECT COUNT(*) AS n FROM turnos')).n}`);
console.log(`Links:    ${(await get('SELECT COUNT(*) AS n FROM acessos')).n}`);
console.log(`Config:   ${(await get('SELECT COUNT(*) AS n FROM config')).n}`);
console.log('\nBanco pronto. Rode o servidor com: npm start');
process.exit(0);
