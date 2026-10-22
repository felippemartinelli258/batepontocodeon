// Camada de banco de dados.
//
// Dois drivers, com a mesma interface:
//   - SQLite local (node:sqlite) - modo padrao, ideal para servidor com disco persistente.
//   - Turso/libSQL via HTTPS     - para hospedagem serverless (Vercel/Netlify), onde o
//                                  disco do container e efemero. Ativado por TURSO_URL/TURSO_TOKEN.
//
// Nenhuma dependencia externa: o driver Turso usa apenas `fetch`.
import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  cargo TEXT,
  vinculo TEXT NOT NULL DEFAULT 'colaborador',
  perfil TEXT NOT NULL DEFAULT 'colaborador',
  escala_json TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  telefone TEXT,
  senha_trocada_em TEXT,
  senha_provisoria INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios_equipe (
  gestor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  colaborador_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (gestor_id, colaborador_id)
);

CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pontos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  hora TEXT NOT NULL,
  dia_ref TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'automatico',
  justificativa TEXT,
  status TEXT NOT NULL DEFAULT 'aprovado',
  criado_em TEXT NOT NULL,
  criado_por INTEGER REFERENCES usuarios(id),
  ip TEXT
);

CREATE TABLE IF NOT EXISTS ausencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'falta',
  justificativa TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  registrado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS solicitacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'correcao',
  descricao TEXT,
  pontos_json TEXT,
  justificativa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  revisor_id INTEGER REFERENCES usuarios(id),
  revisor_comentario TEXT,
  revisado_em TEXT,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL,
  autor_id INTEGER REFERENCES usuarios(id),
  publicado_em TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ator_id INTEGER REFERENCES usuarios(id),
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  detalhes TEXT,
  data_hora TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS acessos (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rotulo TEXT,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL,
  expira_em TEXT,
  ultimo_uso_em TEXT,
  usos INTEGER NOT NULL DEFAULT 0,
  revogado_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_acessos_usuario ON acessos(usuario_id);

CREATE INDEX IF NOT EXISTS idx_pontos_ud ON pontos(usuario_id, dia_ref);
CREATE INDEX IF NOT EXISTS idx_pontos_data ON pontos(data);
CREATE INDEX IF NOT EXISTS idx_ausencias_ud ON ausencias(usuario_id, data);
CREATE INDEX IF NOT EXISTS idx_solic_ud ON solicitacoes(usuario_id, data);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(data_hora);
`;

// ---------------------------------------------------------------- drivers

async function criarDriverSQLite() {
  const DB_PATH = process.env.DATABASE_PATH || path.join(ROOT, 'data', 'codeon-ponto.db');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Import dinamico: o bundle serverless nao deve carregar o driver nativo
  // quando o sistema esta configurado para usar o Turso.
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrar();

  const emTransacao = { valor: false };

  return {
    nome: 'sqlite',
    caminho: DB_PATH,
    async all(sql, params) {
      return db.prepare(sql).all(...params).map(plain);
    },
    async get(sql, params) {
      const row = db.prepare(sql).get(...params);
      return row ? plain(row) : undefined;
    },
    async run(sql, params) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async exec(sql) {
      db.exec(sql);
    },
    async tx(fn) {
      if (emTransacao.valor) return fn();
      emTransacao.valor = true;
      db.exec('BEGIN');
      try {
        const r = await fn();
        db.exec('COMMIT');
        return r;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        throw err;
      } finally {
        emTransacao.valor = false;
      }
    },
  };
}

function criarDriverTurso() {
  const url = process.env.TURSO_URL;
  const token = process.env.TURSO_TOKEN;
  if (!url || !token) throw new Error('TURSO_URL e TURSO_TOKEN sao obrigatorios para o driver Turso.');
  const base = url.replace(/\/+$/, '');
  const endpoint = `${base}/v2/pipeline`;

  // Em transacao, as instrucoes sao acumuladas e enviadas em um unico lote.
  const buffer = { ativo: false, stmts: [] };

  async function enviar(stmts) {
    if (!stmts.length) return [];
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        requests: stmts.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: s.args || [] } })),
      }),
    });
    if (!res.ok) {
      const texto = await res.text();
      throw new Error(`Turso respondeu ${res.status}: ${texto.slice(0, 400)}`);
    }
    const json = await res.json();
    return json.results || [];
  }

  /**
   * A resposta do pipeline HTTP do Turso e aninhada:
   *   results[i].response.result.{cols,rows,affected_row_count,last_insert_rowid}
   * Formatos mais antigos devolviam o payload direto, entao ambos sao aceitos.
   */
  function resultadoDe(entry) {
    if (!entry) return null;
    if (entry.type && entry.type !== 'ok') {
      throw new Error(`Turso retornou erro: ${JSON.stringify(entry).slice(0, 400)}`);
    }
    const payload = entry.response ? entry.response.result : entry;
    return payload && payload.cols !== undefined ? payload : (entry.result || payload);
  }

  function mapear(entry) {
    const result = resultadoDe(entry);
    if (!result) return { rows: [], changes: 0, lastInsertRowid: null };
    const cols = (result.cols || []).map((c) => (typeof c === 'string' ? c : c.name));
    const rows = (result.rows || []).map((row) => {
      // O Turso devolve linhas como arrays de valores;aceita tambem objetos.
      if (row && typeof row === 'object' && !Array.isArray(row)) return row;
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
    return {
      rows,
      changes: Number(result.affected_row_count ?? 0),
      lastInsertRowid: result.last_insert_rowid != null ? Number(result.last_insert_rowid) : null,
    };
  }

  return {
    nome: 'turso',
    caminho: base,
    async all(sql, params) {
      if (buffer.ativo) { buffer.stmts.push({ sql, args: params }); return []; }
      const [r] = await enviar([{ sql, args: params }]);
      return mapear(r).rows;
    },
    async get(sql, params) {
      if (buffer.ativo) { buffer.stmts.push({ sql, args: params }); return undefined; }
      const [r] = await enviar([{ sql, args: params }]);
      return mapear(r).rows[0];
    },
    async run(sql, params) {
      if (buffer.ativo) {
        buffer.stmts.push({ sql, args: params });
        return { lastInsertRowid: null, changes: 0 };
      }
      const [r] = await enviar([{ sql, args: params }]);
      const m = mapear(r);
      return { lastInsertRowid: m.lastInsertRowid ?? (m.rows[0]?.id != null ? Number(m.rows[0].id) : null), changes: m.changes };
    },
    async exec(sql) {
      const stmts = dividirSql(sql);
      if (buffer.ativo) { for (const s of stmts) buffer.stmts.push({ sql: s, args: [] }); return; }
      await enviar(stmts.map((s) => ({ sql: s, args: [] })));
    },
    /**
     * O pipeline HTTP do Turso nao mantem sessao, entao a transacao e
     * aproximada: escritas sao acumuladas e enviadas juntas com BEGIN/COMMIT,
     * enquanto leituras sao executadas imediatamente.
     */
    async tx(fn) {
      if (buffer.ativo) return fn();
      buffer.ativo = true;
      buffer.stmts = [];
      try {
        const r = await fn();
        const stmts = [{ sql: 'BEGIN', args: [] }, ...buffer.stmts, { sql: 'COMMIT', args: [] }];
        buffer.ativo = false;
        buffer.stmts = [];
        if (buffer.stmts.length || stmts.length > 2) await enviar(stmts);
        return r;
      } catch (err) {
        buffer.ativo = false;
        buffer.stmts = [];
        try { await enviar([{ sql: 'ROLLBACK', args: [] }]); } catch { /* ignore */ }
        throw err;
      }
    },
  };
}


// PostgreSQL/Supabase: conexao exclusivamente pelo backend.
// Mantemos a API SQL parametrizada do projeto, traduzindo ? para $n.
async function criarDriverPostgres() {
  const { Pool } = await import('pg');
  const { AsyncLocalStorage } = await import('node:async_hooks');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    options: '-c search_path=codeon_ponto,public',
  });
  const scope = new AsyncLocalStorage();
  function traduzir(sql) {
    let n = 0;
    let q = sql.replace(/\?/g, () => `$${++n}`);
    q = q.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
    if (/^\s*INSERT INTO usuarios_equipe/i.test(q) && !/ON CONFLICT/i.test(q)) q += ' ON CONFLICT DO NOTHING';
    return q;
  }
  async function query(sql, params = []) {
    const client = scope.getStore() || pool;
    return client.query(traduzir(sql), params);
  }
  return {
    nome: 'postgres', caminho: 'Supabase PostgreSQL',
    async all(sql, params) { return (await query(sql, params)).rows; },
    async get(sql, params) { return (await query(sql, params)).rows[0]; },
    async run(sql, params) {
      const insert = /^\s*INSERT\s+INTO\s+/i.test(sql);
      const noId = /^\s*INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+(?:config|usuarios_equipe|sessoes|acessos)\b/i.test(sql);
      const result = await query(insert && !noId && !/RETURNING\s/i.test(sql) ? `${sql} RETURNING id` : sql, params);
      return { lastInsertRowid: result.rows[0]?.id == null ? null : Number(result.rows[0].id), changes: result.rowCount ?? 0 };
    },
    async exec(sql) { await query(sql); },
    async tx(fn) {
      if (scope.getStore()) return fn();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await scope.run(client, fn);
        await client.query('COMMIT');
        return result;
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    },
  };
}

/** Divide um SQL em instrucoes individuais respeitando aspas. */
function dividirSql(sql) {
  const partes = [];
  let atual = '';
  let emAspas = false;
  let aspas = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (emAspas) {
      atual += c;
      if (c === aspas) {
        if (sql[i + 1] === aspas) { atual += sql[++i]; continue; }
        emAspas = false;
      }
      continue;
    }
    if (c === "'" || c === '"') { emAspas = true; aspas = c; atual += c; continue; }
    if (c === ';') { if (atual.trim()) partes.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

function plain(row) {
  const out = {};
  for (const k of Object.keys(row)) out[k] = row[k];
  return out;
}

// --------------------------------------------------------------- migracoes
// O CREATE TABLE IF NOT EXISTS nao altera tabelas existentes. Para que um
// banco criado por uma versao anterior continue funcionando, adicionamos as
// colunas novas quando faltarem.
function migrar() {
  const colunas = {
    usuarios: [
      ['senha_trocada_em', 'TEXT'],
      ['senha_provisoria', 'INTEGER NOT NULL DEFAULT 0'],
    ],
  };
  for (const [tabela, campos] of Object.entries(colunas)) {
    let existentes = [];
    try {
      existentes = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
    } catch { continue; }
    for (const [nome, tipo] of campos) {
      if (!existentes.includes(nome)) {
        db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${tipo}`);
      }
    }
  }
}

