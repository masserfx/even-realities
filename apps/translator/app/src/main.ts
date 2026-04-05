import {
  waitForEvenAppBridge,
  evenHubEventFromJson,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  OsEventTypeList,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import './style.css'

// ── Types ───────────────────────────────────────────────────────────

type AppState = 'IDLE' | 'LISTENING' | 'TRANSLATING' | 'RESULT'
type AppMode = 'TRANSLATE' | 'CHAT' | 'COMIC'

interface Language {
  code: string
  label: string
}

interface ComicScene {
  narration: string
  glassesImage?: string // base64 PNG for glasses
  webImage?: string     // base64 PNG for browser
}

// ── Constants ───────────────────────────────────────────────────────

const TARGET_LANGUAGES: Language[] = [
  { code: 'cs', label: 'CS' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'es', label: 'ES' },
  { code: 'ja', label: 'JA' },
  { code: 'ko', label: 'KO' },
  { code: 'zh', label: 'ZH' },
]

const SOURCE_LANGUAGES: Language[] = [
  { code: 'auto', label: 'AUTO' },
  { code: 'cs', label: 'CS' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'es', label: 'ES' },
  { code: 'ja', label: 'JA' },
  { code: 'ko', label: 'KO' },
  { code: 'zh', label: 'ZH' },
]

const BACKEND = 'http://localhost:3001/api'
const RESULT_TIMEOUT_MS = 8000

// ── State ───────────────────────────────────────────────────────────

let mode: AppMode = 'TRANSLATE'
let state: AppState = 'IDLE'
let sourceIndex = 0
let targetIndex = 0
let audioChunks: Uint8Array[] = []
let bridge: EvenAppBridge | null = null
let isFirstDisplay = true
let resultTimer: ReturnType<typeof setTimeout> | null = null
let lastOriginalText = ''
let lastTranslatedText = ''
let glassesUpdatePending = false
let lastGlassesUpdate = 0
let glassesPage = -1 // -1 = auto (show latest), 0+ = manual page index
const GLASSES_UPDATE_INTERVAL = 350 // ms between glasses updates during streaming

// Comic state
let comicTitle = ''
let comicScenes: ComicScene[] = []
let comicIndex = 0           // current scene
let comicShowingImage = false // false = narration text, true = illustration
let comicPaused = false       // pause comic playback
let comicStyleId = 'ink'      // selected comic art style

// Live TTS mute
let liveTtsMuted = false

// Live translation state
let liveMode = false
let liveStream: MediaStream | null = null
let liveAudioContext: AudioContext | null = null
let liveAnalyser: AnalyserNode | null = null
let liveFullTranscript = ''       // accumulated transcript (shown on web)
let liveFullTranslation = ''      // accumulated translation (shown on web)
const CHUNK_DURATION_MS = 1500
const VAD_THRESHOLD = 5           // average frequency amplitude threshold (low = sensitive)

// ── DOM elements ────────────────────────────────────────────────────

const elModeLabel = document.getElementById('mode-label')!
const elLangPair = document.getElementById('lang-pair')!
const elStatus = document.getElementById('status')!
const elOriginal = document.getElementById('original')!
const elTranslated = document.getElementById('translated')!
const elFooter = document.getElementById('footer')!
const elStateIndicator = document.getElementById('state-indicator')!
const elTextInput = document.getElementById('text-input') as HTMLInputElement
const elBtnSend = document.getElementById('btn-send')!
const elContent = document.getElementById('content')!
const elBtnTranslateMode = document.getElementById('btn-translate-mode')!
const elBtnChatMode = document.getElementById('btn-chat-mode')!
const elEngineSelect = document.getElementById('engine-select') as HTMLSelectElement
const elResultControls = document.getElementById('result-controls')!
const elBtnPrevPage = document.getElementById('btn-prev-page')!
const elBtnNextPage = document.getElementById('btn-next-page')!
const elPageIndicator = document.getElementById('page-indicator')!
const elBtnPauseTts = document.getElementById('btn-pause-tts')!
const elBtnComicMode = document.getElementById('btn-comic-mode')!
const elComicPanels = document.getElementById('comic-panels')!
const elLiveToggle = document.getElementById('live-toggle')!
const elBtnPushMode = document.getElementById('btn-push-mode')!
const elBtnLiveMode = document.getElementById('btn-live-mode')!
const elInputDeviceSelect = document.getElementById('input-device-select') as HTMLSelectElement
const elOutputDeviceSelect = document.getElementById('output-device-select') as HTMLSelectElement
const elBtnSelectOutput = document.getElementById('btn-select-output')!
const elSaveHistoryToggle = document.getElementById('save-history-toggle') as HTMLInputElement
const elStylePicker = document.getElementById('style-picker')!
const elStyleGrid = document.getElementById('style-grid')!
const elHistoryOverlay = document.getElementById('history-overlay')!
const elHistoryList = document.getElementById('history-list')!
const elBtnOpenHistory = document.getElementById('btn-open-history')!
const elBtnHistoryClose = document.getElementById('btn-history-close')!
const elHistoryLangSelect = document.getElementById('history-lang-select') as HTMLSelectElement

// ── Helpers ─────────────────────────────────────────────────────────

function getSourceLang(): Language { return SOURCE_LANGUAGES[sourceIndex] }
function getTargetLang(): Language { return TARGET_LANGUAGES[targetIndex] }

function getHeaderLabel(): string {
  if (mode === 'COMIC') return comicTitle || 'Comic Story'
  if (mode === 'CHAT') return 'AI Assistant'
  return `${getSourceLang().label} \u2192 ${getTargetLang().label}`
}

function getStateLabel(): string {
  switch (state) {
    case 'IDLE': return mode === 'CHAT' ? '\u23F0 Ask me' : mode === 'COMIC' ? '\u23F0 Comic Ready' : '\u23F0 Ready'
    case 'LISTENING': return liveMode ? (liveTtsMuted ? '\u25CF LIVE \u2014 muted' : '\u25CF LIVE') : '\uD83D\uDD34 Listening'
    case 'TRANSLATING': return mode === 'COMIC' ? '\u23F3 Creating comic...' : mode === 'CHAT' ? '\u23F3 Thinking' : '\u23F3 Translating'
    case 'RESULT':
      if (mode === 'COMIC' && comicScenes.length > 0) {
        const pauseLabel = comicPaused ? ' \u23F8' : ''
        return `${comicIndex + 1}/${comicScenes.length} ${comicShowingImage ? '\uD83D\uDDBC' : '\uD83D\uDCDD'}${pauseLabel}`
      }
      return '\u2705 Result'
  }
}

function getIdleLabel(): string {
  if (mode === 'COMIC') return 'Comic Story Mode'
  return mode === 'CHAT' ? 'AI Assistant Ready' : 'Translator Ready'
}

// ── Web UI update ───────────────────────────────────────────────────

function updateWebUI(): void {
  elModeLabel.textContent = mode
  elLangPair.textContent = getHeaderLabel()
  elStateIndicator.textContent = getStateLabel()
  elTextInput.placeholder = mode === 'COMIC' ? 'Describe a story...' : mode === 'CHAT' ? 'Ask anything...' : 'Type text to translate...'
  // Send button is an icon (➤), no text change needed

  elBtnTranslateMode.classList.toggle('active', mode === 'TRANSLATE')
  elBtnChatMode.classList.toggle('active', mode === 'CHAT')
  elBtnComicMode.classList.toggle('active', mode === 'COMIC')

  // Show live toggle only in TRANSLATE mode, style picker only in COMIC mode
  elLiveToggle.classList.toggle('hidden', mode !== 'TRANSLATE')
  elStylePicker.classList.toggle('hidden', mode !== 'COMIC')
  elBtnPushMode.classList.toggle('active', !liveMode)
  elBtnLiveMode.classList.toggle('active', liveMode)

  elFooter.className = ''
  if (state === 'LISTENING' && liveMode) elFooter.classList.add('live-listening')
  else if (state === 'LISTENING') elFooter.classList.add('listening')
  if (state === 'TRANSLATING') elFooter.classList.add('translating')

  switch (state) {
    case 'IDLE':
      elStatus.textContent = getIdleLabel()
      elStatus.classList.remove('pulsing', 'hidden')
      elOriginal.classList.add('hidden')
      elTranslated.classList.add('hidden')
      elComicPanels.classList.add('hidden')
      break
    case 'LISTENING':
      if (liveMode && liveFullTranslation) {
        // Live mode with results: show accumulated translation
        elStatus.classList.add('hidden')
        elOriginal.textContent = liveFullTranscript
        elOriginal.classList.remove('hidden')
        elTranslated.textContent = liveFullTranslation
        elTranslated.classList.remove('hidden')
        requestAnimationFrame(() => { elContent.scrollTop = elContent.scrollHeight })
      } else {
        elStatus.textContent = liveMode ? 'Live listening...' : 'Listening...'
        elStatus.classList.add('pulsing')
        elStatus.classList.remove('hidden')
        elOriginal.classList.add('hidden')
        elTranslated.classList.add('hidden')
      }
      break
    case 'TRANSLATING':
      elStatus.textContent = mode === 'COMIC' ? 'Creating comic...' : mode === 'CHAT' ? 'Thinking...' : 'Translating...'
      elStatus.classList.remove('pulsing', 'hidden')
      elOriginal.classList.add('hidden')
      elTranslated.classList.add('hidden')
      elComicPanels.classList.add('hidden')
      break
    case 'RESULT':
      elStatus.classList.add('hidden')
      if (mode === 'COMIC' && comicScenes.length > 0) {
        elOriginal.classList.add('hidden')
        elTranslated.classList.add('hidden')
        renderComicPanels()
        elComicPanels.classList.remove('hidden')
      } else {
        elComicPanels.classList.add('hidden')
        if (lastOriginalText) {
          elOriginal.textContent = lastOriginalText
          elOriginal.classList.remove('hidden')
        }
        if (lastTranslatedText) {
          elTranslated.textContent = lastTranslatedText
          elTranslated.classList.remove('hidden')
        }
      }
      break
  }

  // Show/hide result controls (page nav + stop TTS)
  const totalPages = getGlassesPageCount(lastTranslatedText)
  if (state === 'RESULT' && totalPages > 1) {
    const activePage = glassesPage === -1 ? totalPages - 1 : glassesPage
    elPageIndicator.textContent = `${activePage + 1} / ${totalPages}`
    elResultControls.classList.remove('hidden')
  } else if (state === 'RESULT' && (!ttsAudio.paused || ttsPlaying || window.speechSynthesis.speaking)) {
    elPageIndicator.textContent = ''
    elResultControls.classList.remove('hidden')
  } else {
    elResultControls.classList.add('hidden')
  }
}

// ── Glasses display ─────────────────────────────────────────────────

// Approximate chars that fit the glasses content area (576x200px, ~30 chars/line, ~8 lines)
const GLASSES_PAGE_CHARS = 240

function getGlassesPageCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / GLASSES_PAGE_CHARS))
}

