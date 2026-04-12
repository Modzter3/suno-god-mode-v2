/**
 * Kie.ai requires a callBackUrl on create requests. Polling still works for results.
 * This endpoint only ACKs webhooks so their servers get HTTP 200.
 */
export const config = {
  runtime: 'edge',
  maxDuration: 10,
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method === 'GET') {
    return new Response('ok', { status: 200 });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    await req.text();
  } catch {
    /* ignore */
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
