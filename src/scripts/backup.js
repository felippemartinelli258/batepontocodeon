// Gera um backup JSON de todos os dados do sistema.
// Uso: node src/scripts/backup.js [destino]
import fs from 'node:fs';
import path from 'node:path';
import { all } from '../db.js';

const destino = process.argv[2]
  || path.join(process.cwd(), 'backups', `codeon-backup-${new Date().toISOString().slice(0, 10)}.json`);

const tabelas = [
  'usuarios', 'usuarios_equipe', 'turnos', 'pontos',
  'ausencias', 'solicitacoes', 'avisos', 'auditoria', 'config',
];

const dump = {};
for (const t of tabelas) dump[t] = await all(`SELECT * FROM ${t}`);

const conteudo = JSON.stringify({ gerado_em: new Date().toISOString(), versao: 1, dados: dump }, null, 2);
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, conteudo, 'utf8');

console.log(`Backup gerado: ${destino} (${(Buffer.byteLength(conteudo) / 1024).toFixed(1)} KB)`);
process.exit(0);
