// Telas administrativas: usuarios, jornada, configuracoes, auditoria e avisos.
import {
  el, clear, icon, ICONS, get, post, put, del, toast, modal, confirmar,
  dataBR, dataHoraBR, hhmm, duracao, initials, state,
} from './api.js';

const DIAS_SEMANA = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sab'], ['0', 'Dom']];

// ==================================================== TELA: USUARIOS

export async function telaUsuarios(ctx) {
  const { ir } = ctx;
  const container = el('div', { class: 'stack' });
  const lista = (await get('/api/usuarios')).usuarios || [];

  const barra = el('div', { class: 'row' },
    el('div', {}, el('b', { text: 'Usuarios do sistema' }),
      el('p', { class: 'muted', style: 'font-size:12.5px', text: `${lista.length} cadastrado(s)` })),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-primary', onclick: () => formUsuario(null, lista, ir) }, icon(ICONS.plus, 15), 'Novo usuario'));

  const corpo = el('div', { class: 'table-wrap' },
    el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ...['Nome', 'E-mail', 'Cargo', 'Vinculo', 'Perfil', 'Jornada', 'Status', ''].map((h) => el('th', { text: h })))),
      el('tbody', {}, ...lista.map((u) => el('tr', {},
        el('td', { class: 'who' },
          el('div', { class: 'row tight' },
            el('span', { class: 'avatar', style: 'width:26px;height:26px;font-size:11px', text: initials(u.nome) }),
            el('span', { text: u.nome }))),
        el('td', { class: 'muted', text: u.email }),
        el('td', { text: u.cargo || '—' }),
        el('td', {}, el('span', { class: 'badge', text: u.vinculo === 'prestador' ? 'Prestador' : 'Colaborador' })),
        el('td', {}, el('span', {
          class: `badge ${u.perfil === 'admin' ? 'info' : u.perfil === 'gestor' ? 'ok' : 'neutral'}`,
          text: u.perfil,
        })),
        el('td', { class: 'muted', text: `${Math.round((u.escala?.jornadaMin || 360) / 60)}h` }),
        el('td', {}, el('span', { class: `badge ${u.status === 'ativo' ? 'ok' : 'bad'} dot`, text: u.status })),
        el('td', { class: 'num' }, el('button', { class: 'btn btn-outline btn-sm', onclick: () => formUsuario(u, lista, ir) }, 'Editar')))))));

  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Equipe' })),
    el('div', { class: 'card-body tight' }, corpo)));
  container.insertBefore(barra, container.firstChild);
  return container;
}

