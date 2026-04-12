const KIE_BASE = 'https://api.kie.ai';

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

function getApiKey() {
  const k = process.env.KIE_API_KEY;
  return typeof k === 'string' ? k.trim() : '';
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function callbackUrl(req) {
  const fixed = process.env.KIE_CALLBACK_URL;
  if (typeof fixed === 'string' && fixed.trim()) {
    return fixed.trim();
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (!host) {
    return 'https://invalid.local/api/kie-callback';
  }
  return `${proto}://${host}/api/kie-callback`;
}

function injectCallback(/** @type {Record<string, unknown>} */ payload, req) {
  const out = { ...payload };
  if (!out.callBackUrl) {
    out.callBackUrl = callbackUrl(req);
  }
  return out;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const key = getApiKey();
  if (!key) {
    return json({ code: 500, msg: 'KIE_API_KEY is not set.' }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ code: 400, msg: 'Invalid JSON body' }, 400);
  }

  const op = body && typeof body.op === 'string' ? body.op : '';
  const payload =
    body && body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? body.payload
      : {};
  const taskId =
    typeof body.taskId === 'string'
      ? body.taskId
      : typeof payload.taskId === 'string'
        ? payload.taskId
        : '';

  const ac = new AbortController();
  const kill = setTimeout(function () {
    ac.abort();
  }, 25000);

  try {
    let url;
    /** @type {RequestInit} */
    let init = { signal: ac.signal };

    switch (op) {
      case 'generate': {
        url = `${KIE_BASE}/api/v1/generate`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'recordInfo': {
        if (!taskId) {
          return json({ code: 400, msg: 'taskId required' }, 400);
        }
        url = `${KIE_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`;
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: ac.signal,
        };
        break;
      }
      case 'extend': {
        url = `${KIE_BASE}/api/v1/generate/extend`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'lyrics': {
        url = `${KIE_BASE}/api/v1/lyrics`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'lyricsInfo': {
        if (!taskId) {
          return json({ code: 400, msg: 'taskId required' }, 400);
        }
        url = `${KIE_BASE}/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`;
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: ac.signal,
        };
        break;
      }
      case 'mp4': {
        url = `${KIE_BASE}/api/v1/mp4/generate`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'mp4Info': {
        if (!taskId) {
          return json({ code: 400, msg: 'taskId required' }, 400);
        }
        url = `${KIE_BASE}/api/v1/mp4/record-info?taskId=${encodeURIComponent(taskId)}`;
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: ac.signal,
        };
        break;
      }
      case 'wav': {
        url = `${KIE_BASE}/api/v1/wav/generate`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'wavInfo': {
        if (!taskId) {
          return json({ code: 400, msg: 'taskId required' }, 400);
        }
        url = `${KIE_BASE}/api/v1/wav/record-info?taskId=${encodeURIComponent(taskId)}`;
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: ac.signal,
        };
        break;
      }
      case 'vocalRemoval': {
        url = `${KIE_BASE}/api/v1/vocal-removal/generate`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'vocalInfo': {
        if (!taskId) {
          return json({ code: 400, msg: 'taskId required' }, 400);
        }
        url = `${KIE_BASE}/api/v1/vocal-removal/record-info?taskId=${encodeURIComponent(taskId)}`;
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: ac.signal,
        };
        break;
      }
      case 'uploadCover': {
        url = `${KIE_BASE}/api/v1/generate/upload-cover`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'uploadExtend': {
        url = `${KIE_BASE}/api/v1/generate/upload-extend`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'addInstrumental': {
        url = `${KIE_BASE}/api/v1/generate/add-instrumental`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'addVocals': {
        url = `${KIE_BASE}/api/v1/generate/add-vocals`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'timestampedLyrics': {
        url = `${KIE_BASE}/api/v1/generate/get-timestamped-lyrics`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...payload }),
          signal: ac.signal,
        };
        break;
      }
      case 'generatePersona': {
        url = `${KIE_BASE}/api/v1/generate/generate-persona`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...payload }),
          signal: ac.signal,
        };
        break;
      }
      case 'midiGenerate': {
        url = `${KIE_BASE}/api/v1/midi/generate`;
        init = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(injectCallback({ ...payload }, req)),
          signal: ac.signal,
        };
        break;
      }
      case 'midiInfo': {
        if (!taskId) {
          return json({ code: 400, msg: 'taskId required' }, 400);
        }
        url = `${KIE_BASE}/api/v1/midi/record-info?taskId=${encodeURIComponent(taskId)}`;
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: ac.signal,
        };
        break;
      }
      default:
        return json({ code: 400, msg: 'Unknown op' }, 400);
    }

    const res = await fetch(url, init);
    const data = await res.json().catch(function () {
      return { msg: 'Non-JSON from Kie' };
    });
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('kie-api', e);
    return json(
      { code: 500, msg: e && e.name === 'AbortError' ? 'Kie request timeout' : e.message || 'Kie failed' },
      500
    );
  } finally {
    clearTimeout(kill);
  }
}
