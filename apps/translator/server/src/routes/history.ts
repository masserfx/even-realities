import { Hono } from "hono";
import { mkdir, writeFile, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { processForGlasses } from "../lib/comic-image.js";

const DATA_DIR = join(import.meta.dirname, "../../data/history");

export const historyRoute = new Hono();

interface HistoryEntry {
  timestamp: string;
  mode: "translate" | "chat" | "comic";
  input: string;
  output: string;
  from?: string;
  to?: string;
  images?: string[]; // base64 PNG for comic
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

historyRoute.post("/history", async (c) => {
  const entry = await c.req.json<HistoryEntry>();
  if (!entry.mode || !entry.output) {
    return c.json({ error: "Missing mode or output" }, 400);
  }

  const now = new Date();
  const dateDir = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const dir = join(DATA_DIR, dateDir);
  await ensureDir(dir);

  const ts = now.toISOString().replace(/[:.]/g, "-");
  const filename = `${ts}_${entry.mode}.json`;

  // Don't store large base64 images inline — save separately
  const images = entry.images;
  const saved: HistoryEntry & { imageFiles?: string[] } = { ...entry };
  delete saved.images;

  if (images && images.length > 0) {
    const imgDir = join(dir, `${ts}_images`);
    await ensureDir(imgDir);
    saved.imageFiles = [];
    for (let i = 0; i < images.length; i++) {
      const imgFile = `scene_${i + 1}.png`;
      await writeFile(join(imgDir, imgFile), Buffer.from(images[i], "base64"));
      saved.imageFiles.push(imgFile);
    }
  }

  await writeFile(join(dir, filename), JSON.stringify(saved, null, 2));

  return c.json({ saved: filename });
});

historyRoute.get("/history", async (c) => {
  const modeFilter = c.req.query("mode"); // translate | chat | comic
  const langFilter = c.req.query("lang"); // e.g. "cs", "ja" — matches from or to

  try {
    const dates = await readdir(DATA_DIR);
    const items: {
      date: string;
      file: string;
      timestamp: string;
      mode: string;
      input: string;
      output: string;
      from?: string;
      to?: string;
      imageFiles?: string[];
    }[] = [];

    for (const date of dates.sort().reverse().slice(0, 30)) {
      const dir = join(DATA_DIR, date);
      const dirStat = await stat(dir).catch(() => null);
      if (!dirStat?.isDirectory()) continue;

      const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));

      for (const file of files.sort().reverse()) {
        // Quick mode filter from filename (e.g. "..._translate.json")
        if (modeFilter) {
          const fileSuffix = file.replace(/^.*_/, "").replace(".json", "");
          if (fileSuffix !== modeFilter) continue;
        }

        const content = JSON.parse(
          await readFile(join(dir, file), "utf-8")
        );

        // Language filter
        if (langFilter) {
          const matchFrom = content.from === langFilter;
          const matchTo = content.to === langFilter;
          if (!matchFrom && !matchTo) continue;
        }

        items.push({
          date,
          file,
          timestamp: content.timestamp ?? "",
          mode: content.mode ?? "",
          input: content.input ?? "",
          output: (content.output ?? "").slice(0, 200),
          from: content.from,
          to: content.to,
          imageFiles: content.imageFiles,
        });
      }
    }

    return c.json({ items });
  } catch {
    return c.json({ items: [] });
  }
});

historyRoute.get("/history/:date/:file", async (c) => {
  const { date, file } = c.req.param();
  try {
    const content = await readFile(join(DATA_DIR, date, file), "utf-8");
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

// Serve comic images
historyRoute.get("/history/:date/:dir/:img", async (c) => {
  const { date, dir, img } = c.req.param();
  try {
    const filePath = join(DATA_DIR, date, dir, img);
    const buffer = await readFile(filePath);
    return c.body(new Uint8Array(buffer) as any, 200, { "Content-Type": "image/png" });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

// Convert comic image to glasses format (288×144, 2-bit indexed PNG)
historyRoute.get("/history/:date/:dir/:img/glasses", async (c) => {
  const { date, dir, img } = c.req.param();
  try {
    const filePath = join(DATA_DIR, date, dir, img);
    const buffer = await readFile(filePath);
    const glassesBase64 = await processForGlasses(buffer);
    return c.json({ glassesImage: glassesBase64 });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});
