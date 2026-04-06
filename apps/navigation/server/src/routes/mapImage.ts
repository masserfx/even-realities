import { Hono } from "hono";
import { generateMapImage } from "../lib/mapImage.js";

interface MapImageRequest {
  lat: number;
  lng: number;
  routeGeometry: [number, number][];
  heading?: number;
}

export const mapImageRoute = new Hono();

mapImageRoute.post("/map-image", async (c) => {
  const body = (await c.req.json()) as MapImageRequest;
  const { lat, lng, routeGeometry, heading = 0 } = body;

  if (!lat || !lng || !Array.isArray(routeGeometry)) {
    return c.json({ error: "lat, lng and routeGeometry required" }, 400);
  }

  const base64 = await generateMapImage(lat, lng, routeGeometry, heading);
  return c.json({ image: base64 });
});
