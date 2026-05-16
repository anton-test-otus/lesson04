<script setup>
import { reactive } from 'vue';
import { PRIORITIES } from '../constants';

const emit = defineEmits(['apply', 'reset']);

const filters = reactive({
  q: '',
  priorities: [],
  burningOnly: false,
});

function togglePriority(value) {
  const index = filters.priorities.indexOf(value);
  if (index === -1) {
    filters.priorities.push(value);
  } else {
    filters.priorities.splice(index, 1);
  }
}

function apply() {
  emit('apply', {
    q: filters.q.trim() || undefined,
    priorities: [...filters.priorities].sort(),
    burningOnly: filters.burningOnly,
  });
}

function reset() {
  filters.q = '';
  filters.priorities = [];
  filters.burningOnly = false;
  emit('reset');
}
</script>

<template>
  <section class="filters">
    <h2>Фильтр</h2>

    <label class="field">
      <span>Название (* внутри слова — любые символы)</span>
      <input
        v-model="filters.q"
        type="text"
        placeholder="Наст*ить, doc*er, Docker"
      />
    </label>

    <div class="field">
      <span>Приоритет</span>
      <div class="priority-chips">
        <button
          v-for="p in PRIORITIES"
          :key="p.value"
          type="button"
          :class="['chip', { active: filters.priorities.includes(p.value) }]"
          @click="togglePriority(p.value)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <label class="checkbox">
      <input v-model="filters.burningOnly" type="checkbox" />
      <span>Только горящие</span>
    </label>

    <div class="filter-actions">
      <button type="button" @click="apply">Применить</button>
      <button type="button" class="secondary" @click="reset">Сбросить</button>
    </div>
  </section>
</template>
