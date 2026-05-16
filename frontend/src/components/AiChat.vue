<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const emit = defineEmits(['tasks-changed']);

const providers = ref(null);
const selectedProvider = ref('');
const message = ref('');
const reply = ref('');
const lastAction = ref('');
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
  lastAction.value = '';
  try {
    const result = await api.aiTasks({
      message: message.value.trim(),
      provider: selectedProvider.value || undefined,
    });
    reply.value = result.reply;
    lastAction.value = result.action || '';
    if (result.tasks) {
      emit('tasks-changed', result.tasks);
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
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
      Примеры: «создай задачу купить молоко», «покажи горящие с приоритетом 1», «удали задачу 3»,
      «найди настрой*», «задачи с приоритетом 2 сделай горящими», «всем задачам поставь приоритет 3».
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
        placeholder="Команда на естественном языке..."
        :disabled="loading"
      />
      <button type="submit" :disabled="loading || !message.trim()">
        {{ loading ? 'Обрабатываю...' : 'Выполнить' }}
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="lastAction" class="ai-action">Действие: {{ lastAction }}</p>
    <section v-if="reply" class="ai-reply">
      <span class="ai-reply-label">Ответ</span>
      <p class="ai-reply-text">{{ reply }}</p>
    </section>
  </section>
</template>
