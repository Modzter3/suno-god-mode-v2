import { handleUpload } from '@vercel/blob/client';

/** Client-direct uploads (large audio); needs BLOB_READ_WRITE_TOKEN from a Vercel Blob store. */
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const AUDIO_TYPES = ['audio/*', 'application/octet-stream'];

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

  const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) {
    return json(
      {
        error:
          'BLOB_READ_WRITE_TOKEN is not set or empty. Link a Blob store to this project in Vercel → Storage, then redeploy.',
      },
      503,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
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

    return json(jsonResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 400);
  }
}
