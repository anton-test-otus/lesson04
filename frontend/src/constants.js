export const PRIORITIES = [
  { value: 1, label: 'Высокий' },
  { value: 2, label: 'Средний' },
  { value: 3, label: 'Низкий' },
];

export function priorityLabel(value) {
  return PRIORITIES.find((p) => p.value === value)?.label ?? 'Средний';
}
