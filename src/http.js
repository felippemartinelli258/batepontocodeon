// Nucleo HTTP: roteador minimalista, cookies, body parsing e arquivos estaticos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Localiza a pasta public/.
 *
 * Em desenvolvimento ela fica em <raiz>/public. Em hospedagem serverless o
 * codigo e empacotado e o caminho muda, entao varios candidatos sao testados
 * antes de desistir.
 */
function resolverPublicDir() {
  const candidatos = [
    path.resolve(__dirname, '..', 'public'),
    path.resolve(process.cwd(), 'public'),
    path.resolve(__dirname, 'public'),
    path.resolve(__dirname, '..', '..', 'public'),
    path.resolve(__dirname, '..', '..', '..', 'public'),
    path.resolve(__dirname, '..', '..', '..', '..', 'public'),
  ];
  for (const c of candidatos) {
    try {
      if (fs.existsSync(path.join(c, 'index.html'))) return c;
    } catch { /* ignora candidato inacessivel */ }
  }
  return candidatos[0];
}

export const PUBLIC_DIR = resolverPublicDir();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

export class HttpError extends Error {
  constructor(status, message, extra = null) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const unauthorized = (msg = 'Nao autenticado') => new HttpError(401, msg);
export const forbidden = (msg = 'Sem permissao para esta operacao') => new HttpError(403, msg);
export const notFound = (msg = 'Recurso nao encontrado') => new HttpError(404, msg);

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  return parts.join('; ');
}

export async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return null;

  let raw = null;
  if (Buffer.isBuffer(req.body)) {
    raw = req.body.toString('utf8');
  } else if (typeof req.body === 'string') {
    raw = req.body;
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw badRequest('Corpo da requisicao muito grande.');
      chunks.push(chunk);
    }
    if (chunks.length) raw = Buffer.concat(chunks).toString('utf8');
  }

  if (!raw) return null;
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { throw badRequest('JSON invalido.'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw;
}

// --------------------------------------------------------------- roteador

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const regexSrc = pattern
      .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
      .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    this.routes.push({ method, regex: new RegExp(`^${regexSrc}$`), keys, handler, auth: opts.auth !== false });
    return this;
  }

  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  put(p, h, o) { return this.add('PUT', p, h, o); }
  patch(p, h, o) { return this.add('PATCH', p, h, o); }
  delete(p, h, o) { return this.add('DELETE', p, h, o); }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return null;
  }
}

// --------------------------------------------------------------- respostas

export function json(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function sendBuffer(res, status, buffer, contentType, filename) {
  const headers = {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
  };
  if (filename) {
    headers['Content-Disposition'] = `attachment; filename="${filename.replace(/"/g, '')}"`;
  }
  res.writeHead(status, headers);
  res.end(buffer);
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  const buf = Buffer.from(text, 'utf8');
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': buf.length });
  res.end(buf);
}

// --------------------------------------------------------------- estaticos

export function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) { sendText(res, 403, 'Proibido'); return true; }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const cache = /\.(png|jpg|jpeg|svg|webp|woff2|ico)$/i.test(ext) ? 'public, max-age=86400' : 'no-cache';
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

export function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath)) { sendText(res, 404, 'Nao encontrado'); return; }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(filePath).pipe(res);
}
