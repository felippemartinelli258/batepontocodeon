// Netlify Functions v2: Request/Response Web API; Node HTTP adaptado por stream.
import { Readable } from 'node:stream';
import { createHandler } from '../../src/server.js';

let handlerPromise;
export default async function handler(request, context) {
  handlerPromise ||= createHandler();
  const route = await handlerPromise;
  const url = new URL(request.url);
  const payload = ['GET', 'HEAD'].includes(request.method) ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const req = Readable.from(payload.length ? [payload] : []);
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = Object.fromEntries(request.headers.entries());
  req.socket = { remoteAddress: context.ip || null, encrypted: url.protocol === 'https:' };
  const headers = new Headers();
  const chunks = [];
  const res = {
    statusCode: 200,
    setHeader(k, v) { headers.set(k, v); },
    getHeader(k) { return headers.get(k); },
    writeHead(status, values = {}) { this.statusCode = status; for (const [k, v] of Object.entries(values)) headers.set(k, v); return this; },
    write(chunk) { if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))); return true; },
    end(chunk) { if (chunk != null) this.write(chunk); this.writableEnded = true; return this; },
    on() { return this; }, once() { return this; }, emit() { return false; },
  };
  await route(req, res);
  return new Response(Buffer.concat(chunks), { status: res.statusCode, headers });
}
export const config = { path: '/api/*' };
