import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AGENT_SYSTEM, OUT_OF_SCOPE_MESSAGE } from './taskIntentSchema.js';
import { buildTaskTools } from './taskTools.js';
import { executionToClientData } from './taskExecutor.js';
import { aiError, aiSuccess } from './taskResponse.js';

/**
 * @param {import('@langchain/core/messages').BaseMessage[]} messages
 */
function extractFinalText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    const type = msg._getType?.() ?? msg.type;
    if (type !== 'ai' && type !== 'AIMessage') {
      continue;
    }
    const content = msg.content;
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('')
        .trim();
      if (text) {
        return text;
      }
    }
  }
  return '';
}

/**
 * @param {import('@langchain/core/messages').BaseMessage[]} messages
 */
function parseRejection(messages) {
  const text = extractFinalText(messages);
  const match = text.match(/^REJECT:\s*(.+)$/im);
  if (!match) {
    return null;
  }
  return match[1].trim() || OUT_OF_SCOPE_MESSAGE;
}

function isGarbageAgentText(text) {
  if (!text || text.length < 4) {
    return true;
  }
  if (/^REJECT:/i.test(text)) {
    return false;
  }
  if (/задач|удален|создан|обновлен|готово|выполн|найден/i.test(text)) {
    return false;
  }
  return /^[\wа-яё]{0,20}:\s*[\w{}]+}?$/i.test(text);
}

/**
 * @param {import('@langchain/core/messages').BaseMessage[]} messages
 */
function extractAgentData(messages) {
  /** @type {object[]} */
  const updated = [];
  /** @type {object[]} */
  const created = [];
  /** @type {number[]} */
  const deletedIds = [];
  /** @type {object[] | null} */
  let displayTasks = null;

  for (const msg of messages) {
    const type = msg._getType?.() ?? msg.type;
    if (type !== 'tool' && type !== 'ToolMessage') {
      continue;
    }
    const raw = typeof msg.content === 'string' ? msg.content : String(msg.content ?? '');
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      if (Array.isArray(parsed)) {
        displayTasks = parsed;
        continue;
      }

      switch (parsed.kind) {
        case 'tasks':
          displayTasks = parsed.tasks;
          break;
        case 'task':
          if (parsed.task) {
            updated.push(parsed.task);
          }
          break;
        case 'update_many':
          updated.push(...(parsed.updated ?? []));
          break;
        case 'batch':
          created.push(...(parsed.created ?? []));
          break;
        case 'deleted':
          if (parsed.id != null) {
            deletedIds.push(parsed.id);
          }
          break;
        case 'delete_many':
          deletedIds.push(...(parsed.ids ?? []));
          break;
        default:
          break;
      }
    } catch {
      // ignore non-JSON tool output
    }
  }

  const uniqueUpdated = dedupeTasksById(updated);
  if (uniqueUpdated.length) {
    return { kind: 'update_many', updated: uniqueUpdated, count: uniqueUpdated.length };
  }

  const uniqueDeleted = [...new Set(deletedIds)];
  if (uniqueDeleted.length) {
    return { kind: 'delete_many', ids: uniqueDeleted, count: uniqueDeleted.length };
  }

  const uniqueCreated = dedupeTasksById(created);
  if (uniqueCreated.length) {
    return { kind: 'batch', created: uniqueCreated, count: uniqueCreated.length };
  }

  if (displayTasks) {
    return { kind: 'tasks', tasks: displayTasks };
  }

  return { kind: 'agent' };
}

/**
 * @param {Array<{ id?: number }>} tasks
 */
function dedupeTasksById(tasks) {
  const map = new Map();
  for (const task of tasks) {
    if (task?.id != null) {
      map.set(task.id, task);
    }
  }
  return [...map.values()];
}

/**
 * LangGraph prebuilt ReAct agent с tools API задач.
 * @param {{ model: import('@langchain/core/language_models/chat_models').BaseChatModel, message: string, tasksContext: string }}
 * @returns {Promise<import('./taskResponse.js').AiResponse | null>} null → fallback на structured parse_intent
 */
export async function runTaskToolAgent({ model, message, tasksContext }) {
  const agent = createReactAgent({
    llm: model,
    tools: buildTaskTools(),
    prompt: `${AGENT_SYSTEM}\n\nТекущие задачи:\n${tasksContext}`,
  });

  const result = await agent.invoke(
    { messages: [new HumanMessage(message)] },
    { recursionLimit: 12 }
  );

  const messages = result.messages ?? [];

  const rejection = parseRejection(messages);
  if (rejection) {
    return aiError(rejection);
  }

  const action = extractFinalText(messages);
  if (isGarbageAgentText(action)) {
    return null;
  }

  const data = executionToClientData(extractAgentData(messages));
  return aiSuccess(action, data);
}
