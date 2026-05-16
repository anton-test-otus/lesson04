<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

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
    const result = await api.aiChat({
      message: message.value.trim(),
      provider: selectedProvider.value || undefined,
      system: 'Ты помощник в приложении для задач. Отвечай кратко на русском.',
    });
    reply.value = result.reply;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="ai-chat">
    <h2>AI (LangChain.js)</h2>
    <p v-if="providers" class="ai-meta">
      Провайдер: <strong>{{ providers.default }}</strong>
      <span v-if="providers.resolvedModel"> · модель: {{ providers.resolvedModel }}</span>
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
        placeholder="Сообщение модели..."
        :disabled="loading"
      />
      <button type="submit" :disabled="loading || !message.trim()">
        {{ loading ? 'Думаю...' : 'Отправить' }}
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="reply" class="ai-reply">
      <span class="ai-reply-label">Ответ</span>
      <p>{{ reply }}</p>
    </div>
  </section>
</template>
