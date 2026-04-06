import {
  waitForEvenAppBridge,
  OsEventTypeList,
  ImuReportPace,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import './style.css'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  geocodeSuggestions,
  fetchRoute,
  resolveCurrentStep,
  formatDistance,
  formatDuration,
  haversineDistance,
  type Route,
  type GeocodingResult,
  type Profile,
} from './navigation.ts'
import {
  displayNavStep,
  displayArrived,
  displayIdle,
  resetGlassesState,
  type GlassesNavPage,
} from './glasses.ts'
import { createSimulatedBridge } from './simulator.ts'

const BACKEND = (import.meta.env.VITE_BACKEND as string | undefined) ?? 'http://localhost:3002/api'

// Add ngrok bypass header when tunneling through ngrok
const BACKEND_HEADERS: Record<string, string> = BACKEND.includes('ngrok')
  ? { 'ngrok-skip-browser-warning': 'true' }
  : {}

function backendFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, headers: { ...BACKEND_HEADERS, ...(init?.headers as Record<string, string> ?? {}) } })
}

// ── State ─────────────────────────────────────────────────────────────

type AppState = 'IDLE' | 'NAVIGATING' | 'ARRIVED'

let state: AppState = 'IDLE'
let profile: Profile = 'walking'
let route: Route | null = null
let stepIndex = 0
let destination: [number, number] | null = null  // [lng, lat]
let bridge: EvenAppBridge | null = null
let simulatorBridge: EvenAppBridge | null = null  // always alive, mirrors real bridge
let watchId: number | null = null
let currentPosition: [number, number] | null = null  // [lng, lat]
let suggestionDebounce: ReturnType<typeof setTimeout> | null = null
let routeGeometry: [number, number][] = []
let mapFetchInProgress = false
let currentHeading = 0  // degrees, from IMU z-axis

// ── Leaflet map ───────────────────────────────────────────────────────

let leafletMap: L.Map | null = null
let positionMarker: L.CircleMarker | null = null
let routePolyline: L.Polyline | null = null
let destinationMarker: L.CircleMarker | null = null

function initMap(): void {
  if (leafletMap) return
  leafletMap = L.map('map', { zoomControl: true, attributionControl: false })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(leafletMap)
  // Default view — Prague; will recentre once we have GPS
  leafletMap.setView([50.0755, 14.4378], 13)
}

function updateMap(): void {
  if (!leafletMap || !currentPosition) return

  const [lng, lat] = currentPosition

  // Position marker
  if (!positionMarker) {
    positionMarker = L.circleMarker([lat, lng], {
      radius: 8, color: '#4af', fillColor: '#4af', fillOpacity: 1, weight: 2,
    }).addTo(leafletMap)
  } else {
    positionMarker.setLatLng([lat, lng])
  }

  // Route polyline — Leaflet uses [lat, lng]
  if (routeGeometry.length > 1) {
    const latlngs = routeGeometry.map(([lo, la]) => [la, lo] as [number, number])
    if (!routePolyline) {
      routePolyline = L.polyline(latlngs, { color: '#4af', weight: 4, opacity: 0.85 }).addTo(leafletMap)
    } else {
      routePolyline.setLatLngs(latlngs)
    }
  }

  // Destination marker
  if (destination) {
    const [dLng, dLat] = destination
    if (!destinationMarker) {
      destinationMarker = L.circleMarker([dLat, dLng], {
        radius: 10, color: '#f55', fillColor: '#f55', fillOpacity: 1, weight: 2,
      }).addTo(leafletMap)
    } else {
      destinationMarker.setLatLng([dLat, dLng])
    }
  }

  // Center on position, zoom 17
  leafletMap.setView([lat, lng], 17)
}

function clearMap(): void {
  positionMarker?.remove(); positionMarker = null
  routePolyline?.remove(); routePolyline = null
  destinationMarker?.remove(); destinationMarker = null
}

// ── DOM refs ──────────────────────────────────────────────────────────

