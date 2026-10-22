// Inicializacao: configuracoes padrao, turnos base e admin inicial.
// Nenhum dado ficticio de colaboradores e criado - apenas estrutura e o admin inicial.
import { all, get, run, getConfig, setConfig, auditar } from './db.js';
import { hashSenha } from './auth.js';
import { TURNOS_PADRAO } from './jornada.js';

export async function bootstrap() {
  const padroes = {
    nome_agencia: 'Codeon Agency',
    cor_primaria: '#002ef6',
    cor_destaque: '#002ef6',
    logo_url: '/assets/logo-full.png',
    timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
    jornada_padrao_horas: '6',
  };
  for (const [k, v] of Object.entries(padroes)) {
    if (await getConfig(k) === null) await setConfig(k, v);
  }

  for (const t of TURNOS_PADRAO) {
    if (!await get('SELECT id FROM turnos WHERE nome = ?', t.nome)) {
      await run(
        'INSERT INTO turnos (nome, descricao, inicio, fim, ativo, criado_em) VALUES (?,?,?,?,1,?)',
        t.nome, t.descricao, t.inicio, t.fim, new Date().toISOString(),
      );
    }
  }

  // Admin inicial: criado apenas quando o sistema ainda nao tem usuarios.
  // Em hospedagem serverless varios cold starts podem ocorrer ao mesmo tempo,
  // entao a insercao ignora conflitos de unicidade em vez de quebrar a requisicao.
  const total = await get('SELECT COUNT(*) AS n FROM usuarios');
  if (total.n === 0) {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const senha = process.env.ADMIN_SENHA || '';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || senha.length < 12) {
      throw new Error('Configure ADMIN_EMAIL e ADMIN_SENHA (minimo 12 caracteres) no ambiente do servidor.');
    }
    const nome = process.env.ADMIN_NOME || 'Administrador Codeon';
    const { hash, salt } = hashSenha(senha);
    const agora = new Date().toISOString();
    try {
      await run(
        'INSERT INTO usuarios (nome, email, senha_hash, senha_salt, cargo, vinculo, perfil, escala_json, status, criado_em, atualizado_em) '
        + 'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        nome, email, hash, salt, 'Administrador', 'colaborador', 'admin',
        JSON.stringify({
          jornadaMin: 360, dias: [1, 2, 3, 4, 5],
          turnos: [{ nome: 'Padrao', inicio: '08:00', fim: '14:00', descansoMin: 0, periods: 1 }],
          toleranciaAtrasoMin: 10, toleranciaSaidaMin: 10,
        }),
        'ativo', agora, agora,
      );
      await auditar(null, 'sistema.inicializado', 'usuario', 1, { email });
      console.log('  [setup] Administrador inicial criado. Troque a senha apos o primeiro acesso.');
    } catch (e) {
      // Outro cold start ja criou o admin: nao e erro.
      if (!/UNIQUE|constraint/i.test(String(e.message))) throw e;
    }
  }
}
