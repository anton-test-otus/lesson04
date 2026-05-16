import { isDeleteAllCommand } from './parseDeleteAllMessage.js';
import { parseTaskListFromMessage } from './parseTaskListMessage.js';

/**
 * @typedef {'create' | 'create_batch' | 'delete' | 'delete_many' | 'find' | 'list' | 'mutate' | null} LexicalOperation
 * @typedef {{
 *   taskCreate?: boolean,
 *   taskDelete?: boolean,
 *   taskFind?: boolean,
 *   priorityApply?: boolean,
 *   priorityRemove?: boolean,
 *   priorityBumpUp?: boolean,
 *   priorityBumpDown?: boolean,
 *   burningApply?: boolean,
 *   burningRemove?: boolean,
 * }} LexicalKeywords
 * @typedef {{
 *   q?: string | null,
 *   priorities?: number[],
 *   burning_only?: boolean,
 *   all_tasks?: boolean,
 *   ids?: number[],
 * }} LexicalFilter
 * @typedef {{
 *   set_priority?: number | null,
 *   bump_priority?: 'up' | 'down',
 *   set_is_burning?: boolean,
 * }} LexicalMutation
 * @typedef {{
 *   title?: string,
 *   titles?: string[],
 * }} LexicalCreate
 * @typedef {{
 *   operation: LexicalOperation,
 *   keywords: LexicalKeywords,
 *   filter: LexicalFilter,
 *   mutation: LexicalMutation,
 *   create: LexicalCreate,
 *   matched: string[],
 *   complete: boolean,
 *   raw: string,
 * }} LexicalParse
 */

const PATTERNS = {
  taskCreate: /(?:^|[\s,.:;])(?:создай|создать|создаём|создаем|добавь|добавить|добавляй|добавляем)(?:[\s,.:;]|$)/i,
  taskDelete:
    /(?:^|[\s,.:;])(?:удали|удалить|удаляй|убери|убрать|убирай|очисти|очистить)(?:[\s,.:;]|$)/i,
  taskFind:
    /(?:^|[\s,.:;])(?:найди|найти|ищи|искать|покажи|показать|выведи|вывести|отфильтруй|отфильтровать|фильтр|отбор)(?:[\s,.:;]|$)/i,
  priorityApply:
    /(?:^|[\s,.:;])(?:примени|применить|установи|установить|назначь|назначить|поставь|поставить|задай|задать)(?:[\s,.:;]|$)/i,
  priorityAdd:
    /(?:^|[\s,.:;])(?:добавь|добавить)\s+приоритет(?:ом|а|у)?(?=[\s,.:;]|$)/i,
  priorityRemove:
    /(?:^|[\s,.:;])(?:убери|убрать|сними|снять|очисти|очистить)(?:[\s,.:;]|$)/i,
  priorityRemoveExplicit:
    /(?:^|[\s,.:;])(?:удали|удалить)\s+(?:приоритет|статус)(?:ом|а|у)?(?=[\s,.:;]|$)/i,
  priorityBumpUp: /(?:^|[\s,.:;])(?:подними|поднять|повысь|повысить)(?:[\s,.:;]|$)/i,
  priorityBumpDown: /(?:^|[\s,.:;])(?:опусти|опустить|понизь|понизить)(?:[\s,.:;]|$)/i,
  burningApply: /(?:^|[\s,.:;])(?:зажги|зажечь|сделай\s+горящ|включи\s+огонь)(?:[\s,.:;]|$)/i,
  burningRemove: /(?:^|[\s,.:;])(?:потуши|потушить|убери\s+горящ|сними\s+горящ|выключи\s+огонь)(?:[\s,.:;]|$)/i,
  priorityWord: /(?:^|[\s,.:;])приоритет(?:ом|а|у)?(?:[\s,.:;]|$)/i,
  statusWord: /(?:^|[\s,.:;])статус(?:ом|а|у)?(?:[\s,.:;]|$)/i,
  burningFilter: /(?:^|[\s,.:;])(?:горящ(?:ие|их|ая|ий|им)?)(?:[\s,.:;]|$)/i,
  taskWord: /(?:^|[\s,.:;])задач[а-яё]*(?:[\s,.:;]|$)/i,
  allTasks: /(?:^|[\s,.:;])(?:все|всех|весь)\s+задач/i,
};

