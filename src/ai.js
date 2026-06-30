/**
 * AI provider abstraction — Claude (primary), OpenAI GPT-4o, Google Gemini.
 * Reads keys from .env file. Keys can also be set/updated at runtime via setKey().
 */
import 'dotenv/config';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(__dir, '../.env');

export const MODELS = {
  'claude-sonnet':  { provider:'anthropic', id:'claude-sonnet-4-6',       label:'Claude Sonnet 4.6',   context:200000 },
  'claude-opus':    { provider:'anthropic', id:'claude-opus-4-8',          label:'Claude Opus 4.8',     context:200000 },
  'gpt-4o':         { provider:'openai',    id:'gpt-4o',                   label:'GPT-4o',              context:128000 },
  'gpt-4o-mini':    { provider:'openai',    id:'gpt-4o-mini',              label:'GPT-4o mini',         context:128000 },
  'gemini-pro':     { provider:'gemini',    id:'gemini-2.5-pro',           label:'Gemini 2.5 Pro',      context:1000000},
  'gemini-flash':   { provider:'gemini',    id:'gemini-2.5-flash',         label:'Gemini 2.5 Flash',    context:1000000},
};
export const DEFAULT_MODEL = 'claude-sonnet';

function loadEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const lines = readFileSync(ENV_FILE, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export function getKeys() {
  const env = loadEnv();
  return {
    anthropic:       env.ANTHROPIC_API_KEY       || process.env.ANTHROPIC_API_KEY       || '',
    openai:          env.OPENAI_API_KEY           || process.env.OPENAI_API_KEY           || '',
    gemini:          env.GEMINI_API_KEY           || process.env.GEMINI_API_KEY           || '',
    registry_user:   env.NSW_REGISTRY_USER        || process.env.NSW_REGISTRY_USER        || '',
    registry_pass:   env.NSW_REGISTRY_PASS        || process.env.NSW_REGISTRY_PASS        || '',
    registry_name:   env.NSW_REGISTRY_PARTY_NAME  || process.env.NSW_REGISTRY_PARTY_NAME  || '',
  };
}

export function setKey(provider, value) {
  const env = loadEnv();
  const keyMap = {
    anthropic:     'ANTHROPIC_API_KEY',
    openai:        'OPENAI_API_KEY',
    gemini:        'GEMINI_API_KEY',
    registry_user: 'NSW_REGISTRY_USER',
    registry_pass: 'NSW_REGISTRY_PASS',
    registry_name: 'NSW_REGISTRY_PARTY_NAME',
  };
  if (!keyMap[provider]) return;
  env[keyMap[provider]] = value;
  const content = Object.entries(env).map(([k,v]) => `${k}=${v}`).join('\n') + '\n';
  writeFileSync(ENV_FILE, content);
  process.env[keyMap[provider]] = value;
}

export function modelStatus() {
  const keys = getKeys();
  return {
    anthropic: !!keys.anthropic,
    openai:    !!keys.openai,
    gemini:    !!keys.gemini,
    models: Object.entries(MODELS).map(([id, m]) => ({
      id, label: m.label, provider: m.provider,
      available: m.provider==='anthropic' ? !!keys.anthropic
               : m.provider==='openai'    ? !!keys.openai
               : !!keys.gemini,
    })),
  };
}

// ── Core streaming chat ────────────────────────────────────────────────────────

export async function* streamChat(messages, modelKey=DEFAULT_MODEL, systemPrompt='') {
  const model = MODELS[modelKey] || MODELS[DEFAULT_MODEL];
  const keys  = getKeys();

  if (model.provider === 'anthropic') {
    if (!keys.anthropic) throw new Error('No Anthropic API key. Add it in Settings.');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: keys.anthropic });
    const stream = await client.messages.stream({
      model:      model.id,
      max_tokens: 4096,
      system:     systemPrompt,
      messages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    return;
  }

  if (model.provider === 'openai') {
    if (!keys.openai) throw new Error('No OpenAI API key. Add it in Settings.');
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: keys.openai });
    const msgs = systemPrompt ? [{ role:'system', content:systemPrompt }, ...messages] : messages;
    const stream = await client.chat.completions.create({ model: model.id, messages: msgs, stream: true });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
    return;
  }

  if (model.provider === 'gemini') {
    if (!keys.gemini) throw new Error('No Gemini API key. Add it in Settings.');
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: keys.gemini });
    const allText = (systemPrompt ? systemPrompt+'\n\n' : '') + messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const stream = await ai.models.generateContentStream({ model: model.id, contents: allText });
    for await (const chunk of stream) {
      const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) yield text;
    }
    return;
  }

  throw new Error(`Unknown provider: ${model.provider}`);
}

// ── Non-streaming helper ───────────────────────────────────────────────────────

export async function chat(messages, modelKey=DEFAULT_MODEL, systemPrompt='') {
  let out = '';
  for await (const chunk of streamChat(messages, modelKey, systemPrompt)) out += chunk;
  return out;
}
