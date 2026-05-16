import cors from 'cors';
import express from 'express';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createChatModel, listProviders } from './llm.js';
import { diagnoseConnections } from './providerProbe.js';
import { humanizeError } from './formatError.js';
import { checkProviderHealth, formatLlmError } from './providerHealth.js';
import { handleTaskMessage } from './taskAssistant.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
  }
  next(err);
});

async function healthPayload(providerOverride) {
  const provider = await checkProviderHealth(providerOverride);

  return {
    status: provider.status === 'ok' ? 'ok' : 'degraded',
    service: 'ai',
    provider,
  };
}

function pingHandler(_req, res) {
  res.json({ status: 'ok', service: 'ai' });
}

async function healthHandler(req, res) {
  try {
    const body = await healthPayload(req.query.provider);
    res.status(body.status === 'ok' ? 200 : 503).json(body);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'ai',
      error: humanizeError(error),
    });
  }
}

function providersHandler(_req, res) {
  res.json(listProviders());
}

async function diagnoseHandler(_req, res) {
  try {
    res.json(await diagnoseConnections(true));
  } catch (error) {
    console.error('[ai/diagnose]', error);
    res.status(500).json({
      error: humanizeError(error),
    });
  }
}

async function handleTasks(req, res) {
  const { message, provider, useAgent } = req.body ?? {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(422).json({ error: 'Укажите текст сообщения' });
  }

  const providerName = provider || process.env.AI_PROVIDER || 'ollama';

  try {
    const result = await handleTaskMessage(message, providerName, {
      useAgent: Boolean(useAgent),
    });

    res.json({
      reply: result.reply,
      provider: providerName,
      action: result.action,
      data: result.data,
      tasks: result.tasks,
    });
  } catch (error) {
    console.error('[ai/tasks]', error);
    res.status(502).json({
      error: formatLlmError(error, providerName),
    });
  }
}

async function handleChat(req, res) {
  const { message, provider, system } = req.body ?? {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(422).json({ error: 'Укажите текст сообщения' });
  }

  const providerName = provider || process.env.AI_PROVIDER || 'ollama';

  try {
    const model = await createChatModel(provider);
    const messages = [];

    if (system && typeof system === 'string' && system.trim()) {
      messages.push(new SystemMessage(system.trim()));
    }

    messages.push(new HumanMessage(message.trim()));

    const response = await model.invoke(messages);
    const text =
      typeof response.content === 'string'
        ? response.content
        : response.content.map((part) => (part.type === 'text' ? part.text : '')).join('');

    res.json({
      reply: text,
      provider: providerName,
      model: response.response_metadata?.model ?? null,
    });
  } catch (error) {
    console.error('[ai/chat]', error);
    res.status(502).json({
      error: formatLlmError(error, providerName),
    });
  }
}

// nginx: location /ai/ + proxy_pass http://ai/ → /health, /chat, …
app.get('/ping', pingHandler);
app.get('/health', healthHandler);
app.get('/providers', providersHandler);
app.get('/diagnose', diagnoseHandler);
app.post('/chat', handleChat);
app.post('/tasks', handleTasks);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('[ai]', err);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    error: humanizeError(err),
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`AI service listening on :${port} (provider: ${process.env.AI_PROVIDER || 'ollama'})`);
});
