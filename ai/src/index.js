import cors from 'cors';
import express from 'express';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createChatModel, listProviders } from './llm.js';
import { diagnoseConnections } from './providerProbe.js';
import { humanizeError } from './formatError.js';
import { checkProviderHealth, formatLlmError } from './providerHealth.js';
import { aiError, aiSuccess } from './taskResponse.js';
import { logAiRequest } from './requestLog.js';
import { getTasksGraphStatus } from './tasksGraphMode.js';
import { resolveTasksAgentMode } from './tasksAgentMode.js';
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
    tasksGraph: getTasksGraphStatus(providerOverride),
    tasksAgent: resolveTasksAgentMode(providerOverride),
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
  const started = Date.now();
  const { message, provider } = req.body ?? {};
  const requestText = typeof message === 'string' ? message.trim() : '';
  const providerName = provider || process.env.AI_PROVIDER || 'ollama';
  const agentMode = resolveTasksAgentMode(providerName);
  const requestMeta = {
    provider: provider ?? null,
    pipeline: 'langgraph',
    useAgent: agentMode.enabled,
    toolsConfigured: agentMode.configured,
  };

  if (!requestText) {
    const body = aiError('Укажите текст сообщения');
    await logAiRequest({
      route: 'POST /tasks',
      requestText: '',
      request: requestMeta,
      response: body,
      httpStatus: 422,
      durationMs: Date.now() - started,
    });
    return res.status(422).json(body);
  }

  const streamProgress = req.body?.stream === true;

  try {
    if (streamProgress) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders?.();

      const writeEvent = (payload) => {
        res.write(`${JSON.stringify(payload)}\n`);
      };

      const result = await handleTaskMessage(requestText, providerName, {
        onStreamEvent: (event) => writeEvent(event),
      });

      writeEvent({ type: 'done', ...result });

      await logAiRequest({
        route: 'POST /tasks',
        requestText,
        request: { ...requestMeta, stream: true },
        response: result,
        httpStatus: 200,
        durationMs: Date.now() - started,
      });
      return res.end();
    }

    const result = await handleTaskMessage(requestText, providerName);

    await logAiRequest({
      route: 'POST /tasks',
      requestText,
      request: requestMeta,
      response: result,
      httpStatus: 200,
      durationMs: Date.now() - started,
    });
    res.json(result);
  } catch (error) {
    console.error('[ai/tasks]', error);
    const body = aiError(formatLlmError(error, providerName));
    await logAiRequest({
      route: 'POST /tasks',
      requestText,
      request: requestMeta,
      response: body,
      httpStatus: 502,
      durationMs: Date.now() - started,
    });
    if (streamProgress && !res.headersSent) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    }
    if (streamProgress) {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      }
      const reason = Array.isArray(body.errors) ? body.errors.join('; ') : body.errors;
      res.write(
        `${JSON.stringify({
          type: 'reject',
          reason,
          errors: body.errors,
          source: 'error',
        })}\n`
      );
      res.write(`${JSON.stringify({ type: 'done', ...body })}\n`);
      return res.end();
    }
    res.status(502).json(body);
  }
}

async function handleChat(req, res) {
  const started = Date.now();
  const { message, provider, system } = req.body ?? {};
  const requestText = typeof message === 'string' ? message.trim() : '';
  const requestMeta = {
    provider: provider ?? null,
    hasSystem: Boolean(system && typeof system === 'string' && system.trim()),
  };

  if (!requestText) {
    const body = aiError('Укажите текст сообщения');
    await logAiRequest({
      route: 'POST /chat',
      requestText: '',
      request: requestMeta,
      response: body,
      httpStatus: 422,
      durationMs: Date.now() - started,
    });
    return res.status(422).json(body);
  }

  const providerName = provider || process.env.AI_PROVIDER || 'ollama';

  try {
    const model = await createChatModel(provider);
    const messages = [];

    if (system && typeof system === 'string' && system.trim()) {
      messages.push(new SystemMessage(system.trim()));
    }

    messages.push(new HumanMessage(requestText));

    const response = await model.invoke(messages);
    const text =
      typeof response.content === 'string'
        ? response.content
        : response.content.map((part) => (part.type === 'text' ? part.text : '')).join('');

    const body = aiSuccess('Ответ ассистента', {
      message: text,
      provider: providerName,
      model: response.response_metadata?.model ?? null,
    });
    await logAiRequest({
      route: 'POST /chat',
      requestText,
      request: requestMeta,
      response: body,
      httpStatus: 200,
      durationMs: Date.now() - started,
    });
    res.json(body);
  } catch (error) {
    console.error('[ai/chat]', error);
    const body = aiError(formatLlmError(error, providerName));
    await logAiRequest({
      route: 'POST /chat',
      requestText,
      request: requestMeta,
      response: body,
      httpStatus: 502,
      durationMs: Date.now() - started,
    });
    res.status(502).json(body);
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
