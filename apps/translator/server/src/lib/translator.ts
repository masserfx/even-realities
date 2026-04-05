import OpenAI from "openai";
import { ollamaChat } from "./ollama.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type AIEngine = 'gpt-4.1-nano' | 'gpt-4.1-mini' | 'gpt-4.1' | 'ollama';

let currentEngine: AIEngine = (process.env.AI_ENGINE as AIEngine) ?? 'gpt-4.1-mini';

export function getEngine(): AIEngine { return currentEngine }
export function setEngine(engine: AIEngine): void { currentEngine = engine }

interface ContextEntry {
  original: string;
  translation: string;
}

const contextWindow: ContextEntry[] = [];
const MAX_CONTEXT = 5;

function buildContextBlock(): string {
  if (contextWindow.length === 0) return "";
  const lines = contextWindow.map(
    (e, i) => `${i + 1}. "${e.original}" → "${e.translation}"`
  );
  return `\nRecent conversation context:\n${lines.join("\n")}\n`;
}

const SYSTEM_PROMPT = `You are a professional real-time translator for smart glasses. Rules:
- Translate idiomatically, never literally word-for-word.
- Preserve the original tone, register, and intent.
- Handle slang, idioms, and colloquialisms naturally in the target language.
- Keep translations concise — they will be displayed on a small HUD.
- Output ONLY the translated text, nothing else — no quotes, no explanation.`;

export interface TranslationResult {
  translation: string;
  from: string;
  to: string;
  engine: AIEngine;
}

async function callLLM(system: string, user: string): Promise<string> {
  if (currentEngine === 'ollama') {
    return ollamaChat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  }

  const response = await openai.chat.completions.create({
    model: currentEngine,
    max_tokens: 1024,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function translate(
  text: string,
  from: string,
  to: string
): Promise<TranslationResult> {
  const contextBlock = buildContextBlock();
  const userMessage = `${contextBlock}Translate from ${from} to ${to}:\n${text}`;

  const translation = await callLLM(SYSTEM_PROMPT, userMessage);

  contextWindow.push({ original: text, translation });
  if (contextWindow.length > MAX_CONTEXT) {
    contextWindow.shift();
  }

  return { translation, from, to, engine: currentEngine };
}

async function* callLLMStream(system: string, user: string): AsyncGenerator<string> {
  if (currentEngine === 'ollama') {
    const res = await fetch(`${process.env.OLLAMA_URL ?? 'http://localhost:11434'}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? 'gemma4:e4b',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: true,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama error: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        if (parsed.message?.content) yield parsed.message.content;
      }
    }
    return;
  }

  const stream = await openai.chat.completions.create({
    model: currentEngine,
    max_tokens: 2048,
    stream: true,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export { callLLM, callLLMStream };