const destinationInput = document.getElementById('destination-input') as HTMLInputElement
const suggestionsList = document.getElementById('suggestions') as HTMLUListElement
const searchOverlay = document.getElementById('search-overlay') as HTMLElement
const navCard = document.getElementById('nav-card') as HTMLElement
const arrivedPanel = document.getElementById('arrived-panel') as HTMLElement
const navArrow = document.getElementById('nav-arrow') as HTMLElement
const navInstruction = document.getElementById('nav-instruction') as HTMLElement
const navStreet = document.getElementById('nav-street') as HTMLElement
const navDistance = document.getElementById('nav-distance') as HTMLElement
const navEta = document.getElementById('nav-eta') as HTMLElement
const statusText = document.getElementById('status-text') as HTMLElement
const btnWalking = document.getElementById('btn-walking') as HTMLButtonElement
const btnCycling = document.getElementById('btn-cycling') as HTMLButtonElement
const gpsError = document.getElementById('gps-error') as HTMLElement
const gpsErrorMsg = document.getElementById('gps-error-msg') as HTMLElement
const manualLocation = document.getElementById('manual-location') as HTMLElement
const manualLat = document.getElementById('manual-lat') as HTMLInputElement
const manualLng = document.getElementById('manual-lng') as HTMLInputElement

// ── UI helpers ────────────────────────────────────────────────────────

function showPanel(panel: 'search' | 'nav' | 'arrived'): void {
  searchOverlay.classList.toggle('hidden', panel === 'arrived')
  navCard.classList.toggle('hidden', panel !== 'nav')
  arrivedPanel.classList.toggle('hidden', panel !== 'arrived')
  // Input read-only during navigation
  destinationInput.readOnly = panel === 'nav'
}

function setStatus(msg: string): void {
  statusText.textContent = msg
}

function clearSuggestions(): void {
  while (suggestionsList.firstChild) {
    suggestionsList.removeChild(suggestionsList.firstChild)
  }
  suggestionsList.classList.add('hidden')
}

function renderSuggestions(results: GeocodingResult[]): void {
  clearSuggestions()
  if (results.length === 0) return
  for (const r of results) {
    const li = document.createElement('li')
    li.textContent = r.placeName
    li.addEventListener('click', () => {
      destinationInput.value = r.placeName
      clearSuggestions()
      startNavigation(r.center)
    })
    suggestionsList.appendChild(li)
  }
  suggestionsList.classList.remove('hidden')
}

// ── Profile switcher ──────────────────────────────────────────────────

btnWalking.addEventListener('click', () => {
  profile = 'walking'
  btnWalking.classList.add('active')
  btnCycling.classList.remove('active')
})

btnCycling.addEventListener('click', () => {
  profile = 'cycling'
  btnCycling.classList.add('active')
  btnWalking.classList.remove('active')
})

// ── Geocoding autocomplete ────────────────────────────────────────────

destinationInput.addEventListener('input', () => {
  const q = destinationInput.value
  if (suggestionDebounce) clearTimeout(suggestionDebounce)
  if (q.trim().length < 2) { clearSuggestions(); return }
  suggestionDebounce = setTimeout(async () => {
    try {
      const results = await geocodeSuggestions(q)
      renderSuggestions(results)
    } catch {
      clearSuggestions()
    }
  }, 300)
})

document.getElementById('btn-search')!.addEventListener('click', () => {
  const first = suggestionsList.querySelector('li')
  if (first) {
    (first as HTMLElement).click()
    return
  }
  // No visible suggestions — geocode the current input text and navigate to first result
  const q = destinationInput.value.trim()
  if (!q) return
  setStatus('Hledám...')
  geocodeSuggestions(q).then((results) => {
    if (results.length === 0) { setStatus('Adresa nenalezena'); return }
    destinationInput.value = results[0].placeName
    startNavigation(results[0].center)
  }).catch(() => setStatus('Chyba geocodingu'))
})

destinationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btn-search')!.click()
  }
})

// ── Stop navigation ───────────────────────────────────────────────────

document.getElementById('btn-stop-nav')!.addEventListener('click', () => {
  stopNavigation()
})

function stopNavigation(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  state = 'IDLE'
  route = null
  stepIndex = 0
  destination = null
  routeGeometry = []
  lastMapImage = null
  destinationInput.value = ''
  clearMap()
  resetGlassesState()
  showPanel('search')
  setStatus('Připraven')
  if (bridge) void displayIdle(bridge, 'Zadej cíl v aplikaci')
  if (simulatorBridge && simulatorBridge !== bridge) void displayIdle(simulatorBridge, 'Zadej cíl v aplikaci')
}

// ── GPS & navigation loop ─────────────────────────────────────────────

function startGPS(): void {
  if (watchId !== null) return
  watchId = navigator.geolocation.watchPosition(
    onPosition,
    onWatchError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  )
}

