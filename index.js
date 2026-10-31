import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PetStateStore } from './state.js';

export const name = 'claude-pet';
export const inject = ['webServer'];

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ASSETS = join(ROOT, 'assets');
const ROUTE = '/claude-pet-dsh';
const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function sendFile(res, file) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'public, max-age=3600',
    'x-content-type-options': 'nosniff'
  });
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

function safeAsset(relative) {
  const candidate = normalize(join(ASSETS, relative));
  const prefix = ASSETS.endsWith(sep) ? ASSETS : ASSETS + sep;
  if (candidate !== ASSETS && !candidate.startsWith(prefix)) return null;
  return candidate;
}

export function apply(ctx) {
  const store = new PetStateStore();
  const log = message => ctx.logger?.info?.('[claude-pet-dsh] ' + message);

  ctx.effect(() => {
    const offSession = ctx.on('session/event', (session, event) => {
      store.update(session, event);
    });
    const offError = ctx.on('agent/error', payload => {
      store.error(payload ?? {});
    });
    return () => {
      offSession?.();
      offError?.();
      store.dispose();
    };
  }, 'claude-pet-dsh: session events');

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const sub = pathname.startsWith(ROUTE) ? pathname.slice(ROUTE.length) : pathname;

      if (req.method === 'GET' && (sub === '' || sub === '/' || sub === '/state')) {
        sendJson(res, 200, store.snapshot());
        return;
      }
      if (req.method === 'GET' && sub === '/health') {
        sendJson(res, 200, { ok: true, plugin: 'claude-pet-dsh' });
        return;
      }
      if (req.method === 'GET' && sub === '/icon.png') {
        sendFile(res, join(ASSETS, 'icon.png'));
        return;
      }
      if (req.method === 'GET' && sub.startsWith('/assets/')) {
        const file = safeAsset(sub.slice('/assets/'.length));
        if (file) {
          sendFile(res, file);
          return;
        }
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('claude-pet-dsh: not found');
    }
  }), 'claude-pet-dsh: http route');

  log('mounted at ' + ROUTE);
}
