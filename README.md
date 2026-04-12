# Suno God Mode

Static web app plus Vercel Edge functions that call [OpenRouter](https://openrouter.ai/) for AI song prompts (no Poe dependency).

## Deploy on Vercel

1. Push this folder to a GitHub repository (see below).
2. In [Vercel](https://vercel.com), import the repo.
3. Add **Environment variables** (Project → Settings → Environment Variables):
   - `OPENROUTER_API_KEY` — your OpenRouter API key (required).
   - `OPENROUTER_MODEL` — optional; if unset, the app defaults to `openai/gpt-4o-mini`. The API also sends **fallback models** so a single unavailable slug does not fail the whole request (see [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)).
   - `OPENROUTER_SITE_URL` — optional; defaults to `https://$VERCEL_URL` for the `HTTP-Referer` header OpenRouter expects.
4. Deploy. The app uses `/api/models` (live OpenRouter model catalog for the picker), `/api/generate` (concept), `/api/generate-stream` (song, streaming), `/api/history` (optional saved generations), and optionally `/api/udio-generate` + `/api/udio-feed` for [Udio](https://udioapi.pro/docs) (Chirp) audio rendering.

### Udio (optional in-app audio)

- After a successful **Generate**, use **Send to Udio** to post title, style, and lyrics to [udioapi.pro](https://udioapi.pro/docs) (custom mode).
- Set **`UDIO_API_KEY`** in Vercel (Bearer token from your Udio account). Without it, the button will error when pressed.
- Credits and moderation are enforced by Udio; the UI polls until tracks complete or fail.
- **Stuck on “Sending to Udio”?** The server calls Udio and must finish within your **Vercel function time limit**. On **Hobby**, the default is often **10 seconds** — if Udio is slow, the function can time out before you get a task id. This repo sets **`maxDuration`** in `vercel.json` for `api/udio-generate` (60s); redeploy after pulling. If Vercel still caps at 10s on your plan, upgrade or ensure **UDIO_API_KEY** has no extra spaces and is enabled for **Production**. Check **Vercel → Project → Functions → Logs** for `/api/udio-generate`.

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
