import { Hono } from "hono";
import { translate } from "../lib/translator.js";

export const translateRoute = new Hono();

translateRoute.post("/translate", async (c) => {
  const body = await c.req.json<{ text: string; from: string; to: string }>();

  if (!body.text || !body.from || !body.to) {
    return c.json({ error: "Missing required fields: text, from, to" }, 400);
  }

  try {
    const result = await translate(body.text, body.from, body.to);
    return c.json(result);
  } catch (err) {
    console.error("Translation error:", err);
    return c.json({ error: "Translation failed" }, 500);
  }
});
