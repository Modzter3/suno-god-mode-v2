/**
 * Provider registry for the LLM gateways used by /api/generate and /api/generate-stream.
 * All providers speak the OpenAI-compatible /chat/completions dialect with Bearer auth.
 * @see https://docs.nano-gpt.com/api-reference/endpoint/chat-completion
 * @see https://docs.cline.bot/getting-started/clinepass
 * @see https://opencode.ai/docs/providers/
 */
export const PROVIDERS = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-4o-mini',
  },
  nanogpt: {
    id: 'nanogpt',
    label: 'NanoGPT',
    baseUrl: 'https://nano-gpt.com/api/v1',
    envKey: 'NANOGPT_API_KEY',
    defaultModel: 'openai/gpt-5.1',
  },
  'cline-pass': {
    id: 'cline-pass',
    label: 'ClinePass',
    baseUrl: 'https://api.cline.bot/api/v1',
    envKey: 'CLINEPASS_API_KEY',
    defaultModel: 'cline-pass/glm-5.3-flash',
  },
  'opencode-go': {
    id: 'opencode-go',
    label: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    envKey: 'OPENCODE_GO_API_KEY',
    defaultModel: 'glm-5.1',
  },
};

export const DEFAULT_PROVIDER_ID = 'openrouter';

/** Resolve a provider id from the client (falls back to OpenRouter). */
export function resolveProvider(providerFromClient) {
  const id = providerFromClient && String(providerFromClient).trim();
  if (id && PROVIDERS[id]) return PROVIDERS[id];
  return PROVIDERS[DEFAULT_PROVIDER_ID];
}

/** API key for a provider, from Vercel project env. */
export function getProviderApiKey(provider) {
  return process.env[provider.envKey] || '';
}

/**
 * OpenAI-compatible chat body. OpenRouter keeps its primary+fallbacks behavior;
 * other providers get a plain body (NanoGPT supports the same `models` fallback array).
 */
export function buildChatBody(provider, prompt, modelFromClient, stream) {
  const primary =
    (modelFromClient && String(modelFromClient).trim()) || provider.defaultModel;
  const body = {
    model: primary,
    messages: [{ role: 'user', content: prompt }],
  };
  if (provider.id === 'openrouter') {
    const MAX_FALLBACK_MODELS = 3;
    const FALLBACK_MODELS = [
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.0-flash-001',
      'anthropic/claude-3.5-sonnet',
    ];
    const fallbacks = FALLBACK_MODELS.filter((m) => m !== primary).slice(0, MAX_FALLBACK_MODELS);
    if (fallbacks.length > 0) body.models = fallbacks;
  } else if (provider.id === 'nanogpt') {
    body.stickyProvider = true;
  } else if (provider.id === 'opencode-go') {
    // Some Zen models always think and reject requests without a reasoning parameter.
    body.reasoning_effort = 'low';
  }
  if (stream) body.stream = true;
  return body;
}

/** Extra headers beyond Authorization for a provider (e.g. OpenCode session routing). */
export function getProviderHeaders(provider, siteUrl) {
  const headers = {};
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = siteUrl;
    headers['X-Title'] = 'Suno God Mode';
  } else if (provider.id === 'opencode-go') {
    // Required so Zen routes one conversation to the same upstream (prompt cache warmth).
    headers['x-opencode-session'] = 'suno-god-mode-' + Math.random().toString(36).slice(2, 10);
    headers['x-opencode-client'] = 'suno-god-mode';
  }
  return headers;
}

/** Curated ClinePass catalog (not publicly listable via API). @see https://models.dev/providers/cline-pass/ */
export const CLINEPASS_MODELS = [
  'cline-pass/glm-5.3-flash',
  'cline-pass/deepseek-v4.1-flash-1017',
  'cline-pass/deepseek-v4.1-flash',
  'cline-pass/deepseek-v4-pro',
  'cline-pass/glm-5.3',
  'cline-pass/kimi-k3.1-pro',
  'cline-pass/kimi-k3',
  'cline-pass/muse-spark-1.3-contributor',
  'cline-pass/minimax-m3.1-flash',
  'cline-pass/minimax-m3',
  'cline-pass/mimo-v2.6-pro',
  'cline-pass/mimo-v2.6-flash',
  'cline-pass/qwen3.7-max',
  'cline-pass/qwen3.7-plus',
  'cline-pass/qwen3.8-max',
];
