import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { humanizeError } from './formatError.js';
import { TASK_INTENT_SYSTEM, TaskIntentSchema, formatTasksContext } from './taskIntentSchema.js';

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

/**
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} model
 * @param {string} message
 * @param {string} tasksContext
 */
export async function parseIntent(model, message, tasksContext) {
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

export { formatTasksContext };
