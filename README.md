# Suno God Mode

Static web app plus Vercel Edge functions that call [OpenRouter](https://openrouter.ai/) for AI song prompts (no Poe dependency).

## Deploy on Vercel

1. Push this folder to a GitHub repository (see below).
2. In [Vercel](https://vercel.com), import the repo.
3. Add **Environment variables** (Project → Settings → Environment Variables):
   - `OPENROUTER_API_KEY` — your OpenRouter API key (required).
   - `OPENROUTER_MODEL` — optional; if unset, the app defaults to `openai/gpt-4o-mini`. The API also sends **fallback models** so a single unavailable slug does not fail the whole request (see [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)).
   - `OPENROUTER_SITE_URL` — optional; defaults to `https://$VERCEL_URL` for the `HTTP-Referer` header OpenRouter expects.
   - **`BLOB_READ_WRITE_TOKEN`** — optional; create a [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store on the project to enable **Upload audio** on Kie tabs (public URLs for Kie `uploadUrl`).
4. Deploy. The app uses `/api/models` (live OpenRouter model catalog for the picker), `/api/generate` (concept), `/api/generate-stream` (song, streaming), `/api/history` (optional saved generations), optionally `/api/udio-generate` + `/api/udio-feed` for [Udio](https://udioapi.pro/docs) (Chirp) audio rendering, `/api/kie-api` + `/api/kie-callback` for the [Kie.ai Suno API](https://docs.kie.ai/suno-api/quickstart) (generate, lyrics, extend, music video, stems, WAV), and optionally **`/api/blob-upload`** (Vercel Blob client uploads for Kie audio URLs).

### Kie.ai (optional)

- After **Generate**, open **Kie.ai Suno API** for Suno-style flows and extras from [their docs](https://docs.kie.ai/suno-api/quickstart): **Generate**, **Lyrics only**, **Extend** (platform audio), **Music video**, **Stems** (vocal / 12-stem), **WAV**, **Cover upload** (URL), **Upload extend** (URL), **+ Instrumental**, **+ Vocals**, **Align lyrics** (timestamped), **Persona**, **MIDI** (after a stem job — use the **stem task id**).
- Set **`KIE_API_KEY`** (Bearer token from [kie.ai/api-key](https://kie.ai/api-key)). Kie requires a webhook URL on most create calls; the app defaults to **`https://<your-deployment>/api/kie-callback`**. If local `http` dev fails their URL validation, set **`KIE_CALLBACK_URL`** to your **HTTPS** production callback (see `.env.example`).
- Upload-style actions need a **public HTTPS URL** to your audio file. You can **paste any direct link**, or use **Vercel Blob**: create a **Blob** store (Vercel → Storage), ensure **`BLOB_READ_WRITE_TOKEN`** is set (`vercel env pull` locally), then use **“Upload audio”** on the Kie tabs — the UI fills the URL field with a public blob URL Kie can fetch.
- Billing and moderation are enforced by Kie; see their docs and pricing.

### Udio (optional in-app audio)

- After a successful **Generate**, use **Send to Udio** to post title, style, and lyrics to [udioapi.pro](https://udioapi.pro/docs) (custom mode).
- Set **`UDIO_API_KEY`** in Vercel (Bearer token from your Udio account). Without it, the button will error when pressed.
- Credits and moderation are enforced by Udio; the UI polls until tracks complete or fail.
- **Gateway timeout / Hobby 10s:** Use **“Call Udio from browser”** in the UI, paste your Udio Bearer token (stored in `sessionStorage` only). That skips Vercel entirely for the generate + feed calls. Server **`UDIO_API_KEY`** is only for the Vercel proxy path (works best on **Pro** or when Udio responds fast). The proxy routes use **Edge** runtime with a 30s cap; slow Udio responses can still 504 on free tiers — browser mode avoids that.

### Past results (database)

- In the UI, **History** lists past generations. Each successful **Generate** is saved automatically.
- **Without a database:** entries are stored in **localStorage** in that browser only (up to 100 items).
- **With Postgres:** link **Prisma Postgres** or any Postgres in Vercel **Storage**. The env var must be a **direct** URL starting with `postgres://` or `postgresql://` (the URL you use for raw SQL / Prisma migrate). **Not** a `prisma://` Accelerate-only URL. Typical names: `POSTGRES_URL`, `DATABASE_URL`, or `POSTGRES_PRISMA_URL`. Redeploy after linking. The `generations` table is created on first use.
- **Privacy:** the history API has no per-user auth; anyone who can open your deployed site can read or delete stored rows. For a public app, treat this as a convenience store, not private vault data.

## Local development

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
# Add OPENROUTER_API_KEY to .env.local or use `vercel env add`
vercel dev
```

Open the URL shown (usually `http://localhost:3000`).

## Push to GitHub

```bash
cd suno-god-mode
git init
git add .
git commit -m "Add Suno God Mode with OpenRouter"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Then connect the repo in Vercel and set `OPENROUTER_API_KEY`.
