import { getProviderConfig, normalizeProvider } from './providers.js';

const TIMEOUT_MS = 2500;

/** @type {Record<string, { base: string, body: unknown } | null>} */
const resolvedCache = {
  lmstudio: null,
  ollama: null,
};

function providerBaseUrl(provider) {
  return getProviderConfig(provider).baseUrl;
}

async function tryBaseUrl(base, modelsPath) {
  const url = `${base}${modelsPath}`;
  const started = Date.now();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Date.now() - started;

    if (!response.ok) {
      return { base, url, ok: false, status: response.status, ms, error: `HTTP ${response.status}` };
    }

    const body = await response.json();
    return { base, url, ok: true, status: response.status, ms, body };
  } catch (error) {
    return {
      base,
      url,
      ok: false,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeAllCandidates(provider) {
  const config = getProviderConfig(provider);
  const base = providerBaseUrl(provider);
  const probe = await tryBaseUrl(base, config.modelsPath);
  const probes = [probe];

  if (probe.ok) {
    resolvedCache[provider] = { base: probe.base, body: probe.body };
    return { baseUrl: probe.base, probes, body: probe.body };
  }

  return {
    baseUrl: null,
    probes,
    error: `Провайдер недоступен: ${base}${config.modelsPath}`,
  };
}

export async function probeProviderBaseUrl(providerName) {
  const provider = normalizeProvider(providerName);

  if (provider === 'openai') {
    return { provider, baseUrl: 'https://api.openai.com/v1', probes: [] };
  }

  const cached = resolvedCache[provider];
  if (cached) {
    return {
      provider,
      baseUrl: cached.base,
      body: cached.body,
      probes: [],
      cached: true,
    };
  }

  const result = await probeAllCandidates(provider);
  return { provider, ...result };
}

export async function diagnoseConnections(activeProviderOnly = true) {
  const active = normalizeProvider(process.env.AI_PROVIDER || 'ollama');
  const providersToTest =
    activeProviderOnly && active !== 'openai' ? [active] : ['lmstudio', 'ollama'];

  const results = {};

  await Promise.all(
    providersToTest.map(async (provider) => {
      const { probes } = await probeAllCandidates(provider);
      results[provider] = {
        configured: providerBaseUrl(provider),
        resolved: resolvedCache[provider]?.base ?? null,
        probes,
      };
    })
  );

  return {
    service: 'ai',
    activeProvider: active,
    note:
      'В .env используйте host.docker.internal (не localhost). Linux CLI: lms server start --bind 0.0.0.0 --port 1234',
    providers: results,
  };
}
