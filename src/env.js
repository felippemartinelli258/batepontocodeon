// Carrega o arquivo .env da raiz do projeto, se existir.
//
// Deve ser o primeiro modulo importado pelo sistema, para que as variaveis
// estejam disponiveis antes de qualquer outro arquivo le-las.
//
// Regras:
//   - variaveis ja definidas no ambiente (terminal, CI, hospedagem) tem
//     prioridade e nao sao sobrescritas;
//   - linhas invalidas sao ignoradas sem interromper a execucao;
//   - a ausencia do arquivo .env nao e um erro.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function candidatos() {
  const raiz = path.resolve(__dirname, '..');
  return [
    path.join(raiz, '.env'),
    path.join(process.cwd(), '.env'),
  ];
}

export function carregarEnv() {
  let arquivo = null;
  for (const c of candidatos()) {
    try {
      if (fs.existsSync(c)) { arquivo = c; break; }
    } catch { /* ignora candidato inacessivel */ }
  }
  if (!arquivo) return { carregado: false, arquivo: null, variaveis: [] };

  let conteudo;
  try {
    conteudo = fs.readFileSync(arquivo, 'utf8');
  } catch {
    return { carregado: false, arquivo, variaveis: [] };
  }

  const variaveis = [];
  for (const linha of conteudo.split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const chave = m[1];
    let valor = m[2].trim();
    // Remove aspas envolventes, se houver.
    if ((valor.startsWith('"') && valor.endsWith('"') && valor.length > 1)
      || (valor.startsWith("'") && valor.endsWith("'") && valor.length > 1)) {
      valor = valor.slice(1, -1);
    } else {
      // Comentario no fim da linha, fora de aspas.
      const hash = valor.indexOf(' #');
      if (hash >= 0) valor = valor.slice(0, hash).trim();
    }
    if (process.env[chave] === undefined) {
      process.env[chave] = valor;
      variaveis.push(chave);
    }
  }

  return { carregado: true, arquivo, variaveis };
}

const resultado = carregarEnv();
if (resultado.carregado && resultado.variaveis.length) {
  console.log(`[env] ${resultado.variaveis.length} variavel(is) lida(s) de ${path.basename(resultado.arquivo)}`);
}
