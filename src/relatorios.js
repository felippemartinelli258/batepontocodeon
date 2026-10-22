// Geracao de relatorios em PDF (mensal individual e consolidado da equipe).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFBuilder, PAGE, MARGIN, CODEON_BLUE } from './pdf.js';
import { decodificarPNG, paraRGBChapado } from './png.js';
import { all, get, getConfig } from './db.js';
import { resumoMensal, diaDoUsuario, STATUS_LABEL } from './jornada.js';
import { monthLabel, daysOfMonth, WEEKDAY_NAMES, weekdayOf, toHHMM, humanMinutes, nowLocal, DEFAULT_TZ } from './time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, '..', 'public', 'assets');

const BRAND = {
  ink: [0.07, 0.08, 0.11],
  muted: [0.42, 0.45, 0.50],
  line: [0.87, 0.88, 0.90],
  soft: [0.97, 0.97, 0.98],
  accent: CODEON_BLUE,
  white: [1, 1, 1],
  ok: [0.09, 0.55, 0.36],
  warn: [0.78, 0.52, 0.07],
  bad: [0.75, 0.20, 0.20],
};

const RGB_AZUL = [0, 46, 246];

/**
 * Carrega o monograma da Codeon e o prepara como imagem RGB chapada na cor
 * branca, para estampar sobre a faixa azul do cabecalho.
 */
function carregarMonogramaBranco() {
  try {
    const arquivo = path.join(ASSETS, 'logo-mono.png');
    if (!fs.existsSync(arquivo)) return null;
    const png = decodificarPNG(fs.readFileSync(arquivo));
    const dados = paraRGBChapado(png, RGB_AZUL, [255, 255, 255]);
    return { dados, largura: png.largura, altura: png.altura };
  } catch {
    return null;
  }
}

function header(pdf, titulo, subtitulo, nomeAgencia) {
  pdf.rect(0, PAGE.height - 92, PAGE.width, 92, { fill: BRAND.accent });

  let xLogo = MARGIN;
  if (pdf.images.has('LogoMono')) {
    const img = pdf.images.get('LogoMono');
    const altura = 34;
    const largura = (img.largura / img.altura) * altura;
    pdf.drawImage('LogoMono', MARGIN, PAGE.height - 62, largura, altura);
    xLogo = MARGIN + largura + 12;
  }

  pdf.text(String(nomeAgencia || 'CODEON AGENCY').toUpperCase(), xLogo, PAGE.height - 40, { size: 15, font: 'bold', color: BRAND.white });
  pdf.text('Sistema Interno de Registro de Ponto', xLogo, PAGE.height - 56, { size: 9, color: [0.85, 0.88, 0.95] });
  pdf.text(titulo, PAGE.width - MARGIN, PAGE.height - 40, { size: 12, font: 'bold', color: BRAND.white, align: 'right', width: 260 });
  pdf.text(subtitulo, PAGE.width - MARGIN, PAGE.height - 56, { size: 9, color: [0.85, 0.88, 0.95], align: 'right', width: 260 });
  pdf.y = PAGE.height - 120;
}

function footer(pdf, texto) {
  const total = pdf.pages.length;
  pdf.pages.forEach((p, i) => {
    const saved = pdf.current;
    pdf.current = p;
    p.y = 36;
    pdf.line(MARGIN, 46, PAGE.width - MARGIN, 46, { color: BRAND.line });
    pdf.text(texto || 'Relatorio de frequencia', MARGIN, 32, { size: 7.5, color: BRAND.muted });
    pdf.text(`Pagina ${i + 1} de ${total}`, PAGE.width - MARGIN, 32, { size: 7.5, color: BRAND.muted, align: 'right', width: 120 });
    pdf.current = saved;
  });
}

function sectionTitle(pdf, titulo) {
  pdf.ensureSpace(40);
  pdf.text(titulo, MARGIN, pdf.y, { size: 11, font: 'bold', color: BRAND.ink });
  pdf.y -= 8;
  pdf.line(MARGIN, pdf.y, PAGE.width - MARGIN, pdf.y, { color: BRAND.ink, width: 0.8 });
  pdf.y -= 16;
}

