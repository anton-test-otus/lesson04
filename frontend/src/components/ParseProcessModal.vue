<script setup>
import { computed } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  events: { type: Array, default: () => [] },
});

const emit = defineEmits(['close']);

const NODE_LABELS = {
  start: 'Старт',
  lexical_parse: 'Разбор команды (LLM)',
  api_plan: 'План API (LLM)',
  execute: 'Выполнение',
  respond: 'Формирование ответа',
  tool_agent: 'Tool-calling',
  parse_intent: 'Резервный разбор (LLM)',
};

const OPERATION_LABELS = {
  create: 'Создать задачу',
  create_batch: 'Создать несколько задач',
  delete: 'Удалить задачу',
  delete_many: 'Удалить по отбору',
  find: 'Найти / показать',
  list: 'Список всех задач',
  mutate: 'Найти и изменить',
  sequence: 'Цепочка действий',
  reject: 'Отклонено',
  unknown: 'Неизвестно',
};

function pushReject(items, reason) {
  const text =
    typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : Array.isArray(reason)
        ? reason.filter(Boolean).join('; ')
        : '';
  if (!text) {
    return;
  }
  const existing = [...items].reverse().find((i) => i.kind === 'reject');
  if (existing) {
    existing.detail = text;
    return;
  }
  items.push({
    key: `reject-${items.length}`,
    kind: 'reject',
    title: 'Отклонено',
    status: 'reject',
    detail: text,
  });
}

