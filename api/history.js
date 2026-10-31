import postgres from 'postgres';

/**
 * Past generations — works with Prisma Postgres, Neon, or any standard Postgres URL.
 * Uses POSTGRES_URL, POSTGRES_PRISMA_URL, or DATABASE_URL (first non-empty).
 * URLs like prisma:// (Accelerate only) are not supported here; use the direct SQL URL from your provider.
 *
 * Classic Node (req, res) handler on purpose: Web-style `return new Response(...)`
 * handlers on this project's Node runtime never answer (they hang until timeout).
 */
export const config = {
  maxDuration: 30,
};

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    var chunks = [];
    var size = 0;
    var settled = false;
    req.on('data', function (chunk) {
      if (settled) return;
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        settled = true;
        reject(new Error('Request body too large'));
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

function getConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.PRISMA_DATABASE_URL ||
    ''
  ).trim();
}

/** Prisma Accelerate / Data Proxy URLs need a different client — not this route. */
function isDirectPostgresUrl(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.startsWith('postgres://') || u.startsWith('postgresql://');
}

function dbAvailable() {
  const url = getConnectionString();
  return Boolean(url && isDirectPostgresUrl(url));
}

let sqlSingleton;
function getSql() {
  if (!dbAvailable()) return null;
  if (!sqlSingleton) {
    const url = getConnectionString();
    sqlSingleton = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 12,
      prepare: false,
    });
  }
  return sqlSingleton;
}

let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS generations (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      title TEXT NOT NULL DEFAULT '',
      style_prompt TEXT NOT NULL DEFAULT '',
      lyrics TEXT NOT NULL DEFAULT '',
      slider_settings TEXT NOT NULL DEFAULT '',
      genre_primary TEXT,
      genre_secondary TEXT,
      mood TEXT,
      model TEXT,
      reference_artist TEXT,
      instrumental BOOLEAN NOT NULL DEFAULT FALSE,
      raw_content TEXT
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations (created_at DESC)
  `;
  tableEnsured = true;
}

function serializeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) {
    let v = row[k];
    if (typeof v === 'bigint') v = v.toString();
    if (v instanceof Date) v = v.toISOString();
    out[k] = v;
  }
  return out;
}

export default async function handler(req, res) {
  const rawUrl = getConnectionString();
  if (!rawUrl) {
    if (req.method === 'GET') {
      return send(res, 200, { ok: true, notConfigured: true, items: [], total: 0 });
    }
    if (req.method === 'POST' || req.method === 'DELETE') {
      return send(res, 503, { ok: false, notConfigured: true, error: 'Database not linked' });
    }
    return sendText(res, 405, 'Method Not Allowed');
  }

  if (!isDirectPostgresUrl(rawUrl)) {
    if (req.method === 'GET') {
      return send(res, 200, {
        ok: true,
        notConfigured: true,
        items: [],
        total: 0,
        hint: 'Use the direct postgres:// or postgresql:// URL (not prisma://) in DATABASE_URL or POSTGRES_URL.',
      });
    }
    return send(res, 503, {
      ok: false,
      error:
        'This app needs a direct Postgres connection string (postgres://…). Copy it from Prisma / Vercel Storage, not the Prisma Accelerate URL.',
    });
  }

  const sql = getSql();

  try {
    await ensureTable();
  } catch (e) {
    console.error('history ensureTable', e);
    return send(res, 500, { ok: false, error: (e && e.message) || 'Database init failed' });
  }

  const url = new URL(req.url || '/api/history', 'http://localhost');

  if (req.method === 'GET') {
    const id = url.searchParams.get('id');
    try {
      if (id) {
        const rows = await sql`
          SELECT id, created_at, title, style_prompt, lyrics, slider_settings,
                 genre_primary, genre_secondary, mood, model, reference_artist, instrumental, raw_content
          FROM generations WHERE id = ${id} LIMIT 1
        `;
        if (!rows.length) return send(res, 404, { ok: false, error: 'Not found' });
        return send(res, 200, { ok: true, item: serializeRow(rows[0]) });
      }

      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

      const rows = await sql`
        SELECT id, created_at, title, genre_primary, genre_secondary, mood, model, instrumental,
          SUBSTRING(style_prompt FROM 1 FOR 160) AS style_preview,
          SUBSTRING(lyrics FROM 1 FOR 120) AS lyrics_preview
        FROM generations
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const countRows = await sql`SELECT COUNT(*)::int AS c FROM generations`;
      const total = countRows[0] ? Number(countRows[0].c) : 0;

      return send(res, 200, {
        ok: true,
        items: rows.map(serializeRow),
        total,
        limit,
        offset,
      });
    } catch (e) {
      console.error('history GET', e);
      return send(res, 500, { ok: false, error: (e && e.message) || 'Query failed' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      const title = String(body.title || '').slice(0, 2000);
      const style_prompt = String(body.stylePrompt || body.style_prompt || '');
      const lyrics = String(body.lyrics || '');
      const slider_settings = String(body.sliderSettings || body.slider_settings || '');
      const genre_primary = body.genrePrimary != null ? String(body.genrePrimary).slice(0, 200) : null;
      const genre_secondary = body.genreSecondary != null ? String(body.genreSecondary).slice(0, 200) : null;
      const mood = body.mood != null ? String(body.mood).slice(0, 120) : null;
      const model = body.model != null ? String(body.model).slice(0, 200) : null;
      const reference_artist =
        body.referenceArtist != null ? String(body.referenceArtist).slice(0, 200) : null;
      const instrumental = Boolean(body.instrumental);
      const raw_content = body.rawContent != null ? String(body.rawContent).slice(0, 500000) : null;

      const rows = await sql`
        INSERT INTO generations (
          title, style_prompt, lyrics, slider_settings,
          genre_primary, genre_secondary, mood, model, reference_artist, instrumental, raw_content
        ) VALUES (
          ${title}, ${style_prompt}, ${lyrics}, ${slider_settings},
          ${genre_primary}, ${genre_secondary}, ${mood}, ${model}, ${reference_artist}, ${instrumental}, ${raw_content}
        )
        RETURNING id, created_at
      `;
      const row = serializeRow(rows[0]);
      return send(res, 200, { ok: true, id: row.id, created_at: row.created_at });
    } catch (e) {
      console.error('history POST', e);
      return send(res, 500, { ok: false, error: (e && e.message) || 'Insert failed' });
    }
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return send(res, 400, { ok: false, error: 'Missing id' });
    try {
      await sql`DELETE FROM generations WHERE id = ${id}`;
      return send(res, 200, { ok: true });
    } catch (e) {
      console.error('history DELETE', e);
      return send(res, 500, { ok: false, error: (e && e.message) || 'Delete failed' });
    }
  }

  return sendText(res, 405, 'Method Not Allowed');
}