function getGlassesPageText(text: string, page: number): string {
  const totalPages = getGlassesPageCount(text)
  if (totalPages <= 1) return text

  const start = page * GLASSES_PAGE_CHARS
  const end = start + GLASSES_PAGE_CHARS
  let slice = text.substring(start, end)

  if (page > 0) slice = '…' + slice
  if (end < text.length) slice = slice + '…'

  return slice
}

function buildTextContainers(): TextContainerProperty[] {
  // ── Layout: 576×288 greyscale display ──
  // Minimal chrome, maximize content readability.
  // Header: thin top bar (24px) — only essential context
  // Content: large area (240px) — translation/response text
  // Footer: subtle bottom bar (24px) — status only when useful

  let headerText = ''
  let contentText = ''
  let footerText = ''

  switch (state) {
    case 'IDLE':
      // Clean idle — just mode name centered
      contentText = mode === 'COMIC' ? 'Comic' : mode === 'CHAT' ? 'Chat' : ''
      headerText = mode === 'TRANSLATE' ? `${getSourceLang().label} \u2192 ${getTargetLang().label}` : ''
      footerText = liveMode ? 'tap to start' : ''
      break
    case 'LISTENING':
      if (liveMode && liveFullTranslation) {
        // Live mode with results — show latest translation prominently
        // Only last chunk for readability on small display
        const lines = liveFullTranslation.split('\n')
        contentText = lines.slice(-3).join('\n')
        headerText = `${getSourceLang().label} \u2192 ${getTargetLang().label}`
        footerText = liveTtsMuted ? '\u25CF live \u2014 muted' : '\u25CF live'
      } else {
        contentText = liveMode ? '\u25CF' : '\u2022 \u2022 \u2022'
        footerText = liveMode ? 'live' : 'listening'
      }
      break
    case 'TRANSLATING':
      contentText = '\u2022 \u2022 \u2022'
      footerText = mode === 'CHAT' ? 'thinking' : 'translating'
      break
    case 'RESULT':
      contentText = lastTranslatedText || ''
      if (mode === 'COMIC' && comicScenes.length > 0) {
        contentText = comicScenes[comicIndex]?.narration || ''
        footerText = `${comicIndex + 1}/${comicScenes.length}${comicPaused ? ' \u23F8' : ''}`
      }
      break
  }

  // Paginate long content
  if (contentText.length > GLASSES_PAGE_CHARS) {
    const totalPages = getGlassesPageCount(contentText)
    const activePage = glassesPage === -1 ? totalPages - 1 : Math.min(glassesPage, totalPages - 1)
    contentText = getGlassesPageText(contentText, activePage)
    footerText = `${activePage + 1}/${totalPages}`
  }

  const containers: TextContainerProperty[] = []

  // Header — only show if there's content (keeps display clean)
  if (headerText) {
    containers.push(new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 24,
      borderWidth: 0, borderColor: 0, paddingLength: 6,
      containerID: 1, containerName: 'header',
      content: headerText,
      isEventCapture: 0,
    }))
  }

  // Content — takes most of the display
  const contentY = headerText ? 24 : 0
  const contentH = footerText ? 252 - contentY : 288 - contentY
  containers.push(new TextContainerProperty({
    xPosition: 0, yPosition: contentY, width: 576, height: contentH,
    borderWidth: 0, borderColor: 0, paddingLength: 10,
    containerID: 2, containerName: 'content',
    content: contentText,
    isEventCapture: 1,
  }))

  // Footer — only show if there's status to display
  if (footerText) {
    containers.push(new TextContainerProperty({
      xPosition: 0, yPosition: 252, width: 576, height: 24,
      borderWidth: 0, borderColor: 0, paddingLength: 2,
      containerID: 3, containerName: 'footer',
      content: footerText,
      isEventCapture: 0,
    }))
  }

  return containers
}

function buildComicImageLayout(): { textObjects: TextContainerProperty[], imageObjects: ImageContainerProperty[] } {
  // Comic image: centered image, footer with page indicator
  // Image must match processForGlasses output: 288×144
  const footerLabel = `${comicIndex + 1}/${comicScenes.length}${comicPaused ? ' \u23F8' : ''}`
  const textObjects = [
    new TextContainerProperty({
      xPosition: 0, yPosition: 200, width: 576, height: 24,
      borderWidth: 0, borderColor: 0, paddingLength: 2,
      containerID: 3, containerName: 'footer',
      content: footerLabel,
      isEventCapture: 0,
    }),
  ]
  const imageObjects = [
    new ImageContainerProperty({
      xPosition: 144, yPosition: 48, width: 288, height: 144,
      containerID: 4, containerName: 'comic-img',
    }),
  ]
  return { textObjects, imageObjects }
}

