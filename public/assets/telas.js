// Telas do sistema.
import {
  el, clear, icon, ICONS, api, get, post, put, del, toast, modal, confirmar,
  hhmm, duracao, dataBR, dataHoraBR, mesBR, statusBadge, initials, state,
} from './api.js';

// ---------------------------------------------------------------------------
// Nota: `modal` vem de api.js; `confirmar` tambem. Mantidos aqui para uso
// da tela de ponto.
// ---------------------------------------------------------------------------

// ============================================================ TELA: LOGIN

export function telaLogin(app, aoEntrar) {
  const erro = el('div', { class: 'alert alert-error', style: 'display:none' });
  const email = el('input', { class: 'input', type: 'email', name: 'email', autocomplete: 'username', placeholder: 'voce@codeon.agency', required: true });
  const senha = el('input', { class: 'input', type: 'password', name: 'senha', autocomplete: 'current-password', placeholder: '••••••••', required: true });
  const btn = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Entrar');

  const form = el('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      erro.style.display = 'none';
      btn.disabled = true;
      clear(btn);
      btn.appendChild(el('span', { class: 'spinner' }));
      try {
        const r = await post('/api/auth/login', { email: email.value.trim(), senha: senha.value });
        state.usuario = r.usuario;
        aoEntrar(r.usuario);
      } catch (e) {
        erro.textContent = e.message;
        erro.style.display = 'block';
        btn.disabled = false;
        clear(btn);
        btn.textContent = 'Entrar';
        senha.focus();
        senha.select();
      }
    },
  },
    erro,
    el('div', { class: 'field' }, el('label', { for: 'email', text: 'E-mail ou identificador de acesso' }), email),
    el('div', { class: 'field' }, el('label', { for: 'senha', text: 'Senha' }), senha),
    btn,
  );

  const cfg = state.config || {};
  const logoSrc = cfg.logo_url || '/assets/logo-full.png';
  // Logo completa sobre fundo branco (login claro) e versao monocromatica no painel azul.
  const logo = el('img', { src: logoSrc, alt: cfg.nome_agencia || 'Codeon Agency', class: 'marca-logo' });

  const destaques = [
    'Registro automatico de entrada, saida e intervalos',
    'Jornada configuravel por turno e por periodo',
    'Solicitacoes de correcao com justificativa e aprovacao',
    'Relatorios mensais em PDF para a equipe',
  ];
  const listaDestaques = el('ul', { class: 'login-points' });
  for (const t of destaques) {
    listaDestaques.appendChild(el('li', {}, icon(ICONS.check, 15), el('span', { text: t })));
  }

  const textoLateral = el('div', {},
    el('h1', { text: 'Controle de ponto da Codeon Agency' }),
    el('p', { text: 'Registro de jornada, acompanhamento de frequencia e relatorios consolidados em um unico lugar.' }),
    listaDestaques);

  const lateral = el('aside', { class: 'login-aside' },
    el('div', { class: 'logo-lg' }, el('img', { src: '/assets/logo-mono.png', alt: '', class: 'marca-mono-branca' })),
    textoLateral,
    el('footer', { text: 'Sistema interno de registro de ponto - acesso restrito a equipe autorizada.' }));

  const principal = el('main', { class: 'login-main' },
    el('div', { class: 'login-card' },
      el('div', { class: 'login-logo-mobile' }, el('img', { src: logoSrc, alt: cfg.nome_agencia || 'Codeon Agency', class: 'marca-logo' })),
      el('h2', { text: 'Acessar o sistema' }),
      el('p', { text: 'Informe suas credenciais para registrar seu ponto.' }),
      form));

  return el('div', { class: 'login-wrap' }, lateral, principal);
}

// ================================================== TELA: PAINEL DE PONTO

export async function telaPonto(ctx) {
  const { usuario, ir } = ctx;
  const container = el('div', { class: 'stack' });

  const resp = await get('/api/pontos/hoje');
  const dia = resp.dia;
  const agora = resp.agora;
  const mesAtual = agora.data.slice(0, 7);
  const resumo = (await get(`/api/pontos/resumo/${mesAtual}`)).resumo;
  const avisos = (await get('/api/avisos')).avisos || [];
  const solicitacoes = (await get('/api/solicitacoes')).solicitacoes || [];

  container.appendChild(heroPonto(dia, agora, usuario, ir));

  // Resumo rapido do expediente: o que ja foi registrado hoje.
  if (dia.entradas > 0) {
    const emCurso = dia.em_aberto;
    const itens = el('div', { class: 'row', style: 'gap:18px' },
      resumoItem('Entrada', dia.entrada || '—'),
      resumoItem('Saida', dia.saida || (emCurso ? 'em aberto' : '—')),
      resumoItem('Intervalo', dia.minutos_intervalo ? `${dia.minutos_intervalo} min` : '—'),
      resumoItem('Trabalhado', hhmm(dia.minutos_trabalhados), true),
      resumoItem('Previsto', hhmm(dia.minutos_previstos)));
    const corpoResumo = el('div', { class: 'card-body', style: 'padding:14px 18px' }, itens);
    container.appendChild(el('div', { class: 'card' }, corpoResumo));
  }

  container.appendChild(el('div', { class: 'grid grid-4' },
    kpi('Horas registradas hoje', hhmm(dia.minutos_trabalhados), dia.entradas ? 'Expediente iniciado' : 'Sem registro ainda', 'accent'),
    kpi('Saldo do dia', hhmm(dia.saldo_min), `Previsto ${hhmm(dia.minutos_previstos)}`,
      dia.saldo_min < 0 ? 'warn' : 'ok'),
    kpi('Horas no mes', hhmm(resumo.horas_registradas_min), mesBR(mesAtual), 'accent'),
    kpi('Saldo do mes', hhmm(resumo.saldo_min), `Previsto ${hhmm(resumo.horas_previstas_decorridas_min)} ate hoje`,
      resumo.saldo_min < 0 ? 'bad' : 'ok'),
  ));

  const cols = el('div', { class: 'grid grid-2' });
  cols.appendChild(cardTimeline(dia, agora));
  cols.appendChild(cardAvisos(avisos, solicitacoes, ir));
  container.appendChild(cols);

  return container;
}

