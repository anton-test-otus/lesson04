import cors from 'cors';
import express from 'express';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createChatModel, listProviders } from './llm.js';

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai' });
});

app.get('/api/ai/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai' });
});

app.get('/api/ai/providers', (_req, res) => {
  res.json(listProviders());
});

app.post('/api/ai/chat', async (req, res) => {
  const { message, provider, system } = req.body ?? {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(422).json({ error: 'message is required' });
  }

  try {
    const model = createChatModel(provider);
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
      provider: provider || process.env.AI_PROVIDER || 'ollama',
      model: response.response_metadata?.model ?? null,
    });
  } catch (error) {
    console.error('[ai/chat]', error);
    res.status(502).json({
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('[ai]', err);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    error: err instanceof Error ? err.message : 'Internal server error',
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`AI service listening on :${port} (provider: ${process.env.AI_PROVIDER || 'ollama'})`);
});
