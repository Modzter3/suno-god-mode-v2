import { put } from '@vercel/blob';

/**
 * Small-file upload through the server (no browser SDK).
 * Vercel caps request bodies ~4.5 MB; larger files use /api/blob-upload (client multipart).
 *
 * The page posts the raw file bytes with an `x-filename` header, so this handler needs
 * no multipart parser. Classic Node (req, res) signature on purpose: Web-style
 * `return new Response(...)` handlers on this deployment's Node runtime time out.
 */
export const config = {
  maxDuration: 60,
};

const MAX_BYTES = 4 * 1024 * 1024;

const TOO_LARGE =
  'This file is too large for server upload (max ~4 MB on Vercel). The app will use the browser upload path instead.';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeBlobFilename(name) {
  var base = (typeof name === 'string' && name) || 'upload.bin';
  base = base.replace(/[/\\]/g, '_').replace(/[^\w.\-()+ ]/g, '_');
  if (base.length > 180) base = base.slice(-180);
  return base || 'upload.bin';
}

function headerValue(req, name) {
  var raw = req.headers && req.headers[name];
  var value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : '';
}

/** Collects the raw body, bailing out as soon as it exceeds MAX_BYTES. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    var chunks = [];
    var size = 0;
    var settled = false;
    req.on('data', function (chunk) {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BYTES) {
        settled = true;
        var err = new Error(TOO_LARGE);
        err.code = 'TOO_LARGE';
        reject(err);
        try {
          req.destroy();
        } catch (eD) {}
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', function (e) {
      if (settled) return;
      settled = true;
      reject(e);
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  var token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) {
    return send(res, 503, {
      error:
        'BLOB_READ_WRITE_TOKEN is not set on this deployment. In Vercel: Storage → Blob → connect the store to this project, then redeploy so the env var is injected. You can also paste a direct audio URL instead of uploading.',
      code: 'NO_TOKEN',
      needsToken: true,
    });
  }

  var rawName = headerValue(req, 'x-filename');
  var decodedName = rawName;
  try {
    decodedName = rawName ? decodeURIComponent(rawName) : rawName;
  } catch (eD) {}

  var declared = headerValue(req, 'x-file-size');
  var declaredSize = declared ? parseInt(declared, 10) : 0;
  if (declaredSize > MAX_BYTES) {
    return send(res, 413, { error: TOO_LARGE, code: 'TOO_LARGE' });
  }

  var body;
  try {
    body = await readBody(req);
  } catch (e) {
    if (e && e.code === 'TOO_LARGE') {
      return send(res, 413, { error: TOO_LARGE, code: 'TOO_LARGE' });
    }
    return send(res, 400, {
      error: 'Could not read the upload body: ' + (e && e.message ? e.message : String(e)),
    });
  }

  if (!body || !body.length) {
    return send(res, 400, {
      error: 'Empty upload body. The page posts raw file bytes with an x-filename header.',
    });
  }

  try {
    var name = safeBlobFilename(decodedName);
    var contentType = headerValue(req, 'content-type') || 'application/octet-stream';

    var result = await put(name, body, {
      access: 'public',
      token,
      contentType,
      addRandomSuffix: true,
    });

    return send(res, 200, { url: result.url });
  } catch (e) {
    var message = e && e.message ? e.message : String(e);
    return send(res, 502, { error: 'Vercel Blob rejected the upload: ' + message });
  }
}