function resumoItem(rotulo, valor, destaque = false) {
  return el('div', {},
    el('div', {
      class: 'muted',
      style: 'font-size:11px;letter-spacing:.05em;text-transform:uppercase;font-weight:700',
      text: rotulo,
    }),
    el('div', {
      class: 'mono',
      style: `font-size:${destaque ? '17px' : '15px'};font-weight:700;margin-top:2px${destaque ? ';color:var(--brand)' : ''}`,
      text: valor,
    }));
}

function heroPonto(dia, agora, usuario, ir) {
  const horaAgora = agora.hora;
  const aberto = dia.em_aberto;

  const podeEntrada = !dia.completo && !aberto;
  const podeIntervalo = aberto && dia.intervalo_inicios === dia.intervalo_fins;
  const podeFimIntervalo = aberto && dia.intervalo_inicios > dia.intervalo_fins;
  const podeSaida = aberto;

  const registrar = async (tipo, botao) => {
    const rotulos = {
      entrada: 'Registrar entrada',
      intervalo_inicio: 'Iniciar intervalo',
      intervalo_fim: 'Encerrar intervalo',
      saida: 'Encerrar expediente',
    };
    const descricoes = {
      entrada: `Sua entrada sera registrada com o horario atual do servidor (${horaAgora}).`,
      intervalo_inicio: 'O periodo de intervalo comeca agora.',
      intervalo_fim: 'O intervalo termina agora e o trabalho continua.',
      saida: `Seu expediente sera encerrado com o horario atual (${horaAgora}).`,
    };

    // Confirmacao explicita evita toques acidentais no celular.
    modal(rotulos[tipo], el('div', { class: 'stack' },
      el('p', { style: 'font-size:13.5px;color:var(--ink-2);margin:0', text: descricoes[tipo] }),
      el('p', { class: 'hint', style: 'margin:0', text: `Agora: ${horaAgora} - ${dataBR(agora.data)}` })),
    [
      { texto: 'Cancelar', classe: 'btn-outline' },
      {
        texto: 'Confirmar',
        classe: 'btn-primary',
        onClick: async () => {
          if (botao) { botao.disabled = true; botao.classList.add('carregando'); }
          try {
            const r = await post('/api/pontos/registrar', { tipo });
            const hora = r.dia.entrada || r.dia.saida;
            toast(`${rotulos[tipo]} - ${hora}`, 'ok');
            if (navigator.vibrate) navigator.vibrate(40);
            ir('ponto');
          } catch (e) {
            toast(e.message, 'bad');
            if (botao) { botao.disabled = false; botao.classList.remove('carregando'); }
            return false;
          }
        },
      },
    ]);
  };

  const estadoLabel = dia.completo ? 'Expediente encerrado'
    : aberto ? 'Expediente em andamento'
      : 'Expediente nao iniciado';

  const acoes = el('div', { class: 'ponto-actions' },
    btnPonto('entrada', 'Registrar entrada', 'Inicio do expediente', 'checkCircle', podeEntrada, registrar),
    btnPonto('intervalo_inicio', 'Iniciar intervalo', 'Inicio do intervalo', 'coffee', podeIntervalo, registrar),
    btnPonto('intervalo_fim', 'Encerrar intervalo', 'Retorno do intervalo', 'check', podeFimIntervalo, registrar),
    btnPonto('saida', 'Encerrar expediente', 'Fim do expediente', 'logoutIn', podeSaida, registrar),
  );

  return el('section', { class: 'ponto-hero' },
    el('h2', { text: `Ola, ${String(usuario().nome || '').split(' ')[0]}` }),
    el('div', { class: 'when' }, horaAgora),
    el('div', { class: 'meta', text: `${dataBR(agora.data)} - ${estadoLabel}` }),
    acoes);
}

function btnPonto(tipo, titulo, sub, ico, habilitado, aoClicar) {
  const b = el('button', { class: `ponto-btn ${tipo === 'entrada' ? 'accent' : ''}`, disabled: !habilitado },
    el('span', { class: 'ico' }, icon(ICONS[ico] || ICONS.clock, 17)),
    el('span', {}, el('b', { text: titulo }), el('small', { text: sub })));
  b.addEventListener('click', () => aoClicar(tipo, b));
  return b;
}

