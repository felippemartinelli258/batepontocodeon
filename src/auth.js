// Autenticacao, senhas, sessoes e controle de permissao.
import crypto from 'node:crypto';
import { all, get, run, auditar } from './db.js';

const SESSION_DAYS = 7;

export function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return { hash, salt };
}

export function verificarSenha(senha, hash, salt) {
  try {
    const calc = crypto.scryptSync(String(senha), salt, 64);
    const alvo = Buffer.from(hash, 'hex');
    if (calc.length !== alvo.length) return false;
    return crypto.timingSafeEqual(calc, alvo);
  } catch {
    return false;
  }
}

export async function criarSessao(usuarioId, ip, userAgent) {
  const token = crypto.randomBytes(32).toString('hex');
  const agora = new Date();
  const expira = new Date(agora.getTime() + SESSION_DAYS * 86400000);
  await run(
    'INSERT INTO sessoes (token, usuario_id, criado_em, expira_em, ip, user_agent) VALUES (?,?,?,?,?,?)',
    token, usuarioId, agora.toISOString(), expira.toISOString(), ip || null, userAgent || null,
  );
  return { token, expira_em: expira.toISOString() };
}

export async function destruirSessao(token) {
  if (token) await run('DELETE FROM sessoes WHERE token = ?', token);
}

export async function usuarioDaSessao(token) {
  if (!token) return null;
  const sessao = await get('SELECT * FROM sessoes WHERE token = ?', token);
  if (!sessao) return null;
  if (new Date(sessao.expira_em) < new Date()) {
    await run('DELETE FROM sessoes WHERE token = ?', token);
    return null;
  }
  const usuario = await get('SELECT * FROM usuarios WHERE id = ?', sessao.usuario_id);
  if (!usuario || usuario.status !== 'ativo') return null;
  return usuario;
}

export async function limparSessoesExpiradas() {
  await run('DELETE FROM sessoes WHERE expira_em < ?', new Date().toISOString());
}

export function exigirSenhaForte(senha) {
  const s = String(senha || '');
  if (s.length < 8) return 'A senha deve ter no minimo 8 caracteres.';
  if (!/[A-Za-z]/.test(s)) return 'A senha deve conter ao menos uma letra.';
  if (!/\d/.test(s)) return 'A senha deve conter ao menos um numero.';
  return null;
}

// --------------------------------------------------------------- permissoes

export const PERFIS = ['admin', 'gestor', 'colaborador'];

export function ehAdmin(u) { return u?.perfil === 'admin'; }
export function ehGestor(u) { return u?.perfil === 'gestor'; }
export function ehColaborador(u) { return u?.perfil === 'colaborador'; }

/** O usuario pode ver os dados deste alvo? */
export async function podeVerUsuario(ator, alvo) {
  if (!ator || !alvo) return false;
  if (ator.id === alvo.id) return true;
  if (ehAdmin(ator)) return true;
  if (ehGestor(ator)) {
    const r = await get('SELECT 1 AS x FROM usuarios_equipe WHERE gestor_id = ? AND colaborador_id = ?', ator.id, alvo.id);
    return !!r;
  }
  return false;
}

/** O usuario pode aprovar/alterar registros deste alvo? */
export function podeGerenciarUsuario(ator, alvo) {
  if (!ator || !alvo) return false;
  if (ehAdmin(ator)) return true;
  if (ehGestor(ator)) return ator.id !== alvo.id;
  return false;
}

export async function equipeDoGestor(gestorId) {
  return all(
    'SELECT u.* FROM usuarios u JOIN usuarios_equipe e ON e.colaborador_id = u.id WHERE e.gestor_id = ? ORDER BY u.nome',
    gestorId,
  );
}

export async function listarUsuariosVisiveis(ator) {
  if (ehAdmin(ator)) return all('SELECT * FROM usuarios ORDER BY nome');
  if (ehGestor(ator)) return equipeDoGestor(ator.id);
  return [];
}

export async function registrarLogin(usuario, ok) {
  await auditar(usuario?.id ?? null, ok ? 'login.sucesso' : 'login.falha', 'usuario', usuario?.id ?? null, {
    email: usuario?.email,
  });
}