function kpiRow(pdf, kpis) {
  const gap = 10;
  const w = (PAGE.width - MARGIN * 2 - gap * (kpis.length - 1)) / kpis.length;
  const H = 46;
  pdf.ensureSpace(56);
  const y = pdf.y - H;
  kpis.forEach((k, i) => {
    const x = MARGIN + i * (w + gap);
    pdf.rect(x, y, w, H, { fill: BRAND.soft, stroke: BRAND.line });
    pdf.rect(x, y, w, 2.5, { fill: BRAND.accent });
    // Rotulo em uma ou duas linhas, com reduction de corpo se nao couber.
    const label = String(k.label).toUpperCase();
    let size = 7;
    let lines = pdf.wrap(label, size, w - 20, 'bold');
    while (lines.length > 2 && size > 5.4) {
      size -= 0.3;
      lines = pdf.wrap(label, size, w - 20, 'bold');
    }
    lines = lines.slice(0, 2);
    lines.forEach((ln, li) => {
      pdf.text(ln, x + 10, y + H - 14 - li * (size + 1.6), { size, font: 'bold', color: BRAND.muted });
    });
    pdf.text(k.value, x + 10, y + 11, { size: 13, font: 'bold', color: k.color || BRAND.ink });
  });
  pdf.y = y - 14;
}

function table(pdf, headers, rows, widths, opts = {}) {
  const { aligns = [], fontSize = 8.5, rowHeight = 16, colors = [] } = opts;
  const totalW = widths.reduce((a, b) => a + b, 0);
  const scale = (PAGE.width - MARGIN * 2) / totalW;
  const w = widths.map((x) => x * scale);

  const drawHead = () => {
    pdf.rect(MARGIN, pdf.y - rowHeight, PAGE.width - MARGIN * 2, rowHeight, { fill: BRAND.accent });
    let x = MARGIN;
    headers.forEach((hd, i) => {
      pdf.text(hd, x + 5, pdf.y - 11, {
        size: 7.5, font: 'bold', color: BRAND.white,
        align: aligns[i] || 'left', width: w[i] - 10,
      });
      x += w[i];
    });
    pdf.y -= rowHeight;
  };

  pdf.ensureSpace(rowHeight * 3);
  drawHead();

  rows.forEach((row, ri) => {
    if (pdf.y - rowHeight < MARGIN + 30) {
      pdf.addPage();
      pdf.y = PAGE.height - MARGIN;
      drawHead();
    }
    if (ri % 2 === 1) pdf.rect(MARGIN, pdf.y - rowHeight, PAGE.width - MARGIN * 2, rowHeight, { fill: BRAND.soft });
    let x = MARGIN;
    row.forEach((cell, i) => {
      const color = (colors[ri] && colors[ri][i]) || BRAND.ink;
      pdf.text(cell, x + 5, pdf.y - 11, {
        size: fontSize, color, align: aligns[i] || 'left', width: w[i] - 10,
      });
      x += w[i];
    });
    pdf.line(MARGIN, pdf.y - rowHeight, PAGE.width - MARGIN, pdf.y - rowHeight, { color: BRAND.line, width: 0.4 });
    pdf.y -= rowHeight;
  });
  pdf.y -= 10;
}

function statusColor(status) {
  if (['completo', 'folga'].includes(status)) return BRAND.ok;
  if (['divergente', 'atraso'].includes(status)) return BRAND.warn;
  if (['incompleto', 'inconsistente', 'falta', 'em_andamento'].includes(status)) return BRAND.bad;
  return BRAND.muted;
}

// --------------------------------------------------- relatorio individual

