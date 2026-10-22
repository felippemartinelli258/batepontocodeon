// Rotas da API REST.
import crypto from 'node:crypto';
import {
  all, get, run, tx, auditar, getConfig, setConfig,
} from './db.js';
import {
  hashSenha, verificarSenha, criarSessao, destruirSessao, usuarioDaSessao,
  exigirSenhaForte, ehAdmin, ehGestor, podeVerUsuario, podeGerenciarUsuario,
  listarUsuariosVisiveis, equipeDoGestor, registrarLogin, PERFIS,
} from './auth.js';
import {
  escalaDoUsuario, diaDoUsuario, resumoMensal, STATUS_LABEL, TURNOS_PADRAO,
} from './jornada.js';
import { relatorioIndividual, relatorioConsolidado } from './relatorios.js';
import {
  nowLocal, toHHMM, humanMinutes, daysOfMonth, monthBounds, monthLabel,
  monthKey, epochMs, DEFAULT_TZ,
} from './time.js';
import {
  Router, json, sendBuffer, badRequest, forbidden, notFound, unauthorized, serializeCookie,
} from './http.js';

export const COOKIE = 'codeon_session';

const TIPO_PONTO = {
  entrada: 'entrada',
  saida: 'saida',
  intervalo_inicio: 'intervalo_inicio',
  intervalo_fim: 'intervalo_fim',
};

export function publicUser(u) {
  if (!u) return null;
  const { senha_hash, senha_salt, ...rest } = u;
  return { ...rest, escala: escalaDoUsuario(u) };
}

async function tz() { return getConfig('timezone', DEFAULT_TZ); }

function requireAuth(ctx) {
  if (!ctx.usuario) throw unauthorized();
  return ctx.usuario;
}

function requireAdmin(ctx) {
  const u = requireAuth(ctx);
  if (!ehAdmin(u)) throw forbidden('Acao restrita a administradores.');
  return u;
}

function requireGestorOuAdmin(ctx) {
  const u = requireAuth(ctx);
  if (!ehAdmin(u) && !ehGestor(u)) throw forbidden('Acao restrita a gestores.');
  return u;
}

async function alvoDoUsuario(ctx, usuarioId) {
  const ator = requireAuth(ctx);
  const id = usuarioId ? Number(usuarioId) : ator.id;
  const alvo = await get('SELECT * FROM usuarios WHERE id = ?', id);
  if (!alvo) throw notFound('Usuario nao encontrado.');
  if (Number(id) !== Number(ator.id) && !await podeVerUsuario(ator, alvo)) {
    throw forbidden('Sem permissao para acessar este usuario.');
  }
  return { ator, alvo };
}

function validarData(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) throw badRequest('Data invalida. Use YYYY-MM-DD.');
  return data;
}

function validarMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) throw badRequest('Mes invalido. Use YYYY-MM.');
  if (!monthBounds(mes)) throw badRequest('Mes invalido.');
  return mes;
}

// ------------------------------------------------------------------ rotas

