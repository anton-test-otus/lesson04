<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
import ParseProcessModal from './ParseProcessModal.vue';

const emit = defineEmits(['ai-result', 'graph-step', 'graph-idle']);

const providers = ref(null);
const selectedProvider = ref('');
const useAgent = ref(false);
const message = ref('');
const reply = ref('');
const loading = ref(false);
const error = ref('');
const parseModalOpen = ref(false);
const parseEvents = ref([]);

onMounted(async () => {
  try {
    providers.value = await api.aiProviders();
    selectedProvider.value = providers.value.default;
    useAgent.value = Boolean(providers.value.tasksAgent?.configured);
  } catch (e) {
    error.value = e.message;
  }
});

function handleStreamEvent(event) {
  parseEvents.value = [...parseEvents.value, event];
  if (event.type === 'step' && event.graph && event.node) {
    emit('graph-step', { graph: event.graph, node: event.node });
  }
}

async function send() {
  if (!message.value.trim() || loading.value) return;
  loading.value = true;
  error.value = '';
  reply.value = '';
  parseEvents.value = [];
  parseModalOpen.value = true;

  try {
    const result = await api.aiTasks({
      message: message.value.trim(),
      provider: selectedProvider.value || undefined,
      useAgent: useAgent.value,
      onStreamEvent: handleStreamEvent,
    });
    if (result.status === 'error') {
      const errors = result.errors;
      error.value = Array.isArray(errors)
        ? errors.join('; ')
        : errors || 'Не удалось выполнить команду';
      return;
    }
    reply.value = result.action || '';
    message.value = '';
    emit('ai-result', result);
    setTimeout(() => {
      if (!loading.value) {
        parseModalOpen.value = false;
      }
    }, 1200);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
    emit('graph-idle');
  }
}

function onTextareaKeydown(event) {
  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) {
    return;
  }
  event.preventDefault();
  send();
}
</script>

<template>
  <section class="ai-chat">
    <ParseProcessModal
      :open="parseModalOpen"
      :loading="loading"
      :events="parseEvents"
      @close="parseModalOpen = false"
    />

    <h2>Управление задачами</h2>
    <p v-if="providers" class="ai-meta">
      Провайдер: <strong>{{ providers.default }}</strong>
      <span v-if="providers.resolvedModel"> · модель: {{ providers.resolvedModel }}</span>
    </p>
    <p class="ai-hint">
      Примеры: «создай задачу купить молоко», список «добавь задачи:» и с новой строки пункты (с «-» или без),
      «найди задачи тест* с низким приоритетом», «покажи горящие», «потуши Docker».
    </p>

    <label v-if="providers?.tasksAgent?.agentCapable" class="field field-checkbox">
      <input v-model="useAgent" type="checkbox" :disabled="loading" />
      <span>Tool-calling (ReAct + tools)</span>
    </label>

    <label class="field">
      <span>Провайдер</span>
      <select v-model="selectedProvider" :disabled="loading">
        <option v-for="p in providers?.available ?? []" :key="p" :value="p">
          {{ p }}
        </option>
      </select>
    </label>

    <form class="ai-form" @submit.prevent="send">
      <textarea
        v-model="message"
        rows="3"
        placeholder="Команда на естественном языке... (Ctrl+Enter — выполнить)"
        :disabled="loading"
        @keydown="onTextareaKeydown"
      />
      <button type="submit" :disabled="loading || !message.trim()">
        {{ loading ? 'Обрабатываю...' : 'Выполнить' }}
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>
    <section v-if="reply" class="ai-reply">
      <span class="ai-reply-label">Ответ</span>
      <p class="ai-reply-text">{{ reply }}</p>
    </section>
  </section>
</template>
