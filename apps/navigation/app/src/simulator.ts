// simulator.ts — Browser-based G2 glasses display simulator
// Used when physical hardware is not available (waitForEvenAppBridge fails)

import type {
  EvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  ImageRawDataUpdate,
  EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import {
  StartUpPageCreateResult,
  ImageRawDataUpdateResult,
} from '@evenrealities/even_hub_sdk'

// ── DOM setup ─────────────────────────────────────────────────────────

function createSimulatorUI(): { screen: HTMLElement } {
  document.getElementById('gsim-wrap')?.remove()

  const wrap = document.createElement('div')
  wrap.id = 'gsim-wrap'
  Object.assign(wrap.style, {
    position: 'fixed',
    bottom: 'env(safe-area-inset-bottom, 0px)',
    left: '0',
    right: '0',
    zIndex: '9999',
    background: '#0a0a0a',
    borderTop: '2px solid #00cc00',
    fontFamily: 'monospace',
    // Lift above iOS Safari bottom browser bar
    marginBottom: '0',
    paddingBottom: '4px',
  })

  // Header
  const header = document.createElement('div')
  Object.assign(header.style, { display: 'flex', alignItems: 'center', padding: '4px 8px', gap: '8px' })

  const label = document.createElement('span')
  label.textContent = '▣ G2 Glasses Simulator'
  Object.assign(label.style, { color: '#00cc00', fontSize: '11px', flex: '1' })

  const toggle = document.createElement('button')
  toggle.textContent = 'Skrýt'
  Object.assign(toggle.style, {
    background: 'transparent', border: '1px solid #005500', color: '#00aa00',
    fontSize: '10px', padding: '2px 8px', cursor: 'pointer', borderRadius: '4px',
  })
  header.appendChild(label)
  header.appendChild(toggle)

  // Scale screen to fit device width
  const DISPLAY_W = 576, DISPLAY_H = 288
  const scale = Math.min(1, (window.innerWidth - 8) / DISPLAY_W)

  const screenWrap = document.createElement('div')
  Object.assign(screenWrap.style, {
    width: Math.round(DISPLAY_W * scale) + 'px',
    height: Math.round(DISPLAY_H * scale) + 'px',
    overflow: 'hidden',
    margin: '0 auto',
  })

  const screen = document.createElement('div')
  screen.id = 'gsim-screen'
  Object.assign(screen.style, {
    position: 'relative',
    width: DISPLAY_W + 'px',
    height: DISPLAY_H + 'px',
    background: '#000',
    overflow: 'hidden',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  })

  screenWrap.appendChild(screen)
  wrap.appendChild(header)
  wrap.appendChild(screenWrap)

  // Insert above #bottom-bar so iOS Safari browser chrome doesn't hide it
  const bottomBar = document.getElementById('bottom-bar')
  if (bottomBar) {
    bottomBar.parentElement!.insertBefore(wrap, bottomBar)
  } else {
    document.body.appendChild(wrap)
  }

  // Push nav card up so it doesn't overlap simulator
  const simHeight = Math.round(DISPLAY_H * scale) + 32
  const navCard = document.getElementById('nav-card')
  if (navCard) {
    const prev = navCard.style.bottom || 'calc(env(safe-area-inset-bottom, 0px) + 64px)'
    navCard.dataset['origBottom'] = prev
    navCard.style.bottom = `calc(${simHeight}px + 8px)`
  }

  let visible = true
  toggle.addEventListener('click', () => {
    visible = !visible
    screenWrap.style.display = visible ? 'block' : 'none'
    toggle.textContent = visible ? 'Skrýt' : 'Zobrazit'
    if (navCard) {
      navCard.style.bottom = visible
        ? `calc(${simHeight}px + 8px)`
        : (navCard.dataset['origBottom'] ?? '64px')
    }
  })

  return { screen }
}

// ── Rendering ─────────────────────────────────────────────────────────

type TContainer = {
  xPosition?: number; yPosition?: number; width?: number; height?: number
  paddingLength?: number; content?: string; containerID?: number
}
type IContainer = {
  xPosition?: number; yPosition?: number; width?: number; height?: number
  containerID?: number
}

function clearChildren(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

function renderPage(screen: HTMLElement, texts: TContainer[], images: IContainer[]): void {
  clearChildren(screen)

  for (const t of texts) {
    const div = document.createElement('div')
    Object.assign(div.style, {
      position: 'absolute',
      left: (t.xPosition ?? 0) + 'px',
      top: (t.yPosition ?? 0) + 'px',
      width: (t.width ?? 200) + 'px',
      height: (t.height ?? 40) + 'px',
      padding: (t.paddingLength ?? 4) + 'px',
      boxSizing: 'border-box',
      color: '#00ff00',
      fontFamily: 'monospace',
      fontSize: '13px',
      lineHeight: '1.35',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden',
    })
    div.textContent = t.content ?? ''
    screen.appendChild(div)
  }

  for (const img of images) {
    const el = document.createElement('img')
    el.id = `gsim-img-${img.containerID ?? 0}`
    Object.assign(el.style, {
      position: 'absolute',
      left: (img.xPosition ?? 0) + 'px',
      top: (img.yPosition ?? 0) + 'px',
      width: (img.width ?? 288) + 'px',
      height: (img.height ?? 144) + 'px',
      imageRendering: 'pixelated',
      // Tint grayscale PNG to approximate glasses green phosphor
      filter: 'sepia(1) saturate(8) hue-rotate(60deg)',
    })
    screen.appendChild(el)
  }
}

// ── Simulated bridge ──────────────────────────────────────────────────

export class GlassesSimulator {
  private screen: HTMLElement

  constructor() {
    const { screen } = createSimulatorUI()
    this.screen = screen
  }

  async createStartUpPageContainer(
    c: CreateStartUpPageContainer
  ): Promise<StartUpPageCreateResult> {
    renderPage(this.screen, (c.textObject ?? []) as TContainer[], (c.imageObject ?? []) as IContainer[])
    return StartUpPageCreateResult.success
  }

  async rebuildPageContainer(c: RebuildPageContainer): Promise<boolean> {
    renderPage(this.screen, (c.textObject ?? []) as TContainer[], (c.imageObject ?? []) as IContainer[])
    return true
  }

  async updateImageRawData(data: ImageRawDataUpdate): Promise<ImageRawDataUpdateResult> {
    const el = document.getElementById(`gsim-img-${data.containerID ?? 0}`) as HTMLImageElement | null
    if (!el || !data.imageData) return ImageRawDataUpdateResult.success

    const raw = data.imageData
    const arr = Array.isArray(raw)
      ? new Uint8Array(raw as number[])
      : raw instanceof Uint8Array ? raw
        : raw instanceof ArrayBuffer ? new Uint8Array(raw)
          : new Uint8Array(0)

    if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src)
    el.src = URL.createObjectURL(new Blob([arr.buffer as ArrayBuffer], { type: 'image/png' }))
    return ImageRawDataUpdateResult.success
  }

  async imuControl(_open: boolean, _pace?: unknown): Promise<boolean> { return true }
  onEvenHubEvent(_cb: (e: EvenHubEvent) => void): () => void { return () => {} }
}

export function createSimulatedBridge(): EvenAppBridge {
  return new GlassesSimulator() as unknown as EvenAppBridge
}
