import { normalizeProvider } from './providers.js';

function envAgentEnabled() {
  return process.env.AI_TASKS_USE_AGENT === 'true';
}

/**
 * Tool-calling (createReactAgent) включается переменной AI_TASKS_USE_AGENT=true
 * и доступен только для lmstudio/openai.
 * @param {string} [providerOverride]
 */
export function resolveTasksAgentMode(providerOverride) {
  const provider = normalizeProvider(providerOverride || process.env.AI_PROVIDER || 'ollama');
  const configured = envAgentEnabled();
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

export function getTasksAgentStatus(providerOverride) {
  return resolveTasksAgentMode(providerOverride);
}
