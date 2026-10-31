import { handleUpload } from '@vercel/blob/client';

/**
 * Client-direct uploads (large audio); needs BLOB_READ_WRITE_TOKEN from a Vercel Blob store.
 * Classic Node (req, res) handler: `handleUpload` only needs `url` + `headers` from the
 * request, so a plain object stands in for the Web Request. Web-style returns time out
 * on this deployment's Node runtime.
 */
export const config = {
  maxDuration: 60,
};

const AUDIO_TYPES = ['audio/*', 'application/octet-stream'];

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    var chunks = [];
    var size = 0;
    var settled = false;
    req.on('data', function (chunk) {
      if (settled) return;
      size += chunk.length;
      if (size > 1024 * 1024) {
        settled = true;
        reject(new Error('Request body too large for a token request'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      if (settled) return;
      settled = true;
      var text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
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

  const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) {
    return send(res, 503, {
      error:
        'BLOB_READ_WRITE_TOKEN is not set on this deployment. In Vercel: Storage → Blob → connect the store to this project, then redeploy so the env var is injected.',
      code: 'NO_TOKEN',
      needsToken: true,
    });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, 400, { error: e && e.message ? e.message : 'Invalid JSON body' });
  }

  const host = req.headers && req.headers.host ? String(req.headers.host) : 'localhost';
  const requestShim = {
    url: 'https://' + host + (req.url || '/api/blob-upload'),
    headers: req.headers || {},
  };

  try {
    const jsonResponse = await handleUpload({
      body,
      request: requestShim,
      token,
      onBeforeGenerateToken: async (pathname, _clientPayload, _multipart) => {
        void pathname;
        return {
          allowedContentTypes: AUDIO_TYPES,
          maximumSizeInBytes: 512 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ t: Date.now() }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return send(res, 200, jsonResponse);
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    return send(res, 400, { error: message });
  }
}
