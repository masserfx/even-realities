// navigation.ts — Route calculation and step tracking

export type Profile = 'walking' | 'cycling'

export interface RouteStep {
  instruction: string
  distance: number    // metres
  duration: number    // seconds
  maneuverType: string
  maneuverModifier: string  // "left"|"right"|"slight left"|"straight"|etc.
  streetName: string
  location: [number, number]  // [lng, lat] of the waypoint
}

export interface Route {
  steps: RouteStep[]
  totalDistance: number  // metres
  totalDuration: number  // seconds
  routeGeometry: [number, number][]  // [lng, lat] pairs
}

export interface GeocodingResult {
  placeName: string
  center: [number, number]  // [lng, lat]
}

const BACKEND = 'http://localhost:3002/api'

// ── Geocoding ────────────────────────────────────────────────────────

export async function geocodeSuggestions(query: string): Promise<GeocodingResult[]> {
  if (query.trim().length < 2) return []
  const res = await fetch(`${BACKEND}/geocode?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Geocoding failed')
  const data = await res.json() as { results: GeocodingResult[] }
  return data.results
}

// ── Directions ───────────────────────────────────────────────────────

export async function fetchRoute(
  origin: [number, number],
  destination: [number, number],
  profile: Profile
): Promise<Route> {
  const params = new URLSearchParams({
    origin: `${origin[1]},${origin[0]}`,       // lat,lng
    destination: `${destination[1]},${destination[0]}`,
    profile,
  })
  const res = await fetch(`${BACKEND}/directions?${params}`)
  if (!res.ok) throw new Error('Directions request failed')
  return res.json() as Promise<Route>
}

// ── Step tracking ────────────────────────────────────────────────────

/**
 * Returns distance in metres between two [lng, lat] points.
 * Uses Haversine formula.
 */
export function haversineDistance(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Returns the index of the step we should currently display.
 * Advances to next step once within the advance threshold.
 */
export function resolveCurrentStep(
  steps: RouteStep[],
  position: [number, number],   // [lng, lat]
  currentIndex: number
): number {
  for (let i = currentIndex; i < steps.length - 1; i++) {
    const dist = haversineDistance(position, steps[i].location)
    const threshold = Math.min(steps[i].distance * 0.3, 30)
    if (dist < threshold) {
      // advance to next step
      return i + 1
    }
    // not yet at this waypoint — stay
    return i
  }
  return steps.length - 1
}

// ── Formatting helpers ────────────────────────────────────────────────

export function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`
  return `${Math.round(metres)} m`
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h} h ${m} min`
}
