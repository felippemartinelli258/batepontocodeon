// Servidor HTTP do Codeon Ponto.
import './env.js';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRouter, COOKIE } from './api.js';
import { usuarioDaSessao, limparSessoesExpiradas } from './auth.js';
import { readBody, parseCookies, serveStatic, HttpError, json, serveStaticFile } from './http.js';
import { ROOT } from './db.js';
import { bootstrap } from './bootstrap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Cria o handler de requisicoes. Reutilizavel em adaptadores serverless
 * (Vercel/Netlify) que nao usam o modulo http nativo.
 */
export async function createHandler() {
  await bootstrap();
  const router = buildRouter();

  return async function handler(req, res) {
    const started = Date.now();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400).end('URL invalida');
      return;
    }

    const cookies = parseCookies(req);
    const token = cookies[COOKIE];
    const usuario = token ? await usuarioDaSessao(token) : null;
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.socket?.remoteAddress || null;
    const secure = String(req.headers['x-forwarded-proto'] || '').includes('https')
      || Boolean(req.socket?.encrypted);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');

    try {
      if (url.pathname.startsWith('/api/')) {
        const found = router.match(req.method, url.pathname);
        if (!found) { json(res, 404, { erro: 'Endpoint nao encontrado.' }); return; }
        if (found.route.auth && !usuario) { json(res, 401, { erro: 'Nao autenticado.' }); return; }
        const body = await readBody(req);
        const ctx = {
          req, res, url, body, usuario, token, ip, secure,
          params: found.params, query: Object.fromEntries(url.searchParams),
        };
        await found.route.handler(ctx);
        return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        if (serveStatic(req, res, url.pathname)) return;
        if (!url.pathname.includes('.')) {
          serveStaticFile(res, path.join(ROOT, 'public', 'index.html'));
          return;
        }
      }
      json(res, 404, { erro: 'Recurso nao encontrado.' });
    } catch (err) {
      if (err instanceof HttpError) {
        json(res, err.status, { erro: err.message, ...(err.extra || {}) });
      } else {
        console.error('[erro]', req.method, url.pathname, err);
        json(res, 500, { erro: 'Erro interno do servidor.' });
      }
    } finally {
      const ms = Date.now() - started;
      if (process.env.LOG_REQUESTS !== '0' && url.pathname.startsWith('/api/')) {
        console.log(`${req.method} ${url.pathname} ${res.statusCode} ${ms}ms`);
      }
    }
  };
}

export async function createApp() {
  const handler = await createHandler();
  return http.createServer(handler);
}

export async function start(port = PORT, host = HOST) {
  const server = await createApp();
  server.listen(port, host, () => {
    console.log('\n  Codeon Ponto - Sistema de Registro de Ponto');
    console.log(`  Servidor rodando em http://localhost:${port}\n`);
  });
  setInterval(() => { limparSessoesExpiradas().catch(() => {}); }, 60 * 60 * 1000).unref();
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) start();