function onPosition(pos: GeolocationPosition): void {
  const { longitude: lng, latitude: lat, accuracy } = pos.coords
  currentPosition = [lng, lat]
  if (accuracy <= 500) savePosition(lng, lat)
  updateMap()

  if (state !== 'NAVIGATING' || !route) return

  // Relaxed threshold — WebView GPS is often 60–100 m
  if (accuracy > 100) return

  if (destination) {
    const distToDest = haversineDistance([lng, lat], destination)
    if (distToDest < 15) {
      handleArrived()
      return
    }
  }

  stepIndex = resolveCurrentStep(route.steps, [lng, lat], stepIndex)
  updateNavDisplay()
}

// Watch error during active navigation — retry with low-accuracy fallback
function onWatchError(err: GeolocationPositionError): void {
  const PERMISSION_DENIED = 1
  if (err.code === PERMISSION_DENIED) {
    // Permanent denial — show full error UI
    onPositionError(err)
    return
  }
  // Timeout / unavailable — silently retry without high accuracy
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  watchId = navigator.geolocation.watchPosition(
    onPosition,
    onPositionError,
    { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 }
  )
}

function onPositionError(err: GeolocationPositionError): void {
  const denied = err.code === 1  // PERMISSION_DENIED
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  // During active navigation don't show the error panel — just update status
  if (state === 'NAVIGATING') {
    setStatus('GPS slabý signál')
    return
  }
  setStatus('GPS nedostupné')
  gpsError.classList.remove('hidden')
  manualLocation.classList.remove('hidden')

  if (denied) {
    if (isIOS) {
      gpsErrorMsg.innerHTML =
        'GPS zamítnuto.<br><b>iPhone:</b> Nastavení → Soukromí → Poloha → Safari → <b>Při používání</b>'
      const btn = document.getElementById('btn-open-settings') as HTMLButtonElement | null
      if (btn) btn.style.display = 'inline-block'
    } else {
      gpsErrorMsg.textContent = 'GPS zamítnuto. Povol polohu v nastavení prohlížeče, nebo zadej polohu ručně.'
    }
  } else {
    gpsErrorMsg.textContent = `GPS chyba: ${err.message}`
  }
}

document.getElementById('btn-retry-gps')!.addEventListener('click', () => {
  gpsError.classList.add('hidden')
  setStatus('Čekám na GPS...')
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentPosition = [pos.coords.longitude, pos.coords.latitude]
      savePosition(pos.coords.longitude, pos.coords.latitude)
      gpsError.classList.add('hidden')
      manualLocation.classList.add('hidden')
      setStatus('GPS OK')
      updateMap()
      startGPS()
    },
    onPositionError,
    { enableHighAccuracy: false, timeout: 15000 }
  )
})

document.getElementById('btn-set-location')!.addEventListener('click', () => {
  const lat = parseFloat(manualLat.value)
  const lng = parseFloat(manualLng.value)
  if (isNaN(lat) || isNaN(lng)) {
    gpsErrorMsg.textContent = 'Zadej platné souřadnice (např. 50.0755 / 14.4378)'
    return
  }
  currentPosition = [lng, lat]
  savePosition(lng, lat)
  gpsError.classList.add('hidden')
  manualLocation.classList.add('hidden')
  setStatus(`Poloha: ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
  updateMap()

  if (pendingDestination) {
    const dest = pendingDestination
    pendingDestination = null
    void startNavigation(dest)
  } else if (destinationInput.value.trim()) {
    // User had already selected a destination — retry search
    document.getElementById('btn-search')!.click()
  }
})

// ── Map image fetch ───────────────────────────────────────────────────

let lastMapImage: string | null = null  // cached last good image

async function fetchMapImage(): Promise<string | null> {
  if (!currentPosition || routeGeometry.length === 0) return lastMapImage
  if (mapFetchInProgress) return lastMapImage  // return cached instead of null

  mapFetchInProgress = true
  try {
    const [lng, lat] = currentPosition
    const res = await backendFetch(`${BACKEND}/map-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, routeGeometry, heading: currentHeading }),
    })
    if (!res.ok) return lastMapImage
    const data = await res.json() as { image: string }
    lastMapImage = data.image
    return lastMapImage
  } catch {
    return lastMapImage
  } finally {
    mapFetchInProgress = false
  }
}

// ── Turn arrow fetch (cached per type+modifier) ───────────────────────

const turnArrowCache = new Map<string, string>()