export async function relatorioIndividual(usuario, mes, opts = {}) {
  const resumo = await resumoMensal(usuario, mes);
  const pdf = new PDFBuilder({
    title: `Relatorio de ponto - ${usuario.nome} - ${monthLabel(mes)}`,
    author: 'Codeon Agency',
    subject: 'Relatorio mensal de frequencia',
  });
  const mono = carregarMonogramaBranco();
  if (mono) pdf.registerImage('LogoMono', mono);

  header(pdf, 'Relatorio Mensal de Frequencia', monthLabel(mes), await getConfig('nome_agencia', 'Codeon Agency'));
  pdf.text(usuario.nome, MARGIN, pdf.y, { size: 14, font: 'bold', color: BRAND.ink });
  pdf.y -= 15;
  pdf.text(`${usuario.cargo || 'Sem cargo definido'}  |  Vinculo: ${usuario.vinculo}  |  Periodo: ${monthLabel(mes)}`,
    MARGIN, pdf.y, { size: 9, color: BRAND.muted });
  pdf.y -= 24;

  kpiRow(pdf, [
    { label: 'Previstas no mes', value: toHHMM(resumo.horas_previstas_min) },
    { label: 'Horas registradas', value: toHHMM(resumo.horas_registradas_min) },
    { label: 'Saldo ate hoje', value: toHHMM(resumo.saldo_min), color: resumo.saldo_min < 0 ? BRAND.bad : BRAND.ok },
    { label: 'Dias trabalhados', value: String(resumo.dias_trabalhados) },
    { label: 'Atrasos', value: String(resumo.atrasos), color: resumo.atrasos ? BRAND.warn : BRAND.ink },
  ]);

  sectionTitle(pdf, 'Indicadores do periodo');
  const ind = [
    ['Dias previsto na escala', String(resumo.dias_previstos)],
    ['Horas previstas ate a data de emissao', toHHMM(resumo.horas_previstas_decorridas_min)],
    ['Dias efetivamente trabalhados', String(resumo.dias_trabalhados)],
    ['Atrasos registrados', String(resumo.atrasos)],
    ['Saidas antecipadas', String(resumo.saidas_antecipadas)],
    ['Horas pendentes', humanMinutes(resumo.horas_pendentes_min)],
    ['Registros incompletos', String(resumo.registros_incompletos)],
    ['Divergencias de jornada', String(resumo.divergencias)],
    ['Faltas / Ausencias justificadas', `${resumo.faltas} / ${resumo.ausencias}`],
    ['Folgas na escala', String(resumo.dias_folga)],
  ];
  table(pdf, ['Indicador', 'Valor'], ind.map(([a, b]) => [a, b]), [70, 30], { aligns: ['left', 'right'] });

  sectionTitle(pdf, 'Detalhamento por dia');
  const dias = daysOfMonth(mes);
  const hoje = (await nowLocal(await getConfig('timezone', DEFAULT_TZ))).data;
  const rows = [];
  const colors = [];
  for (const data of dias) {
    if (data > hoje) break;
    const dia = await diaDoUsuario(usuario, data);
    if (!dia.dia_previsto && dia.entradas === 0 && !dia.ausencia) continue;
    const wd = WEEKDAY_NAMES[weekdayOf(data)].slice(0, 3);
    const pts = dia.pontos.map((p) => `${labelTipo(p.tipo)} ${p.hora}`).join('  ');
    rows.push([
      `${data.slice(8)}/${data.slice(5, 7)}`,
      wd,
      dia.entrada || '—',
      dia.saida || '—',
      dia.minutos_intervalo ? `${Math.round(dia.minutos_intervalo)}min` : '—',
      toHHMM(dia.minutos_trabalhados),
      toHHMM(dia.saldo_min),
      dia.ausencia ? (dia.ausencia.tipo === 'falta' ? 'Falta' : 'Ausencia') : (STATUS_LABEL[dia.status] || dia.status),
    ]);
    colors.push([BRAND.muted, BRAND.muted, BRAND.ink, BRAND.ink, BRAND.muted, BRAND.ink,
      dia.saldo_min < 0 ? BRAND.bad : BRAND.ok, statusColor(dia.status)]);
  }
  if (!rows.length) rows.push(['—', '—', '—', '—', '—', '—', '—', 'Sem registros no periodo']);
  table(pdf, ['Data', 'Dia', 'Entrada', 'Saida', 'Int.', 'Trab.', 'Saldo', 'Situacao'], rows,
    [12, 8, 13, 13, 11, 13, 13, 24],
    { aligns: ['left', 'left', 'left', 'left', 'right', 'right', 'right', 'left'], colors });

  const justificativas = await all(
    'SELECT a.*, u.nome FROM ausencias a JOIN usuarios u ON u.id = a.usuario_id '
    + 'WHERE a.usuario_id = ? AND a.data LIKE ? ORDER BY a.data',
    usuario.id, `${mes}%`,
  );
  if (justificativas.length) {
    sectionTitle(pdf, 'Ausencias e justificativas');
    table(pdf, ['Data', 'Tipo', 'Status', 'Justificativa'], justificativas.map((j) => [
      j.data, j.tipo === 'falta' ? 'Falta' : 'Ausencia', j.status, j.justificativa || '—',
    ]), [14, 12, 14, 60], { aligns: ['left', 'left', 'left', 'left'] });
  }

  const inconsistent = resumo.inconsistencias;
  if (inconsistent.length) {
    sectionTitle(pdf, 'Registros a regularizar');
    table(pdf, ['Data', 'Problema'], inconsistent.map((i) => [
      i.data,
      i.status === 'sem_registro' ? 'Dia sem qualquer registro de ponto' : (STATUS_LABEL[i.status] || i.status),
    ]), [20, 80]);
  }

  footer(pdf, `${await getConfig('nome_agencia', 'Codeon Agency')} - Relatorio de ${usuario.nome} - ${monthLabel(mes)} - gerado em ${new Date().toLocaleString('pt-BR')}`);
  return pdf.build();
}

function labelTipo(tipo) {
  return {
    entrada: 'Entrada',
    saida: 'Saida',
    intervalo_inicio: 'Int.',
    intervalo_fim: 'Fim Int.',
  }[tipo] || tipo;
}

