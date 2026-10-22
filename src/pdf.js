// Gerador de PDF em Node puro (sem dependencias externas).
// Suporta: paginas A4, texto Helvetica/Bold, cores, linhas, retangulos, tabelas e imagens.

import zlib from 'node:zlib';

const PAGE = { width: 595.28, height: 841.89 }; // A4 em pontos
const MARGIN = 40;

// Azul institucional Codeon (#002ef6)
export const CODEON_BLUE = [0, 46 / 255, 246 / 255];

const FONTS = {
  regular: 'F1',
  bold: 'F2',
  italic: 'F3',
};

class PDFBuilder {
  constructor(opts = {}) {
    this.title = opts.title || 'Relatorio';
    this.author = opts.author || 'Codeon Agency';
    this.subject = opts.subject || '';
    this.pages = [];
    this.current = null;
    // Imagens registradas: { nome, dados, largura, altura, larguraPx, alturaPx }
    this.images = new Map();
    this.addPage();
  }

  /**
   * Registra uma imagem RGB (sem compressao) como XObject.
   * dados: Buffer RGB, width x height.
   */
  registerImage(nome, { dados, largura, altura }) {
    this.images.set(nome, { nome, dados, largura, altura });
    return nome;
  }

  /** Desenha uma imagem registrada. */
  drawImage(nome, x, y, largura, altura) {
    const img = this.images.get(nome);
    if (!img) return;
    this.page.ops.push(
      `q ${largura.toFixed(2)} 0 0 ${altura.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${nome} Do Q`,
    );
  }

  addPage() {
    this.current = { ops: [], y: PAGE.height - MARGIN, pageNumber: this.pages.length + 1 };
    this.pages.push(this.current);
    return this.current;
  }

  get page() { return this.current; }

  ensureSpace(needed) {
    if (this.current.y - needed < MARGIN + 24) {
      this.addPage();
      return true;
    }
    return false;
  }

  // ---------- primitivas ----------

  text(str, x, y, opts = {}) {
    const {
      size = 10, font = 'regular', color = [0, 0, 0], align = 'left', width = null,
    } = opts;
    const s = String(str ?? '');
    const fontRef = FONTS[font] || FONTS.regular;
    const w = this.textWidth(s, size, font);
    let tx = x;
    if (align === 'center' && width) tx = x + (width - w) / 2;
    else if (align === 'right' && width) tx = x + width - w;
    this.page.ops.push(
      `BT ${this.colorOp(color)} /${fontRef} ${size} Tf 1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(s)}) Tj ET`,
    );
    return w;
  }

  colorOp([r, g, b]) {
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`;
  }

  strokeColorOp([r, g, b]) {
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`;
  }

