/**
 * @typedef {{
 *   method: string,
 *   path: string,
 *   description: string,
 *   query?: Record<string, string | string[]>,
 *   body?: Record<string, unknown>,
 * }} ApiPlanStep
 * @typedef {{
 *   steps: ApiPlanStep[],
 *   intent: object | null,
 *   complete: boolean,
 * }} ApiPlan
 */

/**
 * Нода 2: лексический разбор → intent + план REST API.
 * @param {import('./lexicalParse.js').LexicalParse} lexical
 * @returns {ApiPlan}
 */
export function buildApiPlanFromLexical(lexical) {
  /** @type {ApiPlanStep[]} */
  const steps = [];
  /** @type {object | null} */
  let intent = null;

  if (!lexical.complete || !lexical.operation) {
    return { steps, intent: null, complete: false };
  }

  const { filter, mutation, create } = lexical;

  switch (lexical.operation) {
    case 'list':
      steps.push({
        method: 'GET',
        path: '/api/tasks',
        description: 'Получить все задачи',
      });
      intent = { action: 'list' };
      break;

    case 'find': {
      const query = buildFilterQuery(filter);
      steps.push({
        method: 'GET',
        path: '/api/tasks/filter',
        description: 'Отфильтровать задачи',
        query,
      });
      intent = {
        action: 'filter',
        q: filter.q ?? null,
        priorities: filter.priorities,
        burning_only: filter.burning_only,
      };
      break;
    }

    case 'create_batch':
      steps.push({
        method: 'POST',
        path: '/api/tasks/batch',
        description: 'Создать несколько задач',
        body: { titles: create.titles },
      });
      intent = { action: 'create_batch', titles: create.titles };
      break;

    case 'create':
      steps.push({
        method: 'POST',
        path: '/api/tasks',
        description: 'Создать задачу',
        body: { title: create.title },
      });
      intent = { action: 'create', title: create.title };
      break;

    case 'delete_many': {
      const query = filter.all_tasks ? {} : buildFilterQuery(filter);
      steps.push({
        method: 'GET',
        path: '/api/tasks/filter',
        description: 'Отобрать задачи для удаления',
        query: Object.keys(query).length ? query : undefined,
      });
      steps.push({
        method: 'DELETE',
        path: '/api/tasks/{id}',
        description: filter.all_tasks
          ? 'Удалить каждую задачу (все)'
          : 'Удалить каждую найденную задачу',
      });
      intent = {
        action: 'delete_many',
        q: filter.q ?? null,
        priorities: filter.priorities,
        burning_only: filter.burning_only,
      };
      break;
    }

    case 'mutate': {
      const query = buildFilterQuery(filter);
      steps.push({
        method: 'GET',
        path: '/api/tasks/filter',
        description: 'Отобрать задачи для изменения',
        query,
      });
      const updateBody = {};
      if (mutation.set_priority !== undefined) {
        updateBody.priority = mutation.set_priority;
      }
      if (mutation.set_is_burning !== undefined) {
        updateBody.is_burning = mutation.set_is_burning;
      }
      steps.push({
        method: 'POST',
        path: '/api/tasks/{id}/update',
        description:
          mutation.bump_priority === 'up'
            ? 'Поднять приоритет у каждой найденной'
            : mutation.bump_priority === 'down'
              ? 'Опустить приоритет у каждой найденной'
              : 'Обновить каждую найденную задачу',
        body: updateBody,
      });
      intent = {
        action: 'update_many',
        q: filter.q ?? null,
        priorities: filter.priorities,
        burning_only: filter.burning_only,
        set_priority: mutation.set_priority,
        bump_priority: mutation.bump_priority,
        set_is_burning: mutation.set_is_burning,
      };
      break;
    }

    default:
      return { steps: [], intent: null, complete: false };
  }

  return { steps, intent, complete: Boolean(intent) };
}

/**
 * @param {import('./lexicalParse.js').LexicalFilter} filter
 */
function buildFilterQuery(filter) {
  /** @type {Record<string, string | string[]>} */
  const query = {};
  if (filter.q) {
    query.q = filter.q;
  }
  if (filter.priorities?.length) {
    query.priority = filter.priorities.map(String);
  }
  if (filter.burning_only) {
    query.burning_only = '1';
  }
  return query;
}