function cardTimeline(dia, agora) {
  void agora;
  const itens = dia.pontos || [];
  const lista = el('div', { class: 'timeline' });
  if (!itens.length) {
    lista.appendChild(el('div', { class: 'empty' },
      el('div', { class: 'ico' }, icon(ICONS.clock, 20)),
      el('b', { text: 'Nenhum registro hoje' }),
      el('p', { text: 'Registre sua entrada para iniciar o expediente.' })));
  } else {
    for (const p of itens) {
      const kind = p.tipo === 'entrada' ? 'entrada' : p.tipo === 'saida' ? 'saida' : 'intervalo';
      const nome = { entrada: 'Entrada', saida: 'Saida', intervalo_inicio: 'Inicio do intervalo', intervalo_fim: 'Fim do intervalo' }[p.tipo];
      lista.appendChild(el('div', { class: 'tl-item', dataset: { kind } },
        el('div', { class: 'tl-time', text: p.hora }),
        el('div', { class: 'tl-rail' }, el('span', { class: 'tl-dot' })),
        el('div', { class: 'tl-body' },
          el('b', { text: nome }),
          el('p', { text: p.origem === 'correcao' ? 'Correcao aprovada pelo gestor' : p.origem === 'manual' ? 'Registro manual' : 'Registro automatico' }))));
    }
  }

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Linha do tempo de hoje' }),
      el('div', { class: 'right' }, statusBadge(dia.status, dia.status_label))),
    el('div', { class: 'card-body' },
      lista,
      el('div', { class: 'divider' }),
      el('div', { class: 'row', style: 'justify-content:space-between' },
        el('span', { class: 'muted', text: 'Intervalos' }),
        el('b', { class: 'mono', text: `${dia.minutos_intervalo || 0} min` })),
      el('div', { class: 'row', style: 'justify-content:space-between;margin-top:6px' },
        el('span', { class: 'muted', text: 'Trabalhado / previsto' }),
        el('b', { class: 'mono', text: `${hhmm(dia.minutos_trabalhados)} / ${hhmm(dia.minutos_previstos)}` })),
      dia.atraso_min > 0 ? el('div', { class: 'alert alert-warn', style: 'margin:12px 0 0' },
        `Atraso de ${duracao(dia.atraso_min)} em relacao ao inicio previsto.`) : null,
      dia.saida_anticipada_min > 0 ? el('div', { class: 'alert alert-warn', style: 'margin:12px 0 0' },
        `Saida antecipada de ${duracao(dia.saida_anticipada_min)}.`) : null,
      dia.horas_pendentes_min > 0 && dia.completo ? el('div', { class: 'alert alert-info', style: 'margin:12px 0 0' },
        `Faltam ${duracao(dia.horas_pendentes_min)} para completar a jornada do dia.`) : null,
    ));
}

function cardAvisos(avisos, solicitacoes, ir) {
  const pendentes = solicitacoes.filter((s) => s.status === 'pendente').length;
  const corpo = el('div', { class: 'stack', style: 'gap:10px' });
  if (pendentes) {
    corpo.appendChild(el('div', { class: 'alert alert-info', style: 'margin:0' },
      `Voce tem ${pendentes} solicitacao(oes) em analise.`));
  }
  if (!avisos.length) {
    corpo.appendChild(el('div', { class: 'empty' },
      el('div', { class: 'ico' }, icon(ICONS.bell, 20)),
      el('b', { text: 'Nenhum aviso publicado' }),
      el('p', { text: 'Comunicados internos aparecerão aqui.' })));
  } else {
    for (const a of avisos.slice(0, 5)) {
      corpo.appendChild(el('div', {
        style: 'border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px 13px',
      },
        el('b', { text: a.titulo, style: 'display:block;margin-bottom:3px' }),
        el('p', { class: 'muted', text: a.corpo, style: 'font-size:12.5px;white-space:pre-line' }),
        el('p', { class: 'muted', text: dataHoraBR(a.publicado_em), style: 'font-size:11.5px;margin-top:6px' })));
    }
  }
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Avisos e comunicados' }),
      el('div', { class: 'right' }, el('span', { class: 'badge', text: `${avisos.length}` }))),
    el('div', { class: 'card-body' }, corpo));
}

function kpi(label, value, foot, tom) {
  return el('div', { class: `kpi ${tom || ''}` },
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: value }),
    foot ? el('div', { class: 'foot', text: foot }) : null);
}

// ================================================ TELA: MEU HISTORICO

export async function telaHistorico(ctx) {
  const { usuario, ir } = ctx;
  const container = el('div', { class: 'stack' });

  const hoje = (await get('/api/pontos/hoje')).agora.data;
  const mesInicial = hoje.slice(0, 7);
  let mes = ctx.params.mes || mesInicial;

  const tabelaHost = el('div', { class: 'card-body tight' });

  async function carregar() {
    const d = (await get(`/api/pontos/historico?inicio=${mes}-01&fim=${mes}-31`)).dias;
    const resumo = (await get(`/api/pontos/resumo/${mes}`)).resumo;
    clear(tabelaHost);
    tabelaHost.appendChild(tabelaHistorico(d, resumo, ir, mes));
    return { d, resumo };
  }

  const selMes = el('input', { class: 'input', type: 'month', value: mes, style: 'max-width:170px', onchange: (e) => { mes = e.target.value; carregar(); } });

  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Historico de frequencia' }),
      el('div', { class: 'right' }, selMes)),
    tabelaHost));

  await carregar();
  return container;
}