function formUsuario(usuario, lista, ir) {
  const edicao = !!usuario;
  const nome = el('input', { class: 'input', value: usuario?.nome || '' });
  const email = el('input', { class: 'input', type: 'email', value: usuario?.email || '', disabled: edicao });
  const senha = el('input', { class: 'input', type: 'password', placeholder: edicao ? 'Deixe em branco para manter' : 'Minimo 8 caracteres, com letra e numero' });
  const cargo = el('input', { class: 'input', value: usuario?.cargo || '' });
  const vinculo = el('select', { class: 'input' },
    el('option', { value: 'colaborador', text: 'Colaborador' }),
    el('option', { value: 'prestador', text: 'Prestador de servicos' }));
  const perfil = el('select', { class: 'input' },
    el('option', { value: 'colaborador', text: 'Colaborador' }),
    el('option', { value: 'gestor', text: 'Gestor' }),
    el('option', { value: 'admin', text: 'Administrador' }));
  const status = el('select', { class: 'input' },
    el('option', { value: 'ativo', text: 'Ativo' }),
    el('option', { value: 'inativo', text: 'Inativo' }));

  if (usuario) {
    vinculo.value = usuario.vinculo;
    perfil.value = usuario.perfil;
    status.value = usuario.status;
  }

  // Escala
  const escala = usuario?.escala || { jornadaMin: 360, dias: [1, 2, 3, 4, 5], turnos: [{ nome: 'Padrao', inicio: '08:00', fim: '14:00', descansoMin: 0, periods: 1 }] };
  const jornadaHoras = el('input', { class: 'input', type: 'number', step: '0.5', min: '1', max: '24', value: String((escala.jornadaMin || 360) / 60) });
  const diasHost = el('div', { class: 'day-pills' });
  const selecao = new Set(escala.dias || [1, 2, 3, 4, 5]);
  for (const [v, lbl] of DIAS_SEMANA) {
    const b = el('button', { type: 'button', class: `day-pill ${selecao.has(Number(v)) ? 'on' : ''}` },
      el('span', { text: lbl }));
    b.addEventListener('click', () => {
      if (selecao.has(Number(v))) selecao.delete(Number(v)); else selecao.add(Number(v));
      b.classList.toggle('on');
    });
    diasHost.appendChild(b);
  }

  const turnosHost = el('div', { class: 'stack', style: 'gap:8px' });
  const turnos = [...(escala.turnos || [])];
  function renderTurnos() {
    clear(turnosHost);
    if (!turnos.length) {
      turnosHost.appendChild(el('p', { class: 'hint', text: 'Nenhum turno definido. A jornada sera registrada sem referencia de turno.' }));
    }
    turnos.forEach((t, i) => {
      turnosHost.appendChild(el('div', {
        style: 'border:1px solid var(--line);border-radius:var(--radius-sm);padding:11px 12px;display:grid;gap:9px',
      },
        el('div', { class: 'row' },
          el('input', { class: 'input', style: 'flex:1;min-width:120px', value: t.nome, placeholder: 'Nome do turno', oninput: (e) => { t.nome = e.target.value; } }),
          el('button', { class: 'btn btn-outline btn-sm', onclick: () => { turnos.splice(i, 1); renderTurnos(); } }, 'Remover')),
        el('div', { class: 'row' },
          el('div', { style: 'flex:1;min-width:110px' }, el('label', { class: 'muted', style: 'font-size:11.5px', text: 'Inicio' }),
            el('input', { class: 'input', type: 'time', value: t.inicio, oninput: (e) => { t.inicio = e.target.value; } })),
          el('div', { style: 'flex:1;min-width:110px' }, el('label', { class: 'muted', style: 'font-size:11.5px', text: 'Fim' }),
            el('input', { class: 'input', type: 'time', value: t.fim, oninput: (e) => { t.fim = e.target.value; } })),
          el('div', { style: 'flex:1;min-width:110px' }, el('label', { class: 'muted', style: 'font-size:11.5px', text: 'Intervalo (min)' }),
            el('input', { class: 'input', type: 'number', min: '0', value: String(t.descansoMin || 0), oninput: (e) => { t.descansoMin = Number(e.target.value) || 0; } })),
          el('div', { style: 'flex:1;min-width:110px' }, el('label', { class: 'muted', style: 'font-size:11.5px', text: 'Periodos' }),
            el('select', {
              class: 'input', onchange: (e) => { t.periods = Number(e.target.value); },
            }, ...[1, 2, 3].map((n) => el('option', { value: String(n), text: n === 1 ? '1 periodo' : `${n} periodos`, selected: (t.periods || 1) === n })))))));
    });
  }
  renderTurnos();

  const toleranciaAtraso = el('input', { class: 'input', type: 'number', min: '0', value: String(escala.toleranciaAtrasoMin ?? 10) });
  const toleranciaSaida = el('input', { class: 'input', type: 'number', min: '0', value: String(escala.toleranciaSaidaMin ?? 10) });

  const corpo = el('div', { class: 'stack' },
    el('div', { class: 'grid grid-2' },
      el('div', { class: 'field' }, el('label', { text: 'Nome completo' }), nome),
      el('div', { class: 'field' }, el('label', { text: 'E-mail / identificador de acesso' }), email),
      el('div', { class: 'field' }, el('label', { text: 'Senha' }), senha),
      el('div', { class: 'field' }, el('label', { text: 'Cargo ou funcao' }), cargo),
      el('div', { class: 'field' }, el('label', { text: 'Tipo de vinculo' }), vinculo),
      el('div', { class: 'field' }, el('label', { text: 'Perfil de acesso' }), perfil),
      el('div', { class: 'field' }, el('label', { text: 'Status da conta' }), status)),
    el('div', { class: 'divider' }),
    el('h4', { text: 'Jornada', style: 'font-size:13.5px' }),
    el('div', { class: 'field' }, el('label', { text: 'Jornada diaria (horas)' }), jornadaHoras),
    el('div', { class: 'field' }, el('label', { text: 'Dias de trabalho' }), diasHost),
    el('div', { class: 'field' },
      el('label', { text: 'Turnos' }),
      turnosHost,
      el('button', {
        type: 'button', class: 'btn btn-outline btn-sm', style: 'margin-top:8px',
        onclick: () => { turnos.push({ nome: `Turno ${turnos.length + 1}`, inicio: '08:00', fim: '14:00', descansoMin: 0, periods: 1 }); renderTurnos(); },
      }, icon(ICONS.plus, 14), 'Adicionar turno')),
    el('div', { class: 'grid grid-2' },
      el('div', { class: 'field' }, el('label', { text: 'Tolerancia de atraso (min)' }), toleranciaAtraso),
      el('div', { class: 'field' }, el('label', { text: 'Tolerancia de saida antecipada (min)' }), toleranciaSaida)));

  modal(edicao ? 'Editar usuario' : 'Novo usuario', corpo, [
    { texto: 'Cancelar', classe: 'btn-outline' },
    {
      texto: edicao ? 'Salvar alteracoes' : 'Criar usuario',
      classe: 'btn-primary',
      onClick: async () => {
        const payload = {
          nome: nome.value.trim(),
          cargo: cargo.value.trim() || null,
          vinculo: vinculo.value,
          perfil: perfil.value,
          status: status.value,
          escala: {
            jornadaMin: Math.round(Number(jornadaHoras.value) * 60),
            dias: [...selecao].sort(),
            turnos,
            toleranciaAtrasoMin: Number(toleranciaAtraso.value) || 0,
            toleranciaSaidaMin: Number(toleranciaSaida.value) || 0,
          },
        };
        if (!edicao) {
          payload.email = email.value.trim();
          payload.senha = senha.value;
        } else if (senha.value) {
          payload.senha = senha.value;
        }
        try {
          if (edicao) {
            await put(`/api/usuarios/${usuario.id}`, payload);
            toast('Usuario atualizado.', 'ok');
            ir('usuarios');
          } else {
            const r = await post('/api/usuarios', payload);
            toast('Usuario criado e link de acesso gerado.', 'ok');
            ir('usuarios');
            if (r.link_acesso) mostrarLinkGerado(r.link_acesso, nome.value.trim());
          }
        } catch (e) { toast(e.message, 'bad'); return false; }
      },
    },
  ]);
}

