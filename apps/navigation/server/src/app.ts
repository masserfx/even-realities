import { Hono } from "hono";
import { cors } from "hono/cors";
import { directionsRoute } from "./routes/directions.js";
import { geocodeRoute } from "./routes/geocode.js";
import { mapImageRoute } from "./routes/mapImage.js";
import { turnArrowRoute } from "./routes/turnArrow.js";

export const app = new Hono();

// Even Hub WebView may send requests with null/custom origin — allow all localhost origins
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.route("/api", directionsRoute);
app.route("/api", geocodeRoute);
app.route("/api", mapImageRoute);
app.route("/api", turnArrowRoute);
