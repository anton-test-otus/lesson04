import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { OUT_OF_SCOPE_MESSAGE } from './taskIntentSchema.js';
import { parseIntent } from './taskIntentParse.js';
import { parseLexicalWithLlm } from './lexicalParseLlm.js';
import { buildApiPlanWithLlm } from './apiPlanLlm.js';
import { runTaskToolAgent } from './taskAgentRun.js';
import { resolveTasksAgentMode } from './tasksAgentMode.js';
import { buildReply, executeTaskIntent } from './taskExecutor.js';
import { aiError, aiSuccess } from './taskResponse.js';

/** Имя графа для UI и логов. */
export const TASK_GRAPH_NAME = 'tasks';

/**
 * @param {string} nodeName
 * @param {(state: object, config?: import('@langchain/core/runnables').RunnableConfig) => Promise<object>} fn
 */
function stream(config, event) {
  config?.configurable?.onStreamEvent?.(event);
}

/**
 * @param {import('@langchain/core/runnables').RunnableConfig} [config]
 * @param {string | string[] | null | undefined} reason
 * @param {string} [source]
 */
function streamReject(config, reason, source) {
  const errors = Array.isArray(reason)
    ? reason
    : reason
      ? [String(reason)]
      : [];
  const text = errors.join('; ') || OUT_OF_SCOPE_MESSAGE;
  stream(config, {
    type: 'reject',
    reason: text,
    errors,
    source,
  });
}

function withGraphProgress(nodeName, fn) {
  return async (state, config) => {
    stream(config, {
      type: 'step',
      graph: TASK_GRAPH_NAME,
      node: nodeName,
      phase: 'start',
    });
    const updates = await fn(state, config);
    stream(config, {
      type: 'step',
      graph: TASK_GRAPH_NAME,
      node: nodeName,
      phase: 'done',
    });
    return updates;
  };
}

/**
 * @param {object} lexical
 */
function summarizeLexical(lexical) {
  return {
    operation: lexical.operation,
    detected_phrases: lexical.matched ?? [],
    filter: lexical.filter ?? {},
    mutation: lexical.mutation ?? {},
    create: lexical.create ?? {},
    complete: lexical.complete,
    reject_reason: lexical.reject_reason,
  };
}

/**
 * @param {object} apiPlan
 */
function summarizeApiPlan(apiPlan) {
  return {
    complete: apiPlan.complete,
    steps: apiPlan.steps ?? [],
    intent_action: apiPlan.intent?.action ?? null,
    intent: apiPlan.intent ?? null,
  };
}

const TaskGraphState = Annotation.Root({
  message: Annotation(),
  tasksContext: Annotation(),
  model: Annotation(),
  lexical: Annotation(),
  apiPlan: Annotation(),
  intent: Annotation(),
  execution: Annotation(),
  output: Annotation(),
});

/** @param {{ reason?: string }} intent */
function rejectResponse(intent) {
  const reason = intent.reason?.trim();
  return aiError(reason || OUT_OF_SCOPE_MESSAGE);
}

/** Нода 1: LLM + промпт — разбор ключевых смыслов. */
async function lexicalParseNode(state, config) {
  const lexical = await parseLexicalWithLlm(state.model, state.message, state.tasksContext);
  stream(config, { type: 'lexical', lexical: summarizeLexical(lexical) });
  if (lexical.operation === 'reject') {
    streamReject(config, lexical.reject_reason, 'lexical');
  }
  return { lexical };
}

/** Нода 2: LLM + промпт — план REST и intent. */
async function apiPlanNode(state, config) {
  const apiPlan = await buildApiPlanWithLlm(
    state.model,
    state.lexical,
    state.message,
    state.tasksContext
  );

  stream(config, { type: 'api_plan', apiPlan: summarizeApiPlan(apiPlan) });

  if (apiPlan.intent?.action === 'reject') {
    streamReject(config, apiPlan.intent.reason, 'api_plan');
    return {
      apiPlan,
      intent: apiPlan.intent,
    };
  }

  return {
    apiPlan,
    intent: apiPlan.complete ? apiPlan.intent : null,
  };
}