// =================================================== TELA: TURNOS

export async function telaTurnos(ctx) {
  const container = el('div', { class: 'stack' });
  const turnos = (await get('/api/turnos')).turnos || [];

  const form = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Cadastrar turno' })),
    el('div', { class: 'card-body' },
      el('div', { class: 'grid grid-4' },
        el('div', { class: 'field' }, el('label', { text: 'Nome' }), el('input', { class: 'input', id: 't-nome', placeholder: 'Ex.: Manha' })),
        el('div', { class: 'field' }, el('label', { text: 'Inicio' }), el('input', { class: 'input', type: 'time', id: 't-inicio', value: '08:00' })),
        el('div', { class: 'field' }, el('label', { text: 'Fim' }), el('input', { class: 'input', type: 'time', id: 't-fim', value: '14:00' })),
        el('div', { class: 'field' }, el('label', { text: 'Descricao' }), el('input', { class: 'input', id: 't-desc' }))),
      el('button', {
        class: 'btn btn-primary',
        onclick: async () => {
          const nome = document.getElementById('t-nome').value.trim();
          const inicio = document.getElementById('t-inicio').value;
          const fim = document.getElementById('t-fim').value;
          const descricao = document.getElementById('t-desc').value.trim();
          if (!nome) { toast('Informe o nome do turno.', 'bad'); return; }
          try {
            await post('/api/turnos', { nome, inicio, fim, descricao });
            toast('Turno cadastrado.', 'ok');
            ctx.ir('turnos');
          } catch (e) { toast(e.message, 'bad'); }
        },
      }, icon(ICONS.plus, 15), 'Cadastrar turno')));

  const corpo = el('div', { class: 'table-wrap' },
    el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ...['Turno', 'Inicio', 'Fim', 'Descricao'].map((h) => el('th', { text: h })))),
      el('tbody', {}, ...turnos.map((t) => el('tr', {},
        el('td', { class: 'who', text: t.nome }),
        el('td', { class: 'num', text: t.inicio }),
        el('td', { class: 'num', text: t.fim }),
        el('td', { class: 'muted', text: t.descricao || '—' }))))));

  container.appendChild(form);
  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Turnos disponiveis' })),
    el('div', { class: 'card-body tight' }, corpo)));
  return container;
}

