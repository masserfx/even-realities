import { Hono } from "hono";
import { transcribe } from "../lib/whisper.js";
import { translate } from "../lib/translator.js";

export const streamRoute = new Hono();

streamRoute.post("/stream", async (c) => {
  const body = await c.req.json<{ audio?: string; text?: string; from?: string; to: string; format?: string }>();

  if (!body.to || (!body.audio && !body.text)) {
    return c.json({ error: "Missing required fields: (audio or text) + to" }, 400);
  }

  try {
    let originalText: string;
    let detectedLang: string;

    if (body.text) {
      // Text-only mode (manual input)
      originalText = body.text;
      detectedLang = body.from === "auto" ? "auto" : (body.from ?? "auto");
    } else {
      // Audio mode: transcribe first
      const fromLang = body.from === "auto" ? undefined : body.from;
      const transcription = await transcribe(body.audio!, fromLang, body.format);

      if (!transcription.text.trim()) {
        return c.json({
          original: "",
          translated: "",
          from: transcription.language,
          to: body.to,
        });
      }

      originalText = transcription.text;
      detectedLang = transcription.language;
    }

    // Translate
    const result = await translate(originalText, detectedLang, body.to);

    return c.json({
      original: originalText,
      translated: result.translation,
      from: detectedLang,
      to: body.to,
    });
  } catch (err) {
    console.error("Stream error:", err);
    return c.json({ error: "Transcription or translation failed" }, 500);
  }
});
