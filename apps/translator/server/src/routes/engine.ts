import { Hono } from "hono";
import { getEngine, setEngine, type AIEngine } from "../lib/translator.js";

export const engineRoute = new Hono();

const AVAILABLE_ENGINES: { id: AIEngine; label: string; speed: string }[] = [
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", speed: "~1s" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", speed: "~1.5s" },
  { id: "gpt-4.1", label: "GPT-4.1", speed: "~2s" },
  { id: "ollama", label: "Ollama (offline)", speed: "~40s" },
];

engineRoute.get("/engine", (c) => {
  return c.json({ current: getEngine(), available: AVAILABLE_ENGINES });
});

engineRoute.put("/engine", async (c) => {
  const body = await c.req.json<{ engine: string }>();
  const valid = AVAILABLE_ENGINES.map((e) => e.id);

  if (!valid.includes(body.engine as AIEngine)) {
    return c.json({ error: `Invalid engine. Choose: ${valid.join(", ")}` }, 400);
  }

  setEngine(body.engine as AIEngine);
  return c.json({ engine: getEngine() });
});