// ================================================= TELA: CONFIGURACOES

export async function telaConfig(ctx) {
  const cfg = (await get('/api/config/publica'));
  const nome = el('input', { class: 'input', value: cfg.nome_agencia || 'Codeon Agency' });
  const corPrimaria = el('input', { class: 'input', type: 'color', value: cfg.cor_primaria || '#12141a', style: 'padding:3px;height:40px' });
  const corDestaque = el('input', { class: 'input', type: 'color', value: cfg.cor_destaque || '#c9a227', style: 'padding:3px;height:40px' });
  const logoUrl = el('input', { class: 'input', value: cfg.logo_url || '', placeholder: 'https://.../logo.svg' });
  const tz = el('input', { class: 'input', value: cfg.timezone || 'America/Sao_Paulo' });

  const corpo = el('div', { class: 'stack' },
    el('div', { class: 'field' }, el('label', { text: 'Nome da agencia' }), nome),
    el('div', { class: 'grid grid-2' },
      el('div', { class: 'field' }, el('label', { text: 'Cor primaria' }), corPrimaria),
      el('div', { class: 'field' }, el('label', { text: 'Cor de destaque' }), corDestaque)),
    el('div', { class: 'field' }, el('label', { text: 'URL do logo' }), logoUrl),
    el('div', { class: 'field' }, el('label', { text: 'Fuso horario' }), tz,
      el('p', { class: 'hint', text: 'Formato IANA, por exemplo America/Sao_Paulo.' })));

  return el('div', { class: 'stack' },
    el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', { text: 'Identidade visual e parametros' })),
      el('div', { class: 'card-body' }, corpo,
        el('button', {
          class: 'btn btn-primary', style: 'margin-top:14px',
          onclick: async () => {
            try {
              await put('/api/config', {
                nome_agencia: nome.value.trim(),
                cor_primaria: corPrimaria.value,
                cor_destaque: corDestaque.value,
                logo_url: logoUrl.value.trim(),
                timezone: tz.value.trim(),
              });
              toast('Configuracoes salvas. Recarregando a pagina...', 'ok');
              setTimeout(() => window.location.reload(), 700);
            } catch (e) { toast(e.message, 'bad'); }
          },
        }, 'Salvar configuracoes'))),
    el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', { text: 'Backup dos dados' })),
      el('div', { class: 'card-body' },
        el('p', { class: 'muted', style: 'font-size:13px;margin-bottom:12px', text: 'Gere um arquivo JSON com todos os registros do sistema (pontos, usuarios, solicitacoes, auditoria). Guarde-o em local seguro.' }),
        el('button', { class: 'btn btn-outline', onclick: () => window.open('/api/backup', '_blank') }, icon(ICONS.download, 15), 'Gerar backup'))));
}

// ================================================== TELA: MINHA CONTA

