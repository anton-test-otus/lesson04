<script setup>
import { onMounted, ref } from 'vue';
import { api } from './api';
import { priorityLabel } from './constants';
import TaskEditModal from './components/TaskEditModal.vue';
import AiChat from './components/AiChat.vue';

const tasks = ref([]);
const loading = ref(false);
const error = ref('');
const apiStatus = ref('');
const aiStatus = ref('');
const editingTask = ref(null);

async function checkServices() {
  try {
    const health = await api.health();
    apiStatus.value = health.status;
  } catch (e) {
    apiStatus.value = e.message;
  }

  try {
    const health = await api.aiHealth();
    if (health.status === 'ok' && health.provider?.status === 'ok') {
      aiStatus.value = 'ok';
    } else if (health.provider?.error) {
      aiStatus.value = health.provider.error;
    } else {
      aiStatus.value = health.status === 'ok' ? 'ok' : health.status;
    }
  } catch (e) {
    aiStatus.value = e.message;
  }
}

async function loadTasks() {
  loading.value = true;
  error.value = '';
  await checkServices();
  try {
    tasks.value = await api.getTasks();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function statusClass(status) {
  return status === 'ok' ? 'status-ok' : 'status-error';
}

function onAiTasksChanged(newTasks) {
  tasks.value = newTasks;
  error.value = '';
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
      <div v-if="apiStatus || aiStatus" class="status-row">
        <p v-if="apiStatus" class="status" :class="statusClass(apiStatus)">
          API: {{ apiStatus }}
        </p>
        <p v-if="aiStatus" class="status" :class="statusClass(aiStatus)">
          AI: {{ aiStatus }}
        </p>
      </div>
    </header>

    <AiChat @tasks-changed="onAiTasksChanged" />

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

    <p v-if="!loading && tasks.length === 0" class="hint">Список пуст</p>

    <TaskEditModal
      :task="editingTask"
      @close="closeEdit"
      @save="saveEdit"
    />
  </div>
</template>
