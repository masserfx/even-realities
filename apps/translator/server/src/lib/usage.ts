import fs from "node:fs";
import path from "node:path";

// ── Pricing (USD per unit) ─────────────────────────────────────────

const PRICING = {
  // GPT chat — per 1M tokens
  "gpt-4.1-nano":  { input: 0.10, output: 0.40 },
  "gpt-4.1-mini":  { input: 0.40, output: 1.60 },
  "gpt-4.1":       { input: 2.00, output: 8.00 },
  "ollama":        { input: 0, output: 0 },  // free (local)
  // Whisper — per minute of audio
  "whisper-1":     { perMinute: 0.006 },
  // TTS — per 1M characters
  "tts-1":         { perMChar: 15.00 },
  // DALL-E — per image
  "dall-e-2":      { perImage: 0.02 },  // 256x256
  "dall-e-3":      { perImage: 0.04 },  // 1024x1024
} as const;

// ── Currency rates (approximate, updated periodically) ─────────────

const CURRENCY_RATES: Record<string, { rate: number; symbol: string; code: string }> = {
  cs: { rate: 23.5, symbol: "Kč", code: "CZK" },
  sk: { rate: 0.93, symbol: "€", code: "EUR" },
  de: { rate: 0.93, symbol: "€", code: "EUR" },
  fr: { rate: 0.93, symbol: "€", code: "EUR" },
  es: { rate: 0.93, symbol: "€", code: "EUR" },
  it: { rate: 0.93, symbol: "€", code: "EUR" },
  pl: { rate: 4.05, symbol: "zł", code: "PLN" },
  ja: { rate: 150.0, symbol: "¥", code: "JPY" },
  ko: { rate: 1380.0, symbol: "₩", code: "KRW" },
  zh: { rate: 7.25, symbol: "¥", code: "CNY" },
  pt: { rate: 0.93, symbol: "€", code: "EUR" },
  ru: { rate: 92.0, symbol: "₽", code: "RUB" },
  uk: { rate: 0.79, symbol: "£", code: "GBP" },
  en: { rate: 1.0, symbol: "$", code: "USD" },
};

export function getCurrency(lang: string): { rate: number; symbol: string; code: string } {
  return CURRENCY_RATES[lang] ?? CURRENCY_RATES["en"];
}

// ── Usage entry ────────────────────────────────────────────────────

interface UsageEntry {
  timestamp: string;  // ISO
  type: "chat" | "whisper" | "tts" | "image";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  characters?: number;
  images?: number;
  costUsd: number;
}

// ── In-memory store + file persistence ─────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");

let entries: UsageEntry[] = [];

function load(): void {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      entries = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    }
  } catch {
    entries = [];
  }
}

function save(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error("[Usage] Save error:", err);
  }
}

// Load on module init
load();

// ── Track functions ────────────────────────────────────────────────

export function trackChat(model: string, inputTokens: number, outputTokens: number): void {
  const p = PRICING[model as keyof typeof PRICING];
  if (!p || !("input" in p)) {
    console.log(`[Usage] Unknown model for tracking: ${model}`);
    return;
  }
  const costUsd = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  entries.push({
    timestamp: new Date().toISOString(),
    type: "chat",
    model,
    inputTokens,
    outputTokens,
    costUsd,
  });
  save();
}

export function trackWhisper(audioSeconds: number): void {
  const costUsd = (audioSeconds / 60) * PRICING["whisper-1"].perMinute;
  entries.push({
    timestamp: new Date().toISOString(),
    type: "whisper",
    model: "whisper-1",
    audioSeconds,
    costUsd,
  });
  save();
}

export function trackTts(characters: number): void {
  const costUsd = (characters / 1_000_000) * PRICING["tts-1"].perMChar;
  entries.push({
    timestamp: new Date().toISOString(),
    type: "tts",
    model: "tts-1",
    characters,
    costUsd,
  });
  save();
}

export function trackImage(model: string, count: number = 1): void {
  const p = PRICING[model as keyof typeof PRICING];
  if (!p || !("perImage" in p)) return;
  const costUsd = count * p.perImage;
  entries.push({
    timestamp: new Date().toISOString(),
    type: "image",
    model,
    images: count,
    costUsd,
  });
  save();
}

// ── Query ──────────────────────────────────────────────────────────

interface UsageStats {
  totalUsd: number;
  byType: Record<string, number>;
  byModel: Record<string, number>;
  totalTokens: number;
  totalImages: number;
  totalAudioMin: number;
  totalTtsChars: number;
  count: number;
}

function computeStats(items: UsageEntry[]): UsageStats {
  const byType: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let totalUsd = 0;
  let totalTokens = 0;
  let totalImages = 0;
  let totalAudioMin = 0;
  let totalTtsChars = 0;

  for (const e of items) {
    totalUsd += e.costUsd;
    byType[e.type] = (byType[e.type] ?? 0) + e.costUsd;
    byModel[e.model] = (byModel[e.model] ?? 0) + e.costUsd;
    totalTokens += (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
    totalImages += e.images ?? 0;
    totalAudioMin += (e.audioSeconds ?? 0) / 60;
    totalTtsChars += e.characters ?? 0;
  }

  return { totalUsd, byType, byModel, totalTokens, totalImages, totalAudioMin, totalTtsChars, count: items.length };
}

export function getUsageStats(): { all: UsageStats; week: UsageStats; day: UsageStats } {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const dayItems = entries.filter(e => new Date(e.timestamp).getTime() >= dayAgo);
  const weekItems = entries.filter(e => new Date(e.timestamp).getTime() >= weekAgo);

  return {
    all: computeStats(entries),
    week: computeStats(weekItems),
    day: computeStats(dayItems),
  };
}

export { PRICING };
