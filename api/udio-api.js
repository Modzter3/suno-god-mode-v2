const UDIO_BASE = 'https://udioapi.pro/api';

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

/** Current Udio music models — https://udioapi.pro/docs/v2-extend */
const UDIO_MODELS = ['chirp-v6', 'chirp-v6-mini', 'chirp-v6-wild'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getApiKey() {
  const k = process.env.UDIO_API_KEY;
  return typeof k === 'string' ? k.trim() : '';
}

function clip(value, max) {
  if (value == null) return '';
  return String(value).slice(0, max);
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function pickModel(value) {
  const m = text(value);
  return UDIO_MODELS.includes(m) ? m : 'chirp-v6';
}

/** Normalise image_urls (docs: up to 5 public JPEG/PNG/WEBP, non-custom mode only). */
function pickImageUrls(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  return list
    .map(function (u) {
      return text(u);
    })
    .filter(function (u) {
      return /^https?:\/\//i.test(u);
    })
    .slice(0, 5);
}

/** /v2/extend — https://udioapi.pro/docs/v2-extend */
function buildExtendPayload(p) {
  const originTaskId = text(p.origin_task_id);
  if (!originTaskId) {
    return { error: 'origin_task_id is required (workId from a finished Udio task).' };
  }
  const payload = {
    origin_task_id: originTaskId,
    extend_audio_index: p.extend_audio_index === 1 || p.extend_audio_index === '1' ? 1 : 0,
    custom_mode: Boolean(p.custom_mode),
  };
  if (payload.custom_mode) {
    const prompt = clip(p.prompt, 5000);
    if (!prompt.trim()) {
      return { error: 'custom_mode requires prompt (lyrics for the new section).' };
    }
    payload.prompt = prompt;
    const style = clip(p.style, 1000);
    if (style.trim()) payload.style = style;
    const title = clip(p.title, 80);
    if (title.trim()) payload.title = title;
    const tags = clip(p.tags, 200);
    if (tags.trim()) payload.tags = tags;
    const start = Number(p.extensionStartTime);
    if (Number.isFinite(start) && start > 0) payload.extensionStartTime = start;
  }
  return { payload };
}

/** /v2/upload-cover/generate — title cap is 100 here (not 80). */
function buildUploadCoverPayload(p) {
  const uploadUrl = text(p.upload_url);
  if (!uploadUrl) {
    return { error: 'upload_url is required (public direct audio link, max 8 minutes).' };
  }
  const custom = Boolean(p.custom_mode);
  const instrumental = Boolean(p.make_instrumental);
  const payload = {
    upload_url: uploadUrl,
    model: pickModel(p.model),
    custom_mode: custom,
  };
  if (custom) {
    if (!instrumental) {
      const prompt = clip(p.prompt, 5000);
      if (!prompt.trim()) {
        return { error: 'Custom mode needs lyrics (or tick Instrumental).' };
      }
      payload.prompt = prompt;
    }
    payload.make_instrumental = instrumental;
    const style = clip(p.style, 1000);
    if (style.trim()) payload.style = style;
    const title = clip(p.title, 100);
    if (title.trim()) payload.title = title;
  } else {
    const prompt = clip(p.prompt, 500);
    if (!prompt.trim()) {
      return { error: 'Non-custom mode needs an idea prompt (max 500 chars).' };
    }
    payload.prompt = prompt;
    /** Docs: image_urls are ignored in custom mode, so only forward them here. */
    const images = pickImageUrls(p.image_urls);
    if (images.length) payload.image_urls = images;
  }
  return { payload };
}

const STATUS_PATHS = {
  uploadCoverStatus: '/v2/upload-cover/status',
  coverStatus: '/v2/cover/status',
  wavStatus: '/v2/wav/status',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const key = getApiKey();
  if (!key) {
    return json(
      { code: 500, message: 'UDIO_API_KEY is not set in Vercel → Settings → Environment Variables.' },
      500
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ code: 400, message: 'Invalid JSON body' }, 400);
  }

  const op = body && typeof body.op === 'string' ? body.op : '';
  const payload =
    body && body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? body.payload
      : {};
  const taskId = text(payload.task_id) || text(body && body.taskId);

  const ac = new AbortController();
  const kill = setTimeout(function () {
    ac.abort();
  }, 25000);

  try {
    let url = '';
    /** @type {RequestInit} */
    let init = { signal: ac.signal };
    const post = function (path, jsonBody) {
      url = `${UDIO_BASE}${path}`;
      init = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonBody),
        signal: ac.signal,
      };
    };

    switch (op) {
      case 'extend': {
        const built = buildExtendPayload(payload);
        if (built.error) return json({ code: 400, message: built.error }, 400);
        post('/v2/extend', built.payload);
        break;
      }
      case 'uploadCover': {
        const built = buildUploadCoverPayload(payload);
        if (built.error) return json({ code: 400, message: built.error }, 400);
        post('/v2/upload-cover/generate', built.payload);
        break;
      }
      case 'coverGenerate': {
        const coverTaskId = text(payload.taskId) || taskId;
        if (!coverTaskId) {
          return json({ code: 400, message: 'taskId is required (finished generate workId).' }, 400);
        }
        post('/v2/cover/generate', { taskId: coverTaskId });
        break;
      }
      case 'wavGenerate': {
        const audioId = text(payload.audio_id);
        if (!taskId || !audioId) {
          return json({ code: 400, message: 'task_id and audio_id are required.' }, 400);
        }
        post('/v2/wav/generate', { task_id: taskId, audio_id: audioId });
        break;
      }
      case 'timestampedLyrics': {
        const audioId = text(payload.audio_id);
        if (!taskId || !audioId) {
          return json({ code: 400, message: 'task_id and audio_id are required.' }, 400);
        }
        post('/v2/timestamped-lyrics', { task_id: taskId, audio_id: audioId });
        break;
      }
      case 'uploadCoverStatus':
      case 'coverStatus':
      case 'wavStatus': {
        if (!taskId) {
          return json({ code: 400, message: 'task_id is required.' }, 400);
        }
        url = `${UDIO_BASE}${STATUS_PATHS[op]}?task_id=${encodeURIComponent(taskId)}`;
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: ac.signal,
        };
        break;
      }
      default:
        return json({ code: 400, message: 'Unknown op' }, 400);
    }

    const res = await fetch(url, init);
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return json(
        { code: res.status, message: raw.slice(0, 200) || 'Non-JSON response from Udio' },
        res.ok ? 200 : res.status
      );
    }
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('udio-api', e);
    return json(
      {
        code: 500,
        message:
          e && e.name === 'AbortError'
            ? 'Udio request timed out'
            : e.message || 'Udio request failed',
      },
      500
    );
  } finally {
    clearTimeout(kill);
  }
}

