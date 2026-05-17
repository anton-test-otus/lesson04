import { createChatModel, normalizeProvider } from './llm.js';
import { formatLlmError } from './providerHealth.js';
import { formatTasksContext } from './taskIntentParse.js';
import { getTaskGraph, TASK_GRAPH_NAME } from './taskGraph.js';
import { resolveTasksAgentMode } from './tasksAgentMode.js';
import * as tasksApi from './tasksApi.js';

export { TASK_GRAPH_NAME };

/**
 * @param {string} message
 * @param {string} [providerOverride]
 * @param {{
 *   onGraphStep?: (payload: { graph: string, node: string }) => void,
 *   onStreamEvent?: (event: object) => void,
 * }} [options]
 */
export async function handleTaskMessage(message, providerOverride, options = {}) {
  const provider = normalizeProvider(providerOverride || process.env.AI_PROVIDER || 'ollama');
  const model = await createChatModel(provider);
  const tasks = await tasksApi.listTasks();
  const tasksContext = formatTasksContext(tasks);
  const trimmed = message.trim();
  const { onGraphStep, onStreamEvent } = options;
  const agentMode = resolveTasksAgentMode(provider);

  const emit = (event) => {
    onStreamEvent?.(event);
    if (event.type === 'step' && event.graph && event.node) {
      onGraphStep?.({ graph: event.graph, node: event.node });
    }
  };

  try {
    emit({ type: 'step', graph: TASK_GRAPH_NAME, node: 'start', phase: 'start' });
    const graph = getTaskGraph();
    const finalState = await graph.invoke(
      {
        message: trimmed,
        model,
        tasksContext,
        lexical: null,
        apiPlan: null,
        intents: null,
        intent: null,
        execution: null,
        output: null,
      },
      {
        configurable: { onStreamEvent: emit, provider, useAgent: agentMode.enabled },
      }
    );

    if (!finalState.output) {
      throw new Error('Граф завершился без ответа');
    }

    return finalState.output;
  } catch (error) {
    throw new Error(formatLlmError(error, provider));
  }
}