export async function telaMinhaConta(ctx) {
  const { ir } = ctx;
  const container = el('div', { class: 'stack' });
  const u = state.usuario;

  const nome = el('input', { class: 'input', value: u.nome || '' });
  const telefone = el('input', { class: 'input', value: u.telefone || '', placeholder: 'Opcional' });

  const senhaAtual = el('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const senhaNova = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Minimo 8 caracteres, com letra e numero' });
  const senhaConfere = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Repita a nova senha' });

  const forca = el('div', { class: 'hint', style: 'margin-top:6px' });
  function avaliarForca() {
    const s = senhaNova.value;
    const pontos = [s.length >= 8, /[A-Za-z]/.test(s), /\d/.test(s), /[^A-Za-z0-9]/.test(s), s.length >= 12]
      .filter(Boolean).length;
    const rotulos = ['muito fraca', 'fraca', 'razoavel', 'boa', 'forte', 'muito forte'];
    forca.textContent = s ? `Forca da senha: ${rotulos[pontos]}` : '';
    forca.style.color = pontos >= 4 ? 'var(--ok)' : pontos >= 3 ? 'var(--warn)' : 'var(--ink-3)';
  }
  senhaNova.addEventListener('input', avaliarForca);

  const formDados = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Meus dados' })),
    el('div', { class: 'card-body' },
      el('div', { class: 'grid grid-2' },
        el('div', { class: 'field' }, el('label', { text: 'Nome completo' }), nome),
        el('div', { class: 'field' }, el('label', { text: 'Telefone' }), telefone)),
      el('p', { class: 'hint', text: `E-mail de acesso: ${u.email}  |  Perfil: ${u.perfil}  |  Conta: ${u.status}` }),
      el('button', {
        class: 'btn btn-primary',
        onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          try {
            const r = await put('/api/auth/perfil', { nome: nome.value, telefone: telefone.value });
            state.usuario = r.usuario;
            toast('Dados atualizados.', 'ok');
          } catch (e) { toast(e.message, 'bad'); }
          ev.currentTarget.disabled = false;
        },
      }, 'Salvar dados')));

  const formSenha = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Alterar minha senha' })),
    el('div', { class: 'card-body' },
      el('div', { class: 'alert alert-info', style: 'margin-bottom:16px' },
        'Ao trocar a senha, as sessoes abertas em outros dispositivos sao encerradas.'),
      el('div', { class: 'field' }, el('label', { text: 'Senha atual' }), senhaAtual),
      el('div', { class: 'field' }, el('label', { text: 'Nova senha' }), senhaNova, forca),
      el('div', { class: 'field' }, el('label', { text: 'Confirmar nova senha' }), senhaConfere),
      el('button', {
        class: 'btn btn-primary',
        onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          try {
            if (senhaNova.value !== senhaConfere.value) {
              toast('A confirmacao nao confere com a nova senha.', 'bad');
              ev.currentTarget.disabled = false;
              return;
            }
            await post('/api/auth/trocar-senha', {
              senha_atual: senhaAtual.value,
              senha_nova: senhaNova.value,
            });
            senhaAtual.value = ''; senhaNova.value = ''; senhaConfere.value = '';
            toast('Senha alterada com sucesso.', 'ok');
          } catch (e) { toast(e.message, 'bad'); }
          ev.currentTarget.disabled = false;
        },
      }, 'Alterar senha')));

  container.appendChild(formDados);
  container.appendChild(formSenha);
  return container;
}

// ==================================================== TELA: ACESSOS