function tabelaHistorico(dias, resumo, ir, mes) {
  const wrap = el('div', { class: 'table-wrap' });
  const linhas = dias.filter((d) => d.dia_previsto || d.entradas > 0 || d.ausencia);

  if (!linhas.length) {
    return el('div', { class: 'empty' },
      el('div', { class: 'ico' }, icon(ICONS.calendar, 20)),
      el('b', { text: 'Sem registros no periodo' }),
      el('p', { text: 'Nao ha registros de ponto nem ausencias neste mes.' }));
  }

  const tb = el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      ...['Data', 'Entrada', 'Saida', 'Intervalo', 'Trabalhado', 'Saldo', 'Situacao', ''].map((h, i) =>
        el('th', { class: i >= 1 && i <= 5 ? 'num' : '', text: h })))),
    el('tbody', {}, ...linhas.map((d) => el('tr', {},
      el('td', { class: 'who', text: dataBR(d.data) }),
      el('td', { class: 'num', text: d.entrada || '—' }),
      el('td', { class: 'num', text: d.saida || '—' }),
      el('td', { class: 'num', text: d.minutos_intervalo ? `${d.minutos_intervalo}min` : '—' }),
      el('td', { class: 'num', text: hhmm(d.minutos_trabalhados) }),
      el('td', { class: `num ${d.saldo_min < 0 ? 'neg' : 'pos'}`, text: hhmm(d.saldo_min) }),
      el('td', {}, statusBadge(d.status, d.status_label)),
      el('td', { class: 'num' }, el('button', {
        class: 'btn btn-outline btn-sm',
        onclick: () => abrirSolicitacao(d.data),
      }, 'Corrigir'))))));

  wrap.appendChild(tb);
  return wrap;
}

function abrirSolicitacao(data) {
  const dataInput = el('input', { class: 'input', type: 'date', value: data });
  const tipo = el('select', { class: 'input' },
    ...[['correcao', 'Correcao de horario'], ['insercao', 'Insercao de registro'], ['ajuste', 'Ajuste de jornada']].map(([v, t]) => el('option', { value: v, text: t })));
  const justificativa = el('textarea', { class: 'input', placeholder: 'Explique o motivo da correcao (minimo 10 caracteres).' });
  const pontosHost = el('div', { class: 'stack', style: 'gap:8px' });

  const linhas = [];
  function addPonto(tipoP, hora) {
    const linha = {
      tipo: tipoP,
      hora: el('input', { class: 'input', type: 'time', value: hora || '' }),
    };
    linhas.push(linha);
    render();
  }
  function render() {
    clear(pontosHost);
    linhas.forEach((l) => {
      pontosHost.appendChild(el('div', { class: 'row' },
        el('select', {
          class: 'input', style: 'max-width:170px',
          onchange: (e) => { l.tipo = e.target.value; },
        }, ...[['entrada', 'Entrada'], ['intervalo_inicio', 'Inicio intervalo'], ['intervalo_fim', 'Fim intervalo'], ['saida', 'Saida']].map(([v, t]) => el('option', { value: v, text: t, selected: l.tipo === v }))),
        l.hora,
        el('button', { class: 'btn btn-outline btn-sm', onclick: () => { linhas.splice(linhas.indexOf(l), 1); render(); } }, 'Remover')));
    });
  }
  addPonto('entrada', '08:00');
  addPonto('saida', '14:00');

  const corpo = el('div', { class: 'stack' },
    el('div', { class: 'field' }, el('label', { text: 'Data' }), dataInput),
    el('div', { class: 'field' }, el('label', { text: 'Tipo de solicitacao' }), tipo),
    el('div', { class: 'field' },
      el('label', { text: 'Registros propostos' }),
      el('p', { class: 'hint', style: 'margin:0 0 8px', text: 'Informe os horarios que deveriam ter sido registrados. Eles so serao aplicados apos a aprovacao do gestor.' }),
      pontosHost,
      el('button', { class: 'btn btn-outline btn-sm', style: 'margin-top:8px', onclick: () => addPonto('entrada', '') }, 'Adicionar registro')),
    el('div', { class: 'field' }, el('label', { text: 'Justificativa' }), justificativa),
  );

  modal('Solicitar correcao de registro', corpo, [
    { texto: 'Cancelar', classe: 'btn-outline' },
    {
      texto: 'Enviar solicitacao',
      classe: 'btn-primary',
      onClick: async () => {
        const pontos = linhas.map((l) => ({ tipo: l.tipo, hora: l.hora.value })).filter((p) => p.hora);
        try {
          await post('/api/solicitacoes', {
            data: dataInput.value, tipo: tipo.value, justificativa: justificativa.value, pontos,
          });
          toast('Solicitacao enviada. Aguarde a analise do gestor.', 'ok');
        } catch (e) { toast(e.message, 'bad'); return false; }
      },
    },
  ]);
}

