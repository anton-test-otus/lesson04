import { buildApiPlanFromLexical } from './apiPlanFromLexical.js';
import { API_PLAN_SYSTEM, ApiPlanSchema } from './apiPlanSchema.js';
import { invokeStructuredSchema } from './llmStructured.js';

/**
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} model
 * @param {import('./lexicalParse.js').LexicalParse} lexical
 * @param {string} message
 * @param {string} tasksContext
 */
export async function buildApiPlanWithLlm(model, lexical, message, tasksContext) {
  if (lexical.operation === 'reject') {
    const rejectIntent = { action: 'reject', reason: lexical.reject_reason };
    return {
      steps: [],
      intents: [rejectIntent],
      intent: rejectIntent,
      complete: true,
    };
  }

  if (!lexical.complete || !lexical.operation) {
    return { steps: [], intent: null, intents: null, complete: false };
  }

  const humanText = [
    `Исходная команда: ${message}`,
    '',
    'Разбор (lexical JSON):',
    JSON.stringify(
      {
        operation: lexical.operation,
        actions: lexical.actions,
        detected_phrases: lexical.matched,
        filter: lexical.filter,
        mutation: lexical.mutation,
        create: lexical.create,
        complete: lexical.complete,
      },
      null,
      2
    ),
  ].join('\n');

  try {
    const plan = await invokeStructuredSchema(
      model,
      ApiPlanSchema,
      'api_plan',
      `${API_PLAN_SYSTEM}\n\nТекущие задачи:\n${tasksContext}`,
      humanText
    );

    const intents = plan.intents?.length
      ? plan.intents
      : plan.intent
        ? [plan.intent]
        : null;

    if (plan.complete && intents?.length) {
      return {
        steps: plan.steps ?? [],
        intents,
        intent: intents[0],
        complete: true,
      };
    }
  } catch (error) {
    console.warn('[ai/tasks] api_plan LLM failed, rule fallback:', error.message);
  }

  return buildApiPlanFromLexical(lexical);
}
