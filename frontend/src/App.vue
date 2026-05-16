<script setup>
import { onMounted, ref } from 'vue';
import { api } from './api';
import { priorityLabel } from './constants';
import TaskEditModal from './components/TaskEditModal.vue';
import TaskFilters from './components/TaskFilters.vue';

const tasks = ref([]);
const title = ref('');
const loading = ref(false);
const error = ref('');
const apiStatus = ref('');
const editingTask = ref(null);
const activeFilters = ref(null);

async function loadTasks() {
  loading.value = true;
  error.value = '';
  try {
    const health = await api.health();
    apiStatus.value = health.status;
    tasks.value = activeFilters.value
      ? await api.filterTasks(activeFilters.value)
      : await api.getTasks();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function applyFilters(filters) {
  const hasFilters =
    filters.q ||
    (filters.priorities && filters.priorities.length > 0) ||
    filters.burningOnly;
  activeFilters.value = hasFilters ? filters : null;
  loadTasks();
}

function resetFilters() {
  activeFilters.value = null;
  loadTasks();
}

async function addTask() {
  if (!title.value.trim()) return;
  error.value = '';
  try {
    if (title.value.includes(',')) {
      await api.createTasksBatch(title.value);
    } else {
      await api.createTask(title.value.trim());
    }
    title.value = '';
    await loadTasks();
  } catch (e) {
    error.value = e.message;
  }
}

function openEdit(task) {
  editingTask.value = { ...task };
}

function closeEdit() {
  editingTask.value = null;
}

async function saveEdit(payload) {
  if (!editingTask.value) return;
  error.value = '';
  try {
    await api.updateTask(editingTask.value.id, payload);
    closeEdit();
    await loadTasks();
  } catch (e) {
    error.value = e.message;
  }
}

async function removeTask(id) {
  error.value = '';
  try {
    await api.deleteTask(id);
    await loadTasks();
  } catch (e) {
    error.value = e.message;
  }
}

function priorityClass(priority) {
  return `priority priority-${priority}`;
}

onMounted(loadTasks);
</script>

<template>
  <div class="page">
    <header>
      <h1>Задачи</h1>
      <p class="subtitle">Slim PHP API + Vue + Nginx (Docker)</p>
      <p v-if="apiStatus" class="status">API: {{ apiStatus }}</p>
    </header>

    <TaskFilters @apply="applyFilters" @reset="resetFilters" />

    <form class="form" @submit.prevent="addTask">
      <input
        v-model="title"
        type="text"
        placeholder="Задача или несколько через запятую..."
        :disabled="loading"
      />
      <button type="submit" :disabled="loading || !title.trim()">
        Добавить
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="hint">Загрузка...</p>

    <ul v-else class="list">
      <li
        v-for="task in tasks"
        :key="task.id"
        :class="{ burning: task.is_burning }"
      >
        <div class="task-main">
          <span v-if="task.is_burning" class="burning-badge" title="Горящая"
            >🔥</span
          >
          <span class="task-title">{{ task.title }}</span>
          <span :class="priorityClass(task.priority)">
            {{ priorityLabel(task.priority) }}
          </span>
        </div>
        <div class="task-actions">
          <button type="button" class="secondary" @click="openEdit(task)">
            Изменить
          </button>
          <button type="button" class="danger" @click="removeTask(task.id)">
            Удалить
          </button>
        </div>
      </li>
    </ul>

    <p v-if="!loading && tasks.length === 0" class="hint">
      {{ activeFilters ? 'Ничего не найдено' : 'Список пуст' }}
    </p>

    <TaskEditModal
      :task="editingTask"
      @close="closeEdit"
      @save="saveEdit"
    />
  </div>
</template>
