const UDIO_BASE = 'https://udioapi.pro/api';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const key = process.env.UDIO_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: 'UDIO_API_KEY is not set.', code: 500 }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const workId = url.searchParams.get('workId');
  if (!workId) {
    return new Response(JSON.stringify({ error: 'workId query required', code: 400 }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(
      `${UDIO_BASE}/v2/feed?workId=${encodeURIComponent(workId)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
      }
    );
    const data = await res.json().catch(function () {
      return { message: 'Invalid JSON from Udio feed' };
    });
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('udio-feed', e);
    return new Response(JSON.stringify({ error: e.message || 'Feed failed', code: 500 }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
