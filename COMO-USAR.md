# Codeon Ponto — como usar no dia a dia

Guia curto para o administrador e para os funcionários. O sistema já vem com a
identidade visual da Codeon Agency (azul `#002ef6`, logo oficial), banco
pronto e link individual de acesso.

---

## Parte 1 — Começando (5 minutos)

### 1. Suba o sistema

```bash
cd codeon-ponto
npm start
```

Abra **http://localhost:3000**.

### 2. Entre como administrador

| | |
|---|---|
| E-mail | `admin@codeon.agency` |
| Senha | `Codeon@2026` |

O sistema detecta que essa é uma senha provisória e abre a tela **Minha conta**
pedindo uma senha definitiva. Defina a sua e o acesso está pronto.

### 3. Crie a equipe

Em **Usuários → Novo usuário**, preencha nome, e-mail, cargo e tipo de
vínculo. Ao salvar, o sistema:

1. cria a conta com uma senha provisória;
2. **gera automaticamente um link de acesso** e mostra numa janela — copie
   com um clique;
3. marca a senha como provisória, então a pessoa é obrigada a trocá-la no
   primeiro acesso.

Envie o link por WhatsApp. A pessoa abre, entra direto no painel de ponto e
toca em "Registrar entrada".

### 4. Ajuste a jornada de cada um (opcional)

Ao cadastrar, cada pessoa pode ter sua própria escala: jornada em horas, dias
de trabalho, turnos (manhã/tarde/noite ou outros), intervalo de descanso e
divisão em 1, 2 ou 3 períodos. O cálculo de atraso, saldo e horas pendentes usa
essa escala.

### 5. Publique na internet

Para a equipe acessar de fora da sua máquina, publique o sistema — o passo a
passo está em `DEPLOY.md`. Depois de publicar, defina `PUBLIC_URL` com o
endereço final (ex.: `https://ponto.codeon.agency`) para que os links gerados
usem o endereço certo.

---

## Parte 2 — O que o funcionário faz

1. Recebe o link (WhatsApp, e-mail ou-impresso).
2. Toca no link. Entra direto no painel de ponto.
3. Toca em **Registrar entrada** e confirma. O horário é o do servidor.
4. No meio do dia: **Iniciar intervalo** / **Encerrar intervalo**.
5. Ao sair: **Encerrar expediente**.
6. Opcionalmente, instala na tela inicial:
   - **Android**: aparece a barra "Instalar o Codeon Ponto".
   - **iPhone**: Compartilhar → "Adicionar à Tela de Início".

Depois de instalado, ele abre pelo ícone, em tela cheia, sem barra de
endereço. Funciona como um aplicativo.

### Se preferir senha

Também vale entrar por e-mail e senha. Em **Minha conta → Alterar minha
senha**, cada pessoa define a senha definitiva que quiser.

### Se o celular mudar ou for perdido

Vá em **Links de acesso**, gere um link novo para a pessoa e revogue o
antigo. O acesso para de funcionar na hora. As horas já registradas permanecem
no histórico.

### Se a pessoa sair da empresa

Em **Usuários**, mude o status para **inativo** — desliga o login por senha e
o link de acesso. E revogue o link, por garantia.

---

## Parte 3 — O que o administrador acompanha

| Tela | Para que serve |
|---|---|
| **Visão geral** | Indicadores do mês: presentes hoje, horas, atrasos, registros incompletos, saldo |
| **Registros da equipe** | Frequência de cada pessoa, dia a dia; permite lançar ponto retroativo com justificativa |
| **Links de acesso** | Gerar, copiar e revogar os links; ver o último uso de cada um |
| **Solicitações de correção** | Aprovar ou rejeitar correções pedidas pelos funcionários |
| **Ausências e faltas** | Registrar justificativa de ausência; aprovar ou rejeitar |
| **Inconsistências** | Dias sem registro, incompletos ou divergentes |
| **Usuários** | Cadastrar, editar jornada, ativar/desativar |
| **Auditoria** | Histórico de tudo que foi feito, com autor e data |
| **Configurações** | Identidade visual, fuso horário e backup |
| **Minha conta** | Seus dados e troca de senha |

### Relatórios

- **PDF individual** — por pessoa, por mês, com detalhamento dia a dia.
- **PDF consolidado** — toda a equipe no mês, com horas previstas ×
  registradas, atrasos, ausências e registros a regularizar.

Ambos saem em **Registros da equipe** e **Visão geral**, no botão de PDF. A
identidade visual (logo e azul) já está nos relatórios.

---

## Parte 4 — Backup

O sistema mantém tudo em um arquivo de banco (`data/codeon-ponto.db`).

- **Sob demanda:** Configurações → Gerar backup (baixa um JSON).
- **Programado:** `npm run backup` (grava em `backups/`).

Guarde o JSON em um lugar fora da máquina. É o que garante que nada se perde
se o disco falhar.

---

## Regras que o sistema aplica

- **O horário é do servidor.** O funcionário não consegue fraudar a hora do
  celular; o registro usa o relógio do servidor.
- **Sem internet, não registra.** Se a conexão cair, nada é gravado — é
  preferível a um ponto com horário duvidoso.
- **Registro não some.** Correções guardam o registro original, a
  justificativa, quem aprovou e a data.
- **Ausência não é falta automaticamente.** O gestor registra e aprova a
  justificativa.
- **Dias futuros não contam.** O saldo do mês considera só os dias que já
  aconteceram.
- **Turno que passa da meia-noite** é tratado corretamente.

---

## Problemas frequentes

**"Não consigo entrar"**
A conta pode estar inativa. Em **Usuários**, veja o status. Se for a primeira
vez, use o link individual em vez da senha.

**"O link não abre"**
Confira se o endereço no link é o da rede local ou da publicação correta. Se
você mudou de domínio, gere links novos em **Links de acesso**.

**"O funcionário vê o painel do administrador"**
Isso não acontece: as permissões são do servidor. Se um gestor vê a equipe,
é porque ele foi vinculado a ela em **Usuários → Equipe**.

**"Esqueci a senha do administrador"**
Rode o script, que redefine a senha sem precisar de acesso:

```bash
node src/scripts/create-admin.js "Seu Nome" "seu@email.com" "NovaSenha@2026"
```

**"Quero cadastrar a equipe toda de uma vez"**
Copie `equipe-exemplo.json`, preencha com os dados e rode:

```bash
npm run iniciar -- equipe.json
```

O script cria os usuários, os vínculos de equipe e os links de acesso, e
imprime as senhas provisórias e os links de cada pessoa.

**"Preciso de mais um link para a mesma pessoa"**
Em **Links de acesso**, gere quantos precisar. Cada link é independente e
revogável.