const FIND_PREFIX =
  /^(?:найди|найти|ищи|искать|покажи|показать|выведи|вывести|отфильтруй|отфильтровать|фильтр)\s+(?:все\s+)?(?:задач[а-яё]*\s+)?/i;

const LEXICAL_PRIORITY = [
  { pattern: /(?:^|[\s,.:;])(?:с|со)\s+низк(?:им|ий|ого)?\s+приоритет(?:ом|а)?(?=[\s,.:;]|$)/gi, values: [3] },
  { pattern: /(?:^|[\s,.:;])низк(?:им|ий|ого)?\s+приоритет(?:ом|а)?(?=[\s,.:;]|$)/gi, values: [3] },
  { pattern: /(?:^|[\s,.:;])(?:с|со)\s+средн(?:им|ий|его)?\s+приоритет(?:ом|а)?(?=[\s,.:;]|$)/gi, values: [2] },
  { pattern: /(?:^|[\s,.:;])средн(?:им|ий|его)?\s+приоритет(?:ом|а)?(?=[\s,.:;]|$)/gi, values: [2] },
  { pattern: /(?:^|[\s,.:;])(?:с|со)\s+высок(?:им|ий|ого)?\s+приоритет(?:ом|а)?(?=[\s,.:;]|$)/gi, values: [1] },
  { pattern: /(?:^|[\s,.:;])высок(?:им|ий|ого)?\s+приоритет(?:ом|а)?(?=[\s,.:;]|$)/gi, values: [1] },
];

const NUMERIC_PRIORITY = /(?:^|[\s,.:;])приоритет(?:ом|а|у)?\s*(\d)(?=[\s,.:;]|$)/gi;

const MUTATION_TAIL = [
  /\s*(?:,|\s+и)\s*(?:подними|поднять|повысь|повысить)(?:\s+им)?\s+приоритет(?:ом|а)?.*$/i,
  /\s*(?:,|\s+и)\s*(?:опусти|опустить|понизь|понизить)(?:\s+им)?\s+приоритет(?:ом|а)?.*$/i,
  /\s*(?:,|\s+и)\s*(?:убери|убрать|сними|снять|очисти|очистить|удали|удалить)(?:\s+им)?\s+(?:приоритет|статус)(?:ом|а)?.*$/i,
  /\s*(?:,|\s+и)\s*(?:примени|применить|установи|назначь|поставь|добавь|добавить).{0,30}приоритет.*$/i,
  /\s*(?:,|\s+и)\s*(?:зажги|зажечь|потуши|потушить).*$/i,
  /\s*(?:,|\s+и)\s*(?:удали|удалить|убери|убрать)(?:\s+их)?.*$/i,
];

/**
 * @param {string} message
 * @returns {LexicalKeywords}
 */
function detectKeywords(message) {
  const text = String(message).trim();
  /** @type {LexicalKeywords} */
  const keywords = {};
  /** @type {string[]} */
  const matched = [];

  for (const [key, pattern] of Object.entries(PATTERNS)) {
    if (pattern.test(text)) {
      keywords[key] = true;
      matched.push(key);
    }
  }

  if (
    (keywords.priorityApply || keywords.priorityAdd) &&
    (keywords.priorityWord || keywords.statusWord || keywords.priorityAdd)
  ) {
    keywords.priorityApply = true;
    matched.push('priorityContext');
  }
  if (
    keywords.priorityRemoveExplicit ||
    (keywords.priorityRemove && (keywords.priorityWord || keywords.statusWord))
  ) {
    keywords.priorityRemove = true;
    matched.push('priorityClearContext');
  }

  return { keywords, matched };
}

/**
 * @param {string} message
 * @param {LexicalKeywords} keywords
 * @returns {LexicalFilter}
 */
