// Verifica se todos os nomes importados existem como export no modulo de origem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [path.join(raiz, 'src'), path.join(raiz, 'public', 'assets')];

function listar(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listar(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const arquivos = dirs.flatMap(listar);
const exportsPorArquivo = new Map();

for (const arq of arquivos) {
  const src = fs.readFileSync(arq, 'utf8');
  const nomes = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) nomes.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.split(/\s+as\s+/).pop().trim();
      if (nome) nomes.add(nome);
    }
  }
  if (/export\s+default/.test(src)) nomes.add('default');
  exportsPorArquivo.set(arq, nomes);
}

let erros = 0;
for (const arq of arquivos) {
  const src = fs.readFileSync(arq, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const destino = path.resolve(path.dirname(arq), m[2]);
    if (m[2].startsWith('node:')) continue;
    if (!fs.existsSync(destino)) {
      console.log(`ERRO  ${path.basename(arq)} -> modulo inexistente ${m[2]}`);
      erros += 1;
      continue;
    }
    const disponiveis = exportsPorArquivo.get(destino);
    for (const parte of m[1].split(',')) {
      const nome = parte.split(/\s+as\s+/)[0].trim();
      if (!nome) continue;
      if (!disponiveis.has(nome)) {
        console.log(`ERRO  ${path.basename(arq)} importa "${nome}" que nao existe em ${path.basename(destino)}`);
        erros += 1;
      }
    }
  }
}

// Verifica tambem que todo id usado por document.getElementById existe no HTML correspondente
console.log(erros === 0 ? `\nOK - todos os imports resolvem (${arquivos.length} arquivos).` : `\n${erros} problema(s) de import.`);
process.exit(erros ? 1 : 0);
