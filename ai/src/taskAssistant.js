import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { createChatModel, normalizeProvider } from './llm.js';
import { humanizeError } from './formatError.js';
import { formatLlmError } from './providerHealth.js';
import {
  TASK_INTENT_SYSTEM,
  TaskIntentSchema,
  formatTasksContext,
} from './taskIntentSchema.js';
import { buildReply, executeTaskIntent, shouldReturnTasks } from './taskExecutor.js';
import { buildTaskTools } from './taskTools.js';
import * as tasksApi from './tasksApi.js';

const CHAT_SYSTEM =
  'Ты помощник в приложении для задач. Отвечай кратко на русском. Список задач приложён для контекста.';

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

async function runToolCallingAgent(model, message, tasksContext) {
  const tools = buildTaskTools();
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `Ты управляешь задачами через инструменты. Отвечай на русском после выполнения.\n\nТекущие задачи:\n${tasksContext}`,
    ],
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const agent = await createToolCallingAgent({ llm: model, tools, prompt });
  const executor = new AgentExecutor({ agent, tools, maxIterations: 6, verbose: false });
  const result = await executor.invoke({ input: message });

  return {
    reply: result.output,
    action: 'agent',
    data: null,
    tasks: await tasksApi.listTasks(),
  };
}

async function runStructuredPipeline(model, message, tasks) {
  const tasksContext = formatTasksContext(tasks);
  const intent = await parseIntent(model, message, tasksContext);

  if (intent.action === 'none') {
    const response = await model.invoke([
      new SystemMessage(`${CHAT_SYSTEM}\n\n${tasksContext}`),
      new HumanMessage(message),
    ]);
    const reply =
      typeof response.content === 'string'
        ? response.content
        : response.content.map((p) => (p.type === 'text' ? p.text : '')).join('');

    return { reply, action: null, data: null, tasks: null };
  }

  const data = await executeTaskIntent(intent);
  const reply = buildReply(intent, data);
  const tasksAfter = shouldReturnTasks(intent)
    ? intent.action === 'filter'
      ? data.tasks
      : await tasksApi.listTasks()
    : intent.action === 'delete'
      ? await tasksApi.listTasks()
      : null;

  return { reply, action: intent.action, data, tasks: tasksAfter };
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
  const useAgent =
    options.useAgent ?? process.env.AI_TASKS_USE_AGENT === 'true';

  try {
    if (useAgent && ['lmstudio', 'openai'].includes(provider)) {
      return await runToolCallingAgent(model, message.trim(), formatTasksContext(tasks));
    }
    return await runStructuredPipeline(model, message.trim(), tasks);
  } catch (error) {
    throw new Error(formatLlmError(error, provider));
  }
}