function extractFilter(message, keywords) {
  let text = String(message).trim();
  /** @type {number[]} */
  const priorities = [];

  if (keywords.burningFilter || keywords.burningApply) {
    // burning filter only when find context, not "зажги" mutation alone
  }

  if (PATTERNS.burningFilter.test(text) && keywords.taskFind) {
    // handled below
  }

  if (keywords.allTasks || isDeleteAllCommand(text)) {
    return { all_tasks: true, q: null, priorities: [], burning_only: false };
  }

  text = text.replace(NUMERIC_PRIORITY, (_, digit) => {
    const n = Number(digit);
    if ([1, 2, 3].includes(n)) {
      priorities.push(n);
    }
    return ' ';
  });

  for (const { pattern, values } of LEXICAL_PRIORITY) {
    const next = text.replace(pattern, ' ');
    if (next !== text) {
      priorities.push(...values);
      text = next;
    }
  }

  let burning_only = false;
  if (/(?:^|[\s,.:;])(?:горящ(?:ие|их|ая|ий|им)?)(?:[\s,.:;]|$)/i.test(text) && keywords.taskFind) {
    burning_only = true;
    text = text.replace(/(?:^|[\s,.:;])(?:с\s+)?горящ(?:ие|их|ая|ий|им)?(?:\s+статус(?:ом|а)?)?(?=[\s,.:;]|$)/gi, ' ');
  }

  let q = null;
  if (keywords.taskFind) {
    text = text.replace(FIND_PREFIX, '').trim();
    for (const tail of MUTATION_TAIL) {
      text = text.replace(tail, '');
    }
    text = text.replace(/[.!?…]+$/, '').trim().replace(/\s+/g, ' ');
    if (text && !/^приоритет/i.test(text) && !/^статус/i.test(text)) {
      q = text;
    }
  }

  const uniquePriorities = [...new Set(priorities)].filter((p) => [1, 2, 3].includes(p));

  /** @type {LexicalFilter} */
  const filter = {};
  if (q) {
    filter.q = q;
  }
  if (uniquePriorities.length) {
    filter.priorities = uniquePriorities;
  }
  if (burning_only) {
    filter.burning_only = true;
  }

  return filter;
}

/**
 * @param {string} message
 * @param {LexicalKeywords} keywords
 * @returns {LexicalMutation}
 */
function extractMutation(message, keywords) {
  /** @type {LexicalMutation} */
  const mutation = {};
  const text = String(message).trim();

  const hasPriorityContext =
    keywords.priorityWord || keywords.statusWord || /приоритет/i.test(text);

  if (keywords.priorityBumpUp || /(?:^|[\s,.:;])(?:и\s+)?(?:подними|поднять)\s+приоритет/i.test(text)) {
    mutation.bump_priority = 'up';
  }
  if (keywords.priorityBumpDown || /(?:^|[\s,.:;])(?:и\s+)?(?:опусти|опустить)\s+приоритет/i.test(text)) {
    mutation.bump_priority = 'down';
  }

  if (
    keywords.priorityRemove &&
    hasPriorityContext &&
    !mutation.bump_priority
  ) {
    mutation.set_priority = null;
  }

  if (keywords.priorityApply && hasPriorityContext && mutation.set_priority === undefined) {
    const num = text.match(/приоритет(?:ом|а|у)?\s*(\d)/i);
    if (num) {
      mutation.set_priority = Number(num[1]);
    } else if (/высок/i.test(text)) {
      mutation.set_priority = 1;
    } else if (/средн/i.test(text)) {
      mutation.set_priority = 2;
    } else if (/низк/i.test(text)) {
      mutation.set_priority = 3;
    }
  }

  if (keywords.burningApply && !keywords.taskFind) {
    mutation.set_is_burning = true;
  }
  if (keywords.burningRemove && !keywords.taskFind) {
    mutation.set_is_burning = false;
  }
  if (keywords.burningApply && /(?:^|[\s,.:;])(?:и\s+)?(?:зажги|зажечь)/i.test(text)) {
    mutation.set_is_burning = true;
  }
  if (keywords.burningRemove && /(?:^|[\s,.:;])(?:и\s+)?(?:потуши|потушить)/i.test(text)) {
    mutation.set_is_burning = false;
  }

  return mutation;
}

