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

export function formatLlmError(error, provider) {
  const message = error instanceof Error ? error.message : String(error);
  const name = normalizeProvider(provider);

  if (/connection error|fetch failed|econnrefused|enotfound|network|timed out/i.test(message)) {
    if (name === 'lmstudio') {
      return (
        'Нет связи с LM Studio из Docker. ' +
        'localhost:1234 в .env не подходит (это контейнер, не ПК). ' +
        'Включите lms server start --bind 0.0.0.0 или откройте /ai/diagnose'
      );
    }
    if (name === 'ollama') {
      return 'Нет связи с Ollama из Docker. Запустите ollama serve; не используйте localhost в .env.';
    }
    return `Нет связи с ${name}: ${message}`;
  }

  if (/model.*not found|404/i.test(message)) {
    return (
      `Модель не найдена (${name}). Проверьте LMSTUDIO_MODEL / OLLAMA_MODEL по списку /models.`
    );
  }

  return message;
}