export function buildRouter() {
  const r = new Router();

  // ------------------------------------------------------------ publicos
  r.get('/api/health', async (ctx) => {
    json(ctx.res, 200, { ok: true, versao: '1.0.0', tempo: new Date().toISOString() });
  }, { auth: false });

  r.get('/api/config/publica', async (ctx) => {
    json(ctx.res, 200, {
      nome_agencia: await getConfig('nome_agencia', 'Codeon Agency'),
      cor_primaria: await getConfig('cor_primaria', '#002ef6'),
      cor_destaque: await getConfig('cor_destaque', '#002ef6'),
      logo_url: await getConfig('logo_url', '/assets/logo-full.png'),
      timezone: await tz(),
      jornada_padrao_horas: Number(await getConfig('jornada_padrao_horas', '6')),
    });
  }, { auth: false });

  r.post('/api/auth/login', async (ctx) => {
    const body = ctx.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const senha = String(body.senha || '');
    if (!email || !senha) throw badRequest('Informe e-mail e senha.');
    const usuario = await get('SELECT * FROM usuarios WHERE lower(email) = ?', email);
    if (!usuario || !verificarSenha(senha, usuario.senha_hash, usuario.senha_salt)) {
      await registrarLogin(usuario, false);
      throw unauthorized('E-mail ou senha invalidos.');
    }
    if (usuario.status !== 'ativo') {
      await registrarLogin(usuario, false);
      throw forbidden('Usuario inativo. Procure o administrador.');
    }
    await registrarLogin(usuario, true);
    const sessao = await criarSessao(usuario.id, ctx.ip, ctx.req.headers['user-agent']);
    ctx.res.setHeader('Set-Cookie', serializeCookie(COOKIE, sessao.token, {
      maxAge: 7 * 86400, httpOnly: true, secure: ctx.secure, sameSite: 'Lax',
    }));
    json(ctx.res, 200, { usuario: publicUser(usuario), expira_em: sessao.expira_em });
  }, { auth: false });

  r.post('/api/auth/logout', async (ctx) => {
    if (ctx.token) await destruirSessao(ctx.token);
    ctx.res.setHeader('Set-Cookie', serializeCookie(COOKIE, '', { maxAge: 0, httpOnly: true }));
    json(ctx.res, 200, { ok: true });
  });

  r.get('/api/auth/me', async (ctx) => {
    const u = requireAuth(ctx);
    json(ctx.res, 200, { usuario: publicUser(u) });
  });

  // ------------------------------------------------- acessos sem senha
  // Um link individual por pessoa. Quem tem o link entra direto, sem digitar
  // e-mail e senha - pensados para o celular e para quem troca de aparelho.

  r.post('/api/acessos', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const b = ctx.body || {};
    const usuarioId = b.usuario_id ? Number(b.usuario_id) : ator.id;
    const alvo = await get('SELECT * FROM usuarios WHERE id = ?', usuarioId);
    if (!alvo) throw notFound('Usuario nao encontrado.');
    if (!podeGerenciarUsuario(ator, alvo) && ator.id !== alvo.id) {
      throw forbidden('Sem permissao para gerar acesso deste usuario.');
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const expiraEm = b.expira_dias ? new Date(Date.now() + Number(b.expira_dias) * 86400000).toISOString() : null;
    await run(
      'INSERT INTO acessos (token, usuario_id, rotulo, criado_por, criado_em, expira_em, usos) '
      + 'VALUES (?,?,?,?,?,?,0)',
      token, usuarioId, b.rotulo || null, ator.id, new Date().toISOString(), expiraEm,
    );
    await auditar(ator.id, 'acesso.criado', 'acesso', usuarioId, { rotulo: b.rotulo || null, expiraEm });
    const acesso = await get('SELECT * FROM acessos WHERE token = ?', token);
    json(ctx.res, 201, { acesso, link: montarLinkAcesso(ctx, token) });
  });

  r.get('/api/acessos', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const sql = `SELECT a.*, u.nome AS usuario_nome, u.email AS usuario_email, u.cargo, u.status AS usuario_status
      FROM acessos a JOIN usuarios u ON u.id = a.usuario_id
      ${ehAdmin(ator) ? '' : 'WHERE a.usuario_id IN (SELECT colaborador_id FROM usuarios_equipe WHERE gestor_id = ?) OR a.criado_por = ?'}
      ORDER BY a.criado_em DESC`;
    const params = ehAdmin(ator) ? [] : [ator.id, ator.id];
    const acessos = await all(sql, ...params);
    json(ctx.res, 200, { acessos });
  });

  r.delete('/api/acessos/:token', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const token = ctx.params.token;
    const acesso = await get('SELECT * FROM acessos WHERE token = ?', token);
    if (!acesso) throw notFound('Acesso nao encontrado.');
    if (!ehAdmin(ator) && acesso.criado_por !== ator.id && acesso.usuario_id !== ator.id) {
      throw forbidden('Sem permissao para revogar este acesso.');
    }
    await run('UPDATE acessos SET revogado_em = ? WHERE token = ?', new Date().toISOString(), token);
    await auditar(ator.id, 'acesso.revogado', 'acesso', acesso.usuario_id, { rotulo: acesso.rotulo });
    json(ctx.res, 200, { ok: true });
  });

  // Entrada pelo link individual
  r.post('/api/auth/acesso', async (ctx) => {
    const token = String(ctx.body?.token || ctx.query.token || '').trim();
    if (!token) throw badRequest('Token de acesso nao informado.');

    const acesso = await get('SELECT * FROM acessos WHERE token = ?', token);
    if (!acesso) throw unauthorized('Link de acesso invalido.');
    if (acesso.revogado_em) throw forbidden('Este link de acesso foi revogado.');
    if (acesso.expira_em && new Date(acesso.expira_em) < new Date()) {
      throw unauthorized('Este link de acesso expirou. Peca um novo link ao gestor.');
    }
    const usuario = await get('SELECT * FROM usuarios WHERE id = ?', acesso.usuario_id);
    if (!usuario) throw notFound('Usuario nao encontrado.');
    if (usuario.status !== 'ativo') throw forbidden('Usuario inativo. Procure o administrador.');

    await run('UPDATE acessos SET ultimo_uso_em = ?, usos = usos + 1 WHERE token = ?', new Date().toISOString(), token);
    await auditar(usuario.id, 'login.acesso', 'usuario', usuario.id, { rotulo: acesso.rotulo });

    const sessao = await criarSessao(usuario.id, ctx.ip, ctx.req.headers['user-agent']);
    ctx.res.setHeader('Set-Cookie', serializeCookie(COOKIE, sessao.token, {
      maxAge: 7 * 86400, httpOnly: true, secure: ctx.secure, sameSite: 'Lax',
    }));
    json(ctx.res, 200, { usuario: publicUser(usuario), expira_em: sessao.expira_em });
  }, { auth: false });

  // ------------------------------------------------------ troca de senha
  r.post('/api/auth/trocar-senha', async (ctx) => {
    const u = requireAuth(ctx);
    const b = ctx.body || {};
    const atual = String(b.senha_atual || '');
    const nova = String(b.senha_nova || '');

    if (!verificarSenha(atual, u.senha_hash, u.senha_salt)) {
      throw badRequest('A senha atual esta incorreta.');
    }
    const erro = exigirSenhaForte(nova);
    if (erro) throw badRequest(erro);
    if (atual === nova) throw badRequest('A nova senha deve ser diferente da atual.');

    const { hash, salt } = hashSenha(nova);
    await run(
      'UPDATE usuarios SET senha_hash = ?, senha_salt = ?, senha_trocada_em = ?, senha_provisoria = 0, atualizado_em = ? WHERE id = ?',
      hash, salt, new Date().toISOString(), new Date().toISOString(), u.id,
    );
    // Encerra as outras sessoes: a senha nova vale apenas neste dispositivo.
    await run('DELETE FROM sessoes WHERE usuario_id = ? AND token != ?', u.id, ctx.token || '');
    await auditar(u.id, 'senha.trocada', 'usuario', u.id);

    json(ctx.res, 200, {
      ok: true,
      mensagem: 'Senha alterada. As outras sessoes foram encerradas.',
    });
  });

  // Perfil do proprio usuario, com opcoes para editar
  r.put('/api/auth/perfil', async (ctx) => {
    const u = requireAuth(ctx);
    const b = ctx.body || {};
    const campos = [];
    const valores = [];
    if (b.nome !== undefined) {
      const nome = String(b.nome).trim();
      if (!nome) throw badRequest('Informe o nome completo.');
      campos.push('nome = ?'); valores.push(nome);
    }
    if (b.telefone !== undefined) { campos.push('telefone = ?'); valores.push(b.telefone || null); }
    if (!campos.length) throw badRequest('Nada para atualizar.');
    campos.push('atualizado_em = ?'); valores.push(new Date().toISOString());
    await run(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, ...valores, u.id);
    await auditar(u.id, 'perfil.atualizado', 'usuario', u.id, b);
    json(ctx.res, 200, { usuario: publicUser(await get('SELECT * FROM usuarios WHERE id = ?', u.id)) });
  });

  // -------------------------------------------------------------- ponto
  r.get('/api/pontos/hoje', async (ctx) => {
    const u = requireAuth(ctx);
    const alvo = ctx.query.usuario_id ? (await alvoDoUsuario(ctx, ctx.query.usuario_id)).alvo : u;
    const hoje = await tz();
    const data = ctx.query.data || (await nowLocal(hoje)).data;
    validarData(data);
    const dia = await diaDoUsuario(alvo, data);
    json(ctx.res, 200, { dia, agora: await nowLocal(hoje) });
  });

  r.post('/api/pontos/registrar', async (ctx) => {
    const u = requireAuth(ctx);
    const body = ctx.body || {};
    const tipo = TIPO_PONTO[body.tipo];
    if (!tipo) throw badRequest('Tipo de registro invalido.');

    const fuso = await tz();
    const relogio = await nowLocal(fuso);
    const data = body.data ? validarData(body.data) : relogio.data;
    const hora = body.hora && /^\d{2}:\d{2}$/.test(body.hora) ? body.hora : relogio.hora;

    if (data !== relogio.data) {
      throw badRequest('O registro manual so e permitido para o dia de hoje. Use uma solicitacao de correcao para datas anteriores.');
    }

    const dia = await diaDoUsuario(u, data);
    if (dia.completo) throw badRequest('Ja existe um expediente fechado neste dia. Solicite uma correcao ao gestor.');
    if (dia.em_aberto && tipo === 'entrada') throw badRequest('Ja existe um registro em aberto neste dia.');
    if (dia.em_aberto && tipo !== 'saida') throw badRequest('O expediente esta em aberto. Encerre o expediente antes de registrar intervalo.');

    const ts = epochMs(data, hora, fuso) ?? Date.now();
    const { lastInsertRowid } = await run(
      'INSERT INTO pontos (usuario_id, data, hora, dia_ref, ts, tipo, origem, justificativa, status, criado_em, criado_por, ip) '
      + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      u.id, data, hora, data, ts, tipo, body.origem === 'manual' ? 'manual' : 'automatico',
      body.justificativa || null, 'aprovado', new Date().toISOString(), u.id, ctx.ip || null,
    );
    await auditar(u.id, 'ponto.registrado', 'ponto', lastInsertRowid, { data, hora, tipo });
    const novoDia = await diaDoUsuario(u, data);
    json(ctx.res, 201, { ponto_id: lastInsertRowid, dia: novoDia });
  });

  r.post('/api/pontos/lancar', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const b = ctx.body || {};
    const data = validarData(b.data);
    const hora = String(b.hora || '').slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(hora)) throw badRequest('Informe o horario no formato HH:MM.');
    const tipo = TIPO_PONTO[b.tipo];
    if (!tipo) throw badRequest('Tipo de registro invalido.');
    const justificativa = String(b.justificativa || '').trim();
    if (justificativa.length < 5) throw badRequest('Justifique o lancamento retroativo.');

    const usuarioId = b.usuario_id ? Number(b.usuario_id) : ator.id;
    const alvo = await get('SELECT * FROM usuarios WHERE id = ?', usuarioId);
    if (!alvo) throw notFound('Usuario nao encontrado.');
    if (!podeGerenciarUsuario(ator, alvo) && ator.id !== alvo.id) throw forbidden('Sem permissao para lancar ponto deste usuario.');

    const fuso = await tz();
    const hoje = (await nowLocal(fuso)).data;
    if (data > hoje) throw badRequest('Nao e possivel lancar ponto em data futura.');

    const existente = await get(
      'SELECT * FROM pontos WHERE usuario_id = ? AND dia_ref = ? AND tipo = ? AND hora = ?',
      usuarioId, data, tipo, hora,
    );
    if (existente) throw badRequest('Ja existe um registro deste tipo no mesmo horario.');

    const ts = epochMs(data, hora, fuso) ?? Date.now();
    const { lastInsertRowid } = await run(
      'INSERT INTO pontos (usuario_id, data, hora, dia_ref, ts, tipo, origem, justificativa, status, criado_em, criado_por, ip) '
      + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      usuarioId, data, hora, data, ts, tipo, 'lancamento', justificativa, 'aprovado',
      new Date().toISOString(), ator.id, ctx.ip || null,
    );
    await auditar(ator.id, 'ponto.lancado', 'ponto', lastInsertRowid, {
      usuario_id: usuarioId, data, hora, tipo, justificativa,
    });
    const dia = await diaDoUsuario(alvo, data);
    json(ctx.res, 201, { ponto_id: lastInsertRowid, dia });
  });

  r.get('/api/pontos/historico', async (ctx) => {
    const u = requireAuth(ctx);
    const hoje = (await nowLocal(await tz())).data;
    const inicio = ctx.query.inicio || `${monthKey(hoje)}-01`;
    const fim = ctx.query.fim || hoje;
    validarData(inicio); validarData(fim);
    const { alvo } = await alvoDoUsuario(ctx, ctx.query.usuario_id);
    const dias = daysOfMonth(monthKey(inicio));
    const registros = [];
    for (const d of dias) {
      if (d < inicio || d > fim) continue;
      registros.push(await diaDoUsuario(alvo, d));
    }
    json(ctx.res, 200, { usuario: publicUser(alvo), periodo: { inicio, fim }, dias: registros });
  });

  r.get('/api/pontos/dia/:data', async (ctx) => {
    const { alvo } = await alvoDoUsuario(ctx, ctx.query.usuario_id);
    const data = validarData(ctx.params.data);
    json(ctx.res, 200, { dia: await diaDoUsuario(alvo, data) });
  });

  r.get('/api/pontos/resumo/:mes', async (ctx) => {
    const { alvo } = await alvoDoUsuario(ctx, ctx.query.usuario_id);
    const mes = validarMes(ctx.params.mes);
    json(ctx.res, 200, { resumo: await resumoMensal(alvo, mes), rotulo: monthLabel(mes) });
  });

  // ------------------------------------------------------------ usuarios
  r.get('/api/usuarios', async (ctx) => {
    const u = requireAuth(ctx);
    const lista = await listarUsuariosVisiveis(u);
    json(ctx.res, 200, { usuarios: lista.map(publicUser) });
  });

  r.post('/api/usuarios', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = ctx.body || {};
    const nome = String(b.nome || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    if (!nome) throw badRequest('Informe o nome completo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Informe um e-mail valido.');
    const erro = exigirSenhaForte(b.senha);
    if (erro) throw badRequest(erro);
    if (!PERFIS.includes(b.perfil)) throw badRequest('Perfil invalido.');
    if (!['colaborador', 'prestador'].includes(b.vinculo)) throw badRequest('Tipo de vinculo invalido.');

    const escala = normalizarEscala(b.escala);
    const { hash, salt } = hashSenha(b.senha);
    const agora = new Date().toISOString();
    const { lastInsertRowid } = await run(
      'INSERT INTO usuarios (nome, email, senha_hash, senha_salt, cargo, vinculo, perfil, escala_json, status, telefone, senha_provisoria, criado_em, atualizado_em) '
      + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      nome, email, hash, salt, b.cargo || null, b.vinculo, b.perfil,
      JSON.stringify(escala), b.status === 'inativo' ? 'inativo' : 'ativo',
      b.telefone || null, b.senha_provisoria === false ? 0 : 1, agora, agora,
    );
    await auditar(admin.id, 'usuario.criado', 'usuario', lastInsertRowid, { nome, email, perfil: b.perfil });

    // Gera automaticamente o link de acesso do funcionario, para envio
    // imediato - sem senha, sem app para instalar.
    const token = crypto.randomBytes(24).toString('base64url');
    await run(
      'INSERT INTO acessos (token, usuario_id, rotulo, criado_por, criado_em, expira_em, usos) '
      + 'VALUES (?,?,?,?,?,?,0)',
      token, lastInsertRowid, 'Link inicial', admin.id, agora, null,
    );
    await auditar(admin.id, 'acesso.criado', 'acesso', lastInsertRowid, { automatico: true });

    const criado = await get('SELECT * FROM usuarios WHERE id = ?', lastInsertRowid);
    json(ctx.res, 201, {
      usuario: publicUser(criado),
      link_acesso: montarLinkAcesso(ctx, token),
    });
  });

  r.put('/api/usuarios/:id', async (ctx) => {
    const ator = requireAuth(ctx);
    const id = Number(ctx.params.id);
    const alvo = await get('SELECT * FROM usuarios WHERE id = ?', id);
    if (!alvo) throw notFound('Usuario nao encontrado.');
    if (!podeGerenciarUsuario(ator, alvo) && !(ehAdmin(ator) && ator.id === id)) {
      throw forbidden('Sem permissao para alterar este usuario.');
    }
    const b = ctx.body || {};
    const campos = [];
    const valores = [];
    const push = (col, val) => { campos.push(`${col} = ?`); valores.push(val); };

    if (b.nome !== undefined && (ehAdmin(ator) || ator.id === id)) push('nome', String(b.nome).trim());
    if (b.cargo !== undefined) push('cargo', b.cargo || null);
    if (b.telefone !== undefined) push('telefone', b.telefone || null);
    if (b.vinculo !== undefined && ehAdmin(ator)) {
      if (!['colaborador', 'prestador'].includes(b.vinculo)) throw badRequest('Vinculo invalido.');
      push('vinculo', b.vinculo);
    }
    if (b.perfil !== undefined && ehAdmin(ator)) {
      if (!PERFIS.includes(b.perfil)) throw badRequest('Perfil invalido.');
      push('perfil', b.perfil);
    }
    if (b.status !== undefined && ehAdmin(ator)) {
      if (!['ativo', 'inativo'].includes(b.status)) throw badRequest('Status invalido.');
      push('status', b.status);
    }
    if (b.escala !== undefined) push('escala_json', JSON.stringify(normalizarEscala(b.escala)));
    if (b.senha !== undefined && b.senha !== '') {
      if (!ehAdmin(ator) && ator.id !== id) throw forbidden('Sem permissao para redefinir a senha.');
      const erro = exigirSenhaForte(b.senha);
      if (erro) throw badRequest(erro);
      const { hash, salt } = hashSenha(b.senha);
      push('senha_hash', hash); push('senha_salt', salt);
      push('senha_provisoria', b.senha_provisoria === false ? 0 : 1);
      await run('DELETE FROM sessoes WHERE usuario_id = ?', id);
    }
    if (!campos.length) throw badRequest('Nada para atualizar.');
    push('atualizado_em', new Date().toISOString());
    await run(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, ...valores, id);
    await auditar(ator.id, 'usuario.atualizado', 'usuario', id, b);
    const atualizado = await get('SELECT * FROM usuarios WHERE id = ?', id);
    json(ctx.res, 200, { usuario: publicUser(atualizado) });
  });

  r.post('/api/usuarios/:id/equipe', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const id = Number(ctx.params.id);
    const alvo = await get('SELECT * FROM usuarios WHERE id = ?', id);
    if (!alvo) throw notFound('Usuario nao encontrado.');
    const gestorId = ehAdmin(ator) && ctx.body?.gestor_id ? Number(ctx.body.gestor_id) : ator.id;
    const gestor = await get('SELECT * FROM usuarios WHERE id = ?', gestorId);
    if (!gestor || (gestor.perfil !== 'gestor' && gestor.perfil !== 'admin')) {
      throw badRequest('Gestor invalido.');
    }
    await run('INSERT OR IGNORE INTO usuarios_equipe (gestor_id, colaborador_id) VALUES (?,?)', gestorId, id);
    await auditar(ator.id, 'equipe.vinculado', 'usuario', id, { gestor_id: gestorId });
    json(ctx.res, 200, { ok: true });
  });

  r.delete('/api/usuarios/:id/equipe', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const id = Number(ctx.params.id);
    const gestorId = ehAdmin(ator) && ctx.query.gestor_id ? Number(ctx.query.gestor_id) : ator.id;
    await run('DELETE FROM usuarios_equipe WHERE gestor_id = ? AND colaborador_id = ?', gestorId, id);
    await auditar(ator.id, 'equipe.desvinculado', 'usuario', id, { gestor_id: gestorId });
    json(ctx.res, 200, { ok: true });
  });

  r.get('/api/equipe', async (ctx) => {
    const u = requireAuth(ctx);
    if (ehAdmin(u)) {
      json(ctx.res, 200, { gestores: await all("SELECT * FROM usuarios WHERE perfil IN ('gestor','admin') ORDER BY nome") });
      return;
    }
    json(ctx.res, 200, { gestores: [], colaboradores: (await equipeDoGestor(u.id)).map(publicUser) });
  });

  // -------------------------------------------------------------- turnos
  r.get('/api/turnos', async (ctx) => {
    requireAuth(ctx);
    json(ctx.res, 200, { turnos: await all('SELECT * FROM turnos WHERE ativo = 1 ORDER BY inicio') });
  });

  r.post('/api/turnos', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = ctx.body || {};
    if (!b.nome) throw badRequest('Informe o nome do turno.');
    if (!/^\d{2}:\d{2}$/.test(b.inicio || '') || !/^\d{2}:\d{2}$/.test(b.fim || '')) {
      throw badRequest('Informe inicio e fim no formato HH:MM.');
    }
    const { lastInsertRowid } = await run(
      'INSERT INTO turnos (nome, descricao, inicio, fim, ativo, criado_em) VALUES (?,?,?,?,1,?)',
      String(b.nome).trim(), b.descricao || null, b.inicio, b.fim, new Date().toISOString(),
    );
    await auditar(admin.id, 'turno.criado', 'turno', lastInsertRowid, b);
    json(ctx.res, 201, { turno: await get('SELECT * FROM turnos WHERE id = ?', lastInsertRowid) });
  });

  r.put('/api/turnos/:id', async (ctx) => {
    const admin = requireAdmin(ctx);
    const id = Number(ctx.params.id);
    if (!await get('SELECT id FROM turnos WHERE id = ?', id)) throw notFound('Turno nao encontrado.');
    const b = ctx.body || {};
    await run('UPDATE turnos SET nome = ?, descricao = ?, inicio = ?, fim = ?, ativo = ? WHERE id = ?',
      b.nome || 'Turno', b.descricao || null, b.inicio || '08:00', b.fim || '14:00',
      b.ativo === false ? 0 : 1, id);
    await auditar(admin.id, 'turno.atualizado', 'turno', id, b);
    json(ctx.res, 200, { turno: await get('SELECT * FROM turnos WHERE id = ?', id) });
  });

  // --------------------------------------------------------- solicitacoes
  r.get('/api/solicitacoes', async (ctx) => {
    const u = requireAuth(ctx);
    const filtro = ehAdmin(u) ? '' : 'WHERE s.usuario_id = ?';
    const params = ehAdmin(u) ? [] : [u.id];
    const itens = await all(
      `SELECT s.*, us.nome AS usuario_nome, rv.nome AS revisor_nome
       FROM solicitacoes s
       JOIN usuarios us ON us.id = s.usuario_id
       LEFT JOIN usuarios rv ON rv.id = s.revisor_id ${filtro} ORDER BY s.criado_em DESC`,
      ...params,
    );
    json(ctx.res, 200, { solicitacoes: itens.map((s) => ({ ...s, pontos_json: safeJson(s.pontos_json) })) });
  });

  r.post('/api/solicitacoes', async (ctx) => {
    const u = requireAuth(ctx);
    const b = ctx.body || {};
    const data = validarData(b.data);
    const justificativa = String(b.justificativa || '').trim();
    if (justificativa.length < 10) throw badRequest('Descreva a justificativa com pelo menos 10 caracteres.');
    const tipo = ['correcao', 'ajuste', 'insercao'].includes(b.tipo) ? b.tipo : 'correcao';
    const pontos = Array.isArray(b.pontos) ? b.pontos : [];
    const { lastInsertRowid } = await run(
      'INSERT INTO solicitacoes (usuario_id, data, tipo, descricao, pontos_json, justificativa, status, criado_em) '
      + 'VALUES (?,?,?,?,?,?,?,?)',
      u.id, data, tipo, b.descricao || null,
      pontos.length ? JSON.stringify(pontos) : null, justificativa, 'pendente', new Date().toISOString(),
    );
    await auditar(u.id, 'solicitacao.criada', 'solicitacao', lastInsertRowid, { data, tipo });
    json(ctx.res, 201, { solicitacao: await get('SELECT * FROM solicitacoes WHERE id = ?', lastInsertRowid) });
  });

  r.post('/api/solicitacoes/:id/decisao', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const id = Number(ctx.params.id);
    const s = await get('SELECT * FROM solicitacoes WHERE id = ?', id);
    if (!s) throw notFound('Solicitacao nao encontrada.');
    if (s.status !== 'pendente') throw badRequest('Esta solicitacao ja foi analisada.');
    const b = ctx.body || {};
    if (!['aprovado', 'rejeitado'].includes(b.status)) throw badRequest('Decisao invalida.');
    const aprovar = b.status === 'aprovado';
    const fuso = await tz();

    await tx(async () => {
      if (aprovar && s.pontos_json) {
        const pontos = safeJson(s.pontos_json) || [];
        for (const p of pontos) {
          const hora = String(p.hora || '').slice(0, 5);
          if (!/^\d{2}:\d{2}$/.test(hora)) continue;
          const ts = epochMs(s.data, hora, fuso) ?? Date.now();
          await run(
            'INSERT INTO pontos (usuario_id, data, hora, dia_ref, ts, tipo, origem, justificativa, status, criado_em, criado_por, ip) '
            + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            s.usuario_id, s.data, hora, s.data, ts,
            TIPO_PONTO[p.tipo] || p.tipo, 'correcao', s.justificativa, 'aprovado',
            new Date().toISOString(), ator.id, null,
          );
        }
      }
      await run(
        'UPDATE solicitacoes SET status = ?, revisor_id = ?, revisor_comentario = ?, revisado_em = ? WHERE id = ?',
        b.status, ator.id, b.comentario || null, new Date().toISOString(), id,
      );
    });

    await auditar(ator.id, `solicitacao.${b.status}`, 'solicitacao', id, {
      usuario_id: s.usuario_id, data: s.data, comentario: b.comentario || null,
    });
    json(ctx.res, 200, { solicitacao: await get('SELECT * FROM solicitacoes WHERE id = ?', id) });
  });

  // ----------------------------------------------------------- ausencias
  r.get('/api/ausencias', async (ctx) => {
    const u = requireAuth(ctx);
    let sql = 'SELECT a.*, us.nome AS usuario_nome FROM ausencias a JOIN usuarios us ON us.id = a.usuario_id';
    const params = [];
    if (!ehAdmin(u) && !ehGestor(u)) { sql += ' WHERE a.usuario_id = ?'; params.push(u.id); }
    if (ctx.query.mes) { sql += ' AND a.data LIKE ?'; params.push(`${ctx.query.mes}%`); }
    sql += ' ORDER BY a.data DESC';
    json(ctx.res, 200, { ausencias: await all(sql, ...params) });
  });

  r.post('/api/ausencias', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const b = ctx.body || {};
    const data = validarData(b.data);
    const usuarioId = b.usuario_id ? Number(b.usuario_id) : ator.id;
    const alvo = await get('SELECT * FROM usuarios WHERE id = ?', usuarioId);
    if (!alvo) throw notFound('Usuario nao encontrado.');
    if (!podeGerenciarUsuario(ator, alvo) && ator.id !== alvo.id) throw forbidden('Sem permissao.');
    const tipo = b.tipo === 'falta' ? 'falta' : 'ausencia';
    const status = ehAdmin(ator) ? 'aprovado' : 'pendente';
    const { lastInsertRowid } = await run(
      'INSERT INTO ausencias (usuario_id, data, tipo, justificativa, status, registrado_por, criado_em) '
      + 'VALUES (?,?,?,?,?,?,?)',
      usuarioId, data, tipo, b.justificativa || null, status, ator.id, new Date().toISOString(),
    );
    await auditar(ator.id, 'ausencia.registrada', 'ausencia', lastInsertRowid, { usuario_id: usuarioId, data, tipo });
    json(ctx.res, 201, { ausencia: await get('SELECT * FROM ausencias WHERE id = ?', lastInsertRowid) });
  });

  r.post('/api/ausencias/:id/status', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const id = Number(ctx.params.id);
    const a = await get('SELECT * FROM ausencias WHERE id = ?', id);
    if (!a) throw notFound('Ausencia nao encontrada.');
    const b = ctx.body || {};
    if (!['aprovado', 'rejeitado', 'pendente'].includes(b.status)) throw badRequest('Status invalido.');
    await run('UPDATE ausencias SET status = ? WHERE id = ?', b.status, id);
    await auditar(ator.id, 'ausencia.status', 'ausencia', id, { status: b.status });
    json(ctx.res, 200, { ausencia: await get('SELECT * FROM ausencias WHERE id = ?', id) });
  });

  // -------------------------------------------------------------- avisos
  r.get('/api/avisos', async (ctx) => {
    requireAuth(ctx);
    json(ctx.res, 200, { avisos: await all('SELECT * FROM avisos WHERE ativo = 1 ORDER BY publicado_em DESC') });
  });

  r.post('/api/avisos', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const b = ctx.body || {};
    if (!b.titulo || !b.corpo) throw badRequest('Informe titulo e conteudo do aviso.');
    const { lastInsertRowid } = await run(
      'INSERT INTO avisos (titulo, corpo, autor_id, publicado_em, ativo) VALUES (?,?,?,?,1)',
      String(b.titulo).trim(), String(b.corpo).trim(), ator.id, new Date().toISOString(),
    );
    await auditar(ator.id, 'aviso.criado', 'aviso', lastInsertRowid, { titulo: b.titulo });
    json(ctx.res, 201, { aviso: await get('SELECT * FROM avisos WHERE id = ?', lastInsertRowid) });
  });

  r.put('/api/avisos/:id', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const id = Number(ctx.params.id);
    if (!await get('SELECT id FROM avisos WHERE id = ?', id)) throw notFound('Aviso nao encontrado.');
    const b = ctx.body || {};
    await run('UPDATE avisos SET titulo = ?, corpo = ?, ativo = ? WHERE id = ?',
      b.titulo || '', b.corpo || '', b.ativo === false ? 0 : 1, id);
    await auditar(ator.id, 'aviso.atualizado', 'aviso', id, b);
    json(ctx.res, 200, { ok: true });
  });

  // ----------------------------------------------------------- auditoria
  r.get('/api/auditoria', async (ctx) => {
    requireAdmin(ctx);
    const limite = Math.min(Number(ctx.query.limite) || 200, 1000);
    const registros = await all(
      `SELECT a.*, u.nome AS ator_nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.ator_id
       ORDER BY a.id DESC LIMIT ?`, limite,
    );
    json(ctx.res, 200, { registros: registros.map((x) => ({ ...x, detalhes: safeJson(x.detalhes) })) });
  });

  // ---------------------------------------------------------- config admin
  r.put('/api/config', async (ctx) => {
    const admin = requireAdmin(ctx);
    const b = ctx.body || {};
    const permitidas = ['nome_agencia', 'cor_primaria', 'cor_destaque', 'logo_url', 'timezone', 'jornada_padrao_horas'];
    for (const chave of permitidas) {
      if (b[chave] !== undefined) await setConfig(chave, b[chave]);
    }
    await auditar(admin.id, 'config.atualizada', 'config', null, b);
    json(ctx.res, 200, { ok: true });
  });

  // ----------------------------------------------------------- relatorios
  r.get('/api/relatorios/individual.pdf', async (ctx) => {
    const { alvo } = await alvoDoUsuario(ctx, ctx.query.usuario_id);
    const mes = validarMes(ctx.query.mes || monthKey((await nowLocal(await tz())).data));
    const buf = await relatorioIndividual(alvo, mes);
    sendBuffer(ctx.res, 200, buf, 'application/pdf', `ponto-${alvo.nome.replace(/\s+/g, '-').toLowerCase()}-${mes}.pdf`);
  });

  r.get('/api/relatorios/consolidado.pdf', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const mes = validarMes(ctx.query.mes || monthKey((await nowLocal(await tz())).data));
    const todos = await all('SELECT * FROM usuarios WHERE status = ? ORDER BY nome', 'ativo');
    const usuarios = ehAdmin(ator) ? todos : todos.filter((u) => podeGerenciarUsuario(ator, u) || u.id === ator.id);
    const buf = await relatorioConsolidado(mes, usuarios);
    sendBuffer(ctx.res, 200, buf, 'application/pdf', `relatorio-consolidado-${mes}.pdf`);
  });

  r.get('/api/relatorios/dashboard', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const mes = validarMes(ctx.query.mes || monthKey((await nowLocal(await tz())).data));
    const todos = await all('SELECT * FROM usuarios WHERE status = ? ORDER BY nome', 'ativo');
    const visiveis = ehAdmin(ator) ? todos : todos.filter((u) => podeGerenciarUsuario(ator, u) || u.id === ator.id);
    const resumos = [];
    for (const u of visiveis) resumos.push(await resumoMensal(u, mes));
    const soma = (k) => resumos.reduce((a, x) => a + x[k], 0);
    const hoje = (await nowLocal(await tz())).data;
    const presentes = await all(
      'SELECT DISTINCT u.id, u.nome FROM pontos p JOIN usuarios u ON u.id = p.usuario_id WHERE p.dia_ref = ? AND p.tipo = ?',
      hoje, 'entrada',
    );
    const pendSolic = await get("SELECT COUNT(*) AS n FROM solicitacoes WHERE status = 'pendente'");
    const pendAus = await get("SELECT COUNT(*) AS n FROM ausencias WHERE status = 'pendente'");
    json(ctx.res, 200, {
      mes,
      rotulo: monthLabel(mes),
      totais: {
        colaboradores: visiveis.length,
        horas_previstas_min: soma('horas_previstas_min'),
        horas_registradas_min: soma('horas_registradas_min'),
        saldo_min: soma('saldo_min'),
        atrasos: soma('atrasos'),
        saidas_antecipadas: soma('saidas_antecipadas'),
        horas_pendentes_min: soma('horas_pendentes_min'),
        dias_trabalhados: soma('dias_trabalhados'),
        registros_incompletos: soma('registros_incompletos'),
        faltas: soma('faltas'),
        ausencias: soma('ausencias'),
      },
      hoje: { data: hoje, presentes: presentes.length, total: visiveis.length },
      resumos,
      pendencias: {
        solicitacoes: pendSolic.n,
        ausencias: pendAus.n,
        registros_incompletos: soma('registros_incompletos'),
      },
    });
  });

  r.get('/api/relatorios/inconsistencias', async (ctx) => {
    const ator = requireGestorOuAdmin(ctx);
    const mes = validarMes(ctx.query.mes || monthKey((await nowLocal(await tz())).data));
    const todos = await all('SELECT * FROM usuarios WHERE status = ? ORDER BY nome', 'ativo');
    const visiveis = ehAdmin(ator) ? todos : todos.filter((u) => podeGerenciarUsuario(ator, u) || u.id === ator.id);
    const itens = [];
    for (const u of visiveis) {
      const resumo = await resumoMensal(u, mes);
      for (const i of resumo.inconsistencias) {
        itens.push({ usuario_id: u.id, usuario_nome: u.nome, data: i.data, problema: i.status });
      }
    }
    json(ctx.res, 200, { mes, inconsistencias: itens });
  });

  // ------------------------------------------------------------- backup
  r.get('/api/backup', async (ctx) => {
    requireAdmin(ctx);
    const buf = await gerarBackup();
    sendBuffer(ctx.res, 200, buf, 'application/json', `codeon-backup-${(await nowLocal(await tz())).data}.json`);
  });

  r.post('/api/backup', async (ctx) => {
    requireAdmin(ctx);
    const buf = await gerarBackup();
    sendBuffer(ctx.res, 200, buf, 'application/json', `codeon-backup-${(await nowLocal(await tz())).data}.json`);
  });

  return r;
}