// ============================================= TELA: MINHAS SOLICITACOES

export async function telaSolicitacoes(ctx) {
  const { ir } = ctx;
  const container = el('div', { class: 'stack' });
  const dados = (await get('/api/solicitacoes')).solicitacoes || [];

  const corpo = dados.length ? el('div', { class: 'table-wrap' },
    el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ...['Data', 'Tipo', 'Justificativa', 'Status', 'Analise'].map((h) => el('th', { text: h })))),
      el('tbody', {}, ...dados.map((s) => el('tr', {},
        el('td', { class: 'who', text: dataBR(s.data) }),
        el('td', { class: 'muted', text: { correcao: 'Correcao', insercao: 'Insercao', ajuste: 'Ajuste' }[s.tipo] || s.tipo }),
        el('td', { text: s.justificativa, style: 'max-width:340px' }),
        el('td', {}, el('span', {
          class: `badge ${s.status === 'aprovado' ? 'ok' : s.status === 'rejeitado' ? 'bad' : 'warn'} dot`,
          text: s.status,
        })),
        el('td', { class: 'muted', text: s.revisor_nome ? `${s.revisor_nome}${s.revisor_comentario ? ` - ${s.revisor_comentario}` : ''}` : '—' })))))
  ) : el('div', { class: 'empty' },
    el('div', { class: 'ico' }, icon(ICONS.request, 20)),
    el('b', { text: 'Nenhuma solicitacao' }),
    el('p', { text: 'Voce ainda nao solicitou nenhuma correcao de registro.' }));

  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Minhas solicitacoes' }),
      el('div', { class: 'right' }, el('span', { class: 'badge', text: `${dados.length}` }))),
    el('div', { class: 'card-body tight' }, corpo)));

  return container;
}

// ==================================================== TELA: DASHBOARD GESTOR

export async function telaDashboard(ctx) {
  const { ir } = ctx;
  const container = el('div', { class: 'stack' });

  const hoje = (await get('/api/pontos/hoje')).agora.data;
  let mes = ctx.params.mes || hoje.slice(0, 7);

  const host = el('div', { class: 'stack' });

  async function carregar() {
    const d = (await get(`/api/relatorios/dashboard?mes=${mes}`));
    clear(host);
    host.appendChild(conteudoDashboard(d, mes, ir));
  }

  const selMes = el('input', { class: 'input', type: 'month', value: mes, style: 'max-width:170px', onchange: (e) => { mes = e.target.value; carregar(); } });

  container.appendChild(el('div', { class: 'row' },
    el('div', {}, el('b', { text: 'Visao geral da equipe' })),
    el('div', { class: 'spacer' }),
    selMes,
    el('button', { class: 'btn btn-outline', onclick: () => window.open(`/api/relatorios/consolidado.pdf?mes=${mes}`, '_blank') },
      icon(ICONS.download, 15), 'Relatorio PDF')));

  container.appendChild(host);
  await carregar();
  return container;
}

function conteudoDashboard(d, mes, ir) {
  const t = d.totais;
  const stack = el('div', { class: 'stack' });

  stack.appendChild(el('div', { class: 'grid grid-4' },
    kpi('Presentes hoje', `${d.hoje.presentes}/${d.hoje.total}`, dataBR(d.hoje.data), 'accent'),
    kpi('Horas registradas', hhmm(t.horas_registradas_min), `Previstas ${hhmm(t.horas_previstas_min)} no mes`, 'accent'),
    kpi('Atrasos', String(t.atrasos), 'No periodo', t.atrasos ? 'warn' : 'ok'),
    kpi('Registros incompletos', String(t.registros_incompletos), 'Exigem regularizacao', t.registros_incompletos ? 'bad' : 'ok'),
  ));

  stack.appendChild(el('div', { class: 'grid grid-4' },
    kpi('Saldo do periodo', hhmm(t.saldo_min), 'Registrado menos previsto', t.saldo_min < 0 ? 'bad' : 'ok'),
    kpi('Horas pendentes', hhmm(t.horas_pendentes_min), 'Nao trabalhadas', t.horas_pendentes_min ? 'warn' : 'ok'),
    kpi('Faltas', String(t.faltas), 'Sem justificativa aprovada', t.faltas ? 'bad' : 'ok'),
    kpi('Ausencias justificadas', String(t.ausencias), 'Com atestado ou motivo', 'ok'),
  ));

  const pend = el('div', { class: 'grid grid-3' },
    cardSimples('Solicitacoes pendentes', d.pendencias.solicitacoes, 'Requer analise', 'warn', () => ir('solicitacoes_equipe')),
    cardSimples('Ausencias pendentes', d.pendencias.ausencias, 'Requer analise', 'warn', () => ir('ausencias')),
    cardSimples('Registros incompletos', d.pendencias.registros_incompletos, 'Dias a regularizar', 'bad', () => ir('inconsistencias')),
  );
  stack.appendChild(pend);

  const linhas = d.resumos.map((r) => el('tr', {},
    el('td', { class: 'who', text: r.usuario_nome }),
    el('td', { class: 'num', text: hhmm(r.horas_previstas_min) }),
    el('td', { class: 'num', text: hhmm(r.horas_registradas_min) }),
    el('td', { class: `num ${r.saldo_min < 0 ? 'neg' : 'pos'}`, text: hhmm(r.saldo_min) }),
    el('td', { class: 'num', text: String(r.dias_trabalhados) }),
    el('td', { class: 'num', text: String(r.atrasos) }),
    el('td', { class: 'num', text: String(r.registros_incompletos) }),
    el('td', {}, el('button', {
      class: 'btn btn-outline btn-sm',
      onclick: () => window.open(`/api/relatorios/individual.pdf?usuario_id=${r.usuario_id}&mes=${mes}`, '_blank'),
    }, 'PDF'))));

  stack.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Frequencia por colaborador' }),
      el('div', { class: 'right' }, el('span', { class: 'badge', text: mesBR(mes) }))),
    el('div', { class: 'card-body tight' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'data' },
          el('thead', {}, el('tr', {}, ...['Colaborador', 'Previstas', 'Registradas', 'Saldo', 'Dias', 'Atrasos', 'Incompl.', ''].map((h, i) => el('th', { class: i >= 1 && i <= 6 ? 'num' : '', text: h })))),
          el('tbody', {}, ...linhas))))));

  return stack;
}

