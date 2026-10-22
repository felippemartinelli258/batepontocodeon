# Codeon Ponto

Sistema interno de registro de ponto da **Codeon Agency**. Registra jornada,
acompanha frequência, administra ausências, aprova correções e gera relatórios
mensais em PDF.

Não há dependências externas: o backend roda com Node puro (módulo `node:sqlite`
nativo) e o frontend é uma SPA em HTML/CSS/JavaScript sem build. Roda com um
comando e pode ser hospedada em Vercel, Netlify, Render, Railway ou em um
servidor próprio.

---

## Começando

Requisito: **Node.js 22.5 ou superior** (o banco SQLite nativo foi criado no
Node 22). Verifique com `node -v`.

```bash
cd codeon-ponto
npm start
```

Abra `http://localhost:3000`.

No primeiro acesso o sistema cria o administrador inicial:

| Campo | Valor padrão | Variável de ambiente |
|---|---|---|
| E-mail | `admin@codeon.agency` | `ADMIN_EMAIL` |
| Senha | `Codeon@2026` | `ADMIN_SENHA` |
| Nome | `Administrador Codeon` | `ADMIN_NOME` |

> Troque a senha no primeiro acesso, em **Configurações**. O arquivo
> `.env.example` lista todas as variáveis disponíveis — o sistema também lê
> `.env` se você usar `node --env-file=.env src/server.js`.

Para criar ou redefinir um administrador pela linha de comando:

```bash
node src/scripts/create-admin.js "Seu Nome" "seu@email.com" "Senha@123"
```

---

## Documentos

| Arquivo | Para que serve |
|---|---|
| [`COMO-USAR.md`](COMO-USAR.md) | Guia do dia a dia: cadastro da equipe, envio dos links e operação |
| [`DEPLOY.md`](DEPLOY.md) | Passo a passo de publicação na Vercel |
| [`VSCODE.md`](VSCODE.md) | Como rodar e depurar no VS Code |

## O que o sistema faz

### Registro de ponto
Entrada, início e fim de intervalo e encerramento de expediente. Data e hora são
gravadas automaticamente pelo servidor no fuso configurado — o cliente nunca
informa o horário do relógio. O histórico fica disponível para consulta e
registros não podem ser alterados fora do fluxo de correção.

### Jornada
Jornada padrão de 6 horas, configurável por pessoa. Cada escala define os dias
de trabalho, os turnos (manhã, tarde, noite ou personalizados), o intervalo de descanso
e se a jornada é dividida em 1, 2 ou 3 períodos. O motor de cálculo devolve
horas trabalhadas, horas previstas, saldo, atraso, saída antecipada e horas
pendentes, e classifica o dia como completo, em andamento, incompleto,
inconsistente, divergente, folga, falta ou ausência justificada.

### Troca de senha

O administrador — e qualquer colaborador — troca a própria senha em **Minha
conta**. A senha atual é exigida, as sessões abertas em outros dispositivos são
encerradas e o sistema mede a força da nova senha. Contas criadas pelo
administrador nascem com **senha provisória**: no primeiro acesso, a pessoa é
obrigada a definir uma senha definitiva antes de usar o sistema.

### Acesso por link individual (sem senha)

O link é gerado **automaticamente** quando o administrador cadastra um
funcionário, e aparece na tela para copiar e enviar. Quem recebe abre o link
(`/acesso/<token>`) no celular e entra direto no painel de ponto, sem digitar
e-mail e senha. Pode ter validade (30 dias, 90 dias, 1 ano) e é revogável na
hora — útil quando alguém troca ou perde o aparelho. O login por senha
continua disponível como alternativa.

### Aplicativo instalável (PWA)

O sistema pode ser instalado na tela inicial do celular. Abre em tela cheia,
sem barra de endereço, com o ícone da agency. No Android aparece uma barra de
instalação; no iPhone, Compartilhar → "Adicionar à Tela de Início".

### Painel do colaborador
Entrada e saída do dia, horas do dia e do mês, histórico de frequência,
solicitação de correção com justificativa e consulta aos comunicados internos.

### Painel administrativo
Registros de toda a equipe, frequência individual por período, aprovação e
rejeição de solicitações de correção, registro de justificativas de ausência,
relatórios mensais em PDF e listagem de registros incompletos.

### Perfis de acesso

