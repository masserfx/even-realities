import { Hono } from "hono";

// Photon (komoot.io) — free OpenStreetMap geocoding, no API key needed
const PHOTON_BASE = "https://photon.komoot.io/api";

interface PhotonFeature {
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface GeocodingResult {
  placeName: string;
  center: [number, number]; // [lng, lat]
}

function buildPlaceName(p: PhotonFeature["properties"]): string {
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  else if (p.street) {
    parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
  }
  if (p.city && p.city !== p.name) parts.push(p.city);
  if (p.country) parts.push(p.country);
  return parts.join(", ") || "Neznámé místo";
}

export const geocodeRoute = new Hono();

geocodeRoute.get("/geocode", async (c) => {
  const q = c.req.query("q");
  if (!q || q.trim().length < 2) {
    return c.json({ results: [] });
  }

  const url = `${PHOTON_BASE}?q=${encodeURIComponent(q)}&limit=5&lang=en`;

  const res = await fetch(url, {
    headers: { "User-Agent": "EvenRealitiesNavigation/0.1" },
  });

  if (!res.ok) {
    return c.json({ error: "Geocoding error" }, 502);
  }

  const data = (await res.json()) as PhotonResponse;

  const results: GeocodingResult[] = data.features.map((f) => ({
    placeName: buildPlaceName(f.properties),
    center: f.geometry.coordinates,
  }));

  return c.json({ results });
});
