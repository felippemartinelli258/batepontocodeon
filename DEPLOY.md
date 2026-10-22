# Guia de deploy na Vercel

Passo a passo testado contra a estrutura real deste projeto.

## 1. Crie o banco no Turso (obrigatório)

O disco das functions da Vercel é efêmero — todo reinício da função apaga os
arquivos. O SQLite local, portanto, não serve aqui. O sistema já fala com o
Turso (libSQL) por HTTP, sem nenhuma biblioteca.

1. Acesse [turso.tech](https://turso.tech) e crie uma conta.
2. Crie um banco: `turso db create codeon-ponto`
3. Copie os dois valores do comando `turso db show codeon-ponto`:
   - **URL** — algo como `libsql://codeon-ponto-seunome.turso.io`
   - **Token** — em Authentication → API Tokens → Generate

Plano gratuito do Turso dá 1 GB e 5 milhões de linhas/mês — folgado para uma
equipe de até 30 pessoas.

## 2. Suba o projeto no GitHub

```bash
cd codeon-ponto
git init
git add .
git commit -m "Codeon Ponto - sistema de registro de ponto"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

O `.gitignore` já exclui `data/`, `backups/` e `.env`, então nenhum dado local
sobe para o repositório.

## 3. Importe na Vercel

1. Em [vercel.com/new](https://vercel.com/new), escolha **Add New → Project**.
2. Selecione o repositório do GitHub e clique em **Import**.
3. Em *Framework Preset*, escolha **Other**. Deixe o *Build Command* e o
   *Install Command* **vazios** — não há dependências para instalar e a pasta
   `public/` já é a saída estática.
4. Clique em **Deploy**.

## 4. Cadastre as variáveis de ambiente

Ainda no painel da Vercel: **Settings → Environment Variables**. Cadastre as
quatro variáveis abaixo para **Production**, **Preview** e **Development**:

| Nome | Valor |
|---|---|
| `TURSO_URL` | `libsql://codeon-ponto-seunome.turso.io` |
| `TURSO_TOKEN` | o token gerado no passo 1 |
| `ADMIN_EMAIL` | `admin@codeon.agency` |
| `ADMIN_SENHA` | uma senha forte, ex.: `Trocar@2026x` |

Depois de salvar, vá em **Deployments → ⋮ → Redeploy** para que as variáveis
passem a valer.

## 5. Confirme que está no ar

Abra a URL que a Vercel exibiu. Na primeira chamada:

- o schema do banco é criado automaticamente;
- o administrador inicial é criado com `ADMIN_EMAIL` / `ADMIN_SENHA`;
- a tela de login aparece.

Entre com o administrador, vá em **Configurações** e troque o nome da agência,
as cores e a URL do logo. Como o nome da agência alimenta o cabeçalho dos
relatórios em PDF, a identidade visual fica consistente na tela e no papel.

## Deploy por linha de comando (alternativa)

```bash
npm i -g vercel
vercel login
vercel --prod
vercel env add TURSO_URL production
vercel env add TURSO_TOKEN production
vercel env add ADMIN_EMAIL production
vercel env add ADMIN_SENHA production
vercel --prod
```

O `vercel.json` do projeto já define o runtime `nodejs22.x`, o destino das
funções em `/api` e a reescrita das demais rotas para o `index.html`.

## Checklist depois do deploy

- [ ] `https://seu-dominio.vercel.app/api/health` responde `{"ok":true,...}`
- [ ] O login funciona e abre o painel do administrador
- [ ] Registrar entrada e saída aparece na linha do tempo
- [ ] O PDF mensal baixa e abre corretamente
- [ ] Criar um usuário e fazer login com ele
- [ ] Trocar a senha do administrador

## Backup

Pelo painel: **Configurações → Gerar backup**. O arquivo JSON sai com todas as
tabelas. Para automatizar, crie uma Vercel Cron Job chamando `/api/backup` com
um cookie de sessão — ou, mais simples, use `turso db shell codeon-ponto` e
`.dump` do SQLite.

## Problemas comuns

**"Nao autenticado" em tudo, mesmo depois do login**
O cookie é `HttpOnly` e `SameSite=Lax`. Se você acessa por um caminho com
subdomínio diferente do usado no login, o cookie não vai. Use sempre o mesmo
domínio. Em produção, adicione o domínio próprio em *Settings → Domains* —
com HTTPS o cookie passa a ser `Secure` automaticamente.

**Erro 500 nos logs da função**
Veja o log em *Deployments → Logs*. As causas mais comuns: `TURSO_URL` sem o
prefixo `libsql://`, token trocado ou variáveis não aplicadas ao ambiente
errado. Confirme com `vercel env ls`.

**A página abre em branco**
Rotas do frontend são resolvidas no cliente (`#/ponto`). Se der 404 ao recarregar
em `/dashboard`, o `vercel.json` precisa estar na raiz do repositório e com as
rewrites como no arquivo.

**O Turso acusa "too many requests"**
O plano gratuito tem limite de requisições. Cada abertura de painel faz
várias chamadas. Se a equipe for grande, use o plano pago do Turso ou migre
para um servidor com disco e SQLite local.

## Alternativa: servidor próprio (SQLite local)

Se você preferir manter o SQLite em arquivo, use um VPS, um container ou o
Railway/Render com disco persistente:

```bash
DATABASE_PATH=/var/data/codeon-ponto.db node src/server.js
```

Nesse modo **não** defina `TURSO_URL`. Faça backup com
`node src/scripts/backup.js`.
