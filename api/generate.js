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

    const body = buildChatBody(provider, prompt, model, false);

    const response = await fetch(provider.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...getProviderHeaders(provider, siteUrl),
      },
      body: JSON.stringify(body),
    });

    const rawErr = await response.text();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: parseOpenRouterErrorBody(rawErr) }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = JSON.parse(rawErr);
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (content == null || content === '') {
      return new Response(
        JSON.stringify({ error: 'Empty response from model. Try another model in the dropdown.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ content }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