  rect(x, y, w, h, opts = {}) {
    const { fill = null, stroke = null, lineWidth = 0.6 } = opts;
    const parts = [];
    if (fill) parts.push(this.colorOp(fill));
    if (stroke) parts.push(this.strokeColorOp(stroke));
    parts.push(`${lineWidth} w`);
    parts.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fill && stroke) parts.push('B');
    else if (fill) parts.push('f');
    else parts.push('S');
    this.page.ops.push(parts.join(' '));
  }

  line(x1, y1, x2, y2, opts = {}) {
    const { color = [0.75, 0.75, 0.78], width = 0.6, dash = null } = opts;
    const d = dash ? `[${dash.join(' ')}] 0 d ` : '[] 0 d ';
    this.page.ops.push(
      `${this.strokeColorOp(color)} ${width} w ${d}${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }

  /**
   * Desenha um path a partir de uma lista de comandos:
   *   { op: 'm', x, y } | { op: 'l', x, y } | { op: 'c', x1, y1, x2, y2, x, y }
   */
  path(cmds, opts = {}) {
    const { fill = null, stroke = null, width = 1, close = false } = opts;
    const partes = [];
    if (fill) partes.push(this.colorOp(fill));
    if (stroke) partes.push(this.strokeColorOp(stroke));
    if (stroke) partes.push(`${width} w`);
    const ops = [];
    for (const c of cmds) {
      if (c.op === 'm') ops.push(`${c.x.toFixed(2)} ${c.y.toFixed(2)} m`);
      else if (c.op === 'l') ops.push(`${c.x.toFixed(2)} ${c.y.toFixed(2)} l`);
      else if (c.op === 'c') {
        ops.push(`${c.x1.toFixed(2)} ${c.y1.toFixed(2)} ${c.x2.toFixed(2)} ${c.y2.toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)} c`);
      }
    }
    if (close) ops.push('h');
    partes.push(ops.join(' '));
    if (fill && stroke) partes.push('B');
    else if (fill) partes.push('f');
    else partes.push('S');
    this.page.ops.push(partes.join(' '));
  }

  // ---------- texto medido (aproximacao Helvetica) ----------

  textWidth(str, size, font = 'regular') {
    return measure(str, size, font);
  }

  wrap(str, size, maxWidth, font = 'regular') {
    const words = String(str ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (this.textWidth(test, size, font) <= maxWidth || !cur) cur = test;
      else { lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  paragraph(str, x, y, opts = {}) {
    const { size = 10, font = 'regular', color = [0, 0, 0], maxWidth = PAGE.width - MARGIN * 2, leading = 1.35 } = opts;
    const lines = this.wrap(str, size, maxWidth, font);
    let cy = y;
    for (const line of lines) {
      this.text(line, x, cy, { size, font, color });
      cy -= size * leading;
    }
    return cy;
  }

  // ---------- serializacao ----------

  build() {
    // Numeros de objeto atribuidos de forma deterministica:
    // 1 catalogo, 2 paginas, 3-5 fontes, 6 info, 7..(6+n) conteudos, depois paginas.
    const n = this.pages.length;
    const CATALOG = 1;
    const PAGES = 2;
    const FONT_R = 3;
    const FONT_B = 4;
    const FONT_I = 5;
    const INFO = 6;
    const CONTENT_BASE = 7;
    const PAGE_BASE = CONTENT_BASE + n;
    const IMAGE_BASE = PAGE_BASE + n;

    const imagens = [...this.images.values()];
    const totalObjetos = IMAGE_BASE + imagens.length - 1;

    const objects = new Array(Math.max(totalObjetos, PAGE_BASE + n - 1) + 1).fill(null);
    objects[CATALOG - 1] = `<< /Type /Catalog /Pages ${PAGES} 0 R >>`;
    objects[PAGES - 1] = `<< /Type /Pages /Count ${n} /Kids [${Array.from({ length: n }, (_, i) => `${PAGE_BASE + i} 0 R`).join(' ')}] >>`;
    objects[FONT_R - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[FONT_B - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[FONT_I - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
    objects[INFO - 1] = `<< /Title (${escapePdf(this.title)}) /Author (${escapePdf(this.author)}) `
      + `/Subject (${escapePdf(this.subject)}) /Creator (${escapePdf(this.author)}) /Producer (Codeon Ponto) >>`;

    // Imagens
    const xobjectRefs = [];
    imagens.forEach((img, i) => {
      const objNum = IMAGE_BASE + i;
      xobjectRefs.push(`/${img.nome} ${objNum} 0 R`);
      const comprimido = zlib.deflateSync(Buffer.from(img.dados), { level: 9 });
      objects[objNum - 1] = {
        tipo: 'imagem',
        cabecalho: `<< /Type /XObject /Subtype /Image /Width ${img.largura} /Height ${img.altura} `
          + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode `
          + `/Length ${comprimido.length} >>\nstream\n`,
        stream: comprimido,
      };
    });

    this.pages.forEach((p, i) => {
      const stream = p.ops.join('\n');
      objects[CONTENT_BASE + i - 1] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
      const recursos = xobjectRefs.length
        ? ` /XObject << ${xobjectRefs.join(' ')} >>`
        : '';
      objects[PAGE_BASE + i - 1] = `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] `
        + `/Resources << /Font << /F1 ${FONT_R} 0 R /F2 ${FONT_B} 0 R /F3 ${FONT_I} 0 R >>${recursos} >> `
        + `/Contents ${CONTENT_BASE + i} 0 R >>`;
    });

    // Montagem binaria (as imagens exigem bytes crus).
    const partes = [];
    let tamanho = 0;
    const push = (buf) => { partes.push(buf); tamanho += buf.length; };
    const offsets = [0];

    push(Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1'));
    for (let i = 0; i < objects.length; i++) {
      if (!objects[i]) continue;
      offsets[i + 1] = tamanho;
      if (typeof objects[i] === 'string') {
        push(Buffer.from(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`, 'latin1'));
      } else {
        // O cabecalho ja termina em "stream\n" - nao acrescentar nada entre
        // o cabecalho e os bytes do stream, ou o zlib deixa de ser valido.
        push(Buffer.from(`${i + 1} 0 obj\n${objects[i].cabecalho}`, 'latin1'));
        push(objects[i].stream);
        push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
      }
    }

    const totalRefs = objects.length;
    const xrefPos = tamanho;
    let xref = `xref\n0 ${totalRefs + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= totalRefs; i++) {
      xref += `${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${totalRefs + 1} /Root ${CATALOG} 0 R /Info ${INFO} 0 R >>\n`;
    xref += `startxref\n${xrefPos}\n%%EOF\n`;
    push(Buffer.from(xref, 'latin1'));

    return Buffer.concat(partes);
  }
}

// --------------------------------------------------------------- metricas

const CHAR_W = { regular: 0.5, bold: 0.556, italic: 0.5 };
const NARROW = new Set(['i', 'l', 'j', 'I', 't', 'f', 'r', '(', ')', '[', ']', '/', ' ', '.', ',', ':', ';', "'", '!', '|']);
const WIDE = new Set(['W', 'M', '@', '%', 'm', 'w']);

function measure(str, size, font = 'regular') {
  const base = CHAR_W[font] ?? 0.5;
  let total = 0;
  for (const ch of String(str)) {
    let f = base;
    if (WIDE.has(ch)) f = base * 1.9;
    else if (NARROW.has(ch)) f = base * 0.42;
    else if (ch >= 'A' && ch <= 'Z') f = base * 1.02;
    total += f;
  }
  return total * size;
}

// Caracteres fora do Latin-1 sao transliterados: a fonte Helvetica usa
// WinAnsiEncoding e nao representa em-dash, bullets, setas e afins.
const TRANSLITERACAO = {
  '—': '-', '–': '-', '‒': '-', '−': '-',
  '·': '-', '•': '-', '●': '-', '◦': '-',
  '…': '...', '→': '->', '←': '<-', '↔': '<->',
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
  ' ': ' ', '‑': '-', ' ': ' ', ' ': ' ',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x',
  '≠': '!=', '≤': '<=', '≥': '>=', '×': 'x', '÷': '/',
  '≥': '>=', '≥': '>=', '±': '+/-', 'º': 'o', 'ª': 'a',
  '€': 'EUR', '£': 'GBP', '™': '(TM)', '®': '(R)',
};

function escapePdf(s) {
  let out = '';
  for (const ch of String(s)) {
    if (ch in TRANSLITERACAO) { out += TRANSLITERACAO[ch]; continue; }
    const code = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code < 32) out += ' ';
    else if (code > 255) out += '?';
    else out += ch;
  }
  return out;
}

export { PDFBuilder, PAGE, MARGIN, measure };
