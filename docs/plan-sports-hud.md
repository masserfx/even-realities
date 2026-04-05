# Plan: Sports HUD App — Fitness metriky pro G2 Smart Glasses

> Status: PLANNED | Priorita: #6 z app-ideas.md | Složitost: 3/5

## Přehled

Sportovní HUD zobrazující fitness metriky (tepová frekvence, tempo, vzdálenost, čas) přímo v zorném poli během běhu nebo cyklistiky. Připojení přes Web Bluetooth GATT pro HR pás nebo čte z telefonních senzorů.

---

## Architektura

```
BLE HR pás ──► Web Bluetooth API ──►
                                    ├──► Sports HUD logic ──► G2 brýle
Phone GPS ───► Geolocation API ────►│   (pace, distance)
                                    │
Phone accel. ► DeviceMotion API ───►│   (kroky - fallback)
```

**Rozhodnutí: pure frontend PWA — žádný backend**
- Všechny senzory jsou browser APIs
- Žádné API klíče k skrytí
- Data zůstávají lokálně (privacy-first)
- Jednodušší deployment — statický hosting nebo lokálně

---

## Tech Stack

| Vrstva | Technologie | Důvod |
|--------|-------------|-------|
| HR senzor | **Web Bluetooth GATT** (Heart Rate Service 0x180D) | Standardní BT LE protokol, Garmin/Polar/Wahoo kompatibilní |
| GPS/pace | Browser Geolocation API | Přesnost 3-5m, pace z rychlosti pohybu |
| Kroky (fallback) | DeviceMotion API (accelerometer) | Kdy GPS není dostupné |
| Frontend | Vite + TypeScript | Stejný stack jako translator |
| Backend | **Žádný** | Pure PWA |
| Glasses | Even Hub SDK | Text containers pro metriky |
| Persistenece | localStorage | Workout history lokálně |

---

## Struktura souborů

```
apps/sports-hud/
├── app.json              # Even Hub manifest
├── index.html            # Workout setup + live metrics
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts           # App entry + Even Hub bridge
    ├── sensors/
    │   ├── heart-rate.ts # Web Bluetooth HR GATT
    │   ├── gps.ts        # Geolocation → pace, distance
    │   └── motion.ts     # DeviceMotion → step count
    ├── display/
    │   ├── glasses.ts    # Glasses layout formatting
    │   └── screens.ts    # Multiple metric screens
    ├── workout.ts        # Workout session state, history
    └── style.css
```

---

## Glasses Display — 3 obrazovky, R1 přepíná

### Obrazovka 1 — Hlavní (výchozí)
```
┌─────────────────────────────┐
│  ❤  142 bpm    ZONE 3       │  ← HR + zóna
│                             │
│  5:24 /km    3.2 km         │  ← tempo + vzdálenost
│                             │
│  0:18:32    230 kcal        │  ← čas + kalorie (footer)
└─────────────────────────────┘
```

### Obrazovka 2 — Pokrok
```
┌─────────────────────────────┐
│  Lap 3 / goal: 5km          │
│                             │
│  ████████████░░░░░  64%     │  ← progress bar
│                             │
│  Avg: 5:31/km  Best: 5:10   │
└─────────────────────────────┘
```

### Obrazovka 3 — HR zóny
```
┌─────────────────────────────┐
│  Z5 ████░░░░░░░░░░  20%+   │
│  Z4 ████████░░░░░░  60%    │  ← čas v zónách
│  Z3 ████░░░░░░░░░░  20%    │
│                             │
│  Max HR: 178    Avg: 142    │
└─────────────────────────────┘
```

---

## Web Bluetooth GATT — Heart Rate Service

```typescript
// Standard BT LE Heart Rate Service
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb'
const HEART_RATE_CHARACTERISTIC = '00002a37-0000-1000-8000-00805f9b34fb'

async function connectHR(): Promise<void> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [HEART_RATE_SERVICE] }]
  })
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(HEART_RATE_SERVICE)
  const char = await service.getCharacteristic(HEART_RATE_CHARACTERISTIC)
  await char.startNotifications()
  char.addEventListener('characteristicvaluechanged', (e) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value!
    const hr = parseHeartRateData(value)  // flags byte + HR value
    updateHeartRate(hr)
  })
}
```

**Kompatibilní zařízení**: Garmin HRM-Pro, Polar H10, Wahoo TICKR, Suunto Smart Belt — všechna používají standardní GATT Heart Rate Service.

---

## GPS Pace Calculation

```typescript
// pace z Geolocation speed (m/s → min/km)
function speedToPace(speedMs: number): string {
  if (speedMs < 0.5) return '--:--'  // stojíme
  const secPerKm = 1000 / speedMs
  const min = Math.floor(secPerKm / 60)
  const sec = Math.round(secPerKm % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

// Haversine formula pro vzdálenost
function distanceBetween(a: GeolocationCoordinates, b: GeolocationCoordinates): number {
  const R = 6371000  // Earth radius in meters
  // ... haversine calculation
}
```

---

## HR Zóny (Karvonen metoda)

```typescript
// Zóny 1-5 dle max HR (nastavitelné uživatelem)
function getZone(hr: number, maxHr: number): 1 | 2 | 3 | 4 | 5 {
  const pct = hr / maxHr
  if (pct < 0.60) return 1  // Recovery
  if (pct < 0.70) return 2  // Aerobic base
  if (pct < 0.80) return 3  // Aerobic
  if (pct < 0.90) return 4  // Threshold
  return 5                   // VO2 max
}
```

---

## R1 Gesta

| Gesto | Akce |
|-------|------|
| Click | Pause/Resume workout |
| Scroll up | Předchozí obrazovka |
| Scroll down | Další obrazovka |
| Double click | Lap marker (zaznamená split) |

---

## Implementační fáze

### Phase 1 — MVP
1. Workout session start/stop
2. GPS tracking → pace + vzdálenost
3. Stopky + kalkulace kalorií (odhad z tempa + váha)
4. Glasses display s jednou obrazovkou (HR mock nebo "--")
5. Workout summary po skončení

### Phase 2 — BT HR senzor
1. Web Bluetooth GATT připojení
2. HR monitoring + zóny
3. Tři obrazovky na glasses (R1 přepíná)
4. Lap markery (double-click)

### Phase 3 — Export
1. Strava API upload (GPX formát)
2. Workout history v localStorage s grafy
3. Nastavení: max HR, hmotnost, cíle

---

## Klíčové technické výzvy

| Výzva | Řešení |
|-------|--------|
| GPS accuracy pro pace | Smoothing přes klouzavý průměr 5s, min speed threshold |
| BT připojení v Safari/iOS | Web Bluetooth není v Safari — PWA jen Chrome/Edge |
| Glasses update frekvence | Throttle na 1s (ne každou BT notifikaci) |
| Battery při GPS tracking | `enableHighAccuracy: false` + wake lock API |
| Kalorie bez HR | METs tabulka (běh ~8 METs, cyklo ~6 METs) × váha × čas |

---

## Odhadované náklady

- Žádné API náklady (pure browser APIs)
- Strava API: free tier dostačující pro upload

---

## Browser Kompatibilita

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| Web Bluetooth | ✅ | ❌ | ❌ |
| Geolocation | ✅ | ✅ | ✅ |
| DeviceMotion | ✅ | ✅ | ✅* |
| Wake Lock API | ✅ | ✅ | ✅ |

*Safari vyžaduje user gesture pro DeviceMotion
→ Doporučit Chrome pro BT HR funkce, ostatní v libovolném prohlížeči