async function fetchTurnArrow(type: string, modifier: string): Promise<string | null> {
  const key = `${type}/${modifier}`
  if (turnArrowCache.has(key)) return turnArrowCache.get(key)!
  try {
    const res = await backendFetch(`${BACKEND}/turn-arrow?type=${encodeURIComponent(type)}&modifier=${encodeURIComponent(modifier)}`)
    if (!res.ok) return null
    const data = await res.json() as { image: string }
    turnArrowCache.set(key, data.image)
    return data.image
  } catch {
    return null
  }
}

// Throttle glasses updates: render at most every 4s unless step changed
let lastGlassesUpdate = 0
let lastRenderedStepIndex = -1

function updateNavDisplay(): void {
  if (!route) return
  const step = route.steps[stepIndex]
  if (!step) return

  const distToStep = currentPosition
    ? haversineDistance(currentPosition, step.location)
    : step.distance

  const remainingDuration = route.steps
    .slice(stepIndex)
    .reduce((acc, s) => acc + s.duration, 0)

  const arrow = getArrowForManeuver(step.maneuverType)
  navArrow.textContent = arrow
  navInstruction.textContent = step.instruction
  navStreet.textContent = step.streetName || ''
  navDistance.textContent = formatDistance(distToStep)
  navEta.textContent = formatDuration(remainingDuration)
  updateMap()

  if (!(bridge ?? simulatorBridge)) return

  const now = Date.now()
  const stepChanged = stepIndex !== lastRenderedStepIndex
  if (!stepChanged && now - lastGlassesUpdate < 4000) return  // throttle
  lastGlassesUpdate = now
  lastRenderedStepIndex = stepIndex

  const page: GlassesNavPage = {
    step,
    distanceToStep: distToStep,
    remainingDuration,
    totalDistance: route.totalDistance,
    profile,
  }

  const pushToGlasses = (mapImage: string | null, turnArrow: string | null) => {
    if (bridge) void displayNavStep(bridge, page, mapImage, turnArrow)
    if (simulatorBridge && simulatorBridge !== bridge) void displayNavStep(simulatorBridge, page, mapImage, turnArrow)
  }

  // If turn arrow already cached, skip the blank intermediate render
  const arrowKey = `${step.maneuverType}/${step.maneuverModifier}`
  const cachedArrow = turnArrowCache.get(arrowKey) ?? null
  if (cachedArrow && lastMapImage) {
    pushToGlasses(lastMapImage, cachedArrow)
  } else {
    pushToGlasses(null, null)
    void Promise.all([
      fetchMapImage(),
      fetchTurnArrow(step.maneuverType, step.maneuverModifier),
    ]).then(([mapImage, turnArrow]) => {
      if (mapImage ?? turnArrow) pushToGlasses(mapImage, turnArrow)
    })
  }
}

function getArrowForManeuver(type: string): string {
  const map: Record<string, string> = {
    'turn right': '→', 'turn sharp right': '↘', 'turn slight right': '↗',
    'turn left': '←', 'turn sharp left': '↙', 'turn slight left': '↖',
    'straight': '↑', 'continue': '↑', 'merge': '↑',
    'roundabout': '🔄', 'rotary': '🔄',
    'arrive': '🏁', 'depart': '↑',
  }
  return map[type.toLowerCase()] ?? '↑'
}

function handleArrived(): void {
  state = 'ARRIVED'
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  showPanel('arrived')
  setStatus('Jsi v cíli!')
  if (bridge) void displayArrived(bridge)
  if (simulatorBridge && simulatorBridge !== bridge) void displayArrived(simulatorBridge)
  setTimeout(() => stopNavigation(), 5000)
}

// ── Start navigation ──────────────────────────────────────────────────

// Stores destination while waiting for manual location
let pendingDestination: [number, number] | null = null

async function startNavigation(dest: [number, number]): Promise<void> {
  if (!currentPosition) {
    setStatus('Čekám na GPS...')
    pendingDestination = dest
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentPosition = [pos.coords.longitude, pos.coords.latitude]
        pendingDestination = null
        void startNavigation(dest)
      },
      (err) => {
        // Show manual location input and keep dest for after user sets position
        onPositionError(err)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
    return
  }

  setStatus('Počítám trasu...')
  destination = dest
  showPanel('nav')
  navInstruction.textContent = 'Počítám trasu...'
  navArrow.textContent = '↑'

  try {
    route = await fetchRoute(currentPosition, dest, profile)
    routeGeometry = route.routeGeometry
    stepIndex = 0
    state = 'NAVIGATING'
    updateNavDisplay()
    // Fetch map in background; when done push image to glasses
    void Promise.all([
      fetchMapImage(),
      fetchTurnArrow(route.steps[0].maneuverType, route.steps[0].maneuverModifier),
    ]).then(([img]) => {
      if (img && bridge && state === 'NAVIGATING') updateNavDisplay()
    })
    startGPS()
    setStatus('Navigace aktivní')
  } catch (err) {
    setStatus(`Chyba trasy: ${err instanceof Error ? err.message : String(err)}`)
    showPanel('search')
  }
}