function cardSimples(titulo, valor, sub, tom, aoClicar) {
  return el('div', { class: `kpi ${tom}`, style: 'cursor:pointer', onclick: aoClicar },
    el('div', { class: 'label', text: titulo }),
    el('div', { class: 'value', text: String(valor ?? 0) }),
    el('div', { class: 'foot', text: sub }));
}

// ============================================ TELA: REGISTROS DA EQUIPE

export async function telaEquipe(ctx) {
  const { usuario, ir } = ctx;
  const container = el('div', { class: 'stack' });

  const lista = (await get('/api/usuarios')).usuarios || [];
  const hoje = (await get('/api/pontos/hoje')).agora.data;
  let mes = ctx.params.mes || hoje.slice(0, 7);
  let alvo = ctx.params.usuario || String(lista[0]?.id || '');

  const host = el('div', { class: 'card-body tight' });

  async function carregar() {
    if (!alvo) { clear(host); host.appendChild(el('div', { class: 'empty' }, el('b', { text: 'Nenhum usuario visivel' }))); return; }
    const d = (await get(`/api/pontos/historico?usuario_id=${alvo}&inicio=${mes}-01&fim=${mes}-31`)).dias;
    const resumo = (await get(`/api/pontos/resumo/${mes}?usuario_id=${alvo}`)).resumo;
    clear(host);
    host.appendChild(tabelaHistorico(d, resumo, ir, mes));
  }

  const selUsuario = el('select', {
    class: 'input', style: 'max-width:220px',
    onchange: (e) => { alvo = e.target.value; carregar(); },
  }, ...lista.map((u) => el('option', { value: String(u.id), text: u.nome, selected: String(u.id) === String(alvo) })));

  const btnLancar = el('button', { class: 'btn btn-outline', onclick: () => abrirLancamento(alvo) },
    icon(ICONS.edit, 15), 'Lancar ponto');

  const selMes = el('input', { class: 'input', type: 'month', value: mes, style: 'max-width:170px', onchange: (e) => { mes = e.target.value; carregar(); } });

  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Registros da equipe' }),
      el('div', { class: 'right' },
        selUsuario,
        selMes,
        btnLancar,
        el('button', {
          class: 'btn btn-outline',
          onclick: () => window.open(`/api/relatorios/individual.pdf?usuario_id=${alvo}&mes=${mes}`, '_blank'),
        }, icon(ICONS.download, 15), 'PDF'))),
    host));

  await carregar();
  return container;
}

function abrirLancamento(usuarioId) {
  const dataInput = el('input', { class: 'input', type: 'date', value: new Date().toISOString().slice(0, 10) });
  const horaInput = el('input', { class: 'input', type: 'time', value: '08:00' });
  const tipo = el('select', { class: 'input' },
    ...[['entrada', 'Entrada'], ['intervalo_inicio', 'Inicio do intervalo'], ['intervalo_fim', 'Fim do intervalo'], ['saida', 'Saida']].map(([v, t]) => el('option', { value: v, text: t })));
  const justificativa = el('textarea', { class: 'input', placeholder: 'Motivo do lancamento retroativo.' });

  modal('Lancar ponto retroativo', el('div', { class: 'stack' },
    el('p', { class: 'muted', style: 'font-size:12.5px;margin:0', text: 'Use para registrar um ponto que o colaborador nao conseguiu bater. O lancamento fica auditado com seu nome e a justificativa.' }),
    el('div', { class: 'grid grid-2' },
      el('div', { class: 'field' }, el('label', { text: 'Data' }), dataInput),
      el('div', { class: 'field' }, el('label', { text: 'Horario' }), horaInput)),
    el('div', { class: 'field' }, el('label', { text: 'Tipo de registro' }), tipo),
    el('div', { class: 'field' }, el('label', { text: 'Justificativa' }), justificativa)),
  [
    { texto: 'Cancelar', classe: 'btn-outline' },
    {
      texto: 'Lancar ponto',
      classe: 'btn-primary',
      onClick: async () => {
        try {
          await post('/api/pontos/lancar', {
            usuario_id: Number(usuarioId),
            data: dataInput.value,
            hora: horaInput.value,
            tipo: tipo.value,
            justificativa: justificativa.value,
          });
          toast('Ponto lancado.', 'ok');
        } catch (e) { toast(e.message, 'bad'); return false; }
      },
    },
  ]);
}

