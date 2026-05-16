import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

const PROVIDERS = ['ollama', 'lmstudio', 'openai'];

export function listProviders() {
  const configured = process.env.AI_PROVIDER || 'ollama';

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
  };
}

/**
 * @param {string} [providerOverride]
 * @returns {import('@langchain/core/language_models/chat_models').BaseChatModel}
 */
function normalizeProvider(name) {
  const key = name.toLowerCase().replace(/[_-]/g, '');
  if (key === 'lmstudio') return 'lmstudio';
  if (key === 'ollama') return 'ollama';
  if (key === 'openai') return 'openai';
  return name.toLowerCase();
}

export function createChatModel(providerOverride) {
  const provider = normalizeProvider(
    providerOverride || process.env.AI_PROVIDER || 'ollama'
  );

  switch (provider) {
    case 'ollama':
      return new ChatOllama({
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434',
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
      });

    case 'lmstudio':
      return new ChatOpenAI({
        apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
        model: process.env.LMSTUDIO_MODEL || 'local-model',
        temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
        configuration: {
          baseURL: process.env.LMSTUDIO_BASE_URL || 'http://host.docker.internal:1234/v1',
        },
      });

    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      return new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
      });

    default:
      throw new Error(`Unknown provider: ${provider}. Use: ${PROVIDERS.join(', ')}`);
  }
}
