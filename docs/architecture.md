# Architecture — Even Realities Platform

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                    G2 Smart Glasses                   │
│  Display: 576x288 mono green │ Mic: 4x │ BLE + WiFi │
└──────────────────────┬──────────────────────────────┘
                       │ Even Hub SDK (BLE/WebSocket)
┌──────────────────────┴──────────────────────────────┐
│                   Mobile App / Browser                │
│  Even Hub │ Custom Web App │ PWA                      │
└──────────────────────┬──────────────────────────────┘
                       │ REST API / SSE / WebSocket
┌──────────────────────┴──────────────────────────────┐
│                    Backend Server                      │
│  Hono (Node.js) │ TypeScript │ Port 3001              │
├───────────────────────────────────────────────────────┤
│  Routes:                                              │
│  /api/translate   — Whisper STT + GPT translation     │
│  /api/stream      — SSE streaming translation         │
│  /api/chat        — AI conversation                   │
│  /api/comic       — Comic generation (DALL-E + GPT)   │
│  /api/tts         — Text-to-speech (OpenAI)           │
│  /api/history     — Session history                   │
│  /api/engine      — AI model selection                │
│  /api/image-test  — Image style comparison            │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                  External Services                    │
│  OpenAI (GPT-4.1, Whisper, DALL-E, TTS)              │
│  Ollama (offline fallback)                            │
└───────────────────────────────────────────────────────┘
```

## Glasses Display Pipeline

```
Image generation (DALL-E)
  → sharp: resize to 288x144
  → sharp: greyscale
  → Binary threshold (v >= 128 ? 255 : 0)
  → UPNG: encode as 2-bit indexed PNG
  → Even Hub SDK: ImageRawDataUpdate
```

Key constraint: Image container dimensions MUST exactly match image data (288x144).

## AI Pipeline

```
Audio (PCM/WebM) → Whisper STT → text
  → GPT-4.1 translation (with 5-entry context window)
  → Display on glasses + browser
  → Optional: OpenAI TTS for audio output
```

## Data Flow

- **Context window**: Last 5 translation pairs kept in memory for coherence
- **History**: Saved to `server/data/history/YYYY-MM-DD/HH-MM-SS-type/`
- **Comic previews**: Cached in `server/data/comic-previews/`
- **No database**: File-based storage, suitable for single-user/dev use
