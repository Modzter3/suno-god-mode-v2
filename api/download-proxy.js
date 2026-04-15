/**
 * Proxies remote audio/video files with Content-Disposition: attachment so browsers
 * save to disk instead of ignoring cross-origin <a download> or blocking fetch (no CORS).
 * GET: ?url=&name=  |  POST: JSON { "url", "name" } for very long signed URLs.
 */

export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

const MAX_URL_GET = 8192;
const MAX_URL_POST = 65536;

function sanitizeFilenameBase(s) {
  if (typeof s !== 'string') return '';
  var t = s.trim().slice(0, 200);
  if (!t) return '';
  return t.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();
}

function basenameFromPath(pathname) {
  try {
    var parts = pathname.split('/').filter(Boolean);
    var seg = parts.length ? parts[parts.length - 1] : '';
    if (!seg) return '';
    return decodeURIComponent(seg.split('?')[0] || '');
  } catch (e) {
    return '';
  }
}

function extFromMime(ct) {
  if (!ct || typeof ct !== 'string') return '.mp3';
  var c = ct.split(';')[0].trim().toLowerCase();
  if (c.indexOf('wav') !== -1) return '.wav';
  if (c.indexOf('mpeg') !== -1 || c === 'audio/mp3') return '.mp3';
  if (c.indexOf('mp4') !== -1 || c.indexOf('video/mp4') !== -1) return '.mp4';
  if (c.indexOf('ogg') !== -1) return '.ogg';
  if (c.indexOf('webm') !== -1) return '.webm';
  if (c.indexOf('flac') !== -1) return '.flac';
  if (c.indexOf('aac') !== -1) return '.aac';
  if (c.indexOf('m4a') !== -1) return '.m4a';
  return '.mp3';
}

function extFromPath(pathname) {
  var m = /\.([a-z0-9]{2,5})$/i.exec(pathname || '');
  return m ? '.' + m[1].toLowerCase() : '';
}

/** Basic SSRF guard: block obvious local/private hostnames (hostname only, no DNS). */
function isHostnameAllowed(hostname) {
  var h = String(hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) return false;
  if (h === '0.0.0.0' || h === '127.0.0.1' || h.startsWith('127.')) return false;
  if (h.startsWith('10.')) return false;
  if (h.startsWith('192.168.')) return false;
  if (h.startsWith('169.254.')) return false;
  var m = /^172\.(\d+)\./.exec(h);
  if (m) {
    var n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return false;
  }
  if (h.endsWith('.local') || h.endsWith('.internal')) return false;
  return true;
}

function contentDispositionHeader(filename) {
  var safe = String(filename || 'download')
    .replace(/[\r\n"]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .slice(0, 180);
  var utf8 = encodeURIComponent(filename || 'download');
  return 'attachment; filename="' + safe + '"; filename*=UTF-8\'\'' + utf8;
}

export default async function handler(req) {
  var rawTarget = '';
  var nameParam = '';

  if (req.method === 'GET') {
    var reqUrl;
    try {
      reqUrl = new URL(req.url);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    rawTarget = reqUrl.searchParams.get('url') || '';
    nameParam = reqUrl.searchParams.get('name') || '';
    if (!rawTarget || rawTarget.length > MAX_URL_GET) {
      return new Response(JSON.stringify({ error: 'Missing or oversized url parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return runProxy(rawTarget, nameParam);
  }

  if (req.method === 'POST') {
    var ct = (req.headers.get('content-type') || '').toLowerCase();
    try {
      if (ct.indexOf('application/json') !== -1) {
        var body = await req.json();
        rawTarget = body && typeof body.url === 'string' ? body.url : '';
        nameParam = body && typeof body.name === 'string' ? body.name : '';
      } else {
        var form = await req.formData();
        rawTarget = String(form.get('url') || '');
        nameParam = String(form.get('name') || '');
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!rawTarget || rawTarget.length > MAX_URL_POST) {
      return new Response(JSON.stringify({ error: 'Missing or oversized url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return runProxy(rawTarget, nameParam);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function runProxy(rawTarget, nameParam) {
  var target;
  try {
    target = new URL(rawTarget);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'Only http(s) URLs are allowed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isHostnameAllowed(target.hostname)) {
    return new Response(JSON.stringify({ error: 'Host not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  var ac = new AbortController();
  var kill = setTimeout(function () {
    ac.abort();
  }, 55000);

  var upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': 'suno-god-mode-download-proxy/1.0',
        Accept: 'audio/*,video/*,application/octet-stream,*/*;q=0.8',
      },
    });
  } catch (e) {
    clearTimeout(kill);
    return new Response(JSON.stringify({ error: 'Could not reach file URL' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  clearTimeout(kill);

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream returned ' + upstream.status }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  var mime = upstream.headers.get('content-type') || 'application/octet-stream';
  var base = sanitizeFilenameBase(nameParam) || basenameFromPath(target.pathname) || 'track';
  var hasExt = /\.(mp3|m4a|wav|flac|ogg|webm|aac|mp4)(\?|$)/i.test(base);
  var filename = base;
  if (!hasExt) {
    var pe = extFromPath(target.pathname);
    filename = base + (pe || extFromMime(mime));
  }

  var outHeaders = new Headers();
  outHeaders.set('Content-Type', mime.split(';')[0].trim());
  outHeaders.set('Content-Disposition', contentDispositionHeader(filename));
  var cl = upstream.headers.get('content-length');
  if (cl) outHeaders.set('Content-Length', cl);
  outHeaders.set('Cache-Control', 'private, no-store');

  return new Response(upstream.body, {
    status: 200,
    headers: outHeaders,
  });
}
