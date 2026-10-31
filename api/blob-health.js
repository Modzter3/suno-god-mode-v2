import { put, del } from '@vercel/blob';

/**
 * Vercel Blob health check (Edge runtime, so it always answers).
 * GET /api/blob-health           → reports whether the write token is present
 * GET /api/blob-health?probe=1   → additionally does a real put + delete round-trip
 *
 * Never returns the token itself — only its length and a masked hint.
 */
export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

/** Names a Vercel Blob store can inject; checked in order. */
const TOKEN_NAMES = ['BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_READ_WRITE_TOKEN', 'BLOB_READ_WRITE_TOKEN_PREFIX'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function mask(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.length <= 12) return '…';
  return v.slice(0, 14) + '…' + v.slice(-4);
}

function readToken() {
  for (const name of TOKEN_NAMES) {
    const raw = process.env[name];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) return { name, value };
  }
  return { name: '', value: '' };
}

export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const token = readToken();
  const blobEnv = Object.keys(process.env)
    .filter((k) => /BLOB/i.test(k))
    .sort();

  const report = {
    ok: false,
    runtime: 'edge',
    region: request.headers.get('x-vercel-id') || '',
    token: {
      found: !!token.value,
      envName: token.name || null,
      length: token.value.length,
      masked: mask(token.value),
      looksLikeVercelBlobToken: token.value.startsWith('vercel_blob_rw_'),
    },
    blobEnvNames: blobEnv,
    hint: token.value
      ? 'Token present. Run this URL with ?probe=1 to confirm a real write/delete round-trip.'
      : 'No Blob token on this deployment. Vercel → Storage → create/link a Blob store to this project, then redeploy (env vars are only injected at deploy time).',
  };

  if (!token.value) {
    return json(report, 200);
  }

  const wantsProbe = new URL(request.url).searchParams.get('probe') === '1';
  if (!wantsProbe) {
    report.ok = true;
    return json(report, 200);
  }

  const started = Date.now();
  const name = 'health/blob-check-' + Date.now() + '.txt';
  try {
    const result = await put(name, 'ok', {
      access: 'public',
      token: token.value,
      contentType: 'text/plain',
      addRandomSuffix: true,
    });
    report.probe = { put: 'ok', url: result.url, ms: Date.now() - started };
    try {
      await del(result.url, { token: token.value });
      report.probe.deleted = true;
    } catch (e) {
      report.probe.deleted = false;
      report.probe.deleteError = e instanceof Error ? e.message : String(e);
    }
    report.ok = true;
    return json(report, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    report.probe = { put: 'failed', error: message, ms: Date.now() - started };
    report.hint =
      'Token is set but Vercel Blob rejected the write. Usually a deleted/rotated store, a token from another team, or a store not linked to this project.';
    return json(report, 502);
  }
}
