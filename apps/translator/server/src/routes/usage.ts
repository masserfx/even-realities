import { Hono } from "hono";
import { getUsageStats, getCurrency, PRICING } from "../lib/usage.js";

export const usageRoute = new Hono();

usageRoute.get("/usage", (c) => {
  const lang = c.req.query("lang") ?? "en";
  const stats = getUsageStats();
  const currency = getCurrency(lang);

  const convert = (usd: number) => ({
    usd: Math.round(usd * 1_000_000) / 1_000_000,  // 6 decimal places
    local: Math.round(usd * currency.rate * 100) / 100,
    currency: currency.code,
    symbol: currency.symbol,
  });

  const formatStats = (s: typeof stats.all) => ({
    cost: convert(s.totalUsd),
    byType: Object.fromEntries(
      Object.entries(s.byType).map(([k, v]) => [k, convert(v)])
    ),
    byModel: Object.fromEntries(
      Object.entries(s.byModel).map(([k, v]) => [k, convert(v)])
    ),
    tokens: s.totalTokens,
    images: s.totalImages,
    audioMinutes: Math.round(s.totalAudioMin * 10) / 10,
    ttsCharacters: s.totalTtsChars,
    requests: s.count,
  });

  return c.json({
    all: formatStats(stats.all),
    week: formatStats(stats.week),
    day: formatStats(stats.day),
    pricing: PRICING,
  });
});
