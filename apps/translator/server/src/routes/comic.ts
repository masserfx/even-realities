import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { callLLM, getEngine } from "../lib/translator.js";
import {
  generateComicImage,
  generatePreviewImage,
  processForGlasses,
  processForWeb,
  COMIC_STYLES,
  type ImageModel,
} from "../lib/comic-image.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const comicRoute = new Hono();

const PREVIEW_DIR = join(import.meta.dirname, "../../data/comic-previews");

const COMIC_SYSTEM = `You are a comic story writer for smart glasses. Given a topic, create a 4-6 scene comic story.
Return ONLY valid JSON with this exact structure:
{"title":"...","scenes":[{"narration":"...","imagePrompt":"..."}]}

Rules:
- Each narration: 1-3 sentences, vivid and engaging. Use natural, fluent language.
- CRITICAL: Title and narration MUST be in the SAME language as the user's input. If user writes in Czech, respond in proper Czech. If in English, respond in English. Match the language exactly.
- Each imagePrompt: describe a single visual scene for illustration in English. Focus on characters, poses, and setting. No text in images.
- Make the story complete with beginning, middle, and end.`;

interface ComicScene {
  narration: string;
  imagePrompt: string;
}

interface ComicStory {
  title: string;
  scenes: ComicScene[];
}

async function generateWithConcurrency(
  scenes: ComicScene[],
  imageModel: ImageModel,
  styleId: string,
  onImage: (index: number, glassesImage: string, webImage: string) => Promise<void>
): Promise<void> {
  const MAX_CONCURRENT = 2;
  let running = 0;
  let nextIndex = 0;

  return new Promise((resolve, reject) => {
    function startNext(): void {
      while (running < MAX_CONCURRENT && nextIndex < scenes.length) {
        const idx = nextIndex++;
        running++;
        generateSingleImage(idx)
          .then(() => {
            running--;
            if (nextIndex >= scenes.length && running === 0) resolve();
            else startNext();
          })
          .catch((err) => {
            console.error(`Comic image ${idx} failed:`, err);
            running--;
            if (nextIndex >= scenes.length && running === 0) resolve();
            else startNext();
          });
      }
    }

    async function generateSingleImage(idx: number): Promise<void> {
      const raw = await generateComicImage(scenes[idx].imagePrompt, imageModel, styleId);
      const [glassesImage, webImage] = await Promise.all([
        processForGlasses(raw),
        processForWeb(raw),
      ]);
      await onImage(idx, glassesImage, webImage);
    }

    if (scenes.length === 0) resolve();
    else startNext();
  });
}

// GET /api/comic/styles — list available styles with preview URLs
comicRoute.get("/comic/styles", async (c) => {
  const styles = COMIC_STYLES.map(s => ({
    id: s.id,
    label: s.label,
    previewUrl: `/api/comic/preview/${s.id}`,
  }));
  return c.json({ styles });
});

// GET /api/comic/preview/:id — serve cached preview or generate on demand
comicRoute.get("/comic/preview/:id", async (c) => {
  const { id } = c.req.param();
  const filePath = join(PREVIEW_DIR, `${id}.png`);

  // Try cached
  try {
    const cached = await readFile(filePath);
    return c.body(new Uint8Array(cached) as any, 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" });
  } catch {
    // not cached yet
  }

  // Generate and cache
  try {
    const raw = await generatePreviewImage(id);
    const png = await import("sharp").then(s => s.default(raw).resize(200, 200, { fit: "cover" }).png().toBuffer());
    await mkdir(PREVIEW_DIR, { recursive: true });
    await writeFile(filePath, png);
    return c.body(new Uint8Array(png) as any, 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" });
  } catch (err) {
    console.error(`Preview generation failed for ${id}:`, err);
    return c.json({ error: "Preview generation failed" }, 500);
  }
});

comicRoute.get("/comic/stream", async (c) => {
  const message = c.req.query("message");
  const imageModel = (c.req.query("imageModel") as ImageModel) || "dall-e-2";
  const styleId = c.req.query("style") || "ink";

  if (!message) {
    return c.json({ error: "Missing required query param: message" }, 400);
  }

  return streamSSE(c, async (stream) => {
    try {
      // Step 1: Generate structured story via LLM
      const raw = await callLLM(COMIC_SYSTEM, message);

      let story: ComicStory;
      try {
        // Extract JSON from potential markdown code blocks
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");
        story = JSON.parse(jsonMatch[0]);
        if (!story.title || !Array.isArray(story.scenes) || story.scenes.length === 0) {
          throw new Error("Invalid story structure");
        }
      } catch (parseErr) {
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", message: "Failed to generate story structure" }),
        });
        return;
      }

      // Step 2: Send story metadata
      await stream.writeSSE({
        data: JSON.stringify({
          type: "story",
          title: story.title,
          sceneCount: story.scenes.length,
          engine: getEngine(),
        }),
      });

      // Step 3: Send all scene narrations immediately
      for (let i = 0; i < story.scenes.length; i++) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "scene",
            index: i,
            narration: story.scenes[i].narration,
          }),
        });
      }

      // Step 4: Generate images in parallel and stream as ready
      await generateWithConcurrency(
        story.scenes,
        imageModel,
        styleId,
        async (index, glassesImage, webImage) => {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "image",
              index,
              glassesImage,
              webImage,
            }),
          });
        }
      );

      await stream.writeSSE({
        data: JSON.stringify({ type: "done" }),
      });
    } catch (err) {
      console.error("Comic stream error:", err);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          message: "Comic generation failed",
        }),
      });
    }
  });
});
