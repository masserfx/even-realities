import { Hono } from "hono";
import { transcribe } from "../lib/whisper.js";

export const transcribeRoute = new Hono();

transcribeRoute.post("/transcribe", async (c) => {
  const body = await c.req.json<{ audio: string; language?: string; format?: string }>();

  if (!body.audio) {
    return c.json({ error: "Missing 'audio' field (base64 PCM data)" }, 400);
  }

  try {
    const result = await transcribe(body.audio, body.language, body.format);
    return c.json(result);
  } catch (err) {
    console.error("Transcription error:", err);
    return c.json({ error: "Transcription failed" }, 500);
  }
});
