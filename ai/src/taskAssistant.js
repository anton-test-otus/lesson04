import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { createChatModel, normalizeProvider } from './llm.js';
import { humanizeError } from './formatError.js';
import { formatLlmError } from './providerHealth.js';
import {
  AGENT_SYSTEM,
  OUT_OF_SCOPE_MESSAGE,
  TASK_INTENT_SYSTEM,
  TaskIntentSchema,
  formatTasksContext,
} from './taskIntentSchema.js';
import { parseTaskListFromMessage } from './parseTaskListMessage.js';
import { buildReply, executeTaskIntent, shouldReturnTasks } from './taskExecutor.js';
import { aiError, aiSuccess, withTasks } from './taskResponse.js';
import { buildTaskTools } from './taskTools.js';
import * as tasksApi from './tasksApi.js';

function extractJson(text) {
  const raw = String(text).trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  return JSON.parse(candidate);
}

async function parseIntentWithStructuredOutput(model, message, tasksContext) {
  const structured = model.withStructuredOutput(TaskIntentSchema, {
    name: 'task_intent',
  });

  return structured.invoke([
    new SystemMessage(`${TASK_INTENT_SYSTEM}\n\nТекущие задачи:\n${tasksContext}`),
    new HumanMessage(message),
  ]);
}

async function parseIntentWithJsonPrompt(model, message, tasksContext) {
  const response = await model.invoke([
    new SystemMessage(
      `${TASK_INTENT_SYSTEM}\n\nТекущие задачи:\n${tasksContext}\n\nОтветь одним JSON-объектом по схеме действия (поле action обязательно).`
    ),
    new HumanMessage(message),
  ]);

  const text =
    typeof response.content === 'string'
      ? response.content
      : response.content.map((p) => (p.type === 'text' ? p.text : '')).join('');

  return TaskIntentSchema.parse(extractJson(text));
}

async function parseIntent(model, message, tasksContext) {
  try {
    return await parseIntentWithStructuredOutput(model, message, tasksContext);
  } catch (firstError) {
    console.warn('[ai/tasks] structured output failed, fallback JSON:', firstError.message);
    try {
      return await parseIntentWithJsonPrompt(model, message, tasksContext);
    } catch (secondError) {
      throw new Error(humanizeError(secondError));
    }
  }
}

function rejectResponse(intent) {
  const reason = intent.reason?.trim();
  return aiError(reason || OUT_OF_SCOPE_MESSAGE);
}

function parseAgentRejection(output) {
  const text = String(output).trim();
  const match = text.match(/^REJECT:\s*(.+)$/im);
  if (!match) {
    return null;
  }
  return match[1].trim() || OUT_OF_SCOPE_MESSAGE;
}

async function runToolCallingAgent(model, message, tasksContext) {
  const tools = buildTaskTools();
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', `${AGENT_SYSTEM}\n\nТекущие задачи:\n${tasksContext}`],
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const agent = await createToolCallingAgent({ llm: model, tools, prompt });
  const executor = new AgentExecutor({ agent, tools, maxIterations: 6, verbose: false });
  const result = await executor.invoke({ input: message });

  const rejection = parseAgentRejection(result.output);
  if (rejection) {
    return aiError(rejection);
  }

  const tasks = await tasksApi.listTasks();
  return aiSuccess(result.output, { tasks });
}

async function runStructuredPipeline(intent) {
  const data = await executeTaskIntent(intent);
  const action = buildReply(intent, data);
  const tasksAfter = shouldReturnTasks(intent)
    ? intent.action === 'filter'
      ? data.tasks
      : await tasksApi.listTasks()
    : intent.action === 'delete'
      ? await tasksApi.listTasks()
      : null;

  return aiSuccess(action, withTasks(data, tasksAfter));
}

/**
 * @param {string} message
 * @param {string} [providerOverride]
 * @param {{ useAgent?: boolean }} [options]
 */
export async function handleTaskMessage(message, providerOverride, options = {}) {
  const provider = normalizeProvider(providerOverride || process.env.AI_PROVIDER || 'ollama');
  const model = await createChatModel(provider);
  const tasks = await tasksApi.listTasks();
  const tasksContext = formatTasksContext(tasks);
  const trimmed = message.trim();
  const useAgent =
    options.useAgent ?? process.env.AI_TASKS_USE_AGENT === 'true';

  try {
    const listTitles = parseTaskListFromMessage(trimmed);
    if (listTitles) {
      return await runStructuredPipeline({
        action: 'create_batch',
        titles: listTitles,
      });
    }

    const intent = await parseIntent(model, trimmed, tasksContext);

    if (intent.action === 'reject') {
      return rejectResponse(intent);
    }

    if (useAgent && ['lmstudio', 'openai'].includes(provider)) {
      return await runToolCallingAgent(model, trimmed, tasksContext);
    }

    return await runStructuredPipeline(intent);
  } catch (error) {
    throw new Error(formatLlmError(error, provider));
  }
}