async function updateGlassesDisplay(): Promise<void> {
  if (!bridge) return

  // Comic image mode: show illustration on glasses
  if (mode === 'COMIC' && comicShowingImage && comicScenes[comicIndex]?.glassesImage) {
    const layout = buildComicImageLayout()
    const totalNum = layout.textObjects.length + layout.imageObjects.length
    try {
      if (isFirstDisplay) {
        await bridge.createStartUpPageContainer(
          new CreateStartUpPageContainer({ containerTotalNum: totalNum, textObject: layout.textObjects, imageObject: layout.imageObjects })
        )
        isFirstDisplay = false
      } else {
        await bridge.rebuildPageContainer(
          new RebuildPageContainer({ containerTotalNum: totalNum, textObject: layout.textObjects, imageObject: layout.imageObjects })
        )
      }
      // Send image data
      const imgData = comicScenes[comicIndex].glassesImage!
      const raw = Uint8Array.from(atob(imgData), c => c.charCodeAt(0))
      await bridge.updateImageRawData(
        new ImageRawDataUpdate({ containerID: 4, containerName: 'comic-img', imageData: Array.from(raw) })
      )
    } catch (err) {
      console.error('[G2] Comic image display failed:', err)
    }
    return
  }

  // Standard text-only display
  const textContainers = buildTextContainers()
  const totalNum = textContainers.length
  try {
    if (isFirstDisplay) {
      await bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({ containerTotalNum: totalNum, textObject: textContainers })
      )
      isFirstDisplay = false
    } else {
      await bridge.rebuildPageContainer(
        new RebuildPageContainer({ containerTotalNum: totalNum, textObject: textContainers })
      )
    }
  } catch (err) {
    console.error('[G2] Display update failed:', err)
  }
}

function throttledGlassesUpdate(): void {
  const now = Date.now()
  if (now - lastGlassesUpdate >= GLASSES_UPDATE_INTERVAL) {
    lastGlassesUpdate = now
    void updateGlassesDisplay()
  } else if (!glassesUpdatePending) {
    glassesUpdatePending = true
    setTimeout(() => {
      glassesUpdatePending = false
      lastGlassesUpdate = Date.now()
      void updateGlassesDisplay()
    }, GLASSES_UPDATE_INTERVAL - (now - lastGlassesUpdate))
  }
}

// ── State transitions ───────────────────────────────────────────────

function setState(newState: AppState): void {
  state = newState
  updateWebUI()
  void updateGlassesDisplay()
}

function clearResultTimer(): void {
  if (resultTimer !== null) { clearTimeout(resultTimer); resultTimer = null }
}

// ── Web Audio fallback (when bridge is not available) ───────────────

let mediaRecorder: MediaRecorder | null = null
let recordedBlob: Blob | null = null

async function startWebMic(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
  const chunks: Blob[] = []
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(chunks, { type: 'audio/webm' })
    stream.getTracks().forEach(t => t.stop())
  }
  mediaRecorder.start()
}

function stopWebMic(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') { resolve(null); return }
    mediaRecorder.onstop = () => {
      resolve(recordedBlob)
      mediaRecorder = null
    }
    mediaRecorder.stop()
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Audio handling ──────────────────────────────────────────────────

async function startListening(): Promise<void> {
  audioChunks = []
  recordedBlob = null
  if (bridge) {
    try { await bridge.audioControl(true) } catch (err) { console.error('[G2] Mic error:', err) }
  } else {
    try { await startWebMic() } catch (err) { console.error('[G2] Web mic error:', err) }
  }
  setState('LISTENING')
}

async function stopListeningAndProcess(): Promise<void> {
  let base64: string | null = null

  if (bridge) {
    try { await bridge.audioControl(false) } catch (err) { console.error('[G2] Mic error:', err) }
    if (audioChunks.length === 0) { setState('IDLE'); return }
    const totalLength = audioChunks.reduce((sum, c) => sum + c.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of audioChunks) { combined.set(chunk, offset); offset += chunk.length }
    audioChunks = []
    base64 = uint8ArrayToBase64(combined)
  } else {
    const blob = await stopWebMic()
    if (!blob) { setState('IDLE'); return }
    base64 = await blobToBase64(blob)
  }

  setState('TRANSLATING')

  const audioFormat = bridge ? undefined : 'webm'

  if (mode === 'CHAT' || mode === 'COMIC') {
    // Transcribe first, then route to chat or comic
    try {
      const trRes = await fetch(`${BACKEND}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, format: audioFormat }),
      })
      const trData = await trRes.json() as { text?: string }
      if (trData.text) {
        if (mode === 'COMIC') await sendComicRequest(trData.text)
        else await sendChatMessage(trData.text)
      } else {
        lastOriginalText = ''; lastTranslatedText = '(no speech detected)'
        showResult()
      }
    } catch (err) {
      lastOriginalText = ''; lastTranslatedText = `Error: ${err instanceof Error ? err.message : 'Unknown'}`
      showResult()
    }
  } else {
    await sendForTranslation(base64, audioFormat)
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// ── Live Translation ────────────────────────────────────────────

function checkVAD(): boolean {
  if (!liveAnalyser) return true // no analyser = assume speech
  const data = new Uint8Array(liveAnalyser.frequencyBinCount)
  liveAnalyser.getByteFrequencyData(data)
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]
  const avg = sum / data.length
  console.log(`[VAD] avg=${avg.toFixed(1)} threshold=${VAD_THRESHOLD} speech=${avg > VAD_THRESHOLD}`)
  return avg > VAD_THRESHOLD
}

async function startLiveMode(): Promise<void> {
  liveFullTranscript = ''
  liveFullTranslation = ''

  // Live mode always uses device mic (getUserMedia) — not glasses bridge.
  // Reason: live translation captures ambient audio from the environment,
  // and the glasses bridge audio path is designed for push-to-talk.
  try {
    const inputDeviceId = getSelectedInputDeviceId()
    liveStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        ...(inputDeviceId ? { deviceId: { exact: inputDeviceId } } : {}),
      },
    })
    liveAudioContext = new AudioContext()
    const source = liveAudioContext.createMediaStreamSource(liveStream)
    liveAnalyser = liveAudioContext.createAnalyser()
    liveAnalyser.fftSize = 256
    source.connect(liveAnalyser)
  } catch (err) {
    console.error('[Live] Mic error:', err)
    return
  }

  setState('LISTENING')
  void liveRecordLoop()
}

async function liveRecordLoop(): Promise<void> {
  console.log('[Live] Record loop started')
  while (liveMode && liveStream) {
    // VAD check — skip silence
    if (!checkVAD()) {
      await new Promise(r => setTimeout(r, 500))
      continue
    }
    console.log('[Live] Recording chunk...')
    const blob = await recordChunkFromStream(liveStream, CHUNK_DURATION_MS)
    if (!blob || blob.size < 100 || !liveMode) continue
    const base64 = await blobToBase64(blob)
    console.log(`[Live] Sending chunk (${(base64.length / 1024).toFixed(0)}KB)`)
    // Fire and forget — start recording next chunk immediately
    // while this one is being transcribed + translated on server
    void processLiveAudio(base64, 'webm')
  }
  console.log('[Live] Record loop ended')
}

async function processLiveAudio(base64: string, format: string | undefined): Promise<void> {
  try {
    const res = await fetch(`${BACKEND}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: base64,
        from: getSourceLang().code,
        to: getTargetLang().code,
        format,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json() as { original?: string; translated?: string }
    console.log('[Live] Backend response:', data)
    if (data.original && data.translated) {
      liveFullTranscript += (liveFullTranscript ? ' ' : '') + data.original
      liveFullTranslation += (liveFullTranslation ? '\n' : '') + data.translated

      lastOriginalText = liveFullTranscript
      lastTranslatedText = liveFullTranslation
      glassesPage = -1

      if (state === 'LISTENING') {
        // Still live — update display in-place
        updateWebUI()
        throttledGlassesUpdate()
      } else {
        // Live mode was stopped while request was in flight — show as result
        showResult()
      }

      // Queue TTS for this chunk
      speakQueued(data.translated, langCodeToTTS(getTargetLang().code))
    }
  } catch (err) {
    console.error('[Live] Chunk processing error:', err)
  }
}

function recordChunkFromStream(stream: MediaStream, durationMs: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const chunks: Blob[] = []
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      rec.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }))
      rec.start()
      setTimeout(() => {
        if (rec.state === 'recording') rec.stop()
      }, durationMs)
    } catch {
      resolve(null)
    }
  })
}