// --------------------------------------------------- relatorio consolidado

export async function relatorioConsolidado(mes, usuarios, opts = {}) {
  const pdf = new PDFBuilder({
    title: `Relatorio consolidado - ${monthLabel(mes)}`,
    author: 'Codeon Agency',
    subject: 'Relatorio mensal consolidado da equipe',
  });
  const mono = carregarMonogramaBranco();
  if (mono) pdf.registerImage('LogoMono', mono);

  header(pdf, 'Relatorio Consolidado da Equipe', monthLabel(mes), await getConfig('nome_agencia', 'Codeon Agency'));

  const resumos = [];
  for (const u of usuarios) resumos.push(await resumoMensal(u, mes));
  const totPrev = resumos.reduce((a, r) => a + r.horas_previstas_min, 0);
  const totReg = resumos.reduce((a, r) => a + r.horas_registradas_min, 0);
  const totAtrasos = resumos.reduce((a, r) => a + r.atrasos, 0);
  const totIncompletos = resumos.reduce((a, r) => a + r.registros_incompletos, 0);

  kpiRow(pdf, [
    { label: 'Colaboradores', value: String(usuarios.length) },
    { label: 'Previstas no mes', value: toHHMM(totPrev) },
    { label: 'Horas registradas', value: toHHMM(totReg) },
    { label: 'Atrasos', value: String(totAtrasos), color: totAtrasos ? BRAND.warn : BRAND.ink },
    { label: 'Registros incompletos', value: String(totIncompletos), color: totIncompletos ? BRAND.bad : BRAND.ink },
  ]);

  sectionTitle(pdf, 'Resumo por colaborador');
  const rows = [];
  const colors = [];
  for (const r of resumos) {
    rows.push([
      r.usuario_nome,
      toHHMM(r.horas_previstas_min),
      toHHMM(r.horas_registradas_min),
      toHHMM(r.saldo_min),
      String(r.dias_trabalhados),
      String(r.atrasos),
      String(r.registros_incompletos),
      String(r.faltas + r.ausencias),
    ]);
    colors.push([BRAND.ink, BRAND.muted, BRAND.ink, r.saldo_min < 0 ? BRAND.bad : BRAND.ok,
      BRAND.ink, r.atrasos ? BRAND.warn : BRAND.muted, r.registros_incompletos ? BRAND.bad : BRAND.muted,
      (r.faltas + r.ausencias) ? BRAND.warn : BRAND.muted]);
  }
  if (!rows.length) rows.push(['Sem colaboradores no periodo', '—', '—', '—', '—', '—', '—', '—']);
  table(pdf, ['Colaborador', 'Previstas', 'Registradas', 'Saldo', 'Dias', 'Atrasos', 'Incompl.', 'Faltas'], rows,
    [34, 13, 14, 13, 9, 11, 12, 10],
    { aligns: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'], colors });

  sectionTitle(pdf, 'Justificativas de ausencias do periodo');
  const ausencias = await all(
    'SELECT a.*, u.nome FROM ausencias a JOIN usuarios u ON u.id = a.usuario_id '
    + 'WHERE a.data LIKE ? ORDER BY a.data, u.nome',
    `${mes}%`,
  );
  if (ausencias.length) {
    table(pdf, ['Data', 'Colaborador', 'Tipo', 'Status', 'Justificativa'], ausencias.map((a) => [
      a.data, a.nome, a.tipo === 'falta' ? 'Falta' : 'Ausencia', a.status, a.justificativa || '—',
    ]), [12, 24, 10, 12, 42], { aligns: ['left', 'left', 'left', 'left', 'left'] });
  } else {
    pdf.text('Nenhuma ausencia registrada no periodo.', MARGIN, pdf.y, { size: 9, color: BRAND.muted });
    pdf.y -= 16;
  }

  const incompletes = [];
  for (const r of resumos) {
    for (const i of r.inconsistencias) {
      incompletes.push([
        r.usuario_nome, i.data,
        i.status === 'sem_registro' ? 'Sem registro de ponto' : (STATUS_LABEL[i.status] || i.status),
      ]);
    }
  }
  if (incompletes.length) {
    sectionTitle(pdf, 'Registros incompletos e inconsistencias');
    table(pdf, ['Colaborador', 'Data', 'Problema'], incompletes,
      [34, 16, 50]);
  }

  footer(pdf, `${await getConfig('nome_agencia', 'Codeon Agency')} - Relatorio consolidado - ${monthLabel(mes)} - gerado em ${new Date().toLocaleString('pt-BR')}`);
  return pdf.build();
}