const timeline = computed(() => {
  /** @type {Array<{ key: string, kind: string, title: string, status: string, detail?: string }>} */
  const items = [];
  let stepIndex = 0;

  for (const ev of props.events) {
    if (ev.type === 'reject') {
      pushReject(items, ev.reason ?? ev.errors);
      continue;
    }
    if (ev.type === 'step') {
      const label = NODE_LABELS[ev.node] ?? ev.node;
      if (ev.phase === 'start') {
        items.push({
          key: `step-${stepIndex++}-${ev.node}-start`,
          kind: 'step',
          title: label,
          status: props.loading ? 'active' : 'done',
        });
      } else if (ev.phase === 'done') {
        const last = [...items].reverse().find((i) => i.kind === 'step' && i.title === label);
        if (last) {
          last.status = 'done';
        }
      }
      continue;
    }

    if (ev.type === 'lexical' && ev.lexical) {
      const lx = ev.lexical;
      const isReject = lx.operation === 'reject';
      const lines = [];
      if (isReject && lx.reject_reason) {
        lines.push(`Причина: ${lx.reject_reason}`);
      }
      if (lx.actions?.length) {
        lines.push(
          `Шаги: ${lx.actions.map((op) => OPERATION_LABELS[op] ?? op).join(' → ')}`
        );
      }
      if (lx.operation) {
        lines.push(`Операция: ${OPERATION_LABELS[lx.operation] ?? lx.operation}`);
      }
      if (lx.detected_phrases?.length) {
        lines.push(`Фразы: ${lx.detected_phrases.join(', ')}`);
      }
      if (lx.filter?.q) {
        lines.push(`Имя: ${lx.filter.q}`);
      }
      if (lx.filter?.priorities?.length) {
        lines.push(`Приоритет: ${lx.filter.priorities.join(', ')}`);
      }
      if (lx.filter?.burning_only) {
        lines.push('Только горящие');
      }
      if (lx.filter?.all_tasks) {
        lines.push('Все задачи');
      }
      if (lx.mutation?.bump_priority) {
        lines.push(`Приоритет: ${lx.mutation.bump_priority === 'up' ? '↑' : '↓'}`);
      }
      if (lx.mutation?.set_priority !== undefined) {
        lines.push(
          `Статус: ${lx.mutation.set_priority === null ? 'снять' : lx.mutation.set_priority}`
        );
      }
      if (lx.mutation?.set_is_burning !== undefined) {
        lines.push(`Горящий: ${lx.mutation.set_is_burning ? 'да' : 'нет'}`);
      }
      if (lx.create?.title) {
        lines.push(`Название: ${lx.create.title}`);
      }
      if (lx.create?.titles?.length) {
        lines.push(`Список: ${lx.create.titles.length} шт.`);
      }
      items.push({
        key: `lexical-${items.length}`,
        kind: isReject ? 'reject' : 'detail',
        title: isReject ? 'Отклонено' : 'Результат разбора',
        status: isReject ? 'reject' : 'done',
        detail: lines.join('\n') || '—',
      });
      continue;
    }

    if (ev.type === 'api_plan' && ev.apiPlan) {
      const plan = ev.apiPlan;
      const isReject = plan.intent_action === 'reject' || plan.intent?.action === 'reject';
      const lines = [];
      if (isReject && plan.intent?.reason) {
        lines.push(`Причина: ${plan.intent.reason}`);
      }
      if (plan.intent_actions?.length > 1) {
        lines.push(
          `Цепочка: ${plan.intent_actions.map((a) => OPERATION_LABELS[a] ?? a).join(' → ')}`
        );
      } else if (plan.intent_action) {
        lines.push(`Действие: ${OPERATION_LABELS[plan.intent_action] ?? plan.intent_action}`);
      }
      for (const step of plan.steps ?? []) {
        let q = '';
        if (step.query && typeof step.query === 'object') {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(step.query)) {
            if (Array.isArray(v)) {
              v.forEach((x) => params.append(k, x));
            } else {
              params.set(k, String(v));
            }
          }
          const qs = params.toString();
          if (qs) {
            q = `?${qs}`;
          }
        }
        lines.push(`${step.method} ${step.path}${q}`);
        if (step.description) {
          lines.push(`  ${step.description}`);
        }
      }
      items.push({
        key: `plan-${items.length}`,
        kind: isReject ? 'reject' : 'detail',
        title: isReject ? 'Отклонено' : 'План эндпоинтов',
        status: isReject ? 'reject' : 'done',
        detail: lines.join('\n') || '—',
      });
      continue;
    }

    if (ev.type === 'execute') {
      const stepPrefix =
        ev.step_total > 1 ? `Шаг ${ev.step_index}/${ev.step_total}: ` : '';
      items.push({
        key: `exec-${items.length}`,
        kind: 'step',
        title: `${stepPrefix}Вызов API (${ev.intent_action ?? '…'})`,
        status: props.loading ? 'active' : 'done',
      });
      continue;
    }

    if (ev.type === 'execute_done') {
      const last = [...items]
        .reverse()
        .find(
          (i) =>
            i.title.includes('Вызов API') &&
            (ev.step_total <= 1 ||
              i.title.startsWith(`Шаг ${ev.step_index}/${ev.step_total}:`))
        );
      if (last) {
        if (ev.kind === 'reject') {
          last.status = 'reject';
          last.kind = 'reject';
          last.title = 'Отклонено';
          last.detail = ev.reason ? String(ev.reason) : 'Выполнение отклонено';
        } else {
          last.status = 'done';
          if (ev.kind) {
            last.detail = `Результат: ${ev.kind}${ev.count != null ? ` (${ev.count})` : ''}`;
          }
        }
      }
    }
  }

  const hasReject = items.some((i) => i.kind === 'reject' || i.status === 'reject');
  if (!props.loading && hasReject) {
    for (const item of items) {
      if (item.status === 'active') {
        item.status = 'reject';
      }
    }
  }

  return items;
});
</script>

<template>
  <div
    v-if="open"
    class="overlay parse-overlay"
    role="dialog"
    aria-labelledby="parse-title"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="modal parse-modal">
      <header class="parse-header">
        <h2 id="parse-title">Обработка команды</h2>
        <button type="button" class="secondary parse-close" :disabled="loading" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="loading" class="parse-hint">Идёт разбор и выполнение…</p>
      <p v-else-if="timeline.some((i) => i.status === 'reject')" class="parse-hint parse-hint--reject">
        Команда отклонена
      </p>

      <ol class="parse-timeline">
        <li
          v-for="item in timeline"
          :key="item.key"
          class="parse-item"
          :class="[
            `parse-item--${item.status}`,
            item.kind === 'detail' ? 'parse-item--detail' : '',
            item.kind === 'reject' ? 'parse-item--reject' : '',
          ]"
        >
          <span class="parse-marker" aria-hidden="true" />
          <div class="parse-body">
            <span class="parse-item-title">{{ item.title }}</span>
            <pre v-if="item.detail" class="parse-detail">{{ item.detail }}</pre>
          </div>
        </li>
      </ol>

      <p v-if="timeline.length === 0" class="hint">Ожидание шагов…</p>
    </div>
  </div>
</template>