async function stopLiveMode(): Promise<void> {
  // Stop TTS queue and current playback
  ttsQueue.length = 0
  ttsAudio.pause()
  ttsAudio.src = ''
  ttsPlaying = false

  // Stop mic stream — this also breaks the liveRecordLoop (checks liveStream)
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop())
    liveStream = null
  }
  if (liveAudioContext) {
    void liveAudioContext.close()
    liveAudioContext = null
    liveAnalyser = null
  }

  // Save live session to history
  if (liveFullTranslation) {
    saveToHistory({
      mode: 'translate',
      input: liveFullTranscript,
      output: liveFullTranslation,
      from: getSourceLang().code,
      to: getTargetLang().code,
    })
  }

  // Show what we have so far; if a request is in flight,
  // processLiveAudio will call showResult() when it completes
  if (liveFullTranslation) {
    lastOriginalText = liveFullTranscript
    lastTranslatedText = liveFullTranslation
    showResult()
  } else {
    // Nothing translated yet — show "stopping" briefly, then IDLE
    // (in-flight request will call showResult when done)
    setState('TRANSLATING')
    setTimeout(() => { if (state === 'TRANSLATING') setState('IDLE') }, 5000)
  }
}

// ── Translation ─────────────────────────────────────────────────────

async function sendForTranslation(audio: string, format?: string): Promise<void> {
  try {
    const res = await fetch(`${BACKEND}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio, from: getSourceLang().code, to: getTargetLang().code, format }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { original?: string; translated?: string }
    lastOriginalText = data.original ?? ''
    lastTranslatedText = data.translated ?? 'No translation'
    showResult()
  } catch (err) {
    lastOriginalText = ''
    lastTranslatedText = `Error: ${err instanceof Error ? err.message : 'Unknown'}`
    showResult()
  }
}

async function sendTextForTranslation(text: string): Promise<void> {
  setState('TRANSLATING')
  try {
    const res = await fetch(`${BACKEND}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from: getSourceLang().code, to: getTargetLang().code }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { original?: string; translated?: string }
    lastOriginalText = data.original ?? text
    lastTranslatedText = data.translated ?? 'No translation'
    showResult()
  } catch (err) {
    lastOriginalText = text
    lastTranslatedText = `Error: ${err instanceof Error ? err.message : 'Unknown'}`
    showResult()
  }
}

// ── AI Chat ─────────────────────────────────────────────────────────

async function sendChatMessage(message: string): Promise<void> {
  setState('TRANSLATING')
  lastOriginalText = message
  lastTranslatedText = ''
  glassesPage = -1 // auto-follow latest page

  try {
    const url = `${BACKEND}/chat/stream?message=${encodeURIComponent(message)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    // Switch to RESULT state so text starts showing immediately
    state = 'RESULT'
    // streaming active
    updateWebUI()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const json = line.slice(5).trim()
        if (!json) continue
        const parsed = JSON.parse(json) as { chunk?: string; done?: boolean; error?: string }
        if (parsed.error) { lastTranslatedText = `Error: ${parsed.error}`; break }
        if (parsed.chunk) {
          lastTranslatedText += parsed.chunk
          // Update web UI progressively
          elTranslated.textContent = lastTranslatedText
          elTranslated.classList.remove('hidden')
          elStatus.classList.add('hidden')
          // Auto-scroll content area after DOM update
          requestAnimationFrame(() => {
            elContent.scrollTop = elContent.scrollHeight
          })
          // Update glasses display (throttled to avoid flooding)
          throttledGlassesUpdate()
        }
        if (parsed.done) break
      }
    }

    // streaming done
    showResult()
  } catch (err) {
    // streaming done
    lastTranslatedText = `Error: ${err instanceof Error ? err.message : 'Unknown'}`
    showResult()
  }
}

// ── Comic Mode ─────────────────────────────────────────────────────

function renderComicPanels(): void {
  // Clear existing children safely
  while (elComicPanels.firstChild) elComicPanels.removeChild(elComicPanels.firstChild)

  comicScenes.forEach((scene, i) => {
    const panel = document.createElement('div')
    panel.className = `comic-panel ${i === comicIndex ? 'active' : ''}`

    if (scene.webImage) {
      const img = document.createElement('img')
      img.src = scene.webImage.startsWith('http') ? scene.webImage : `data:image/png;base64,${scene.webImage}`
      img.alt = `Scene ${i + 1}`
      panel.appendChild(img)
    } else {
      const placeholder = document.createElement('div')
      placeholder.className = 'comic-loading'
      placeholder.textContent = `Scene ${i + 1}...`
      panel.appendChild(placeholder)
    }

    const text = document.createElement('p')
    text.className = 'comic-narration'
    text.textContent = scene.narration
    panel.appendChild(text)

    panel.addEventListener('click', () => {
      comicIndex = i
      comicShowingImage = false
      updateWebUI()
      void updateGlassesDisplay()
    })

    elComicPanels.appendChild(panel)
  })
  // Scroll active panel into view
  const activePanel = elComicPanels.querySelector('.active')
  activePanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function sendComicRequest(message: string): Promise<void> {
  setState('TRANSLATING')
  comicTitle = ''
  comicScenes = []
  comicIndex = 0
  comicShowingImage = false

  try {
    const url = `${BACKEND}/comic/stream?message=${encodeURIComponent(message)}&style=${comicStyleId}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const json = line.slice(5).trim()
        if (!json) continue
        const ev = JSON.parse(json)

        switch (ev.type) {
          case 'story':
            comicTitle = ev.title
            break
          case 'scene':
            comicScenes[ev.index] = { narration: ev.narration }
            // Show first scene immediately
            if (ev.index === 0) {
              state = 'RESULT'
              lastTranslatedText = ev.narration
              updateWebUI()
            }
            break
          case 'image':
            if (comicScenes[ev.index]) {
              comicScenes[ev.index].glassesImage = ev.glassesImage
              comicScenes[ev.index].webImage = ev.webImage
              renderComicPanels()
            }
            break
          case 'error':
            lastTranslatedText = `Error: ${ev.message}`
            setState('RESULT')
            return
          case 'done':
            break
        }
      }
    }

    // Save comic to history
    saveToHistory({
      mode: 'comic',
      input: comicTitle,
      output: comicScenes.map((s, i) => `[${i + 1}] ${s.narration}`).join('\n'),
      images: comicScenes.map(s => s.webImage).filter((img): img is string => !!img),
    })

    // Start comic playback
    await playComic()
  } catch (err) {
    lastTranslatedText = `Error: ${err instanceof Error ? err.message : 'Unknown'}`
    setState('RESULT')
  }
}

let comicPlaying = false

