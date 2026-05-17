import { lexicalParseMessage } from './lexicalParse.js';
import { LEXICAL_PARSE_SYSTEM, LexicalParseSchema } from './lexicalParseSchema.js';
import { invokeStructuredSchema } from './llmStructured.js';
import { expandSequentialLexical } from './sequentialActions.js';
import { formatTasksContext } from './taskIntentParse.js';

/**
 * @param {import('zod').infer<typeof LexicalParseSchema>} parsed
 */
function normalizeLexicalParse(parsed, raw) {
  const operation = parsed.operation === 'unknown' ? null : parsed.operation;

  if (parsed.operation === 'reject') {
    return {
      operation: 'reject',
      keywords: {},
      filter: {},
      mutation: {},
      create: {},
      matched: parsed.detected_phrases ?? [],
      complete: true,
      raw,
      reject_reason: parsed.reject_reason,
    };
  }

  const base = {
    operation: operation === 'reject' ? 'reject' : operation,
    keywords: {},
    filter: parsed.filter ?? {},
    mutation: parsed.mutation ?? {},
    create: parsed.create ?? {},
    matched: parsed.detected_phrases ?? [],
    actions: parsed.actions,
    complete: parsed.complete && operation !== null && operation !== 'unknown',
    raw,
    reject_reason: parsed.reject_reason,
  };

  if (parsed.actions?.length >= 2) {
    base.operation = 'sequence';
    base.complete = parsed.complete;
  }

  return expandSequentialLexical(base);
}

/**
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} model
 * @param {string} message
 * @param {string} tasksContext
 */
export async function parseLexicalWithLlm(model, message, tasksContext) {
  const raw = String(message).trim();
  if (!raw) {
    return lexicalParseMessage(raw);
  }

  try {
    const parsed = await invokeStructuredSchema(
      model,
      LexicalParseSchema,
      'lexical_parse',
      `${LEXICAL_PARSE_SYSTEM}\n\nТекущие задачи:\n${tasksContext}`,
      raw
    );
    return normalizeLexicalParse(parsed, raw);
  } catch (error) {
    console.warn('[ai/tasks] lexical LLM failed, regex fallback:', error.message);
    return lexicalParseMessage(raw);
  }
}

export { formatTasksContext };
