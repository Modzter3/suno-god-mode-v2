/**
 * Blob health check — reports whether this deployment can write to Vercel Blob.
 *
 * GET /api/blob-health  → is a write token present? (never returns the token itself)
 *
 * Deliberately a classic Node (req, res) handler with no SDK import, so it also
 * answers the question "does this deployment's Node runtime respond at all?".
 */
export const config = {
  maxDuration: 15,
};

/** Env names a linked Vercel Blob store can inject. */
const TOKEN_NAMES = ['BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_READ_WRITE_TOKEN'];

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function mask(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.length <= 14) return '…';
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

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  const token = readToken();
  const blobEnvNames = Object.keys(process.env)
    .filter((k) => /BLOB/i.test(k))
    .sort();

  const report = {
    ok: !!token.value,
    nodeRuntimeAnswers: true,
    node: process.version,
    region: process.env.VERCEL_REGION || '',
    token: {
      found: !!token.value,
      envName: token.name || null,
      length: token.value.length,
      masked: mask(token.value),
      looksLikeVercelBlobToken: token.value.startsWith('vercel_blob_rw_'),
    },
    blobEnvNames,
    next: token.value
      ? 'Token present — try "Choose file" on an upload tab again. If the write still fails, the store was deleted, rotated, or belongs to another team/project.'
      : 'No Blob token here. Vercel → Storage → Blob → connect the store to THIS project (env vars are injected on the next deploy), then redeploy. Paste a direct audio URL meanwhile.',
  };

  return send(res, 200, report);
}