// ============================================== TELA: SOLICITACOES DA EQUIPE

export async function telaSolicitacoesEquipe(ctx) {
  const { ir } = ctx;
  const container = el('div', { class: 'stack' });
  const dados = (await get('/api/solicitacoes')).solicitacoes || [];

  const cabecalhos = ['Colaborador', 'Data', 'Tipo', 'Justificativa', 'Enviada em', 'Status', 'Decisao'];
  const linhas = dados.map((s) => {
    const statusEl = el('span', {
      class: `badge ${s.status === 'aprovado' ? 'ok' : s.status === 'rejeitado' ? 'bad' : 'warn'} dot`,
      text: s.status,
    });
    const decisaoEl = s.status === 'pendente'
      ? el('div', { class: 'row tight' },
        el('button', { class: 'btn btn-accent btn-sm', onclick: () => decidir(s, 'aprovado') }, 'Aprovar'),
        el('button', { class: 'btn btn-danger btn-sm', onclick: () => decidir(s, 'rejeitado') }, 'Rejeitar'))
      : el('span', { class: 'muted', text: s.revisor_nome || '—' });
    const tipoTexto = { correcao: 'Correcao', insercao: 'Insercao', ajuste: 'Ajuste' }[s.tipo] || s.tipo;
    return el('tr', {},
      el('td', { class: 'who', text: s.usuario_nome }),
      el('td', { text: dataBR(s.data) }),
      el('td', { class: 'muted', text: tipoTexto }),
      el('td', { text: s.justificativa, style: 'max-width:300px' }),
      el('td', { class: 'muted', text: dataHoraBR(s.criado_em) }),
      el('td', {}, statusEl),
      el('td', {}, decisaoEl));
  });

  const corpo = dados.length
    ? el('div', { class: 'table-wrap' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ...cabecalhos.map((h) => el('th', { text: h })))),
        el('tbody', {}, ...linhas)))
    : el('div', { class: 'empty' },
      el('div', { class: 'ico' }, icon(ICONS.request, 20)),
      el('b', { text: 'Nenhuma solicitacao' }),
      el('p', { text: 'Nao ha solicitacoes de correcao aguardando analise.' }));

  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Solicitacoes de correcao' }),
      el('div', { class: 'right' }, el('span', { class: 'badge', text: `${dados.filter((s) => s.status === 'pendente').length} pendentes` }))),
    el('div', { class: 'card-body tight' }, corpo)));

  function decidir(s, decisao) {
    const comentario = el('textarea', { class: 'input', placeholder: 'Comentario (opcional)' });
    modal(decisao === 'aprovado' ? 'Aprovar solicitacao' : 'Rejeitar solicitacao',
      el('div', { class: 'stack' },
        el('div', { class: 'alert alert-info', style: 'margin:0' },
          `${s.usuario_nome} - ${dataBR(s.data)}`),
        el('p', { style: 'font-size:13.5px;color:var(--ink-2)', text: s.justificativa }),
        s.pontos_json && s.pontos_json.length
          ? el('div', { class: 'stack', style: 'gap:6px' },
            el('b', { style: 'font-size:12.5px', text: 'Registros propostos:' }),
            ...s.pontos_json.map((p) => el('div', { class: 'badge', text: `${p.tipo} ${p.hora}` })))
          : null,
        el('div', { class: 'field' }, el('label', { text: 'Comentario' }), comentario)),
      [
        { texto: 'Cancelar', classe: 'btn-outline' },
        {
          texto: decisao === 'aprovado' ? 'Aprovar' : 'Rejeitar',
          classe: decisao === 'aprovado' ? 'btn-accent' : 'btn-danger',
          onClick: async () => {
            try {
              await post(`/api/solicitacoes/${s.id}/decisao`, { status: decisao, comentario: comentario.value });
              toast(decisao === 'aprovado' ? 'Solicitacao aprovada.' : 'Solicitacao rejeitada.', 'ok');
              ir('solicitacoes_equipe');
            } catch (e) { toast(e.message, 'bad'); return false; }
          },
        },
      ]);
  }

  return container;
}

// ================================================== TELA: AUSENCIAS

