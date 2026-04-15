import OpenAI from 'openai';

let client: OpenAI | null = null;

/**
 * Lazy-initialized OpenAI client. Mirrors the getStripe() pattern.
 *
 * Why lazy: instantiating at module load breaks Next.js builds when
 * OPENAI_API_KEY isn't present at build time (Vercel build vs runtime).
 *
 * Server-side only. Never import this from a 'use client' file —
 * the API key would ship to the browser.
 */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}