export async function telaAcessos(ctx) {
  const { ir } = ctx;
  const container = el('div', { class: 'stack' });
  const lista = (await get('/api/usuarios')).usuarios || [];
  const acessos = (await get('/api/acessos')).acessos || [];

  const selUsuario = el('select', { class: 'input', style: 'max-width:220px' },
    ...lista.map((u) => el('option', { value: String(u.id), text: `${u.nome}${u.cargo ? ` - ${u.cargo}` : ''}` })));
  const rotulo = el('input', { class: 'input', style: 'max-width:220px', placeholder: 'Ex.: celular pessoal' });
  const validade = el('select', { class: 'input', style: 'max-width:170px' },
    el('option', { value: '', text: 'Sem expiracao' }),
    el('option', { value: '30', text: '30 dias' }),
    el('option', { value: '90', text: '90 dias' }),
    el('option', { value: '365', text: '1 ano' }));

  const aviso = el('div', { class: 'alert alert-info', style: 'margin:0' },
    'O link individual deixa o funcionario bater o ponto sem digitar e-mail e senha. '
    + 'Ele abre direto no painel de ponto. Revogue o link a qualquer momento se o aparelho for trocado.');

  const form = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Gerar link de acesso' })),
    el('div', { class: 'card-body' },
      aviso,
      el('div', { class: 'grid grid-3', style: 'margin-top:16px' },
        el('div', { class: 'field' }, el('label', { text: 'Para quem e' }), selUsuario),
        el('div', { class: 'field' }, el('label', { text: 'Identificacao (opcional)' }), rotulo),
        el('div', { class: 'field' }, el('label', { text: 'Validade' }), validade)),
      el('button', {
        class: 'btn btn-primary',
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          btn.disabled = true;
          try {
            const r = await post('/api/acessos', {
              usuario_id: Number(selUsuario.value),
              rotulo: rotulo.value.trim() || null,
              expira_dias: validade.value ? Number(validade.value) : null,
            });
            mostrarLinkGerado(r.link);
            ir('acessos');
          } catch (e) {
            toast(e.message, 'bad');
            btn.disabled = false;
          }
        },
      }, icon(ICONS.plus, 15), 'Gerar link')));

  const linhas = acessos.map((a) => {
    const ativo = !a.revogado_em && (!a.expira_em || new Date(a.expira_em) > new Date());
    const link = `${location.origin}/acesso/${a.token}`;
    return el('tr', {},
      el('td', { class: 'who', text: a.usuario_nome }),
      el('td', { class: 'muted', text: a.rotulo || '—' }),
      el('td', { class: 'muted', text: a.criado_em ? dataHoraBR(a.criado_em) : '—' }),
      el('td', { class: 'muted' },
        a.ultimo_uso_em ? dataHoraBR(a.ultimo_uso_em) : 'nunca usado'),
      el('td', {}, el('span', {
        class: `badge ${ativo ? 'ok' : 'bad'} dot`,
        text: a.revogado_em ? 'revogado' : (ativo ? 'ativo' : 'expirado'),
      })),
      el('td', { class: 'num' }, el('div', { class: 'row tight' },
        el('button', {
          class: 'btn btn-outline btn-sm',
          onclick: async () => {
            const area = el('input', { class: 'input', value: link, readonly: true, onclick: (e) => e.target.select() });
            try {
              await navigator.clipboard.writeText(link);
              toast('Link copiado.', 'ok');
            } catch {
              modal('Link de acesso', el('div', { class: 'stack' },
                el('p', { class: 'muted', style: 'font-size:12.5px;margin:0', text: 'Copie o link abaixo e envie para o funcionario.' }),
                area));
            }
          },
        }, 'Copiar'),
        ativo ? el('button', {
          class: 'btn btn-danger btn-sm',
          onclick: async () => {
            await del(`/api/acessos/${a.token}`);
            toast('Link revogado.', 'ok');
            ir('acessos');
          },
        }, 'Revogar') : null)));
  });

  const corpo = acessos.length
    ? el('div', { class: 'table-wrap' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ...['Funcionario', 'Identificacao', 'Criado em', 'Ultimo uso', 'Situacao', ''].map((h) => el('th', { text: h })))),
        el('tbody', {}, ...linhas)))
    : el('div', { class: 'empty' },
      el('div', { class: 'ico' }, icon(ICONS.users, 20)),
      el('b', { text: 'Nenhum link gerado' }),
      el('p', { text: 'Gere um link por funcionario para que ele acesse o sistema sem digitar senha.' }));

  container.appendChild(form);
  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Links de acesso' }),
      el('div', { class: 'right' }, el('span', { class: 'badge', text: `${acessos.filter((a) => !a.revogado_em).length} ativos` }))),
    el('div', { class: 'card-body tight' }, corpo)));

  return container;
}

function mostrarLinkGerado(link, nome = '') {
  modal('Link de acesso gerado', el('div', { class: 'stack' },
    el('p', { class: 'muted', style: 'font-size:13px;margin:0', text: nome ? `Link de acesso de ${nome}. Envie por WhatsApp ou e-mail: ao abrir, a pessoa entra direto no painel de ponto, sem digitar senha.` : 'Envie este link para o funcionario. Ao abrir, ele ja entra logado no painel de ponto.' }),
    el('input', { class: 'input mono', value: link, readonly: true, onclick: (e) => e.target.select() }),
    el('p', { class: 'hint', style: 'margin:0', text: 'Voce pode revogar o link a qualquer momento em Acessos. A senha provisoria tambien foi criada - peça para trocar no primeiro acesso.' })),
  [
    { texto: 'Fechar', classe: 'btn-outline' },
    {
      texto: 'Copiar link',
      classe: 'btn-primary',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast('Link copiado.', 'ok');
        } catch { /* clipboard indisponivel */ }
      },
    },
  ]);
}