async function playComic(): Promise<void> {
  comicPaused = false
  comicPlaying = true
  for (let i = 0; i < comicScenes.length; i++) {
    // Wait while paused
    while (comicPaused) await new Promise(r => setTimeout(r, 200))

    comicIndex = i
    comicShowingImage = false
    lastTranslatedText = comicScenes[i].narration

    // Clear any pending TTS before new scene
    ttsQueue.length = 0
    setState('RESULT')

    // Read narration with TTS (OpenAI TTS via speakQueued, then wait)
    speakQueued(comicScenes[i].narration, detectTTSLang(comicScenes[i].narration))
    // Wait for TTS to finish playing
    await waitForTtsIdle()

    // Show image on glasses if available
    if (comicScenes[i].glassesImage) {
      comicShowingImage = true
      updateWebUI()
      void updateGlassesDisplay()
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  comicPlaying = false
}

/** Wait until TTS queue is drained and audio finishes playing */
async function waitForTtsIdle(): Promise<void> {
  // Give speakQueued time to start drainTtsQueue
  await new Promise(r => setTimeout(r, 300))
  while (ttsPlaying || ttsQueue.length > 0 || !ttsAudio.paused) {
    // Respect pause — don't advance while comic is paused
    while (comicPaused) await new Promise(r => setTimeout(r, 200))
    await new Promise(r => setTimeout(r, 200))
  }
}

function comicNext(): void {
  if (comicShowingImage) {
    // From image → next scene text
    if (comicIndex < comicScenes.length - 1) {
      comicIndex++
      comicShowingImage = false
      lastTranslatedText = comicScenes[comicIndex].narration
    }
  } else {
    // From text → show image (if available), or next scene
    if (comicScenes[comicIndex]?.glassesImage) {
      comicShowingImage = true
    } else if (comicIndex < comicScenes.length - 1) {
      comicIndex++
      lastTranslatedText = comicScenes[comicIndex].narration
    }
  }
  updateWebUI()
  void updateGlassesDisplay()
}

function comicPrev(): void {
  if (comicShowingImage) {
    // From image → back to same scene text
    comicShowingImage = false
    lastTranslatedText = comicScenes[comicIndex].narration
  } else if (comicIndex > 0) {
    comicIndex--
    // Go to image of previous scene if available, else text
    if (comicScenes[comicIndex]?.glassesImage) {
      comicShowingImage = true
    } else {
      lastTranslatedText = comicScenes[comicIndex].narration
    }
  }
  updateWebUI()
  void updateGlassesDisplay()
}

// ── Result display ──────────────────────────────────────────────────

async function showResult(): Promise<void> {
  clearResultTimer()
  setState('RESULT')

  // Auto-save to history
  if (lastTranslatedText && mode !== 'COMIC') {
    saveToHistory({
      mode: mode.toLowerCase(),
      input: lastOriginalText,
      output: lastTranslatedText,
      from: getSourceLang().code,
      to: getTargetLang().code,
    })
  }

  // Speak the result aloud (skip if live mode — TTS already handled by speakQueued)
  if (lastTranslatedText && !liveMode) {
    const lang = mode === 'CHAT'
      ? detectTTSLang(lastTranslatedText)
      : langCodeToTTS(getTargetLang().code)
    await speak(lastTranslatedText, lang)
  }

  // Longer timeout for multi-page results so user can scroll through
  const pages = getGlassesPageCount(lastTranslatedText)
  const timeout = pages > 1 ? RESULT_TIMEOUT_MS * pages : RESULT_TIMEOUT_MS
  resultTimer = setTimeout(() => { glassesPage = -1; setState('IDLE') }, timeout)
}

// ── Gesture / event handling ────────────────────────────────────────

function toggleSpeaking(): void {
  // Handle Audio element TTS
  if (!ttsAudio.paused) {
    ttsAudio.pause()
    return
  }
  if (ttsAudio.paused && ttsAudio.src) {
    void ttsAudio.play()
    return
  }
  // Fallback: browser SpeechSynthesis
  const synth = window.speechSynthesis
  if (synth.speaking && !synth.paused) {
    synth.pause()
  } else if (synth.paused) {
    synth.resume()
  }
}

function handleClick(): void {
  clearResultTimer()

  // Live mode: click toggles TTS mute (double-click stops live)
  if (liveMode && mode === 'TRANSLATE' && state === 'LISTENING') {
    liveTtsMuted = !liveTtsMuted
    if (liveTtsMuted) {
      ttsAudio.pause()
      ttsQueue.length = 0
    }
    console.log(`[Live] TTS ${liveTtsMuted ? 'muted' : 'unmuted'}`)
    updateWebUI()
    return
  }

  // Live mode: start from idle/result
  if (liveMode && mode === 'TRANSLATE') {
    if (state === 'IDLE' || state === 'RESULT') {
      liveTtsMuted = false
      void startLiveMode()
    }
    return
  }

  switch (state) {
    case 'IDLE': void startListening(); break
    case 'LISTENING': void stopListeningAndProcess(); break
    case 'TRANSLATING': break
    case 'RESULT':
      // Comic mode: pause/resume playback
      if (mode === 'COMIC' && comicScenes.length > 0) {
        comicPaused = !comicPaused
        if (comicPaused) {
          ttsAudio.pause()
        } else if (ttsAudio.src && ttsAudio.paused) {
          void ttsAudio.play()
        }
        updateWebUI()
        break
      }
      // Other modes: pause/resume TTS or dismiss
      if (!ttsAudio.paused || ttsPlaying || window.speechSynthesis.speaking || window.speechSynthesis.paused) {
        toggleSpeaking()
      } else {
        glassesPage = -1
        setState('IDLE')
      }
      break
  }
}

function handleScrollUp(): void {
  // Comic mode: previous scene/image
  if (mode === 'COMIC' && state === 'RESULT' && comicScenes.length > 0) {
    comicPrev()
    return
  }
  // In RESULT state with long text: scroll pages
  if (state === 'RESULT' && lastTranslatedText.length > GLASSES_PAGE_CHARS) {
    clearResultTimer()
    const totalPages = getGlassesPageCount(lastTranslatedText)
    const current = glassesPage === -1 ? totalPages - 1 : glassesPage
    glassesPage = Math.max(0, current - 1)
    console.log(`[Glasses] Page ${glassesPage + 1}/${totalPages}`)
    updateWebUI()
    void updateGlassesDisplay()
    return
  }
  if (mode === 'TRANSLATE') {
    targetIndex = (targetIndex + 1) % TARGET_LANGUAGES.length
  } else {
    switchMode()
  }
  updateWebUI()
  void updateGlassesDisplay()
}

function handleScrollDown(): void {
  // Comic mode: next scene/image
  if (mode === 'COMIC' && state === 'RESULT' && comicScenes.length > 0) {
    comicNext()
    return
  }
  // In RESULT state with long text: scroll pages
  if (state === 'RESULT' && lastTranslatedText.length > GLASSES_PAGE_CHARS) {
    clearResultTimer()
    const totalPages = getGlassesPageCount(lastTranslatedText)
    const current = glassesPage === -1 ? totalPages - 1 : glassesPage
    glassesPage = Math.min(totalPages - 1, current + 1)
    console.log(`[Glasses] Page ${glassesPage + 1}/${totalPages}`)
    updateWebUI()
    void updateGlassesDisplay()
    return
  }
  if (mode === 'TRANSLATE') {
    sourceIndex = (sourceIndex + 1) % SOURCE_LANGUAGES.length
  } else {
    switchMode()
  }
  updateWebUI()
  void updateGlassesDisplay()
}

const MODES: AppMode[] = ['TRANSLATE', 'CHAT', 'COMIC']
function switchMode(): void {
  // Stop live mode if active
  if (liveMode && state === 'LISTENING') void stopLiveMode()
  const idx = MODES.indexOf(mode)
  mode = MODES[(idx + 1) % MODES.length]
  state = 'IDLE'
  lastOriginalText = ''
  lastTranslatedText = ''
  glassesPage = -1
  comicScenes = []
  comicIndex = 0
  comicShowingImage = false
}

function handleDoubleClick(): void {
  // In live mode: double-click stops live
  if (liveMode && mode === 'TRANSLATE' && state === 'LISTENING') {
    void stopLiveMode()
    return
  }
  // Otherwise: switch mode
  switchMode()
  updateWebUI()
  void updateGlassesDisplay()
}

function handleGlassesEvent(event: EvenHubEvent): void {
  if (event.audioEvent?.audioPcm) {
    if (state === 'LISTENING') audioChunks.push(new Uint8Array(event.audioEvent.audioPcm))
    return
  }

  const sysEvent = event.sysEvent
  if (!sysEvent?.eventType && sysEvent?.eventType !== 0) return

  switch (sysEvent.eventType) {
    case OsEventTypeList.CLICK_EVENT: handleClick(); break
    case OsEventTypeList.SCROLL_TOP_EVENT: handleScrollUp(); break
    case OsEventTypeList.SCROLL_BOTTOM_EVENT: handleScrollDown(); break
    case OsEventTypeList.DOUBLE_CLICK_EVENT: handleDoubleClick(); break
  }
}

// ── Keyboard shortcuts ──────────────────────────────────────────────

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.target === elTextInput) return
    switch (e.code) {
      case 'Space': e.preventDefault(); handleClick(); break
      case 'ArrowUp': e.preventDefault(); handleScrollUp(); break
      case 'ArrowDown': e.preventDefault(); handleScrollDown(); break
      case 'Tab': e.preventDefault(); switchMode(); updateWebUI(); void updateGlassesDisplay(); break
    }
  })
}

