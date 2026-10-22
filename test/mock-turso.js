// Simula a API HTTP do Turso/libSQL (endpoint /v2/pipeline) usando o SQLite
// por tras, com o mesmo formato de resposta do servico real. Permite testar
// o driver Turso sem depender de rede.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

export function iniciarMockTurso() {
  const db = new DatabaseSync(':memory:');
  let idSeq = 0;

  const servidor = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : { requests: [] };

    const results = [];
    for (const r of body.requests || []) {
      const stmt = r.stmt || {};
      try {
        if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(stmt.sql || '')) {
          results.push({ type: 'ok', response: { type: 'execute', result: { cols: [], rows: [], affected_row_count: 0 } } });
          continue;
        }
        const prepared = db.prepare(stmt.sql);
        if (/^\s*SELECT/i.test(stmt.sql)) {
          const rows = prepared.all(...(stmt.args || []));
          const cols = rows.length ? Object.keys(rows[0]).map((name) => ({ name })) : [];
          results.push({
            type: 'ok',
            response: {
              type: 'execute',
              result: {
                cols,
                rows: rows.map((row) => Object.values(row)),
                affected_row_count: 0,
                last_insert_rowid: null,
              },
            },
          });
        } else {
          const res2 = prepared.run(...(stmt.args || []));
          idSeq += 1;
          results.push({
            type: 'ok',
            response: {
              type: 'execute',
              result: {
                cols: [],
                rows: [],
                affected_row_count: Number(res2.changes),
                last_insert_rowid: Number(res2.lastInsertRowid),
              },
            },
          });
        }
      } catch (e) {
        results.push({ type: 'error', error: { message: e.message } });
      }
    }

    const payload = JSON.stringify({ baton: null, base_url: null, results });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  });

  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        token: 'token-de-teste',
        fechar: () => new Promise((r) => { servidor.close(r); }),
      });
    });
  });
}
