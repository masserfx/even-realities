import { Hono } from "hono";

// OSRM public demo server — free, no API key, OpenStreetMap data
const OSRM_BASE = "https://router.project-osrm.org/route/v1";

interface OsrmStep {
  maneuver: {
    instruction?: string;
    type: string;
    modifier?: string;
    location: [number, number];
  };
  distance: number;
  duration: number;
  name: string;
}

interface OsrmLeg {
  steps: OsrmStep[];
  distance: number;
  duration: number;
}

interface OsrmRoute {
  legs: OsrmLeg[];
  distance: number;
  duration: number;
  geometry: { type: string; coordinates: [number, number][] };
}

interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
  message?: string;
}

interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuverType: string;
  maneuverModifier: string;
  streetName: string;
  location: [number, number];
}

interface RouteResponse {
  steps: RouteStep[];
  totalDistance: number;
  totalDuration: number;
  routeGeometry: [number, number][];
}

// Simple instruction generator from OSRM maneuver type + street name
function buildInstruction(type: string, streetName: string): string {
  const street = streetName ? ` na ${streetName}` : "";
  switch (type) {
    case "turn": return `Odbočte${street}`;
    case "new name": return `Pokračujte${street}`;
    case "depart": return `Vydejte se${street}`;
    case "arrive": return "Jste v cíli";
    case "merge": return `Sjeďte${street}`;
    case "on ramp": return `Najeďte na rampu${street}`;
    case "off ramp": return `Sjeďte z rampy${street}`;
    case "fork": return `Na křižovatce${street}`;
    case "end of road": return `Na konci silnice${street}`;
    case "continue": return `Pokračujte rovně${street}`;
    case "roundabout": return `Do kruhového objezdu${street}`;
    case "rotary": return `Do okružní křižovatky${street}`;
    case "roundabout turn": return `Z kruhového objezdu${street}`;
    case "notification": return `Pokračujte${street}`;
    default: return `Pokračujte${street}`;
  }
}

export const directionsRoute = new Hono();

directionsRoute.get("/directions", async (c) => {
  const origin = c.req.query("origin");       // "lat,lng"
  const destination = c.req.query("destination"); // "lat,lng"
  const profile = c.req.query("profile") ?? "walking";

  if (!origin || !destination) {
    return c.json({ error: "origin and destination are required" }, 400);
  }

  const allowedProfiles = new Set(["walking", "cycling"]);
  if (!allowedProfiles.has(profile)) {
    return c.json({ error: "Invalid profile" }, 400);
  }

  const osrmProfile = profile === "cycling" ? "bike" : "foot";

  const [originLat, originLng] = origin.split(",").map(Number);
  const [destLat, destLng] = destination.split(",").map(Number);

  if (isNaN(originLat) || isNaN(originLng) || isNaN(destLat) || isNaN(destLng)) {
    return c.json({ error: "Invalid coordinates" }, 400);
  }

  // OSRM expects lng,lat order
  const url =
    `${OSRM_BASE}/${osrmProfile}/${originLng},${originLat};${destLng},${destLat}` +
    `?steps=true&geometries=geojson&overview=full`;

  const res = await fetch(url, {
    headers: { "User-Agent": "EvenRealitiesNavigation/0.1" },
  });

  if (!res.ok) {
    return c.json({ error: "OSRM API error", status: res.status }, 502);
  }

  const data = (await res.json()) as OsrmResponse;

  if (data.code !== "Ok" || !data.routes.length) {
    return c.json({ error: data.message ?? "No route found" }, 404);
  }

  const leg = data.routes[0].legs[0];

  const steps: RouteStep[] = leg.steps.map((s) => ({
    instruction: s.maneuver.instruction ?? buildInstruction(s.maneuver.type, s.name),
    distance: s.distance,
    duration: s.duration,
    maneuverType: s.maneuver.type,
    maneuverModifier: s.maneuver.modifier ?? "straight",
    streetName: s.name,
    location: s.maneuver.location,
  }));

  const response: RouteResponse = {
    steps,
    totalDistance: data.routes[0].distance,
    totalDuration: data.routes[0].duration,
    routeGeometry: data.routes[0].geometry.coordinates,
  };

  return c.json(response);
});
