export const config = {
  runtime: 'edge',
};

import { PROVIDERS, CLINEPASS_MODELS } from './providers.js';

/**
 * Proxies the model catalog for the selected provider so the UI always shows current IDs.
 * - openrouter: live proxy of OpenRouter's catalog
 * - nanogpt / opencode-go: live proxy of their OpenAI-compatible /models endpoint
 * - cline-pass: static curated list (not publicly listable)
 * @see https://openrouter.ai/docs/api-reference/list-available-models
 * @see https://docs.nano-gpt.com/api-reference/endpoint/chat-completion
 */
export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url, 'https://placeholder.local');
  const providerId = url.searchParams.get('provider') || 'openrouter';
  const provider = PROVIDERS[providerId] || PROVIDERS.openrouter;
  const apiKey = process.env[provider.envKey] || '';

  try {
    if (provider.id === 'cline-pass') {
      return new Response(JSON.stringify({ data: CLINEPASS_MODELS.map(function (id) { return { id: id, name: id }; }) }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      });
    }

    const headers = { Accept: 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const upstream = await fetch(provider.baseUrl + '/models', { headers });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: text || upstream.statusText }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const json = await upstream.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    const minimal = rows.map(function (m) {
      return {
        id: m.id,
        name: m.name || m.id,
        context_length: m.context_length,
      };
    });

    minimal.sort(function (a, b) {
      return a.id.localeCompare(b.id, undefined, { sensitivity: 'base' });
    });

    return new Response(JSON.stringify({ data: minimal }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Failed to load models' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
