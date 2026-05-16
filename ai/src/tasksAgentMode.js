import { normalizeProvider } from './providers.js';

function envAgentEnabled() {
  return process.env.AI_TASKS_USE_AGENT === 'true';
}

/**
 * @param {unknown} requestUseAgent
 * @returns {boolean | undefined}
 */
function parseRequestUseAgent(requestUseAgent) {
  if (requestUseAgent === true || requestUseAgent === 'true') {
    return true;
  }
  if (requestUseAgent === false || requestUseAgent === 'false') {
    return false;
  }
  return undefined;
}

/**
 * Tool-calling (createReactAgent) доступен для lmstudio/openai с поддержкой tools.
 * @param {string} [providerOverride]
 * @param {unknown} [requestUseAgent]
 */
export function resolveTasksAgentMode(providerOverride, requestUseAgent) {
  const provider = normalizeProvider(providerOverride || process.env.AI_PROVIDER || 'ollama');
  const configured = envAgentEnabled();
  const agentCapable = ['lmstudio', 'openai'].includes(provider);
  const requested = parseRequestUseAgent(requestUseAgent);
  const useAgent = requested ?? configured;
  const enabled = useAgent && agentCapable;

  return {
    enabled,
    configured,
    agentCapable,
    provider,
    requested: requested ?? null,
    useAgent,
    label: enabled ? 'on' : 'off',
  };
}

export function getTasksAgentStatus(providerOverride) {
  return resolveTasksAgentMode(providerOverride);
}
