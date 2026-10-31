// Local dev server: serves static files + runs Vercel-style API functions.
// Supports both handler styles: Edge (`runtime: 'edge'`, Web Request/Response) and
// classic Node `(req, res)` — which is what every non-Edge function in api/ uses.
// No Vercel account needed. Usage: node local-server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const PORT = 3000;
const ROOT = process.cwd();

// --- Load .env.local (simple KEY=VALUE parser) ---
try {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (e) {
  console.warn('No .env.local found');
}

// Vercel CLI normally loads .env.local automatically; keep it in process.env for handlers.

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Convert node req -> Web Request
function toWebRequest(req, body) {
  const proto = 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers, signal: null };
  if (body && body.length) init.body = body;
  return new Request(url, init);
}

async function writeWebResponse(res, webRes) {
  res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
  if (webRes.body) {
    Readable.fromWeb(webRes.body).pipe(res);
  } else {
    res.end();
  }
}

async function handleApi(req, res, apiPath) {
  try {
    const mod = await import(pathToFileURL(join(ROOT, apiPath)).href);
    const handler = mod.default;
    if (typeof handler !== 'function') throw new Error('no default export');

    // Edge functions always take a Web `Request`; plain Node functions take `(req, res)`.
    const isEdge = Boolean(mod.config && mod.config.runtime === 'edge');

    if (!isEdge) {
      // Classic Vercel Node signature — hand it the raw req so it can still read the body stream.
      const result = await handler(req, res);
      if (result instanceof Response) {
        // Fallback for a Web-style handler that forgot `runtime: 'edge'`.
        await writeWebResponse(res, result);
      } else if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const webRes = await handler(toWebRequest(req, body));
    await writeWebResponse(res, webRes);
  } catch (e) {
    console.error(`[api] ${apiPath} error:`, e);
    if (res.writableEnded) return;
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'Internal error' }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = normalize(url.pathname).replace(/\\/g, '/');

  // API functions: /api/<name> -> api/<name>.js
  const apiMatch = pathname.match(/^\/api\/([A-Za-z0-9_-]+)$/);
  if (apiMatch && existsSync(join(ROOT, 'api', apiMatch[1] + '.js'))) {
    return handleApi(req, res, 'api/' + apiMatch[1] + '.js');
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const abs = join(ROOT, filePath);
  if (!abs.startsWith(ROOT) || !existsSync(abs)) {
    // SPA fallback: serve index.html
    filePath = '/index.html';
  }
  try {
    const data = await readFile(join(ROOT, filePath));
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
});
