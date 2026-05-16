import { TASK_GRAPH_NAME } from './taskGraph.js';
import { getTasksAgentStatus } from './tasksAgentMode.js';

/**
 * @param {string} [providerOverride]
 */
export function getTasksGraphStatus(providerOverride) {
  const tools = getTasksAgentStatus(providerOverride);
  return {
    mode: 'langgraph',
    name: TASK_GRAPH_NAME,
    label: tools.enabled ? `${TASK_GRAPH_NAME}+tools` : TASK_GRAPH_NAME,
    toolsAgent: tools,
  };
}

export const getTasksAgentStatusForHealth = getTasksAgentStatus;
