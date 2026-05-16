export const PRIORITIES = [
  { value: null, label: 'Пустой' },
  { value: 1, label: 'Высокий' },
  { value: 2, label: 'Средний' },
  { value: 3, label: 'Низкий' },
];

export function priorityLabel(value) {
  if (value === null || value === undefined) {
    return 'Пустой';
  }
  return PRIORITIES.find((p) => p.value === value)?.label ?? 'Средний';
}
