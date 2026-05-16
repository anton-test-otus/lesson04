<script setup>
import { reactive, watch } from 'vue';
import { PRIORITIES } from '../constants';

const props = defineProps({
  task: { type: Object, default: null },
});

const emit = defineEmits(['close', 'save']);

const form = reactive({
  title: '',
  priority: 2,
  is_burning: false,
});

watch(
  () => props.task,
  (task) => {
    if (!task) return;
    form.title = task.title;
    form.priority = task.priority;
    form.is_burning = Boolean(task.is_burning);
  },
  { immediate: true }
);

function submit() {
  if (!form.title.trim()) return;
  emit('save', {
    title: form.title.trim(),
    priority: form.priority,
    is_burning: form.is_burning,
  });
}
</script>

<template>
  <div v-if="task" class="overlay" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-labelledby="edit-title">
      <h2 id="edit-title">Редактирование задачи</h2>

      <form @submit.prevent="submit">
        <label class="field">
          <span>Название</span>
          <input v-model="form.title" type="text" required />
        </label>

        <label class="field">
          <span>Приоритет</span>
          <select v-model.number="form.priority">
            <option v-for="p in PRIORITIES" :key="p.value" :value="p.value">
              {{ p.label }}
            </option>
          </select>
        </label>

        <label class="checkbox">
          <input v-model="form.is_burning" type="checkbox" />
          <span>Горящая</span>
        </label>

        <div class="actions">
          <button type="button" class="secondary" @click="emit('close')">
            Отмена
          </button>
          <button type="submit" :disabled="!form.title.trim()">Сохранить</button>
        </div>
      </form>
    </div>
  </div>
</template>
