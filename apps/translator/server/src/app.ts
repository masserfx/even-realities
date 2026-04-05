import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { transcribeRoute } from "./routes/transcribe.js";
import { translateRoute } from "./routes/translate.js";
import { streamRoute } from "./routes/stream.js";
import { chatRoute } from "./routes/chat.js";
import { engineRoute } from "./routes/engine.js";
import { comicRoute } from "./routes/comic.js";
import { ttsRoute } from "./routes/tts.js";
import { historyRoute } from "./routes/history.js";
import { imageTestRoute } from "./routes/image-test.js";
import { usageRoute } from "./routes/usage.js";

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.route("/api", transcribeRoute);
app.route("/api", translateRoute);
app.route("/api", streamRoute);
app.route("/api", chatRoute);
app.route("/api", engineRoute);
app.route("/api", comicRoute);
app.route("/api", ttsRoute);
app.route("/api", historyRoute);
app.route("/api", imageTestRoute);
app.route("/api", usageRoute);

// Serve static files (image-test.html etc.)
app.use("/public/*", serveStatic({ root: "./" }));
