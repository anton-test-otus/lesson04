import { getProviderConfig, normalizeProvider } from './providers.js';
import { probeProviderBaseUrl } from './providerProbe.js';

export async function checkProviderHealth(providerOverride) {
  const provider = normalizeProvider(providerOverride || process.env.AI_PROVIDER || 'ollama');

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      return {
        provider,
        status: 'error',
        error: 'OPENAI_API_KEY не задан',
      };
    }
    return { provider, status: 'ok', endpoint: 'https://api.openai.com/v1' };
  }

  const probe = await probeProviderBaseUrl(provider);

  if (!probe.baseUrl) {
    const lastProbe = probe.probes?.at(-1);
    return {
      provider,
      status: 'error',
      endpoint: process.env[provider === 'lmstudio' ? 'LMSTUDIO_BASE_URL' : 'OLLAMA_BASE_URL'],
      error: probe.error || lastProbe?.error || 'Провайдер недоступен',
      probes: probe.probes,
      hint: buildHint(provider),
    };
  }

  const config = getProviderConfig(provider);
  const resolvedModel = probe.body ? config.pickModel(probe.body) : config.model;

  return {
    provider,
    status: 'ok',
    endpoint: probe.baseUrl,
    model: resolvedModel,
    modelConfigured: config.model,
    modelMatched: resolvedModel === config.model,
    probes: probe.probes,
  };
}

function buildHint(provider) {
  if (provider === 'lmstudio') {
    return (
      'LM Studio: Local Server + «Serve on Local Network». ' +
      'В .env используйте host.docker.internal (не localhost). На Linux без GUI: lms server start --bind 0.0.0.0. ' +
      'Диагностика: GET /ai/diagnose'
    );
  }
  return 'Запустите Ollama на хосте (ollama serve). Диагностика: GET /ai/diagnose';
}

import { humanizeError } from './formatError.js';

export function formatLlmError(error, provider) {
  return humanizeError(error, provider);
}
