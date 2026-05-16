import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { humanizeError } from './formatError.js';

function extractJson(text) {
  const raw = String(text).trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  return JSON.parse(candidate);
}

/**
 * @template {import('zod').ZodTypeAny} T
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} model
 * @param {T} schema
 * @param {string} schemaName
 * @param {string} systemPrompt
 * @param {string} humanText
 */
export async function invokeStructuredSchema(model, schema, schemaName, systemPrompt, humanText) {
  try {
    const structured = model.withStructuredOutput(schema, { name: schemaName });
    return await structured.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanText),
    ]);
  } catch (firstError) {
    console.warn(`[ai/tasks] structured ${schemaName} failed, fallback JSON:`, firstError.message);
    const response = await model.invoke([
      new SystemMessage(`${systemPrompt}\n\nОтветь одним JSON-объектом по схеме «${schemaName}».`),
      new HumanMessage(humanText),
    ]);
    const text =
      typeof response.content === 'string'
        ? response.content
        : response.content.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return schema.parse(extractJson(text));
  }
}

export function wrapLlmError(error) {
  throw new Error(humanizeError(error));
}
