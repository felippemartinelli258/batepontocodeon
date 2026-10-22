// Adaptador para Vercel (Serverless Functions) - runtime Node.js 22.
//
// A Vercel detecta a pasta /api e transforma este arquivo em uma funcao que
// atende as rotas /api/*. O frontend e servido como estatico a partir de
// public/ e as demais rotas caem no index.html (ver vercel.json).
//
// Variaveis de ambiente obrigatorias:
//   TURSO_URL, TURSO_TOKEN  (banco persistente - o disco da Vercel e efemero)
//   ADMIN_EMAIL, ADMIN_SENHA (administrador criado no primeiro acesso)
import { createHandler } from '../src/server.js';

const handler = await createHandler();

export default async function(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // A Vercel ja reescreve tudo que nao for /api para o index.html, mas se
  // alguma chamada chegar aqui, devolvemos a SPA.
  if (!url.pathname.startsWith('/api/')) {
    res.writeHead(302, { Location: '/index.html' });
    res.end();
    return;
  }

  await handler(req, res);
}
