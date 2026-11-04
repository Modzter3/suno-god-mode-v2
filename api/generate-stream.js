import { buildChatBody, getProviderApiKey, getProviderHeaders, resolveProvider } from './providers.js';
import { parseOpenRouterErrorBody } from './openrouter-utils.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { prompt, model, provider: providerId } = await req.json();
    const provider = resolveProvider(providerId);

    const apiKey = getProviderApiKey(provider);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `Server misconfiguration: ${provider.envKey} is not set in Vercel project settings (provider: ${provider.label}).` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const siteUrl =
      process.env.OPENROUTER_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://localhost');

    const body = buildChatBody(provider, prompt, model, true);

    const response = await fetch(provider.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...getProviderHeaders(provider, siteUrl),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: parseOpenRouterErrorBody(errorText) }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
