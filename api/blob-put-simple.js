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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json(
      {
        error:
          'BLOB_READ_WRITE_TOKEN is not set. Link a Blob store in Vercel → Storage, then vercel env pull.',
      },
      503,
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
          'This file is too large for server upload (max ~4 MB on Vercel). Save a shorter clip or the app will try the large-file path in the browser.',
        code: 'TOO_LARGE',
      },
      413,
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const name = (typeof file.name === 'string' && file.name) || 'upload.bin';
    const contentType =
      (typeof file.type === 'string' && file.type) || 'application/octet-stream';

    const result = await put(name, buf, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType,
      addRandomSuffix: true,
    });

    return json({ url: result.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
}
