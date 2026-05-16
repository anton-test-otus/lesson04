import { normalizeProvider } from './llm.js';

/**
 * @param {string} [providerOverride]
 */
export function getTasksAgentStatus(providerOverride) {
  const provider = normalizeProvider(providerOverride || process.env.AI_PROVIDER || 'ollama');
  const configured = process.env.AI_TASKS_USE_AGENT === 'true';
  const agentCapable = ['lmstudio', 'openai'].includes(provider);
  const enabled = configured && agentCapable;

  return {
    enabled,
    configured,
    agentCapable,
    provider,
    label: enabled ? 'on' : 'off',
  };
}
