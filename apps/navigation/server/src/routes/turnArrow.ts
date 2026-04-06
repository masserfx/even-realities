import { Hono } from "hono";
import { generateTurnArrowImage } from "../lib/turnArrow.js";

export const turnArrowRoute = new Hono();

turnArrowRoute.get("/turn-arrow", async (c) => {
  const type = (c.req.query("type") ?? "continue").slice(0, 50);
  const modifier = (c.req.query("modifier") ?? "straight").slice(0, 50);
  try {
    const image = await generateTurnArrowImage(type, modifier);
    return c.json({ image });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});
