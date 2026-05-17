/**
 * @typedef {import('./lexicalParse.js').LexicalParse} LexicalParse
 * @typedef {import('./lexicalParse.js').LexicalFilter} LexicalFilter
 * @typedef {import('./lexicalParse.js').LexicalMutation} LexicalMutation
 * @typedef {import('./lexicalParse.js').LexicalCreate} LexicalCreate
 * @typedef {{
 *   operation: import('./lexicalParse.js').LexicalOperation,
 *   filter?: LexicalFilter,
 *   mutation?: LexicalMutation,
 *   create?: LexicalCreate,
 * }} LexicalAction
 */

/**
 * @param {LexicalParse} parse
 * @returns {LexicalParse}
 */
export function expandSequentialLexical(parse) {
  if (parse.actions?.length >= 2) {
    return { ...parse, operation: 'sequence' };
  }

  if (parse.operation === 'mutate' && parse.complete) {
    return {
      ...parse,
      operation: 'sequence',
      actions: [
        { operation: 'find', filter: { ...parse.filter } },
        { operation: 'mutate', filter: {}, mutation: { ...parse.mutation } },
      ],
    };
  }

  if (
    parse.operation === 'delete_many' &&
    parse.complete &&
    !parse.filter?.all_tasks &&
    (parse.filter?.q ||
      parse.filter?.priorities?.length ||
      parse.filter?.burning_only ||
      parse.keywords?.taskFind)
  ) {
    return {
      ...parse,
      operation: 'sequence',
      actions: [
        { operation: 'find', filter: { ...parse.filter } },
        { operation: 'delete_many', filter: {} },
      ],
    };
  }

  return parse;
}

/**
 * @param {object} intent
 * @param {Array<{ id: number }> | null | undefined} tasksFromPrevious
 */
export function resolveIntentWithPreviousTasks(intent, tasksFromPrevious) {
  if (!tasksFromPrevious?.length) {
    return intent;
  }

  if (intent.action !== 'update_many' && intent.action !== 'delete_many') {
    return intent;
  }

  const hasScope =
    intent.ids?.length ||
    (intent.q && String(intent.q).trim()) ||
    intent.priorities?.length ||
    intent.burning_only === true;

  if (hasScope) {
    return intent;
  }

  return {
    ...intent,
    ids: tasksFromPrevious.map((t) => t.id),
  };
}
