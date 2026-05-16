<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const emit = defineEmits(['tasks-changed']);

const providers = ref(null);
const selectedProvider = ref('');
const message = ref('');
const reply = ref('');
const loading = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    providers.value = await api.aiProviders();
    selectedProvider.value = providers.value.default;
  } catch (e) {
    error.value = e.message;
  }
});

async function send() {
  if (!message.value.trim() || loading.value) return;
  loading.value = true;
  error.value = '';
  reply.value = '';
  try {
    const result = await api.aiTasks({
      message: message.value.trim(),
      provider: selectedProvider.value || undefined,
    });
    if (result.status === 'error') {
      const errors = result.errors;
      error.value = Array.isArray(errors)
        ? errors.join('; ')
        : errors || 'Не удалось выполнить команду';
      return;
    }
    reply.value = result.action || '';
    const tasks = result.data?.tasks;
    if (Array.isArray(tasks)) {
      emit('tasks-changed', tasks);
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
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
    <h2>Управление задачами</h2>
    <p v-if="providers" class="ai-meta">
      Провайдер: <strong>{{ providers.default }}</strong>
      <span v-if="providers.resolvedModel"> · модель: {{ providers.resolvedModel }}</span>
    </p>
    <p class="ai-hint">
      Примеры: «создай задачу купить молоко», список «добавь задачи:» и с новой строки пункты (с «-» или без),
      «покажи горящие», «потуши Docker», «подними приоритет» у отобранных.
    </p>

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
