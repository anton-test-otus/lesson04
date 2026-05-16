/** Высший приоритет в API (1 = высокий). */
export const HIGHEST_PRIORITY = 1;

/** Низкий числовой приоритет перед «пустым». */
export const LOW_PRIORITY = 3;

/**
 * @param {number | null | undefined} priority
 * @returns {boolean}
 */
export function isEmptyPriority(priority) {
  return priority === null || priority === undefined;
}

/**
 * @param {number | null | undefined} priority
 * @returns {boolean}
 */
export function canBumpPriorityUp(priority) {
  return priority !== HIGHEST_PRIORITY;
}

/**
 * @param {number | null | undefined} priority
 * @returns {boolean}
 */
export function canBumpPriorityDown(priority) {
  return !isEmptyPriority(priority);
}

/**
 * @param {number | null | undefined} priority
 * @returns {number | null}
 */
export function bumpPriorityUp(priority) {
  if (isEmptyPriority(priority)) {
    return LOW_PRIORITY;
  }
  if (priority === LOW_PRIORITY) {
    return 2;
  }
  if (priority === 2) {
    return HIGHEST_PRIORITY;
  }
  if (priority === HIGHEST_PRIORITY) {
    throw new Error('Нельзя поднять приоритет: уже высший (1)');
  }
  throw new Error(`Некорректный приоритет: ${priority}`);
}

/**
 * @param {number | null | undefined} priority
 * @returns {number | null}
 */
export function bumpPriorityDown(priority) {
  if (isEmptyPriority(priority)) {
    return null;
  }
  if (priority === HIGHEST_PRIORITY) {
    return 2;
  }
  if (priority === 2) {
    return LOW_PRIORITY;
  }
  if (priority === LOW_PRIORITY) {
    return null;
  }
  throw new Error(`Некорректный приоритет: ${priority}`);
}

/**
 * @param {Array<{ id: number, title?: string, priority?: number | null }>} targets
 * @param {'up' | 'down'} direction
 * @returns {string | null}
 */
export function validateBumpForTargets(targets, direction) {
  if (!targets.length) {
    return null;
  }

  if (direction === 'up') {
    const blocked = targets.filter((t) => !canBumpPriorityUp(t.priority));
    if (blocked.length > 0) {
      const list = blocked
        .map((t) => `#${t.id} «${t.title ?? ''}»`.trim())
        .join(', ');
      return `Нельзя поднять приоритет: у задач уже высший (1) — ${list}`;
    }
  }

  if (direction === 'down') {
    const blocked = targets.filter((t) => !canBumpPriorityDown(t.priority));
    if (blocked.length > 0) {
      const list = blocked
        .map((t) => `#${t.id} «${t.title ?? ''}»`.trim())
        .join(', ');
      return `Нельзя опустить приоритет: у задач уже пустой статус — ${list}`;
    }
  }

  return null;
}