export async function telaAusencias(ctx) {
  const { usuario, ir } = ctx;
  const container = el('div', { class: 'stack' });
  const lista = (await get('/api/usuarios')).usuarios || [];
  const dados = (await get('/api/ausencias')).ausencias || [];

  const selUsuario = el('select', { class: 'input', style: 'max-width:200px' },
    ...lista.map((u) => el('option', { value: String(u.id), text: u.nome })));
  const dataInput = el('input', { class: 'input', type: 'date', value: new Date().toISOString().slice(0, 10) });
  const tipo = el('select', { class: 'input' },
    el('option', { value: 'ausencia', text: 'Ausencia justificada' }),
    el('option', { value: 'falta', text: 'Falta' }));
  const justificativa = el('textarea', { class: 'input', placeholder: 'Atestado, motivo ou observacao.' });

  const form = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Registrar ausencia ou falta' })),
    el('div', { class: 'card-body' },
      el('div', { class: 'grid grid-2' },
        el('div', { class: 'field' }, el('label', { text: 'Colaborador' }), selUsuario),
        el('div', { class: 'field' }, el('label', { text: 'Data' }), dataInput),
        el('div', { class: 'field' }, el('label', { text: 'Tipo' }), tipo),
        el('div', { class: 'field' }, el('label', { text: 'Justificativa' }), justificativa)),
      el('button', {
        class: 'btn btn-primary',
        onclick: async (ev) => {
          ev.target.disabled = true;
          try {
            await post('/api/ausencias', {
              usuario_id: Number(selUsuario.value), data: dataInput.value,
              tipo: tipo.value, justificativa: justificativa.value,
            });
            toast('Ausencia registrada.', 'ok');
            ir('ausencias');
          } catch (e) { toast(e.message, 'bad'); ev.target.disabled = false; }
        },
      }, icon(ICONS.plus, 15), 'Registrar')));

  const linhas = dados.map((a) => {
    const acoes = a.status === 'pendente'
      ? el('div', { class: 'row tight' },
        el('button', {
          class: 'btn btn-accent btn-sm',
          onclick: async () => {
            await post(`/api/ausencias/${a.id}/status`, { status: 'aprovado' });
            toast('Ausencia aprovada.', 'ok'); ir('ausencias');
          },
        }, 'Aprovar'),
        el('button', {
          class: 'btn btn-danger btn-sm',
          onclick: async () => {
            await post(`/api/ausencias/${a.id}/status`, { status: 'rejeitado' });
            toast('Ausencia rejeitada.', 'ok'); ir('ausencias');
          },
        }, 'Rejeitar'))
      : null;
    return el('tr', {},
      el('td', { class: 'who', text: dataBR(a.data) }),
      el('td', { text: a.usuario_nome }),
      el('td', {}, el('span', { class: `badge ${a.tipo === 'falta' ? 'bad' : 'warn'}`, text: a.tipo === 'falta' ? 'Falta' : 'Ausencia' })),
      el('td', { class: 'muted', text: a.justificativa || '—' }),
      el('td', {}, el('span', { class: `badge ${a.status === 'aprovado' ? 'ok' : a.status === 'rejeitado' ? 'bad' : 'warn'} dot`, text: a.status })),
      el('td', { class: 'num' }, acoes));
  });

  const corpo = dados.length
    ? el('div', { class: 'table-wrap' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ...['Data', 'Colaborador', 'Tipo', 'Justificativa', 'Status', ''].map((h) => el('th', { text: h })))),
        el('tbody', {}, ...linhas)))
    : el('div', { class: 'empty' },
      el('div', { class: 'ico' }, icon(ICONS.calendar, 20)),
      el('b', { text: 'Nenhuma ausencia registrada' }),
      el('p', { text: 'Use o formulario acima para registrar a primeira ausencia.' }));

  container.appendChild(form);
  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Ausencias e faltas' })),
    el('div', { class: 'card-body tight' }, corpo)));

  return container;
}

// ============================================== TELA: INCONSISTENCIAS

export async function telaInconsistencias(ctx) {
  const container = el('div', { class: 'stack' });
  const hoje = (await get('/api/pontos/hoje')).agora.data;
  let mes = ctx.params.mes || hoje.slice(0, 7);

  const host = el('div', { class: 'card-body tight' });

  async function carregar() {
    const d = (await get(`/api/relatorios/inconsistencias?mes=${mes}`)).inconsistencias || [];
    clear(host);
    if (!d.length) {
      host.appendChild(el('div', { class: 'empty' },
        el('div', { class: 'ico' }, icon(ICONS.checkCircle, 20)),
        el('b', { text: 'Nenhuma inconsistencia' }),
        el('p', { text: 'Todos os registros do periodo estao completos e consistentes.' })));
      return;
    }
    host.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ...['Colaborador', 'Data', 'Problema', ''].map((h) => el('th', { text: h })))),
        el('tbody', {}, ...d.map((i) => el('tr', {},
          el('td', { class: 'who', text: i.usuario_nome }),
          el('td', { text: dataBR(i.data) }),
          el('td', {}, el('span', { class: 'badge warn dot', text: i.problema === 'sem_registro' ? 'Sem registro de ponto' : i.problema })),
          el('td', { class: 'num' }, el('a', {
            class: 'btn btn-outline btn-sm',
            href: `/api/relatorios/individual.pdf?usuario_id=${i.usuario_id}&mes=${mes}`,
            target: '_blank',
          }, 'PDF'))))))));
  }

  const selMes = el('input', { class: 'input', type: 'month', value: mes, style: 'max-width:170px', onchange: (e) => { mes = e.target.value; carregar(); } });
  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Registros incompletos e inconsistencias' }),
      el('div', { class: 'right' }, selMes)),
    host));
  await carregar();
  return container;
}
