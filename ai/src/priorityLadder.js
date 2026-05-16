/**
 * Шкала (от низкой к высокой): пустой → 3 → 2 → 1.
 * В API хранятся только 1–3; «пустой» соответствует 3 (ниже уже некуда).
 *
 * @param {number} priority
 * @returns {number}
 */
export function bumpPriorityUp(priority) {
  if (priority >= 3) {
    return 2;
  }
  if (priority === 2) {
    return 1;
  }
  return 1;
}

/**
 * @param {number} priority
 * @returns {number}
 */
export function bumpPriorityDown(priority) {
  if (priority <= 1) {
    return 2;
  }
  if (priority === 2) {
    return 3;
  }
  return 3;
}