/**
 * @param {string} message
 * @param {LexicalKeywords} keywords
 * @returns {LexicalCreate}
 */
function extractCreate(message, keywords) {
  const batch = parseTaskListFromMessage(message);
  if (batch) {
    return { titles: batch };
  }

  if (!keywords.taskCreate) {
    return {};
  }

  const match = String(message).match(
    /(?:создай|создать|добавь|добавить)\s+(?:задач[а-яё]*\s+)?(?:"([^"]+)"|'([^']+)'|(.+?))(?:[.!?…]|$)/i
  );
  if (match) {
    const title = (match[1] || match[2] || match[3] || '').trim();
    if (title && !/^задач/i.test(title)) {
      return { title };
    }
  }

  return {};
}

/**
 * @param {LexicalKeywords} keywords
 * @param {LexicalFilter} filter
 * @param {LexicalMutation} mutation
 * @param {LexicalCreate} create
 * @returns {LexicalOperation}
 */
function resolveOperation(keywords, filter, mutation, create) {
  if (create.titles?.length) {
    return 'create_batch';
  }
  if (create.title) {
    return 'create';
  }
  if (filter.all_tasks && keywords.taskDelete) {
    return 'delete_many';
  }

  const hasFilter =
    filter.q || filter.priorities?.length || filter.burning_only || filter.all_tasks;
  const hasMutation =
    mutation.set_priority !== undefined ||
    mutation.bump_priority ||
    mutation.set_is_burning !== undefined;

  if (keywords.taskDelete && (hasFilter || keywords.taskFind)) {
    return 'delete_many';
  }
  if (keywords.taskDelete && !hasFilter) {
    return 'delete';
  }
  if (hasMutation && (hasFilter || keywords.taskFind)) {
    return 'mutate';
  }
  if (keywords.taskFind || hasFilter) {
    return 'find';
  }
  if (keywords.taskCreate) {
    return 'create';
  }
  if (/^(?:список|все)\s+задач/i.test(String(filter.q || ''))) {
    return 'list';
  }

  return null;
}

/**
 * @param {LexicalOperation} operation
 * @param {LexicalFilter} filter
 * @param {LexicalMutation} mutation
 * @param {LexicalCreate} create
 */
function isParseComplete(operation, filter, mutation, create) {
  if (!operation) {
    return false;
  }
  switch (operation) {
    case 'create_batch':
      return Boolean(create.titles?.length);
    case 'create':
      return Boolean(create.title);
    case 'delete_many':
      return filter.all_tasks || filter.q || filter.priorities?.length || filter.burning_only;
    case 'find':
      return Boolean(filter.q || filter.priorities?.length || filter.burning_only || filter.all_tasks);
    case 'mutate':
      return (
        (mutation.set_priority !== undefined ||
          mutation.bump_priority ||
          mutation.set_is_burning !== undefined) &&
        Boolean(filter.q || filter.priorities?.length || filter.burning_only || filter.all_tasks)
      );
    case 'list':
      return true;
    default:
      return false;
  }
}

/**
 * Нода 1: разбор по ключевым словам и словоформам.
 * @param {string} message
 * @returns {LexicalParse}
 */
export function lexicalParseMessage(message) {
  const raw = String(message).trim();
  if (!raw) {
    return {
      operation: null,
      keywords: {},
      filter: {},
      mutation: {},
      create: {},
      matched: [],
      complete: false,
      raw,
    };
  }

  const { keywords, matched } = detectKeywords(raw);
  const filter = extractFilter(raw, keywords);
  const mutation = extractMutation(raw, keywords);
  const create = extractCreate(raw, keywords);
  const operation = resolveOperation(keywords, filter, mutation, create);
  const complete = isParseComplete(operation, filter, mutation, create);

  return {
    operation,
    keywords,
    filter,
    mutation,
    create,
    matched,
    complete,
    raw,
  };
}