async function gerarBackup() {
  const tabelas = ['usuarios', 'usuarios_equipe', 'turnos', 'pontos', 'ausencias', 'solicitacoes', 'avisos', 'auditoria', 'config'];
  const dump = {};
  for (const t of tabelas) dump[t] = await all(`SELECT * FROM ${t}`);
  return Buffer.from(JSON.stringify({ gerado_em: new Date().toISOString(), versao: 1, dados: dump }, null, 2), 'utf8');
}

function normalizarEscala(e) {
  const padrao = {
    jornadaMin: 360,
    dias: [1, 2, 3, 4, 5],
    turnos: [{ nome: 'Padrao', inicio: '08:00', fim: '14:00', descansoMin: 0, periods: 1 }],
    toleranciaAtrasoMin: 10,
    toleranciaSaidaMin: 10,
  };
  if (!e || typeof e !== 'object') return padrao;
  const out = { ...padrao, ...e };
  out.jornadaMin = Number(out.jornadaMin) > 0 ? Number(out.jornadaMin) : 360;
  out.dias = Array.isArray(out.dias) && out.dias.length ? out.dias.map(Number) : padrao.dias;
  out.turnos = Array.isArray(out.turnos) && out.turnos.length
    ? out.turnos.map((t) => ({
      nome: t.nome || 'Turno',
      inicio: t.inicio || '08:00',
      fim: t.fim || '14:00',
      descansoMin: Number(t.descansoMin) || 0,
      periods: Math.min(3, Math.max(1, Number(t.periods) || 1)),
    }))
    : padrao.turnos;
  out.toleranciaAtrasoMin = Number(out.toleranciaAtrasoMin) >= 0 ? Number(out.toleranciaAtrasoMin) : 10;
  out.toleranciaSaidaMin = Number(out.toleranciaSaidaMin) >= 0 ? Number(out.toleranciaSaidaMin) : 10;
  return out;
}

function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/** Monta a URL publica de acesso a partir do host da requisicao. */
function montarLinkAcesso(ctx, token) {
  const base = process.env.PUBLIC_URL
    ? String(process.env.PUBLIC_URL).replace(/\/+$/, '')
    : `${ctx.req.headers['x-forwarded-proto'] || (ctx.secure ? 'https' : 'http')}://${ctx.req.headers.host}`;
  return `${base}/acesso/${token}`;
}
