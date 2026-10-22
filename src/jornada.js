// Motor de jornada: interpreta escalas, calcula horas trabalhadas, atrasos,
// saidas antecipadas, horas pendentes e detecta registros inconsistentes.
import { all, get, getConfig } from './db.js';
import { toMinutes, toHHMM, humanMinutes, weekdayOf, daysOfMonth, monthBounds, epochMs, nowLocal, DEFAULT_TZ } from './time.js';

export const TURNOS_PADRAO = [
  { nome: 'Manha', descricao: 'Turno da manha', inicio: '08:00', fim: '14:00' },
  { nome: 'Tarde', descricao: 'Turno da tarde', inicio: '13:00', fim: '19:00' },
  { nome: 'Noite', descricao: 'Turno da noite', inicio: '19:00', fim: '01:00' },
];

export const TOLERANCIA_ATRASO_MIN = 10;
export const TOLERANCIA_SAIDA_MIN = 10;

/**
 * Escala de um usuario.
 * formato: {
 *   jornadaMin: 360,                 // minutos de trabalho efetivo esperados
 *   dias: [1,2,3,4,5],               // dias da semana (0=domingo)
 *   turnos: [{ nome, inicio:'08:00', fim:'14:00', descansoMin: 60, periods: 1 }],
 *   toleranciaAtrasoMin: 10,
 *   toleranciaSaidaMin: 10
 * }
 */
export function escalaDoUsuario(usuario) {
  const padrao = {
    jornadaMin: 360,
    dias: [1, 2, 3, 4, 5],
    turnos: [{ nome: 'Padrao', inicio: '08:00', fim: '14:00', descansoMin: 0, periods: 1 }],
    toleranciaAtrasoMin: TOLERANCIA_ATRASO_MIN,
    toleranciaSaidaMin: TOLERANCIA_SAIDA_MIN,
  };
  if (!usuario?.escala_json) return padrao;
  try {
    const e = JSON.parse(usuario.escala_json);
    return {
      ...padrao,
      ...e,
      dias: Array.isArray(e.dias) && e.dias.length ? e.dias : padrao.dias,
      turnos: Array.isArray(e.turnos) && e.turnos.length ? e.turnos : padrao.turnos,
      jornadaMin: Number(e.jornadaMin) > 0 ? Number(e.jornadaMin) : padrao.jornadaMin,
    };
  } catch {
    return padrao;
  }
}

/** Normaliza os turnos em intervalos de trabalho (apos descontar descansos). */
export function janelasDaEscala(escala) {
  const out = [];
  for (const t of escala.turnos) {
    const ini = toMinutes(t.inicio);
    let fim = toMinutes(t.fim);
    if (ini == null || fim == null) continue;
    if (fim <= ini) fim += 24 * 60; // turno que atravessa a meia-noite
    const total = fim - ini;
    const descansos = Math.max(0, Number(t.descansoMin) || 0);
    const periods = Math.min(3, Math.max(1, Number(t.periods) || 1));
    const descansoPorBloco = periods > 1 ? Math.floor(descansos / periods) : descansos;
    const blocoBruto = Math.floor((total - descansos) / periods);
    let cursor = ini;
    for (let i = 0; i < periods; i++) {
      const inicio = i === 0 ? ini : cursor + (periods > 1 ? descansoPorBloco : 0);
      const fimBloco = i === periods - 1 ? fim : inicio + blocoBruto;
      if (fimBloco > inicio) out.push({ inicio, fim: fimBloco, turno: t.nome });
      cursor = fimBloco;
    }
  }
  return out;
}