// ── Even Hub SDK ──────────────────────────────────────────────────────

async function initGlasses(): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('no-bridge')), 3000)
  )
  try {
    const realBridge = await Promise.race([waitForEvenAppBridge(), timeout])
    bridge = realBridge  // replace simulator with real glasses (simulator stays as mirror)
    bridge.onEvenHubEvent((event: EvenHubEvent) => handleGlassesEvent(event))
    await bridge.imuControl(true, ImuReportPace.P500)
    void displayIdle(bridge, 'Zadej cíl v aplikaci')
    if (simulatorBridge) void displayIdle(simulatorBridge, 'Zadej cíl v aplikaci')
  } catch {
    console.info('No glasses detected — simulator active')
    // bridge is already set to simulator, keep it
  }
}

function handleGlassesEvent(event: EvenHubEvent): void {
  const sysEvent = event.sysEvent
  if (!sysEvent?.eventType && sysEvent?.eventType !== 0) return

  if (sysEvent.eventType === OsEventTypeList.IMU_DATA_REPORT && sysEvent.imuData) {
    // z = yaw = heading in degrees
    currentHeading = sysEvent.imuData.z ?? 0
    return
  }

  if (sysEvent.eventType === OsEventTypeList.CLICK_EVENT && state === 'NAVIGATING' && bridge) {
    updateNavDisplay()
  }
}

// ── Location persistence ──────────────────────────────────────────────

function savePosition(lng: number, lat: number): void {
  localStorage.setItem('nav-last-pos', JSON.stringify([lng, lat]))
}

function loadSavedPosition(): [number, number] | null {
  try {
    const raw = localStorage.getItem('nav-last-pos')
    if (!raw) return null
    const pos = JSON.parse(raw) as [number, number]
    return Array.isArray(pos) && pos.length === 2 ? pos : null
  } catch { return null }
}

async function getLocationByIP(): Promise<[number, number] | null> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) })
    const d = await res.json() as { longitude?: number; latitude?: number }
    if (typeof d.longitude === 'number' && typeof d.latitude === 'number') {
      return [d.longitude, d.latitude]
    }
  } catch { /* ignore */ }
  return null
}

// ── Boot ──────────────────────────────────────────────────────────────

showPanel('search')
setStatus('Připraven')
initMap()

// Simulator always starts immediately — real bridge layered on top if glasses connect
simulatorBridge = createSimulatedBridge()
bridge = simulatorBridge
void displayIdle(bridge, 'Zadej cíl v aplikaci')
void initGlasses()

// Pre-fill manual location form + set currentPosition immediately from saved data
const savedPos = loadSavedPosition()
if (savedPos) {
  currentPosition = savedPos
  manualLat.value = savedPos[1].toFixed(6)
  manualLng.value = savedPos[0].toFixed(6)
  setStatus(`Poloha: uložená`)
  updateMap()
}

// Start IP geolocation immediately in parallel (don't wait for GPS to fail)
if (!savedPos) {
  setStatus('Zjišťuji polohu...')
  void getLocationByIP().then((ipPos) => {
    if (ipPos && !currentPosition) {
      currentPosition = ipPos
      manualLat.value = ipPos[1].toFixed(6)
      manualLng.value = ipPos[0].toFixed(6)
      setStatus('Poloha z IP (přibližná)')
      updateMap()
    }
  })
}

// Try GPS immediately with high accuracy — overwrites IP/saved position
// Only save to localStorage when accuracy is decent (≤500m avoids bad network fixes)
navigator.geolocation.getCurrentPosition(
  (pos) => {
    const { longitude: lng, latitude: lat, accuracy } = pos.coords
    currentPosition = [lng, lat]
    if (accuracy <= 500) savePosition(lng, lat)
    setStatus(accuracy <= 50 ? 'GPS OK' : `GPS (${Math.round(accuracy)} m)`)
    updateMap()
    if (pendingDestination) {
      const dest = pendingDestination
      pendingDestination = null
      void startNavigation(dest)
    }
  },
  () => { /* silent — already have savedPos or IP fallback */ },
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
)
