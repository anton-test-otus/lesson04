<script setup>
import { onMounted, ref } from 'vue';
import { api } from './api';
import { applyAiDataToTasks } from './taskSync';
import { priorityLabel } from './constants';
import TaskEditModal from './components/TaskEditModal.vue';
import AiChat from './components/AiChat.vue';

const tasks = ref([]);
const loading = ref(false);
const error = ref('');
const apiStatus = ref('');
const aiStatus = ref('');
const graphStatus = ref('');
const graphIdleLabel = ref('tasks');
const toolsStatus = ref('');
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
    graphIdleLabel.value = health.tasksGraph?.name ?? health.tasksGraph?.label ?? 'tasks';
    graphStatus.value = graphIdleLabel.value;
    toolsStatus.value = health.tasksAgent?.label ?? health.tasksGraph?.toolsAgent?.label ?? 'off';
  } catch (e) {
    aiStatus.value = e.message;
    graphStatus.value = '';
    toolsStatus.value = '';
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

function graphStatusClass(label) {
  if (String(label).includes('→')) {
    return 'status-ok';
  }
  return label === graphIdleLabel.value ? 'status-ok' : 'status-muted';
}

function onGraphStep({ graph, node }) {
  graphStatus.value = node ? `${graph} → ${node}` : graph;
}

function onGraphIdle() {
  graphStatus.value = graphIdleLabel.value;
}

async function reloadTasksQuiet() {
  try {
    tasks.value = await api.getTasks();
  } catch (e) {
    error.value = e.message;
  }
}

async function onAiResult(result) {
  const mode = applyAiDataToTasks(tasks, result.data);
  if (mode === 'reload') {
    await reloadTasksQuiet();
  }
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
    const task = await api.updateTask(editingTask.value.id, payload);
    applyAiDataToTasks(tasks, { kind: 'task', task });
    closeEdit();
  } catch (e) {
    error.value = e.message;
  }
}

async function removeTask(id) {
  error.value = '';
  try {
    await api.deleteTask(id);
    applyAiDataToTasks(tasks, { kind: 'deleted', id });
  } catch (e) {
    error.value = e.message;
  }
}

function priorityClass(priority) {
  return `priority priority-${priority}`;
}

function hasPriority(priority) {
  return priority === 1 || priority === 2 || priority === 3;
}

onMounted(loadTasks);
</script>

<template>
  <div class="page">
    <header>
      <h1>Задачи</h1>
      <p class="subtitle">Slim PHP API + Vue + Nginx (Docker)</p>
      <div v-if="apiStatus || aiStatus || graphStatus || toolsStatus" class="status-row">
        <p v-if="apiStatus" class="status" :class="statusClass(apiStatus)">
          API: {{ apiStatus }}
        </p>
        <p v-if="aiStatus" class="status" :class="statusClass(aiStatus)">
          AI: {{ aiStatus }}
        </p>
        <p v-if="graphStatus" class="status" :class="graphStatusClass(graphStatus)">
          Graph: {{ graphStatus }}
        </p>
        <p
          v-if="toolsStatus"
          class="status"
          :class="toolsStatus === 'on' ? 'status-ok' : 'status-muted'"
        >
          Tools: {{ toolsStatus }}
        </p>
      </div>
    </header>

    <AiChat
      @ai-result="onAiResult"
      @graph-step="onGraphStep"
      @graph-idle="onGraphIdle"
    />

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
          <span v-if="hasPriority(task.priority)" :class="priorityClass(task.priority)">
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
