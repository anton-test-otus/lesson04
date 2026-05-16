export const PROVIDERS = ['ollama', 'lmstudio', 'openai'];

const DEFAULT_BASE_URLS = {
  ollama: 'http://host.docker.internal:11434',
  lmstudio: 'http://host.docker.internal:1234/v1',
};

function envBaseUrl(name, fallback) {
  return (process.env[name] || fallback).replace(/\/$/, '');
}

export function normalizeProvider(name) {
  const key = String(name || 'ollama')
    .toLowerCase()
    .replace(/[_-]/g, '');
  if (key === 'lmstudio') return 'lmstudio';
  if (key === 'ollama') return 'ollama';
  if (key === 'openai') return 'openai';
  return String(name).toLowerCase();
}

export function getProviderConfig(provider) {
  const p = normalizeProvider(provider);

  switch (p) {
    case 'ollama':
      return {
        provider: p,
        baseUrl: envBaseUrl('OLLAMA_BASE_URL', DEFAULT_BASE_URLS.ollama),
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        modelsPath: '/api/tags',
        pickModel: (body) => {
          const names = (body?.models || []).map((m) => m.name);
          const configured = process.env.OLLAMA_MODEL || 'llama3.2';
          if (names.includes(configured)) return configured;
          const partial = names.find((n) => n.includes(configured) || configured.includes(n));
          return partial || names[0] || configured;
        },
      };
    case 'lmstudio':
      return {
        provider: p,
        baseUrl: envBaseUrl('LMSTUDIO_BASE_URL', DEFAULT_BASE_URLS.lmstudio),
        model: process.env.LMSTUDIO_MODEL || 'local-model',
        modelsPath: '/models',
        pickModel: (body) => {
          const ids = (body?.data || []).map((m) => m.id);
          const configured = process.env.LMSTUDIO_MODEL || 'local-model';
          if (ids.includes(configured)) return configured;
          const partial = ids.find((id) => id.includes(configured) || configured.includes(id));
          return partial || ids[0] || configured;
        },
      };
    case 'openai':
      return {
        provider: p,
        baseUrl: 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
