import { Hono } from "hono";
import sharp from "sharp";
import {
  generateComicImage,
  COMIC_STYLES,
  type ImageModel,
} from "../lib/comic-image.js";

export const imageTestRoute = new Hono();

// Generate one image with a given style, return original + 4 glasses variants
imageTestRoute.post("/image-test/generate", async (c) => {
  const { prompt, styleId, model } = await c.req.json<{
    prompt: string;
    styleId?: string;
    model?: ImageModel;
  }>();

  if (!prompt) return c.json({ error: "Missing prompt" }, 400);

  const raw = await generateComicImage(prompt, model ?? "dall-e-2", styleId);

  // Original greyscale
  const greyscaleBuf = await sharp(raw)
    .resize(288, 144, { fit: "cover" })
    .greyscale()
    .raw()
    .toBuffer();

  // Get pixel data for glasses simulation
  const pixels = new Uint8Array(greyscaleBuf);

  // Create 4-level quantized version (like real G2 display)
  // 4 levels: 0, 85, 170, 255
  const quantized4 = pixels.map((v) => {
    if (v < 64) return 0;
    if (v < 128) return 85;
    if (v < 192) return 170;
    return 255;
  });

  // Create 2-level (current binary threshold)
  const quantized2 = pixels.map((v) => (v >= 128 ? 255 : 0));

  // Encode each variant as base64 PNG via sharp
  const [original, glasses4, glasses2] = await Promise.all([
    sharp(raw).resize(288, 144, { fit: "cover" }).greyscale().png().toBuffer(),
    sharp(Buffer.from(quantized4), { raw: { width: 288, height: 144, channels: 1 } }).png().toBuffer(),
    sharp(Buffer.from(quantized2), { raw: { width: 288, height: 144, channels: 1 } }).png().toBuffer(),
  ]);

  return c.json({
    original: original.toString("base64"),
    glasses4: glasses4.toString("base64"),
    glasses2: glasses2.toString("base64"),
    styleId: styleId ?? "ink",
  });
});

// Generate ALL styles for one prompt at once
imageTestRoute.post("/image-test/all-styles", async (c) => {
  const { prompt, model } = await c.req.json<{
    prompt: string;
    model?: ImageModel;
  }>();

  if (!prompt) return c.json({ error: "Missing prompt" }, 400);

  const results = await Promise.all(
    COMIC_STYLES.map(async (style) => {
      try {
        const raw = await generateComicImage(prompt, model ?? "dall-e-2", style.id);

        const greyscaleBuf = await sharp(raw)
          .resize(288, 144, { fit: "cover" })
          .greyscale()
          .raw()
          .toBuffer();

        const pixels = new Uint8Array(greyscaleBuf);

        const quantized4 = pixels.map((v) => {
          if (v < 64) return 0;
          if (v < 128) return 85;
          if (v < 192) return 170;
          return 255;
        });

        const [original, glasses4] = await Promise.all([
          sharp(raw).resize(288, 144, { fit: "cover" }).png().toBuffer(),
          sharp(Buffer.from(quantized4), { raw: { width: 288, height: 144, channels: 1 } }).png().toBuffer(),
        ]);

        return {
          styleId: style.id,
          label: style.label,
          original: original.toString("base64"),
          glasses4: glasses4.toString("base64"),
        };
      } catch (err) {
        return { styleId: style.id, label: style.label, error: String(err) };
      }
    })
  );

  return c.json({ results });
});

// List styles
imageTestRoute.get("/image-test/styles", (c) => {
  return c.json({
    styles: COMIC_STYLES.map((s) => ({ id: s.id, label: s.label })),
  });
});
