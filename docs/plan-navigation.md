# Plan: Navigation App — Turn-by-turn pro G2 Smart Glasses

> Status: PLANNED | Priorita: #2 z app-ideas.md | Složitost: 4/5

## Přehled

Pěší / cyklistická navigace s šipkami a vzdáleností přímo v zorném poli. Uživatel zadá cíl na telefonu, brýle zobrazují instrukce. Oči zůstávají na cestě.

---

## Architektura

```
Browser (PWA) ─── Geolocation API ──► GPS pozice (každé 3s)
     │                                       │
     │            Mapbox Directions API       │
     ├──────────► (backend proxy) ───────────►│ Výpočet trasy
     │                                       │
     │            Even Hub SDK               ▼
     └──────────► G2 brýle ◄──── instrukce + šipka + vzdálenost
```

**Rozhodnutí: frontend + lehký backend**
- Backend nutný pro skrytí Mapbox API klíče
- Backend port: 3002 (oddělený od translatoru na 3001)
- Frontend: Vite PWA v `apps/navigation/app/`
- Backend: Hono v `apps/navigation/server/`

---

## Tech Stack

| Vrstva | Technologie | Důvod |
|--------|-------------|-------|
| Routing API | **Mapbox Directions API** | Free tier 100k req/měsíc, pedestrian + cycling profily |
| Geocoding | Mapbox Geocoding API | Autocomplete adres |
| GPS | Browser Geolocation API (`watchPosition`) | Přesnost 5-10m, dostatečná |
| Frontend | Vite + TypeScript | Stejný stack jako translator |
| Backend | Hono (Node.js) | Proxy pro Mapbox API klíč |
| Glasses | Even Hub SDK | Text containers pro šipky + info |

---

## Struktura souborů

```
apps/navigation/
├── app/                     # Frontend Even Hub app
│   ├── app.json             # Even Hub manifest
│   ├── index.html           # Destination input + map preview
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts          # Hlavní logika
│       ├── navigation.ts    # Route calculation, step parsing
│       ├── glasses.ts       # Glasses display formatting
│       └── style.css
└── server/                  # Backend (API proxy)
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts
        └── routes/
            └── directions.ts  # Mapbox proxy endpoint
```

---

## Glasses Display Layout

```
┌─────────────────────────────┐
│                             │
│         ➡  TURN RIGHT       │  ← šipka + instrukce (velký font)
│       Na ulici Wenceslas    │
│                             │
│    za 120 m  •  8 min       │  ← vzdálenost + čas (footer)
└─────────────────────────────┘
```

**Šipky** (Unicode, dobře čitelné na mono displeji):
- ↑ Rovně, ↗ Mírně vpravo, → Vpravo, ↘ Ostrá vpravo
- ↖ Mírně vlevo, ← Vlevo, ↙ Ostrá vlevo
- 🔄 Otočit, 🏁 Cíl

---

## Implementační fáze

### Phase 1 — MVP (pěší navigace)
1. Destination input s Mapbox geocoding autocomplete
2. `watchPosition()` — GPS track každé 3s
3. Mapbox Directions (walking profile) → array kroků
4. Detekce aktuálního kroku (vzdálenost k next waypoint < threshold)
5. Glasses display: šipka + název ulice + vzdálenost
6. R1: click = zopakovat instrukci, scroll up/down = přiblíž/oddal (future)

### Phase 2 — Enhancements
- Cycling profile (Mapbox)
- Offline tiles (cache posledních tras)
- Re-routing při odbočení z trasy
- ETA na cíl v reálném čase
- Sdílení polohy (live location link)

---

## Klíčové technické výzvy

| Výzva | Řešení |
|-------|--------|
| GPS přesnost v budovách | Threshold 15m místo 5m, nenavigovat pod 50% accuracy |
| Hranice kroků (kdy přepnout) | Vzdálenost k next waypoint < `min(step_distance * 0.3, 30m)` |
| Battery drain z watchPosition | `maximumAge: 3000`, `enableHighAccuracy: false` po dosažení trasy |
| Mapbox API klíč bezpečnost | Backend proxy — klíč nikdy v JS bundlu |
| Offline fallback | Cache trasy v localStorage, varovat bez GPS |

---

## Mapbox API volání (backend proxy)

```
GET /api/directions?origin=50.087,14.421&destination=50.075,14.437&profile=walking
→ Mapbox Directions API v5
→ Vrátí: steps[] s maneuver.instruction, distance, duration, location
```

---

## Odhadované náklady

- Mapbox free tier: 100 000 req/měsíc → při 10 navigacích/den = 300 req/měsíc ✅
- Geocoding: 50 000 free req/měsíc ✅
- Prakticky zdarma pro osobní použití

---

## Závislosti (nové)

```json
// server
"@mapbox/mapbox-sdk": "^0.16"

// app — žádné nové (pure TS + browser APIs)
```
