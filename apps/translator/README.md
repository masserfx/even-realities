# G2 Assistant — AI Translator for Even Realities G2

Real-time speech translation, AI chat, teleprompter and comic generator for the Even Realities G2 smart glasses.

## Features

| Mode | Description |
|------|-------------|
| **Translate** | Speak → transcribe → translate, result shown on G2 display |
| **Chat** | Hands-free AI assistant (GPT-4.1), voice in / text out on glasses |
| **Captions** | Live captions without translation (same language subtitles) |
| **Comic** | Describe a scene → AI generates illustrated comic panels |
| **Prompter** | Teleprompter — paste text, scroll at adjustable WPM on glasses |

### Supported translation languages
Czech · English · German · French · Spanish · Japanese · Korean · Chinese

### AI models
- GPT-4.1 Nano (fastest, cheapest)
- GPT-4.1 Mini
- GPT-4.1 (most capable)
- Ollama (offline, local model)

---

## Requirements

- Even Realities G2 glasses
- [Even Hub app](https://www.evenrealities.com) on your phone
- Node.js 18+
- OpenAI API key — [get one here](https://platform.openai.com/api-keys)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/masserfx/even-realities.git
cd even-realities/apps/translator
```

### 2. Configure the backend

```bash
cd server
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=sk-...        # required
ANTHROPIC_API_KEY=sk-ant-... # optional (not used in current version)
PORT=3001
```

Install dependencies and start:

```bash
npm install
npm run dev
```

The backend runs at `http://localhost:3001`.

### 3. Start the frontend

In a new terminal:

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Connect G2 glasses

1. Open **Even Hub** on your phone
2. Make sure G2 is paired and connected
3. In Even Hub, go to **Apps** → scan QR code or enter the URL manually
4. The G2 display will show the assistant interface

---

## Usage

### Translate mode

1. Select source language (or leave **AUTO** for auto-detect)
2. Select target language (CS / EN / DE / FR / ES / JA / KO / ZH)
3. Choose **Push** or **Live** mode:
   - **Push** — tap the mic button, speak, release → translation appears on glasses
   - **Live** — continuous streaming transcription and translation
4. Press the microphone button and speak

### Chat mode

1. Switch to **Chat** tab
2. Press mic and ask anything — GPT-4.1 answers, displayed on glasses
3. Or type a question in the text input

### Comic mode

1. Switch to **Comic** tab
2. Select an art style from the grid
3. Describe a scene (voice or text) → AI generates a comic panel on the glasses

### Prompter mode

1. Switch to **Prompter** tab
2. Paste your speech text
3. Adjust reading speed (WPM)
4. Press **▶ Start** — text scrolls on the G2 display

### Settings

Tap **Settings** to access:
- **Model** — switch between GPT-4.1 versions or Ollama offline
- **Voice** — toggle text-to-speech readback of translations
- **Save** — auto-save all sessions to disk
- **Mic / Output** — select audio input/output device
- **History** — browse past sessions
- **Usage** — view API cost breakdown

---

## Running with Even Hub (production)

### Build the frontend

```bash
cd app
npm run build
```

### Pack for Even Hub

```bash
npx evenhub pack app.json dist/ -o translator.ehpk
```

Upload `translator.ehpk` at [hub.evenrealities.com](https://hub.evenrealities.com).

> **Note:** Update the `whitelist` in `app.json` with your production backend URL before packing.

### Backend deployment

The backend can be deployed to any Node.js host. Example with PM2:

```bash
cd server
npm install
npm run build
pm2 start dist/index.js --name g2-translator
```

---

## Architecture

```
app/          Vite + TypeScript frontend (Even Hub WebView)
  src/
    main.ts   All UI logic, SDK integration, mode switching
    style.css Dark monospace theme optimised for glasses overlay

server/       Hono + Node.js backend (port 3001)
  src/
    routes/
      transcribe.ts   Whisper STT (audio → text)
      translate.ts    GPT translation
      stream.ts       Live streaming transcription
      chat.ts         GPT-4.1 chat
      comic.ts        DALL-E comic generation
      tts.ts          OpenAI text-to-speech
      history.ts      Session storage
      usage.ts        Cost tracking
```

---

## Troubleshooting

**Glasses not updating**
- Make sure Even Hub is open and G2 is connected
- Check that the frontend URL is in `app.json` whitelist

**Mic not working**
- Allow microphone permission in the browser / Even Hub
- Select the correct input device in Settings → Mic

**Translation errors**
- Verify `OPENAI_API_KEY` in `.env` is valid and has credits
- Check backend logs: `npm run dev` output

**Ollama mode**
- Install [Ollama](https://ollama.ai) locally
- Pull a model: `ollama pull llama3`
- Backend connects to `http://localhost:11434` automatically