| Perfil | Alcance |
|---|---|
| **Administrador** | Tudo: usuários, jornadas, turnos, relatórios, auditoria, backup |
| **Gestor** | Equipe vinculada, aprova correções, registra ausências, gera relatórios |
| **Colaborador / Prestador** | Apenas os próprios registros, jornada, histórico e solicitações |

### Usuários
Nome completo, e-mail identificador de acesso, senha individual, cargo, tipo de
vínculo (colaborador ou prestador de serviços), jornada e turno definidos, status
(ativo/inativo) e perfil de acesso.

### Segurança
Senhas com `scrypt` e sal individual, sessão em cookie `HttpOnly`/`SameSite=Lax`
com expiração de 7 dias, controle de permissões por perfil no servidor, registro
de auditoria de toda ação administrativa, cabeçalhos de segurança e backup
periódico.

### Correções
O registro original nunca é apagado. Cada correção guarda a justificativa, os
registros originais, o responsável pela alteração, o comentário do gestor e a
data da aprovação.

---

## Estrutura

```
codeon-ponto/
├── api/index.js              Adaptador Vercel
├── netlify/functions/api.js  Adaptador Netlify
├── public/                   Frontend (SPA sem build)
│   ├── index.html
│   └── assets/
│       ├── app.css           Design system
│       ├── api.js            Cliente HTTP, helpers de UI e formatação
│       ├── app.js            Shell, rotas e navegação
│       ├── telas.js          Telas do colaborador e do gestor
│       └── admin.js          Telas administrativas
├── src/
│   ├── db.js                 Driver SQLite local + driver Turso (serverless)
│   ├── auth.js               Senhas, sessões, permissões
│   ├── jornada.js            Motor de cálculo de jornada
│   ├── api.js                Rotas REST
│   ├── relatorios.js         Relatórios mensais em PDF
│   ├── pdf.js                Gerador de PDF (escrito do zero, sem libs)
│   ├── http.js               Roteador, cookies, estáticos
│   ├── bootstrap.js          Configuração inicial e admin
│   ├── server.js             Servidor HTTP
│   ├── time.js               Fuso horário, datas e minutos
│   └── scripts/              create-admin.js, backup.js
├── test/                     Testes automatizados
├── vercel.json
├── netlify.toml
└── .env.example
```

---

## Hospedagem

### Servidor próprio (com disco persistente)

O modo mais simples. O banco SQLite fica em `data/codeon-ponto.db`.

```bash
node src/server.js
```

Para produção, use systemd, pm2 ou Docker e coloque atrás de um proxy HTTPS
(Caddy, Nginx). Cookie e sessão são transmitidos com `Secure` quando a conexão
é HTTPS.

### Vercel

O disco do container da Vercel é efêmero, então o SQLite local não persiste.
Use um banco **Turso/libSQL** (gratuito para esta escala):