// ------------------------------------------------------------------ init

/**
 * O banco usa o modulo nativo node:sqlite, disponivel a partir do Node 22.5.
 * Verificar a versao aqui evita um erro dificil de entender ("Cannot find
 * module 'node:sqlite'") para quem esta com o Node antigo instalado.
 */
function verificarVersaoNode() {
  const [maior, menor] = process.versions.node.split('.').map(Number);
  if (maior > 22 || (maior === 22 && menor >= 5)) return;
  console.error('\n  [erro] O Codeon Ponto precisa do Node.js 22.5 ou superior.');
  console.error(`  Versao instalada: ${process.versions.node}`);
  console.error('  Baixe a versao atual em https://nodejs.org (ou use o nvm) e tente de novo.\n');
  process.exit(1);
}

verificarVersaoNode();

const usarPostgres = Boolean(process.env.DATABASE_URL);
const usarTurso = !usarPostgres && Boolean(process.env.TURSO_URL && process.env.TURSO_TOKEN);
export const driver = usarPostgres ? await criarDriverPostgres() : usarTurso ? criarDriverTurso() : await criarDriverSQLite();
export const DB_PATH = driver.caminho;

if (usarPostgres) {
  console.log('[db] Driver Supabase PostgreSQL (schema codeon_ponto)');
} else if (usarTurso) {
  await driver.exec(SCHEMA);
  console.log(`[db] Driver Turso/libSQL (${driver.caminho})`);
} else {
  console.log(`[db] Driver SQLite local (${driver.caminho})`);
}

// --------------------------------------------------------------- interface

export async function all(sql, ...params) {
  return driver.all(sql, params);
}

export async function get(sql, ...params) {
  return driver.get(sql, params);
}

export async function run(sql, ...params) {
  return driver.run(sql, params);
}

export async function exec(sql) {
  return driver.exec(sql);
}

export async function tx(fn) {
  return driver.tx(fn);
}

// --------------------------------------------------------------- config

export async function getConfig(chave, padrao = null) {
  const row = await get('SELECT valor FROM config WHERE chave = ?', chave);
  return row ? row.valor : padrao;
}

export async function setConfig(chave, valor) {
  await run(
    'INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
    chave, valor == null ? null : String(valor),
  );
}

// --------------------------------------------------------------- auditoria

export async function auditar(atorId, acao, entidade, entidadeId, detalhes = null) {
  await run(
    'INSERT INTO auditoria (ator_id, acao, entidade, entidade_id, detalhes, data_hora) VALUES (?,?,?,?,?,?)',
    atorId ?? null, acao, entidade, entidadeId == null ? null : String(entidadeId),
    detalhes == null ? null : JSON.stringify(detalhes),
    new Date().toISOString(),
  );
}