/** Minutos trabalhados a partir de uma sequencia de pontos ja ordenada. */
export function calcularDoDia(pontos, escala, tz = DEFAULT_TZ) {
  const janelas = janelasDaEscala(escala);
  const ordenados = [...pontos].sort((a, b) => {
    const ta = a.ts ?? epochMs(a.data, a.hora, tz) ?? 0;
    const tb = b.ts ?? epochMs(b.data, b.hora, tz) ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.hora).localeCompare(String(b.hora));
  });

  const entradas = ordenados.filter((p) => p.tipo === 'entrada');
  const saidas = ordenados.filter((p) => p.tipo === 'saida');
  const intervalos = ordenados.filter((p) => p.tipo === 'intervalo_inicio');
  const fimIntervalo = ordenados.filter((p) => p.tipo === 'intervalo_fim');

  let minutosTrabalhados = 0;
  let minutosIntervalo = 0;
  const peridos = [];
  let aberto = null;

  for (const p of ordenados) {
    const m = toMinutes(p.hora);
    if (m == null) continue;
    if (p.tipo === 'entrada' || p.tipo === 'intervalo_fim') {
      if (aberto == null) aberto = m;
    } else if (p.tipo === 'saida' || p.tipo === 'intervalo_inicio') {
      if (aberto != null) {
        const dur = Math.max(0, m - aberto);
        if (p.tipo === 'intervalo_inicio') minutosIntervalo += dur;
        else {
          minutosTrabalhados += dur;
          peridos.push({ inicio: aberto, fim: m });
        }
        aberto = null;
      }
    }
  }
  const emAberto = aberto != null;

  const primeiraEntrada = entradas.length ? ordenados.find((p) => p.tipo === 'entrada').hora : null;
  const ultimaSaida = saidas.length ? [...ordenados].reverse().find((p) => p.tipo === 'saida').hora : null;

  let atrasoMin = 0;
  if (primeiraEntrada && janelas.length) {
    const atrasoBruto = toMinutes(primeiraEntrada) - janelas[0].inicio;
    if (atrasoBruto > (escala.toleranciaAtrasoMin ?? TOLERANCIA_ATRASO_MIN)) atrasoMin = atrasoBruto;
  }
  let saidaAnticipadaMin = 0;
  if (ultimaSaida && janelas.length) {
    const fimPrevisto = janelas[janelas.length - 1].fim;
    const diff = fimPrevisto - toMinutes(ultimaSaida);
    if (diff > (escala.toleranciaSaidaMin ?? TOLERANCIA_SAIDA_MIN)) saidaAnticipadaMin = diff;
  }

  const previstoMin = escala.jornadaMin;
  const realizadoMin = Math.round(minutosTrabalhados);
  const saldoMin = realizadoMin - previstoMin;
  const horasPendentesMin = Math.max(0, previstoMin - realizadoMin);

  const completo = entradas.length > 0 && saidas.length > 0 && !emAberto;
  const consistente = completo && (intervalos.length === fimIntervalo.length);

  return {
    minutos_trabalhados: realizadoMin,
    minutos_intervalo: Math.round(minutosIntervalo),
    minutos_previstos: previstoMin,
    saldo_min: saldoMin,
    horas_pendentes_min: horasPendentesMin,
    atraso_min: atrasoMin,
    saida_anticipada_min: saidaAnticipadaMin,
    entrada: primeiraEntrada,
    saida: ultimaSaida,
    entradas: entradas.length,
    saidas: saidas.length,
    intervalo_inicios: intervalos.length,
    intervalo_fins: fimIntervalo.length,
    completo,
    consistente,
    em_aberto: emAberto,
    status: statusDoDia({ completo, consistente, emAberto, atrasoMin, saidaAnticipadaMin, realizadoMin, previstoMin }),
  };
}

function statusDoDia(d) {
  if (d.emAberto) return 'em_andamento';
  if (!d.completo) return 'incompleto';
  if (!d.consistente) return 'inconsistente';
  if (d.atrasoMin > 0 || d.saidaAnticipadaMin > 0) return 'divergente';
  if (d.realizadoMin < d.previstoMin) return 'horas_pendentes';
  return 'completo';
}

export const STATUS_LABEL = {
  completo: 'Completo',
  em_andamento: 'Em andamento',
  incompleto: 'Incompleto',
  inconsistente: 'Inconsistente',
  divergente: 'Divergente',
  horas_pendentes: 'Horas pendentes',
  ausencia: 'Ausencia justificada',
  falta: 'Falta',
  folga: 'Folga',
};