1. Crie um banco em [turso.tech](https://turso.tech).
2. Copie a URL e o token.
3. No projeto da Vercel, defina as variáveis `TURSO_URL`, `TURSO_TOKEN`,
   `ADMIN_EMAIL` e `ADMIN_SENHA`.
4. Faça o deploy. O arquivo `api/index.js` e o `vercel.json` já estão
   configurados — o build não precisa de `npm install`.

O passo a passo completo, com checklist e resolução de problemas, está em
**[DEPLOY.md](DEPLOY.md)**.

### Netlify

Mesma necessidade de banco persistente (Turso). O `netlify.toml` já aponta a
publicação para `public/` e as funções para `netlify/functions/api.js`.
Defina `TURSO_URL`, `TURSO_TOKEN`, `ADMIN_EMAIL` e `ADMIN_SENHA` no painel.

### Alternativa: servidor com disco em Vercel/Netlify

Planos pagos permitem disco persistente. Nesse caso, defina
`DATABASE_PATH=/var/task/data/codeon-ponto.db` e **não** configure `TURSO_URL`.
Faça o backup periodicamente com `node src/scripts/backup.js`.

---

## Backup

Pelo painel, em **Configurações → Gerar backup**, ou por linha de comando:

```bash
node src/scripts/backup.js                    # gera em ./backups/
node src/scripts/backup.js /caminho/backup.json
```

O arquivo contém todas as tabelas em JSON e pode ser restaurado com um INSERT
ou importado para uma nova instância.

---

## Identidade visual

A identidade oficial da Codeon Agency já está aplicada:

- **Azul institucional** `#002ef6` na interface, nos ícones e nos relatórios
- **Logo oficial** (`public/assets/logo-full.png` e `logo-mono.png`) na tela de
  login, no menu lateral, no favicon, nos ícones do PWA e no cabeçalho dos PDFs
- **Wordmark** "CODEON AGENCY" nos relatórios em PDF

Para trocar qualquer um desses, vá em **Configurações**: nome da agência, cor
primária, cor de destaque e URL do logo. As cores viram variáveis CSS
(`--brand` e `--accent`) e valem para toda a interface. Para substituir os
arquivos de imagem, basta sobrescrever os PNGs em `public/assets/` — ou
apontar `logo_url` para uma URL externa.

---

## API

Todas as rotas respondem em JSON. A autenticação usa o cookie `codeon_session`.

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/login` | público |
| POST | `/api/auth/logout` | autenticado |
| POST | `/api/auth/trocar-senha` | autenticado |
| PUT | `/api/auth/perfil` | autenticado |
| GET | `/api/auth/me` | autenticado |
| GET | `/api/config/publica` | público |
| GET | `/api/pontos/hoje` | autenticado |
| POST | `/api/pontos/registrar` | autenticado |
| POST | `/api/pontos/lancar` | gestor / admin (lançamento retroativo auditado) |
| POST | `/api/acessos` | gestor / admin (gera link individual) |
| GET | `/api/acessos` | gestor / admin |
| DELETE | `/api/acessos/:token` | gestor / admin (revoga link) |
| POST | `/api/auth/acesso` | público (entra pelo link individual) |
| GET | `/api/pontos/historico` | autenticado |
| GET | `/api/pontos/dia/:data` | autenticado |
| GET | `/api/pontos/resumo/:mes` | autenticado |
| GET | `/api/usuarios` | autenticado (visível conforme perfil) |
| POST | `/api/usuarios` | admin |
| PUT | `/api/usuarios/:id` | admin / gestor |
| POST | `/api/usuarios/:id/equipe` | gestor / admin |
| GET | `/api/turnos` | autenticado |
| POST | `/api/turnos` | admin |
| GET | `/api/solicitacoes` | autenticado |
| POST | `/api/solicitacoes` | autenticado |
| POST | `/api/solicitacoes/:id/decisao` | gestor / admin |
| GET | `/api/ausencias` | autenticado |
| POST | `/api/ausencias` | gestor / admin |
| GET | `/api/avisos` | autenticado |
| POST | `/api/avisos` | gestor / admin |
| GET | `/api/relatorios/dashboard` | gestor / admin |
| GET | `/api/relatorios/inconsistencias` | gestor / admin |
| GET | `/api/relatorios/individual.pdf` | autenticado |
| GET | `/api/relatorios/consolidado.pdf` | gestor / admin |
| GET | `/api/auditoria` | admin |
| GET | `/api/backup` | admin |
| PUT | `/api/config` | admin |

---

## Testes

```bash
npm test                 # roda toda a suite
npm run iniciar -- equipe.json   # cria banco + equipe + links de acesso

node test/e2e.js         # 45 verificações de API, permissões e relatórios
node test/frontend.js    # 31 verificações de renderização das telas
node test/app.js         # 24 verificações do shell e da navegação entre rotas
node test/acessos.js     # 34 verificações de link individual e PWA
node test/identidade.js  # 36 verificações de senha, cadastro e identidade visual
node test/turso.js       # 21 verificações do driver Turso (serverless)
node test/imports.js     # integridade dos imports
```

Os testes sobem um servidor em porta efêmera com banco temporário e não tocam
nos dados reais.

---

## Regras operacionais implementadas

- A jornada prevista é configurável por pessoa, por turno e por período.
- O sistema diferencia **horas previstas**, **horas registradas** e **horas
  efetivamente trabalhadas** — são três campos distintos nos relatórios.
- Uma ausência não é automaticamente tratada como falta injustificada: o gestor
  registra a ausência com justificativa e a approve ou rejeita.
- Correções preservam o registro original, a justificativa, o responsável e a
  data da aprovação.
- Turnos que atravessam a meia-noite são tratados corretamente na ordenação dos
  pontos.
- Tolerâncias de atraso e saída antecipada são configuráveis por pessoa.
- Dias que ainda não aconteceram não entram nos indicadores do período.
- O gestor pode lançar ponto retroativo com justificativa; o lançamento fica
  registrado na auditoria com o nome do responsável.
