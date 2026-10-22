# Rodando o Codeon Ponto no VS Code

## 1. Pré-requisitos

Você precisa do **Node.js 22.5 ou superior** — o sistema usa o banco SQLite
nativo do Node, que só existe a partir dessa versão.

Para conferir, abra o terminal do VS Code (`Ctrl + `` `) e rode:

```bash
node -v
```

Se aparecer `v22.5.0` ou maior, está tudo certo. Se aparecer `v18.x` ou `v20.x`,
instale a versão atual em [nodejs.org](https://nodejs.org) — ou, se usar o
`nvm` no Windows (nvm-windows):

```bash
nvm install 22
nvm use 22
```

Se a versão estiver errada, o próprio sistema avisa com uma mensagem
explicativa em vez de quebrar com um erro de módulo.

## 2. Abrir o projeto

Descompacte o `codeon-ponto.zip` (pode ser direto na pasta Downloads) e no
VS Code use **File → Open Folder** e escolha a pasta `codeon-ponto`.

> Abra a pasta do projeto, e não o arquivo `package.json` solto — é a pasta
> inteira que o VS Code precisa para achar os arquivos de debug.

## 3. Instalar a extensão de debug do Node

No VS Code, abra a paleta de comandos (`Ctrl + Shift + P`) e digite:

```
Tasks: Install Tasks Extension
```

Escolha **Tasks Extension Gallery** e instale. Essa extensão habilita o botão
de execução ▶ no menu de debug e a lista de tarefas do terminal.

## 4. Iniciar o sistema

Há três formas, todas equivalentes:

**Pela task (recomendado).** `Ctrl + Shift + P` → **Tasks: Run Task** →
**Iniciar Codeon Ponto**. Ou `Ctrl + Shift + B`, que roda direto a task padrão.
O servidor sobe em um terminal dedicado.

**Pelo botão de debug.** Abra `src/server.js` e clique no ▶ ao lado do número
da linha, ou pressione `F5`. Escolha a configuração "Iniciar Codeon Ponto".

**Pelo terminal.** `Ctrl + `` ` e:

```bash
node src/server.js
```

Para recarregar sozinho a cada alteração de arquivo, use a task "Iniciar com
recarga automatica" ou:

```bash
node --watch src/server.js
```

## 5. Entrar no sistema

Abra **http://localhost:3000** no navegador.

No primeiro acesso o sistema cria o administrador inicial:

- **E-mail:** `admin@codeon.agency`
- **Senha:** `Codeon@2026`

Troque a senha em **Configurações** logo depois do primeiro login.

Para mudar essas credenciais, edite o arquivo `.env` na raiz do projeto
(crie a partir do `.env.example`) e reinicie o servidor:

```bash
ADMIN_EMAIL=seu@email.com
ADMIN_SENHA=SuaSenha@Forte1
```

O `.env` é lido automaticamente na subida — não precisa de `--env-file`. Na
terminal, as variáveis que você digitar têm prioridade sobre o arquivo, então
`set PORT=3100` antes do comando sobrepõe a porta do `.env`.

Ou rode o script, que cria ou atualiza um administrador sem precisar de
variável de ambiente:

```bash
node src/scripts/create-admin.js "Seu Nome" "seu@email.com" "Senha@123"
```

## 6. Onde os dados ficam

O banco é um arquivo em `data/codeon-ponto.db`, criado na primeira execução.

- **Não versionar essa pasta** — o `.gitignore` já a exclui.
- **Backup**: **Configurações → Gerar backup** na tela, ou `npm run backup`
  (grava em `backups/`).
- **Apagar tudo e recomeçar**: feche o servidor e delete a pasta `data/`. O
  banco e o admin são recriados na próxima subida.

## 7. Comandos úteis

| No terminal do VS Code | O que faz |
|---|---|
| `npm start` | Sobe o servidor |
| `npm run dev` | Sobe com recarga automática |
| `npm test` | Roda toda a suíte (119 verificações) |
| `npm run backup` | Gera backup JSON em `backups/` |
| `npm run admin -- "Nome" "email" "senha"` | Cria ou atualiza um administrador |

## 8. Problemas comuns

**"Cannot find module 'node:sqlite'"**
Node antigo. Rode `node -v` e instale a versão 22.5 ou superior.

**"porta 3000 já está em uso"**
Outro processo está usando a porta. Descubra com `netstat -ano | findstr :3000`
e finalize o processo, ou mude a porta:

```bash
set PORT=3100 && node src/server.js
```

No `launch.json` e no `tasks.json` já há um campo `PORT` — mudar lá é mais fácil.

**A página abre mas o login não funciona**
Verifique se o servidor subiu sem erro no terminal. Se aparecer
`[setup] Administrador inicial criado`, está funcionando e o login correto é o
da tabela acima.

**"E-mail ou senha invalidos"**
O `.env` só é lido no start. Depois de editar, reinicie o servidor (Ctrl+C e
F5). Se existir um `.env` com outra senha, ela tem precedência sobre o padrão
`Codeon@2026`.

**Quero testar com outro fuso horário**
Edite `TIMEZONE=America/Sao_Paulo` no `.env` (formato IANA) e reinicie. Isso
afeta o cálculo de atraso e de horas.

**O VS Code asks para "selecionar o interpretador"**
É o seletor de Node no canto inferior direito. Escolha a versão 22 ou superior.

**Rodando o backend com o Live Server do VS Code**
Não funciona — o Live Server serve só arquivos estáticos. O sistema tem uma API
com banco de dados; use `npm start` mesmo.