// ── History save ────────────────────────────────────────────────────

function isSaveEnabled(): boolean {
  return elSaveHistoryToggle.checked
}

function saveToHistory(entry: {
  mode: string
  input: string
  output: string
  from?: string
  to?: string
  images?: string[]
}): void {
  if (!isSaveEnabled()) return
  fetch(`${BACKEND}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...entry, timestamp: new Date().toISOString() }),
  }).catch(err => console.error('[History] Save failed:', err))
}

// ── Media Session (AirPods / headphone controls) ────────────────────

function setupMediaSession(): void {
  if (!('mediaSession' in navigator)) return

  const handler = () => handleClick()

  navigator.mediaSession.setActionHandler('pause', handler)
  navigator.mediaSession.setActionHandler('play', handler)
  navigator.mediaSession.setActionHandler('nexttrack', () => handleScrollDown())
  navigator.mediaSession.setActionHandler('previoustrack', () => handleScrollUp())

  // Set metadata so AirPods know what's playing
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'G2 Assistant',
    artist: 'Live Translation',
  })
}

// ── Web UI controls ─────────────────────────────────────────────────

function submitInput(): void {
  const text = elTextInput.value.trim()
  if (!text) return
  elTextInput.value = ''
  elTextInput.blur()
  if (mode === 'COMIC') void sendComicRequest(text)
  else if (mode === 'CHAT') void sendChatMessage(text)
  else void sendTextForTranslation(text)
}

function setupWebControls(): void {
  elBtnSend.addEventListener('click', submitInput)

  elTextInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') submitInput()
  })

  elBtnTranslateMode.addEventListener('click', () => {
    if (mode !== 'TRANSLATE') { mode = 'TRANSLATE'; state = 'IDLE'; lastOriginalText = ''; lastTranslatedText = ''; comicScenes = []; updateWebUI(); void updateGlassesDisplay() }
  })
  elBtnChatMode.addEventListener('click', () => {
    if (mode !== 'CHAT') { mode = 'CHAT'; state = 'IDLE'; lastOriginalText = ''; lastTranslatedText = ''; comicScenes = []; updateWebUI(); void updateGlassesDisplay() }
  })
  elBtnComicMode.addEventListener('click', () => {
    if (mode !== 'COMIC') { mode = 'COMIC'; state = 'IDLE'; lastOriginalText = ''; lastTranslatedText = ''; comicScenes = []; updateWebUI(); void updateGlassesDisplay() }
  })

  // Live/Push toggle
  elBtnPushMode.addEventListener('click', () => {
    if (liveMode) {
      liveMode = false
      if (state === 'LISTENING') void stopLiveMode()
      updateWebUI()
    }
  })
  elBtnLiveMode.addEventListener('click', () => {
    if (!liveMode) {
      liveMode = true
      if (state === 'LISTENING') void stopListeningAndProcess() // stop push recording first
      updateWebUI()
    }
  })

  // Engine selector
  elEngineSelect.addEventListener('change', async () => {
    const engine = elEngineSelect.value
    try {
      const res = await fetch(`${BACKEND}/engine`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine }),
      })
      const data = await res.json()
      if (data.error) console.error('Engine switch failed:', data.error)
      else console.log('[Engine]', data.engine)
    } catch (err) {
      console.error('Engine switch error:', err)
    }
  })

  // Load current engine on startup
  void fetch(`${BACKEND}/engine`).then(r => r.json()).then(data => {
    if (data.current) elEngineSelect.value = data.current
  }).catch(() => {})

  // Save history toggle — persist to localStorage
  const savedPref = localStorage.getItem('g2-save-history')
  if (savedPref !== null) elSaveHistoryToggle.checked = savedPref === 'true'
  elSaveHistoryToggle.addEventListener('change', () => {
    localStorage.setItem('g2-save-history', String(elSaveHistoryToggle.checked))
  })

  // Audio device selectors
  void enumerateAudioDevices()

  // Result controls: page nav + stop TTS
  elBtnPrevPage.addEventListener('click', () => handleScrollUp())
  elBtnNextPage.addEventListener('click', () => handleScrollDown())
  elBtnPauseTts.addEventListener('click', () => {
    toggleSpeaking()
    const synth = window.speechSynthesis
    elBtnPauseTts.textContent = synth.paused ? 'Resume' : 'Pause'
  })
}

// ── Audio device management ─────────────────────────────────────────

const ttsAudio = new Audio()

async function enumerateAudioDevices(): Promise<void> {
  try {
    // Need permission first to get device labels
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    tempStream.getTracks().forEach(t => t.stop())

    const devices = await navigator.mediaDevices.enumerateDevices()

    // Input devices (microphones)
    const inputs = devices.filter(d => d.kind === 'audioinput')
    elInputDeviceSelect.textContent = ''
    for (const dev of inputs) {
      const opt = document.createElement('option')
      opt.value = dev.deviceId
      opt.textContent = dev.label || `Mic ${dev.deviceId.slice(0, 8)}`
      elInputDeviceSelect.appendChild(opt)
    }

    // Output devices (speakers/headphones)
    const outputs = devices.filter(d => d.kind === 'audiooutput')
    elOutputDeviceSelect.textContent = ''
    for (const dev of outputs) {
      const opt = document.createElement('option')
      opt.value = dev.deviceId
      opt.textContent = dev.label || `Output ${dev.deviceId.slice(0, 8)}`
      elOutputDeviceSelect.appendChild(opt)
    }

    // Listen for output device change (dropdown)
    elOutputDeviceSelect.addEventListener('change', () => {
      void applyOutputDevice(elOutputDeviceSelect.value)
    })

    // Browser-native output picker (shows BT devices reliably)
    elBtnSelectOutput.addEventListener('click', async () => {
      try {
        if ('selectAudioOutput' in navigator.mediaDevices) {
          const device = await (navigator.mediaDevices as any).selectAudioOutput()
          console.log('[Audio] Selected output:', device.label, device.deviceId)
          await applyOutputDevice(device.deviceId)
          // Add to dropdown if not there
          let found = false
          for (const opt of elOutputDeviceSelect.options) {
            if (opt.value === device.deviceId) { opt.selected = true; found = true; break }
          }
          if (!found) {
            const opt = document.createElement('option')
            opt.value = device.deviceId
            opt.textContent = device.label
            opt.selected = true
            elOutputDeviceSelect.appendChild(opt)
          }
        } else {
          alert('selectAudioOutput not supported — select output device from dropdown or system preferences')
        }
      } catch (err) {
        console.error('[Audio] selectAudioOutput error:', err)
      }
    })
  } catch (err) {
    console.warn('[Audio] Device enumeration failed:', err)
  }
}

// ── Comic style picker ─────────────────────────────────────────────

async function loadComicStyles(): Promise<void> {
  try {
    const res = await fetch(`${BACKEND}/comic/styles`)
    const data = await res.json() as { styles: { id: string; label: string; previewUrl: string }[] }

    elStyleGrid.innerHTML = ''
    for (const style of data.styles) {
      const card = document.createElement('div')
      card.className = `style-card${style.id === comicStyleId ? ' active' : ''}`
      card.dataset.styleId = style.id

      const img = document.createElement('img')
      img.className = 'style-card-img'
      img.alt = style.label
      img.src = `${BACKEND}${style.previewUrl.replace(/^\/api/, '')}`

      const label = document.createElement('div')
      label.className = 'style-card-label'
      label.textContent = style.label

      card.appendChild(img)
      card.appendChild(label)

      card.addEventListener('click', () => {
        comicStyleId = style.id
        elStyleGrid.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'))
        card.classList.add('active')
      })

      elStyleGrid.appendChild(card)
    }
  } catch (err) {
    console.error('[Comic] Failed to load styles:', err)
  }
}

// ── History browser ────────────────────────────────────────────────

let historyModeFilter = ''
let historyLangFilter = ''

function openHistory(): void {
  elHistoryOverlay.classList.remove('hidden')
  void loadHistory()
}

function closeHistory(): void {
  elHistoryOverlay.classList.add('hidden')
  setState('IDLE')
}

function closeHistoryWithoutReset(): void {
  elHistoryOverlay.classList.add('hidden')
}

async function loadHistory(): Promise<void> {
  elHistoryList.innerHTML = '<div class="history-empty">Loading...</div>'

  const params = new URLSearchParams()
  if (historyModeFilter) params.set('mode', historyModeFilter)
  if (historyLangFilter) params.set('lang', historyLangFilter)

  try {
    const res = await fetch(`${BACKEND}/history?${params}`)
    const data = await res.json() as { items: HistoryItem[] }

    if (!data.items || data.items.length === 0) {
      elHistoryList.innerHTML = '<div class="history-empty">No entries found</div>'
      return
    }

    elHistoryList.innerHTML = ''
    for (const item of data.items) {
      const el = document.createElement('div')
      el.className = 'history-item'

      const time = item.timestamp ? new Date(item.timestamp).toLocaleString() : ''
      const modeClass = item.mode === 'chat' ? ' chat' : item.mode === 'comic' ? ' comic' : ''
      const langInfo = item.from && item.to ? `${item.from.toUpperCase()} \u2192 ${item.to.toUpperCase()}` : ''

      let imagesHtml = ''
      if (item.imageFiles && item.imageFiles.length > 0) {
        const ts = item.file.replace(`_${item.mode}.json`, '')
        const imgs = item.imageFiles.map(f =>
          `<img src="${BACKEND}/history/${item.date}/${ts}_images/${f}" alt="${f}" />`
        ).join('')
        imagesHtml = `<div class="history-item-images">${imgs}</div>`
      }

      el.innerHTML = `
        <div class="history-item-header">
          <span class="history-item-mode${modeClass}">${item.mode}</span>
          <span class="history-item-time">${time}</span>
        </div>
        ${langInfo ? `<div class="history-item-lang">${langInfo}</div>` : ''}
        <div class="history-item-text">${escapeHtml(item.output)}</div>
        ${imagesHtml}
      `

      el.addEventListener('click', () => void openHistoryDetail(item.date, item.file))
      elHistoryList.appendChild(el)
    }
  } catch (err) {
    elHistoryList.innerHTML = `<div class="history-empty">Error loading history</div>`
    console.error('[History] Load failed:', err)
  }
}

interface HistoryItem {
  date: string
  file: string
  timestamp: string
  mode: string
  input: string
  output: string
  from?: string
  to?: string
  imageFiles?: string[]
}

async function openHistoryDetail(date: string, file: string): Promise<void> {
  try {
    const res = await fetch(`${BACKEND}/history/${date}/${file}`)
    const data = await res.json()

    const ts = file.replace(`_${data.mode}.json`, '')
    let imagesHtml = ''
    if (data.imageFiles && data.imageFiles.length > 0) {
      const imgs = data.imageFiles.map((f: string) =>
        `<img src="${BACKEND}/history/${date}/${ts}_images/${f}" alt="${f}" />`
      ).join('')
      imagesHtml = `<div class="detail-section"><div class="detail-label">Images</div><div class="detail-images">${imgs}</div></div>`
    }

    const time = data.timestamp ? new Date(data.timestamp).toLocaleString() : ''
    const langInfo = data.from && data.to ? `${data.from.toUpperCase()} \u2192 ${data.to.toUpperCase()}` : ''

    elHistoryList.innerHTML = `
      <div id="history-detail">
        <div id="history-detail-header">
          <button id="btn-history-back">\u2190</button>
          <span id="history-detail-title">${data.mode.toUpperCase()} ${langInfo} &mdash; ${time}</span>
        </div>
        <div id="history-detail-body">
          <div class="detail-section">
            <div class="detail-label">Input</div>
            <div class="detail-text">${escapeHtml(data.input || '')}</div>
          </div>
          <div class="detail-section">
            <div class="detail-label">Output</div>
            <div class="detail-text">${escapeHtml(data.output || '')}</div>
          </div>
          ${imagesHtml}
        </div>
      </div>
    `

    document.getElementById('btn-history-back')!.addEventListener('click', () => {
      void loadHistory()
      // Restore previous glasses state
      setState(state)
    })

    // Show on glasses display
    if (data.mode === 'comic' && data.imageFiles && data.imageFiles.length > 0) {
      // Load comic into playback
      const outputLines = (data.output || '').split('\n')
      comicScenes = []
      comicIndex = 0
      comicShowingImage = false
      comicTitle = data.input || 'Comic'
      mode = 'COMIC'

      // Parse narrations from output lines like "[1] narration text"
      for (let i = 0; i < data.imageFiles.length; i++) {
        const line = outputLines[i] || ''
        const narration = line.replace(/^\[\d+\]\s*/, '')
        // webImage URL for browser panel rendering
        const webImageUrl = `${BACKEND}/history/${date}/${ts}_images/${data.imageFiles[i]}`
        comicScenes.push({ narration, webImage: webImageUrl })
      }

      // Fetch glasses images in parallel
      const imgPromises = data.imageFiles.map(async (f: string, i: number) => {
        try {
          const r = await fetch(`${BACKEND}/history/${date}/${ts}_images/${f}/glasses`)
          const d = await r.json() as { glassesImage?: string }
          if (d.glassesImage && comicScenes[i]) {
            comicScenes[i].glassesImage = d.glassesImage
          }
        } catch { /* skip */ }
      })
      await Promise.all(imgPromises)

      // Close history overlay and start comic playback
      closeHistoryWithoutReset()
      renderComicPanels()
      setState('RESULT')
      await playComic()
    } else {
      // Text-based history (translate, chat)
      lastOriginalText = data.input || ''
      lastTranslatedText = data.output || ''
      glassesPage = 0
      comicShowingImage = false
      setState('RESULT')

      if (data.output) {
        const lang = data.to ? langCodeToTTS(data.to) : detectTTSLang(data.output)
        speakQueued(data.output, lang)
      }
    }

  } catch (err) {
    console.error('[History] Detail load failed:', err)
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function setupHistory(): void {
  elBtnOpenHistory.addEventListener('click', openHistory)
  elBtnHistoryClose.addEventListener('click', closeHistory)

  // Mode filter buttons
  document.querySelectorAll('.history-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-filter').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      historyModeFilter = (btn as HTMLElement).dataset.mode ?? ''
      void loadHistory()
    })
  })

  // Language filter
  elHistoryLangSelect.addEventListener('change', () => {
    historyLangFilter = elHistoryLangSelect.value
    void loadHistory()
  })
}

async function applyOutputDevice(deviceId: string): Promise<void> {
  if ('setSinkId' in ttsAudio) {
    try {
      await (ttsAudio as any).setSinkId(deviceId)
      console.log('[Audio] Output device applied:', deviceId)
    } catch (e) {
      console.error('[Audio] setSinkId error:', e)
    }
  }
}

function getSelectedInputDeviceId(): string | undefined {
  return elInputDeviceSelect.value || undefined
}

/** Play TTS via OpenAI TTS API through selected output device, with queue */
const ttsQueue: string[] = []
let ttsPlaying = false

function speakQueued(text: string, _lang: string): void {
  if (liveTtsMuted) return // Live mode TTS muted
  ttsQueue.push(text)
  if (!ttsPlaying) void drainTtsQueue()
}

async function drainTtsQueue(): Promise<void> {
  ttsPlaying = true
  while (ttsQueue.length > 0) {
    const text = ttsQueue.shift()!
    try {
      const res = await fetch(`${BACKEND}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speed: 1.3 }),
      })
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      await new Promise<void>((resolve) => {
        ttsAudio.src = objectUrl
        ttsAudio.onended = () => { URL.revokeObjectURL(objectUrl); resolve() }
        ttsAudio.onerror = () => { URL.revokeObjectURL(objectUrl); resolve() }
        void ttsAudio.play()
      })
    } catch (err) {
      console.error('[TTS] Error:', err)
    }
  }
  ttsPlaying = false
}

