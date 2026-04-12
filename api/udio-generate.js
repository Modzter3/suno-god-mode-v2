const UDIO_BASE = 'https://udioapi.pro/api';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Style / lyrics caps from https://udioapi.pro/docs/v2-generate */
const MODEL_LIMITS = {
  'chirp-v3-5': { style: 200, prompt: 3000 },
  'chirp-v4-0': { style: 200, prompt: 3000 },
};

function limitsFor(model) {
  return MODEL_LIMITS[model] || { style: 1000, prompt: 5000 };
}

function clamp01(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) return undefined;
  return Math.min(0.99, Math.max(0, Math.round(x * 100) / 100));
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const key = process.env.UDIO_API_KEY;
  if (!key) {
    return json(
      { error: 'UDIO_API_KEY is not set in Vercel → Settings → Environment Variables.', code: 500 },
      500
    );
  }

  try {
    const body = await req.json();
    const model =
      typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'chirp-v4-5';
    const lim = limitsFor(model);

    let title = body.title != null ? String(body.title) : '';
    title = title.slice(0, 80);

    let style = body.style != null ? String(body.style) : '';
    style = style.slice(0, lim.style);

    let prompt = body.prompt != null ? String(body.prompt) : '';
    if (!prompt.trim()) {
      prompt = body.make_instrumental ? 'Instrumental.' : ' ';
    }
    prompt = prompt.slice(0, lim.prompt);

    const payload = {
      model,
      prompt,
      make_instrumental: Boolean(body.make_instrumental),
    };
    if (style) payload.style = style;
    if (title) payload.title = title;
    if (body.tags != null && String(body.tags).trim()) {
      payload.tags = String(body.tags).slice(0, 200);
    }
    if (body.gender === 'male' || body.gender === 'female') {
      payload.gender = body.gender;
    }

    const sw = clamp01(body.style_weight);
    const wc = clamp01(body.weirdness_constraint);
    const aw = clamp01(body.audio_weight);
    if (sw !== undefined) payload.style_weight = sw;
    if (wc !== undefined) payload.weirdness_constraint = wc;
    if (aw !== undefined) payload.audio_weight = aw;

    const res = await fetch(`${UDIO_BASE}/v2/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(function () {
      return { message: 'Invalid JSON from Udio' };
    });

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('udio-generate', e);
    return json({ error: e.message || 'Udio request failed', code: 500 }, 500);
  }
}
