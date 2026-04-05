import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { callLLM, callLLMStream, getEngine } from "../lib/translator.js";

export const chatRoute = new Hono();

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const conversationHistory: ChatMessage[] = [];
const MAX_HISTORY = 10;

const ASSISTANT_SYSTEM = `You are an AI assistant running on smart glasses (Even Realities G2).
- By default keep responses concise (2-3 sentences) — the display is a small HUD (576x288px).
- BUT when the user asks for something longer (story, fairy tale, explanation, list, poem), provide a full response. The text will scroll automatically.
- Be direct, skip pleasantries.
- If asked to translate, translate idiomatically.
- If asked about surroundings/navigation, give practical answers.
- You can help with: translation, quick facts, calculations, reminders, weather context, directions, stories.
- Respond in the same language as the user's message, unless asked otherwise.`;

chatRoute.post("/chat", async (c) => {
  const body = await c.req.json<{ message: string; reset?: boolean }>();

  if (!body.message) {
    return c.json({ error: "Missing required field: message" }, 400);
  }

  if (body.reset) {
    conversationHistory.length = 0;
  }

  conversationHistory.push({ role: "user", content: body.message });

  try {
    const contextMessages = conversationHistory.slice(-MAX_HISTORY * 2);
    const fullPrompt = contextMessages.map(m => `${m.role}: ${m.content}`).join("\n");

    const response = await callLLM(ASSISTANT_SYSTEM, fullPrompt);

    conversationHistory.push({ role: "assistant", content: response });

    while (conversationHistory.length > MAX_HISTORY * 2) {
      conversationHistory.shift();
    }

    return c.json({ response, engine: getEngine() });
  } catch (err) {
    console.error("Chat error:", err);
    return c.json({ error: "AI assistant unavailable" }, 500);
  }
});

chatRoute.get("/chat/stream", async (c) => {
  const message = c.req.query("message");
  const reset = c.req.query("reset");

  if (!message) {
    return c.json({ error: "Missing required query param: message" }, 400);
  }

  if (reset === "true") {
    conversationHistory.length = 0;
  }

  conversationHistory.push({ role: "user", content: message });

  const contextMessages = conversationHistory.slice(-MAX_HISTORY * 2);
  const fullPrompt = contextMessages.map(m => `${m.role}: ${m.content}`).join("\n");

  return streamSSE(c, async (stream) => {
    let fullResponse = "";
    try {
      for await (const chunk of callLLMStream(ASSISTANT_SYSTEM, fullPrompt)) {
        fullResponse += chunk;
        await stream.writeSSE({ data: JSON.stringify({ chunk, done: false }) });
      }
      conversationHistory.push({ role: "assistant", content: fullResponse });
      while (conversationHistory.length > MAX_HISTORY * 2) {
        conversationHistory.shift();
      }
      await stream.writeSSE({ data: JSON.stringify({ chunk: "", done: true, engine: getEngine() }) });
    } catch (err) {
      console.error("Chat stream error:", err);
      await stream.writeSSE({ data: JSON.stringify({ error: "AI assistant unavailable", done: true }) });
    }
  });
});

chatRoute.delete("/chat", (c) => {
  conversationHistory.length = 0;
  return c.json({ status: "conversation cleared" });
});
