import 'server-only';
import OpenAI from 'openai';

/**
 * Server-only OpenAI client. The key never reaches the browser: this module is
 * imported only from Server Actions, and `server-only` makes the build fail if
 * a Client Component ever imports it.
 *
 * Env:
 *   OPENAI_API_KEY             required to enable AI features
 *   OPENAI_MODEL               optional, default below
 *   OPENAI_BASE_URL            optional (Azure OpenAI / proxy / local mock)
 *   AI_HOURLY_LIMIT_PER_USER   optional, default 60
 */
export const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const AI_HOURLY_LIMIT = Math.max(1, Number(process.env.AI_HOURLY_LIMIT_PER_USER ?? 60) || 60);

export function isAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('AI_NOT_CONFIGURED');
  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: 30_000, // a stuck request shouldn't hold a Server Action open
    maxRetries: 2, // SDK retries 408/409/429/5xx with backoff
  });
  return client;
}

/** Map provider errors to messages an agent can act on (never leak raw API text). */
export function aiErrorMessage(error: unknown): { message: string; code: string } {
  if (error instanceof Error && error.message === 'AI_NOT_CONFIGURED') {
    return { code: 'not_configured', message: 'AI is not configured. Add OPENAI_API_KEY to the server environment.' };
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return { code: 'timeout', message: 'The AI took too long to respond. Please try again.' };
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) return { code: 'auth', message: 'The AI provider rejected the API key. Check OPENAI_API_KEY.' };
    if (error.status === 429) return { code: 'provider_rate_limit', message: 'The AI provider is busy or out of quota. Try again in a minute.' };
    if (error.status === 400) return { code: 'bad_request', message: 'The AI request was rejected. Try shorter instructions.' };
    return { code: `http_${error.status ?? 'unknown'}`, message: 'The AI service had a problem. Please try again.' };
  }
  console.error('[ai] unexpected error', error);
  return { code: 'unknown', message: 'Something went wrong generating that. Please try again.' };
}