// =================================================== TELA: AUDITORIA

export async function telaAuditoria(ctx) {
  const registros = (await get('/api/auditoria?limite=300')).registros || [];

  const corpo = registros.length ? el('div', { class: 'table-wrap' },
    el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ...['Quando', 'Responsavel', 'Acao', 'Entidade', 'Detalhes'].map((h) => el('th', { text: h })))),
      el('tbody', {}, ...registros.map((a) => el('tr', {},
        el('td', { class: 'muted nowrap', text: dataHoraBR(a.data_hora) }),
        el('td', { text: a.ator_nome || 'sistema' }),
        el('td', {}, el('span', { class: 'badge', text: a.acao })),
        el('td', { class: 'muted', text: `${a.entidade}${a.entidade_id ? ` #${a.entidade_id}` : ''}` }),
        el('td', { class: 'muted', style: 'max-width:320px;font-size:12px', text: a.detalhes ? JSON.stringify(a.detalhes) : '—' })))))
  ) : el('div', { class: 'empty' },
    el('div', { class: 'ico' }, icon(ICONS.audit, 20)),
    el('b', { text: 'Sem registros de auditoria' }),
    el('p', { text: 'As acoes administrativas serao registradas aqui.' }));

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Historico de alteracoes administrativas' }),
      el('div', { class: 'right' }, el('span', { class: 'badge', text: `${registros.length} eventos` }))),
    el('div', { class: 'card-body tight' }, corpo));
}

// ==================================================== TELA: AVISOS

export async function telaAvisos(ctx) {
  const { ir } = ctx;
  const container = el('div', { class: 'stack' });
  const avisos = (await get('/api/avisos')).avisos || [];

  const titulo = el('input', { class: 'input', placeholder: 'Titulo do aviso' });
  const corpoTxt = el('textarea', { class: 'input', placeholder: 'Conteudo do comunicado' });

  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Publicar comunicado' })),
    el('div', { class: 'card-body' },
      el('div', { class: 'field' }, el('label', { text: 'Titulo' }), titulo),
      el('div', { class: 'field' }, el('label', { text: 'Conteudo' }), corpoTxt),
      el('button', {
        class: 'btn btn-primary',
        onclick: async () => {
          try {
            await post('/api/avisos', { titulo: titulo.value.trim(), corpo: corpoTxt.value.trim() });
            toast('Aviso publicado.', 'ok');
            ir('avisos');
          } catch (e) { toast(e.message, 'bad'); }
        },
      }, icon(ICONS.plus, 15), 'Publicar'))));

  const corpo = avisos.length ? el('div', { class: 'stack', style: 'gap:10px' },
    ...avisos.map((a) => el('div', { style: 'border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 14px' },
      el('div', { class: 'row' },
        el('b', { text: a.titulo }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'muted', style: 'font-size:11.5px', text: dataHoraBR(a.publicado_em) }),
        el('button', {
          class: 'btn btn-outline btn-sm',
          onclick: async () => {
            await put(`/api/avisos/${a.id}`, { titulo: a.titulo, corpo: a.corpo, ativo: false });
            toast('Aviso desativado.', 'ok'); ir('avisos');
          },
        }, 'Desativar')),
      el('p', { class: 'muted', text: a.corpo, style: 'font-size:13px;margin-top:6px;white-space:pre-line' }))))
    : el('div', { class: 'empty' },
      el('div', { class: 'ico' }, icon(ICONS.bell, 20)),
      el('b', { text: 'Nenhum aviso publicado' }),
      el('p', { text: 'Publique o primeiro comunicado interno.' }));

  container.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Comunicados publicados' })),
    el('div', { class: 'card-body' }, corpo)));

  return container;
}