// ── Bridge init ─────────────────────────────────────────────────────

async function initBridge(): Promise<void> {
  try {
    bridge = await waitForEvenAppBridge()
    console.log('[G2] Bridge connected')
    bridge.onEvenHubEvent((event: EvenHubEvent) => handleGlassesEvent(event))
    await updateGlassesDisplay()
  } catch (err) {
    console.warn('[G2] Bridge not available (browser mode):', err)
  }
}

window.addEventListener('evenHubEvent', ((e: CustomEvent) => {
  handleGlassesEvent(evenHubEventFromJson(e.detail))
}) as EventListener)

// ── Auto-demo ──────────────────────────────────────────────────────

// ── TTS helper ─────────────────────────────────────────────────────

function findVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const langPrefix = lang.split('-')[0]
  // Prefer exact match, then prefix match
  return voices.find(v => v.lang === lang) ??
    voices.find(v => v.lang.startsWith(langPrefix + '-')) ??
    voices.find(v => v.lang.startsWith(langPrefix))
}

function speak(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    synth.cancel()

    const start = () => {
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = lang
      const voice = findVoice(lang)
      if (voice) utter.voice = voice
      utter.rate = 0.95
      utter.onend = () => resolve()
      utter.onerror = () => resolve()
      synth.speak(utter)
    }

    if (synth.speaking) {
      setTimeout(start, 200)
    } else {
      start()
    }
  })
}


