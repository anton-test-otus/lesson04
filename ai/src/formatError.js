import { ZodError } from 'zod';
import { normalizeProvider } from './providers.js';

function looksLikeJson(text) {
  const t = text.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function messageFromParsedJson(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item.message === 'string');
    if (first) {
      return first.message;
    }
  }
  if (value && typeof value === 'object') {
    if (typeof value.error === 'string') {
      return value.error;
    }
    if (typeof value.message === 'string') {
      return value.message;
    }
  }
  return null;
}

/**
 * Текст для пользователя: без сырого JSON и технических дампов Zod/LangChain.
 */
export function humanizeError(error, provider) {
  if (error instanceof ZodError) {
    return (
      'Не удалось понять команду. ' +
      'Уточните действие: создать, показать, изменить, удалить задачи; ' +
      'укажите id или критерии (приоритет, горящие, поиск по названию).'
    );
  }

  let message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';

  if (looksLikeJson(message)) {
    try {
      const parsed = JSON.parse(message);
      const fromJson = messageFromParsedJson(parsed);
      if (fromJson && !looksLikeJson(fromJson)) {
        message = fromJson;
      } else {
        return 'Не удалось обработать запрос. Переформулируйте команду проще.';
      }
    } catch {
      return 'Не удалось обработать запрос. Переформулируйте команду проще.';
    }
  }

  if (/invalid_union|invalid_type|expected.*received|ZodError/i.test(message)) {
    return (
      'Не удалось разобрать команду. ' +
      'Примеры: «создай задачу …», «покажи горящие», «задачи с приоритетом 2 сделай горящими».'
    );
  }

  if (/SyntaxError|JSON\.parse|Unexpected token|не корректный JSON/i.test(message)) {
    return 'Модель вернула непонятный ответ. Повторите запрос или упростите формулировку.';
  }

  if (/message is required/i.test(message)) {
    return 'Укажите текст сообщения.';
  }

  if (/Task command failed|diagnose failed|Internal server error/i.test(message)) {
    return 'Не удалось выполнить команду. Попробуйте ещё раз или проверьте /ai/health.';
  }

  const network = /connection error|fetch failed|econnrefused|enotfound|network|timed out/i;
  if (network.test(message) || network.test(cause)) {
    const name = normalizeProvider(provider || process.env.AI_PROVIDER || 'ollama');
    if (name === 'lmstudio') {
      return (
        'Нет связи с LM Studio. Проверьте lms server start --bind 0.0.0.0 и host.docker.internal в .env.'
      );
    }
    if (name === 'ollama') {
      return 'Нет связи с Ollama. Запустите ollama serve на хосте.';
    }
    return `Нет связи с провайдером ${name}.`;
  }

  if (/model.*not found|404/i.test(message)) {
    return 'Модель не найдена. Проверьте LMSTUDIO_MODEL / OLLAMA_MODEL в .env.';
  }

  if (/Title is required|Priority must be|Task not found|At least one title/i.test(message)) {
    const map = {
      'Title is required': 'Укажите название задачи.',
      'Priority must be 1, 2 or 3': 'Приоритет должен быть 1, 2 или 3.',
      'Task not found': 'Задача не найдена. Проверьте id в списке.',
      'At least one title is required': 'Укажите хотя бы одно название задачи.',
    };
    for (const [en, ru] of Object.entries(map)) {
      if (message.includes(en)) {
        return ru;
      }
    }
  }

  if (/Укажите set_priority|API:/i.test(message)) {
    return message.replace(/^API:\s*/, 'Ошибка задач: ');
  }

  if (message.length > 280 && /[{[\]}]/.test(message)) {
    return 'Не удалось обработать запрос. Переформулируйте команду проще.';
  }

  return message;
}
