import { put } from '@vercel/blob';

/**
 * Small-file upload through the server (no browser SDK).
 * Vercel caps request bodies ~4.5 MB; larger files use /api/blob-upload (client multipart).
 */
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const MAX_BYTES = 4 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function safeBlobFilename(name) {
  var base = (typeof name === 'string' && name) || 'upload.bin';
  base = base.replace(/[/\\]/g, '_').replace(/[^\w.\-()+ ]/g, '_');
  if (base.length > 180) base = base.slice(-180);
  return base || 'upload.bin';
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  var token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) {
    return json(
      {
        error:
          'BLOB_READ_WRITE_TOKEN is not set or is empty. In Vercel: Storage → Blob → link store to this project, then redeploy so the env var is injected.',
      },
      503,
    );
  }

  if (typeof request.formData !== 'function') {
    return json(
      {
        error:
          'Server cannot read multipart uploads (missing formData). Redeploy with Node.js serverless functions.',
      },
      500,
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected multipart form data with a file field.' }, 400);
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'Missing file in form field "file".' }, 400);
  }

  const size = typeof file.size === 'number' ? file.size : 0;
  if (size > MAX_BYTES) {
    return json(
      {
        error:
          'This file is too large for server upload (max ~4 MB on Vercel). The app will use the browser upload path instead.',
        code: 'TOO_LARGE',
      },
      413,
    );
  }

  try {
    const name = safeBlobFilename(file.name);
    const contentType =
      (typeof file.type === 'string' && file.type) || 'application/octet-stream';

    /** Prefer stream to avoid buffering; fallback for older runtimes. */
    const body =
      typeof file.stream === 'function' ? file.stream() : Buffer.from(await file.arrayBuffer());

    const result = await put(name, body, {
      access: 'public',
      token,
      contentType,
      addRandomSuffix: true,
    });

    return json({ url: result.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
}
