import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultLogDir = path.join(moduleDir, '..', 'logs');

const LOG_DIR = process.env.AI_REQUEST_LOG_DIR || defaultLogDir;
const LOG_FILE = process.env.AI_REQUEST_LOG_FILE || 'requests.jsonl';

let dirReady = false;

async function ensureLogDir() {
  if (dirReady) {
    return;
  }
  await fs.mkdir(LOG_DIR, { recursive: true });
  dirReady = true;
}

/**
 * @param {{
 *   route: string,
 *   requestText: string,
 *   request?: Record<string, unknown> | null,
 *   response: unknown,
 *   httpStatus: number,
 *   durationMs?: number,
 * }} entry
 */
export async function logAiRequest(entry) {
  try {
    await ensureLogDir();
    const line = {
      time: new Date().toISOString(),
      route: entry.route,
      requestText: entry.requestText,
      request: entry.request ?? null,
      response: entry.response,
      httpStatus: entry.httpStatus,
      ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
    };
    await fs.appendFile(path.join(LOG_DIR, LOG_FILE), `${JSON.stringify(line)}\n`, 'utf8');
  } catch (error) {
    console.error('[ai/request-log]', error instanceof Error ? error.message : error);
  }
}