/** Monta o dia completo de um usuario (pontos + ausencia + status). */
export async function diaDoUsuario(usuario, data, pontos = null, ausencia = null) {
  const escala = escalaDoUsuario(usuario);
  const lista = pontos || await all(
    'SELECT * FROM pontos WHERE usuario_id = ? AND dia_ref = ? ORDER BY hora, id',
    usuario.id, data,
  );
  const aus = ausencia !== undefined && ausencia !== null
    ? ausencia
    : await get('SELECT * FROM ausencias WHERE usuario_id = ? AND data = ? ORDER BY id DESC LIMIT 1', usuario.id, data);

  const calc = calcularDoDia(lista, escala, await getConfig('timezone', DEFAULT_TZ));
  const wd = weekdayOf(data);
  const diaPrevisto = escala.dias.includes(wd);

  const base = {
    data,
    usuario_id: usuario.id,
    pontos: lista.map((p) => ({
      id: p.id, tipo: p.tipo, hora: p.hora, origem: p.origem, status: p.status,
      justificativa: p.justificativa, criado_em: p.criado_em,
    })),
    dia_previsto: diaPrevisto,
    ausencia: aus ? {
      id: aus.id, tipo: aus.tipo, justificativa: aus.justificativa,
      status: aus.status, criado_em: aus.criado_em,
    } : null,
    ...calc,
  };

  if (!diaPrevisto && calc.entradas === 0) {
    base.status = 'folga';
    base.minutos_trabalhados = 0;
    base.saldo_min = 0;
    base.horas_pendentes_min = 0;
  }
  if (aus && aus.status === 'aprovado' && calc.entradas === 0) {
    base.status = aus.tipo === 'falta' ? 'falta' : 'ausencia';
    base.horas_pendentes_min = 0;
    base.saldo_min = 0;
  }
  base.status_label = STATUS_LABEL[base.status] || base.status;
  return base;
}

/** Resumo do mes de um usuario. */
export async function resumoMensal(usuario, mes) {
  const escala = escalaDoUsuario(usuario);
  const bounds = monthBounds(mes);
  if (!bounds) return null;
  const dias = daysOfMonth(mes);

  const fuso = await getConfig('timezone', DEFAULT_TZ);
  const hoje = (await nowLocal(fuso)).data;

  let previsto = 0;
  let previstoDecorrido = 0;
  let trabalhado = 0;
  let diasTrabalhados = 0;
  let atrasos = 0;
  let saidasAnticipadas = 0;
  let horasPendentes = 0;
  let incompletos = 0;
  let divergentes = 0;
  let diasFolga = 0;
  let faltas = 0;
  let ausencias = 0;
  const inconsistencias = [];

  for (const data of dias) {
    const wd = weekdayOf(data);
    const diaPrevisto = escala.dias.includes(wd);
    if (diaPrevisto) previsto += escala.jornadaMin;

    // Dias que ainda nao aconteceram nao entram nos indicadores do periodo.
    if (data > hoje) continue;
    if (diaPrevisto) previstoDecorrido += escala.jornadaMin;

    const dia = await diaDoUsuario(usuario, data);
    trabalhado += dia.minutos_trabalhados;

    if (dia.entradas > 0) diasTrabalhados += 1;
    if (!diaPrevisto && dia.entradas === 0) diasFolga += 1;
    if (dia.atraso_min > 0) atrasos += 1;
    if (dia.saida_anticipada_min > 0) saidasAnticipadas += 1;
    if (dia.status === 'incompleto' || dia.status === 'inconsistente' || dia.status === 'em_andamento') {
      incompletos += 1;
      if (dia.status !== 'em_andamento') inconsistencias.push({ data, status: dia.status });
    }
    if (dia.status === 'divergente') divergentes += 1;
    if (dia.status === 'falta') faltas += 1;
    if (dia.status === 'ausencia') ausencias += 1;
    if (diaPrevisto && dia.entradas === 0 && !dia.ausencia && dia.status !== 'em_andamento') {
      horasPendentes += escala.jornadaMin;
      if (!inconsistencias.find((i) => i.data === data)) {
        inconsistencias.push({ data, status: 'sem_registro' });
      }
    }
  }

  return {
    mes,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    horas_previstas_min: previsto,
    horas_previstas_decorridas_min: previstoDecorrido,
    horas_registradas_min: trabalhado,
    horas_efetivas_min: trabalhado,
    saldo_min: trabalhado - previstoDecorrido,
    dias_trabalhados: diasTrabalhados,
    dias_previstos: dias.filter((d) => escala.dias.includes(weekdayOf(d))).length,
    dias_folga: diasFolga,
    atrasos,
    saidas_antecipadas: saidasAnticipadas,
    horas_pendentes_min: horasPendentes,
    registros_incompletos: incompletos,
    divergencias: divergentes,
    faltas,
    ausencias,
    inconsistencias,
    horas_previstas: toHHMM(previsto),
    horas_registradas: toHHMM(trabalhado),
    saldo: toHHMM(trabalhado - previstoDecorrido),
  };
}

export { toHHMM, humanMinutes };
