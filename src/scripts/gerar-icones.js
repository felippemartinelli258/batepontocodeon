// Gera os icones PNG do PWA a partir de um desenho vetorial simples.
// Sem dependencias: escreve PNG manualmente (IHDR/IDAT/IEND) com zlib nativo.
//
// Uso: node src/scripts/gerar-icones.js
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', '..', 'public', 'assets');

const FUNDO = [0x12, 0x14, 0x1a];
const OURO = [0xc9, 0xa2, 0x27];
const BRANCO = [0xff, 0xff, 0xff];

/** Distancia de um ponto ao centro de um anel, em unidades de raio. */
function corDoPixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const u = (x + 0.5 - cx) / (size / 2);
  const v = (y + 0.5 - cy) / (size / 2);
  const r = Math.sqrt(u * u + v * v);

  // Anel do relogio
  const raioAnel = 0.66;
  const espessura = 0.085;
  if (Math.abs(r - raioAnel) < espessura / 2) return OURO;

  // Ponteiros: 12h (vertical) e 4h (diagonal)
  const emHoras = (dx, dy) => {
    const t = Math.atan2(dy, dx);
    return t;
  };
  const dx = u;
  const dy = -v; // y do pixel cresce para baixo
  const ang = emHoras(dx, dy);
  const dist = r;

  // Ponteiro das horas: aponta para 12 (angulo -PI/2) e vai ate 55% do raio
  const angHoras = -Math.PI / 2;
  const diffHoras = Math.abs(((ang - angHoras + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (dist < 0.56 && diffHoras < 0.14 && dist > 0.10) return OURO;

  // Ponteiro dos minutos: aponta para 4h (~ -PI/2 + 2*PI/3)
  const angMin = -Math.PI / 2 + (2 * Math.PI) / 3;
  const diffMin = Math.abs(((ang - angMin + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (dist < 0.5 && diffMin < 0.11 && dist > 0.08) return OURO;

  // Marcado central
  if (r < 0.1) return BRANCO;

  return FUNDO;
}

function crc32(buf) {
  let c;
  const tabela = crc32.tabela || (crc32.tabela = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ tabela[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(tipo, dados) {
  const comprimento = Buffer.alloc(4);
  comprimento.writeUInt32BE(dados.length, 0);
  const tipoBuf = Buffer.from(tipo, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tipoBuf, dados])), 0);
  return Buffer.concat([comprimento, tipoBuf, dados, crcBuf]);
}

function gerarPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b] = corDoPixel(x, y, size);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compressao
  ihdr[11] = 0;  // filtro
  ihdr[12] = 0;  // sem entrelacamento

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });

for (const size of [192, 512]) {
  const arquivo = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(arquivo, gerarPng(size));
  console.log(`gerado: ${arquivo}`);
}

// Favicon ICO nao e suportado por PWA; o SVG ja cobre navegadores modernos.
console.log('icones PWA gerados em public/assets/');
