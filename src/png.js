// Decodificador de PNG minimo, em Node puro (zlib nativo).
// Suporta o que o sistema precisa: 8 bits por canal, cor verdadeira
// (RGB) ou com alfa (RGBA), sem entrelacamento.
import zlib from 'node:zlib';

export function decodificarPNG(buffer) {
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== assinatura[i]) throw new Error('Arquivo PNG invalido.');
  }

  let offset = 8;
  let largura = 0;
  let altura = 0;
  let profundidade = 0;
  let tipoCor = 0;
  let interlacado = 0;
  const partes = [];

  while (offset < buffer.length) {
    const comprimento = buffer.readUInt32BE(offset);
    const tipo = buffer.toString('ascii', offset + 4, offset + 8);
    const dados = buffer.subarray(offset + 8, offset + 8 + comprimento);
    offset += 12 + comprimento;

    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
      profundidade = dados[8];
      tipoCor = dados[9];
      interlacado = dados[12];
    } else if (tipo === 'IDAT') {
      partes.push(dados);
    } else if (tipo === 'IEND') {
      break;
    }
  }

  if (profundidade !== 8) throw new Error(`PNG com profundidade ${profundidade} nao suportado.`);
  if (interlacado !== 0) throw new Error('PNG entrelacado nao suportado.');
  const canais = tipoCor === 6 ? 4 : (tipoCor === 2 ? 3 : 0);
  if (!canais) throw new Error(`PNG com tipo de cor ${tipoCor} nao suportado.`);

  const bruto = zlib.inflateSync(Buffer.concat(partes));
  const bytesPorLinha = largura * canais;
  const pixels = Buffer.alloc(altura * bytesPorLinha);

  let pos = 0;
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[pos];
    pos += 1;
    const linha = bruto.subarray(pos, pos + bytesPorLinha);
    pos += bytesPorLinha;
    const atual = pixels.subarray(y * bytesPorLinha, (y + 1) * bytesPorLinha);
    const anterior = y > 0
      ? pixels.subarray((y - 1) * bytesPorLinha, y * bytesPorLinha)
      : Buffer.alloc(bytesPorLinha);

    for (let x = 0; x < bytesPorLinha; x++) {
      const a = x >= canais ? atual[x - canais] : 0;
      const b = anterior[x];
      const c = x >= canais ? anterior[x - canais] : 0;
      const v = linha[x];
      switch (filtro) {
        case 0: atual[x] = v; break;
        case 1: atual[x] = (v + a) & 0xff; break;
        case 2: atual[x] = (v + b) & 0xff; break;
        case 3: atual[x] = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: atual[x] = (v + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`Filtro PNG desconhecido: ${filtro}`);
      }
    }
  }

  return { largura, altura, canais, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Converte um PNG RGBA em RGB chapado, usando uma cor de fundo.
 * Pixels totalmente transparentes viram a cor de fundo; opacos viram a cor
 * principal. Efeito usado para "estampar" a logo sobre uma faixa colorida.
 */
export function paraRGBChapado(png, fundo, tinta) {
  const { largura, altura, canais, pixels } = png;
  const saida = Buffer.alloc(largura * altura * 3);
  for (let i = 0, j = 0; i < pixels.length; i += canais, j += 3) {
    const alfa = canais === 4 ? pixels[i + 3] : 255;
    if (alfa >= 128) {
      saida[j] = tinta[0]; saida[j + 1] = tinta[1]; saida[j + 2] = tinta[2];
    } else {
      saida[j] = fundo[0]; saida[j + 1] = fundo[1]; saida[j + 2] = fundo[2];
    }
  }
  return saida;
}