function langCodeToTTS(code: string): string {
  const map: Record<string, string> = {
    cs: 'cs-CZ', en: 'en-US', de: 'de-DE', fr: 'fr-FR',
    es: 'es-ES', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN',
  }
  return map[code] ?? 'en-US'
}

function detectTTSLang(text: string): string {
  // Czech diacritics
  if (/[ěščřžýáíéúůďťňó]/i.test(text)) return 'cs-CZ'
  // German
  if (/[äöüß]/i.test(text)) return 'de-DE'
  // French
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(text)) return 'fr-FR'
  // Spanish
  if (/[ñ¿¡]/i.test(text)) return 'es-ES'
  // Korean
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return 'ko-KR'
  // Japanese (hiragana/katakana)
  if (/[\u3040-\u30ff]/.test(text)) return 'ja-JP'
  // Chinese (CJK without kana = Chinese)
  if (/[\u4e00-\u9fff]{2,}/.test(text)) return 'zh-CN'
  return 'en-US'
}

// ── Auto-demo ──────────────────────────────────────────────────────

async function runAutoDemo(): Promise<void> {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
  await wait(2000)

  // === TRANSLATE MODE ===
  mode = 'TRANSLATE'

  const translations = [
    { text: 'Excuse me, is this seat taken?', from: 'en', to: 'cs', si: 2, ti: 0 },
    { text: 'Kde je nejbližší stanice metra?', from: 'cs', to: 'en', si: 1, ti: 1 },
    { text: 'Je voudrais un café et un croissant, s\'il vous plaît.', from: 'fr', to: 'cs', si: 4, ti: 0 },
  ]

  for (const t of translations) {
    sourceIndex = t.si; targetIndex = t.ti
    setState('IDLE'); await wait(1000)

    // Simulate listening — speak the original text aloud
    setState('LISTENING')
    await speak(t.text, langCodeToTTS(t.from))
    await wait(1000)

    setState('TRANSLATING')
    try {
      const res = await fetch(`${BACKEND}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.text, from: t.from, to: t.to }),
      })
      const data = await res.json() as { original?: string; translated?: string }
      lastOriginalText = data.original ?? t.text
      lastTranslatedText = data.translated ?? ''
    } catch { lastOriginalText = t.text; lastTranslatedText = '(error)' }

    setState('RESULT')
    await wait(1000)
    // Speak the translation
    await speak(lastTranslatedText, langCodeToTTS(t.to))
    await wait(2500)
  }

  // === CHAT MODE ===
  mode = 'CHAT'
  setState('IDLE'); await wait(1500)

  const questions = [
    { q: 'What are 3 must-see places in Tokyo?', lang: 'en' },
    { q: 'Kolik je 1250 CZK v eurech?', lang: 'cs' },
    { q: 'How do you say cheers in Japanese?', lang: 'en' },
  ]

  for (const { q, lang } of questions) {
    // Speak the question
    setState('LISTENING')
    await speak(q, langCodeToTTS(lang))
    await wait(1000)

    lastOriginalText = q
    setState('TRANSLATING')
    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      })
      const data = await res.json() as { response?: string }
      lastTranslatedText = data.response ?? ''
    } catch { lastTranslatedText = '(error)' }

    setState('RESULT')
    await wait(1000)
    // Speak the AI response
    await speak(lastTranslatedText, langCodeToTTS(lang))
    await wait(2500)
  }

  // Back to idle
  mode = 'TRANSLATE'
  setState('IDLE')
  console.log('[G2] Auto-demo finished')
}

// ── Polyglot demo ──────────────────────────────────────────────────

async function runPolyglotDemo(): Promise<void> {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
  const original = 'Jmenuji se Leoš a jsem AI developer.'

  const targets = [
    { code: 'en', label: 'EN', ti: 1 },
    { code: 'de', label: 'DE', ti: 2 },
    { code: 'fr', label: 'FR', ti: 3 },
    { code: 'es', label: 'ES', ti: 4 },
    { code: 'ja', label: 'JA', ti: 5 },
    { code: 'ko', label: 'KO', ti: 6 },
    { code: 'zh', label: 'ZH', ti: 7 },
  ]

  mode = 'TRANSLATE'
  sourceIndex = 1 // CS

  await wait(1500)

  // First speak the original in Czech
  lastOriginalText = original
  lastTranslatedText = original
  targetIndex = 0 // CS
  setState('RESULT')
  await speak(original, 'cs-CZ')
  await wait(1500)

  for (const t of targets) {
    targetIndex = t.ti
    setState('TRANSLATING')
    await wait(500)

    try {
      const res = await fetch(`${BACKEND}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: original, from: 'cs', to: t.code }),
      })
      const data = await res.json() as { original?: string; translated?: string }
      lastOriginalText = original
      lastTranslatedText = data.translated ?? ''
    } catch {
      lastOriginalText = original
      lastTranslatedText = '(error)'
    }

    setState('RESULT')
    await wait(500)
    await speak(lastTranslatedText, langCodeToTTS(t.code))
    await wait(2000)
  }

  setState('IDLE')
  console.log('[G2] Polyglot demo finished')
}

// ── Boot ────────────────────────────────────────────────────────────

function main(): void {
  updateWebUI()
  setupKeyboardShortcuts()
  setupWebControls()
  setupMediaSession()
  setupHistory()
  void loadComicStyles()
  void initBridge()
}

main()
