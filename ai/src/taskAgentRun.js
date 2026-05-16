import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AGENT_SYSTEM, OUT_OF_SCOPE_MESSAGE } from './taskIntentSchema.js';
import { buildTaskTools } from './taskTools.js';
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
  /** @type {unknown} */
  let lastPayload = null;

  for (const msg of messages) {
    const type = msg._getType?.() ?? msg.type;
    if (type !== 'tool' && type !== 'ToolMessage') {
      continue;
    }
    const raw = typeof msg.content === 'string' ? msg.content : String(msg.content ?? '');
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.kind) {
        lastPayload = parsed;
      } else if (Array.isArray(parsed)) {
        lastPayload = { kind: 'tasks', tasks: parsed };
      }
    } catch {
      // ignore non-JSON tool output
    }
  }

  if (lastPayload && typeof lastPayload === 'object' && 'kind' in lastPayload) {
    return lastPayload;
  }

  return { kind: 'agent' };
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

  const data = extractAgentData(messages);
  return aiSuccess(action, data);
}
