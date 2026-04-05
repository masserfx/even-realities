import { Hono } from "hono";
import OpenAI from "openai";
import { trackTts } from "../lib/usage.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const ttsRoute = new Hono();

ttsRoute.post("/tts", async (c) => {
  const { text, lang, speed } = await c.req.json<{
    text: string;
    lang?: string;
    speed?: number;
  }>();

  if (!text) return c.json({ error: "Missing text" }, 400);

  try {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
      response_format: "mp3",
      speed: speed ?? 1.3,
    });

    trackTts(text.length);
    const buffer = Buffer.from(await response.arrayBuffer());
    return c.body(buffer, 200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length.toString(),
    });
  } catch (err) {
    console.error("TTS error:", err);
    return c.json({ error: "TTS failed" }, 500);
  }
});