/** Fallback: единый structured intent. */
async function parseIntentNode(state) {
  const intent = await parseIntent(state.model, state.message, state.tasksContext);
  return { intent };
}

/** Fallback: ReAct + tools. */
async function toolAgentNode(state, config) {
  const mode = resolveTasksAgentMode(
    config?.configurable?.provider,
    config?.configurable?.useAgent
  );

  if (!mode.enabled) {
    return {};
  }

  const output = await runTaskToolAgent({
    model: state.model,
    message: state.message,
    tasksContext: state.tasksContext,
  });

  if (output) {
    return { output };
  }

  return {};
}

async function executeNode(state, config) {
  stream(config, {
    type: 'execute',
    intent_action: state.intent?.action ?? null,
  });
  const execution = await executeTaskIntent(state.intent);
  if (execution?.kind === 'reject') {
    streamReject(config, execution.reason, 'execute');
  }
  stream(config, {
    type: 'execute_done',
    kind: execution?.kind ?? null,
    reason: execution?.kind === 'reject' ? execution.reason : undefined,
    count:
      execution?.count ??
      execution?.tasks?.length ??
      execution?.updated?.length ??
      null,
  });
  return { execution };
}

async function respondNode(state, config) {
  if (state.output) {
    if (state.output.status === 'error') {
      streamReject(config, state.output.errors, 'agent');
    }
    return {};
  }

  if (state.intent?.action === 'reject') {
    if (!state.apiPlan?.intent || state.apiPlan.intent.action !== 'reject') {
      streamReject(config, state.intent.reason, 'intent');
    }
    return { output: rejectResponse(state.intent) };
  }

  const data = state.execution;
  if (data?.kind === 'reject') {
    return {
      output: rejectResponse({ reason: data.reason }),
    };
  }

  const action = buildReply(state.intent, data);
  return { output: aiSuccess(action, data) };
}

function routeAfterApiPlan(state, config) {
  if (state.intent?.action === 'reject') {
    return 'respond';
  }
  if (state.intent) {
    return 'execute';
  }
  const mode = resolveTasksAgentMode(
    config?.configurable?.provider,
    config?.configurable?.useAgent
  );
  if (mode.enabled) {
    return 'tool_agent';
  }
  return 'parse_intent';
}

function routeAfterToolAgent(state) {
  if (state.output) {
    return 'respond';
  }
  return 'parse_intent';
}

function routeAfterParse(state) {
  return state.intent?.action === 'reject' ? 'respond' : 'execute';
}

function buildTaskGraph() {
  return new StateGraph(TaskGraphState)
    .addNode('lexical_parse', withGraphProgress('lexical_parse', lexicalParseNode))
    .addNode('api_plan', withGraphProgress('api_plan', apiPlanNode))
    .addNode('tool_agent', withGraphProgress('tool_agent', toolAgentNode))
    .addNode('parse_intent', withGraphProgress('parse_intent', parseIntentNode))
    .addNode('execute', withGraphProgress('execute', executeNode))
    .addNode('respond', withGraphProgress('respond', respondNode))
    .addEdge(START, 'lexical_parse')
    .addEdge('lexical_parse', 'api_plan')
    .addConditionalEdges('api_plan', routeAfterApiPlan, {
      execute: 'execute',
      respond: 'respond',
      tool_agent: 'tool_agent',
      parse_intent: 'parse_intent',
    })
    .addConditionalEdges('tool_agent', routeAfterToolAgent, {
      respond: 'respond',
      parse_intent: 'parse_intent',
    })
    .addConditionalEdges('parse_intent', routeAfterParse, {
      respond: 'respond',
      execute: 'execute',
    })
    .addEdge('execute', 'respond')
    .addEdge('respond', END);
}

/** @type {import('@langchain/langgraph').CompiledStateGraph | null} */
let compiledGraph = null;

export function getTaskGraph() {
  if (!compiledGraph) {
    compiledGraph = buildTaskGraph().compile();
  }
  return compiledGraph;
}
