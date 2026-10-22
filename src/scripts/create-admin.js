// Cria ou atualiza o administrador inicial do sistema.
// Uso: node src/scripts/create-admin.js "Nome" "email@codeon.agency" "Senha@123"
import { get, run, auditar } from '../db.js';
import { hashSenha } from '../auth.js';
import { bootstrap } from '../bootstrap.js';

const [nome, email, senha] = process.argv.slice(2);

if (!nome || !email || !senha) {
  console.error('Uso: node src/scripts/create-admin.js "Nome Completo" "email@codeon.agency" "Senha@123"');
  process.exit(1);
}

await bootstrap();

const existente = await get('SELECT * FROM usuarios WHERE lower(email) = ?', email.toLowerCase());
const { hash, salt } = hashSenha(senha);
const agora = new Date().toISOString();

if (existente) {
  await run(
    'UPDATE usuarios SET nome = ?, senha_hash = ?, senha_salt = ?, perfil = ?, status = ?, atualizado_em = ? WHERE id = ?',
    nome, hash, salt, 'admin', 'ativo', agora, existente.id,
  );
  await run('DELETE FROM sessoes WHERE usuario_id = ?', existente.id);
  await auditar(existente.id, 'usuario.atualizado', 'usuario', existente.id, { via: 'script', perfil: 'admin' });
  console.log(`Administrador "${nome}" (${email}) atualizado com sucesso.`);
} else {
  const { lastInsertRowid } = await run(
    'INSERT INTO usuarios (nome, email, senha_hash, senha_salt, cargo, vinculo, perfil, escala_json, status, criado_em, atualizado_em) '
    + 'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    nome, email.toLowerCase(), hash, salt, 'Administrador', 'colaborador', 'admin',
    JSON.stringify({
      jornadaMin: 360, dias: [1, 2, 3, 4, 5],
      turnos: [{ nome: 'Padrao', inicio: '08:00', fim: '14:00', descansoMin: 0, periods: 1 }],
      toleranciaAtrasoMin: 10, toleranciaSaidaMin: 10,
    }),
    'ativo', agora, agora,
  );
  await auditar(lastInsertRowid, 'usuario.criado', 'usuario', lastInsertRowid, { via: 'script', perfil: 'admin' });
  console.log(`Administrador "${nome}" (${email}) criado com sucesso.`);
}
process.exit(0);
