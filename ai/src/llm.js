import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { getProviderConfig, normalizeProvider, PROVIDERS } from './providers.js';
import { checkProviderHealth } from './providerHealth.js';
import { getTasksGraphStatus } from './tasksGraphMode.js';

export { PROVIDERS, normalizeProvider };

export function listProviders() {
  const configured = process.env.AI_PROVIDER || 'ollama';
  const config = getProviderConfig(configured);

  return {
    default: configured,
    available: PROVIDERS,
    models: {
      ollama: process.env.OLLAMA_MODEL || 'llama3.2',
      lmstudio: process.env.LMSTUDIO_MODEL || 'local-model',
      openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    endpoints: {
      ollama: process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434',
      lmstudio: process.env.LMSTUDIO_BASE_URL || 'http://host.docker.internal:1234/v1',
      openai: 'https://api.openai.com/v1',
    },
    resolvedModel: config.model,
    tasksGraph: getTasksGraphStatus(configured),
    tasksAgent: getTasksGraphStatus(configured).toolsAgent,
  };
}

/**
 * @param {string} [providerOverride]
 */
export async function createChatModel(providerOverride) {
  const provider = normalizeProvider(providerOverride || process.env.AI_PROVIDER || 'ollama');
  const health = await checkProviderHealth(provider);

  if (health.status !== 'ok') {
    throw new Error(health.hint || health.error || `Провайдер ${provider} недоступен`);
  }

  const timeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000);

  switch (provider) {
    case 'ollama': {
      const config = getProviderConfig('ollama');
      return new ChatOllama({
        baseUrl: config.baseUrl,
        model: health.model || config.model,
        temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
        maxRetries: 1,
      });
    }

    case 'lmstudio': {
      const config = getProviderConfig('lmstudio');
      return new ChatOpenAI({
        apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
        model: health.model || config.model,
        temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
        timeout,
        maxRetries: 1,
        configuration: {
          baseURL: config.baseUrl,
        },
      });
    }

    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      return new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
        timeout,
        maxRetries: 1,
      });

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
