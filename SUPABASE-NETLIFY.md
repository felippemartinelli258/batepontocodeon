# CODEON PONTO — Supabase + Netlify

## Estado da entrega
O schema privado `codeon_ponto` foi criado no projeto BATEPONTO (`peqqehzoevfrzsjznqek`).
A integração do backend foi preparada, mas **a conexão real e o deploy ainda precisam de validação**.

## Variáveis de ambiente no Netlify
Em Site configuration > Environment variables, configure (escopo Functions):
- `DATABASE_URL`: URI de conexão **Session pooler** do Supabase (copiar de Connect > Session pooler; incluir senha real e SSL conforme painel). **Nunca publicar ou enviar essa senha em chat.**
- `ADMIN_EMAIL`: e-mail escolhido para o administrador.
- `ADMIN_SENHA`: senha única forte, pelo menos 12 caracteres.
- `ADMIN_NOME`: nome exibido para o administrador.
- `TIMEZONE`: `America/Sao_Paulo`.
- `PUBLIC_URL`: URL final do Netlify.

Não configure `TURSO_URL` e `TURSO_TOKEN`. O backend usa `DATABASE_URL` quando presente.

## Publicação
1. Faça deploy do repositório ou envie o ZIP de código para um projeto Netlify com build automático.
2. Build command: vazio; publish directory: `public`; functions directory: `netlify/functions`.
3. O Netlify precisa instalar `pg` pelo `npm install` no build.
4. Configure as variáveis antes do primeiro acesso; no primeiro request será criado o administrador.
5. Verifique login, sessão, cadastro, equipe, marcações, relatórios, PDF e logout antes do uso real.

## Segurança e pendências
- O schema é privado e não deve ser exposto na Data API.
- Nunca colocar DATABASE_URL no JavaScript do navegador.
- A suíte original é baseada em SQLite e não valida automaticamente o driver PostgreSQL.
- Ainda faltam teste integrado no Netlify, revisão completa de permissões, rate limiting e avaliação jurídica de conformidade do ponto eletrônico.
- Não use este sistema para registro trabalhista oficial até a homologação.
