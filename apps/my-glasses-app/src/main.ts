import './style.css'
import {
  waitForEvenAppBridge,
  evenHubEventFromJson,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  OsEventTypeList,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'

// G2 display: 576x288 per eye, 4-bit greyscale
const DISPLAY_W = 576
const DISPLAY_H = 288

type TextPage = { title: string; body: string }
type ListPage = { title: string; items: string[] }
type Page = TextPage | ListPage

const pages: Page[] = [
  { title: 'Hello G2!', body: 'Swipe to navigate.\nClick for details.\nDouble-click to exit.' },
  { title: 'Device Info', body: 'Loading...' },
  { title: 'Menu', items: ['Option A', 'Option B', 'Option C', 'Back'] },
]

let currentPage = 0
let bridge: EvenAppBridge

function isListPage(page: Page): page is ListPage {
  return 'items' in page
}

async function showTextPage(title: string, body: string, rebuild = false) {
  const header = new TextContainerProperty({
    xPosition: 0, yPosition: 0,
    width: DISPLAY_W, height: 40,
    borderWidth: 0, borderColor: 5,
    paddingLength: 4,
    containerID: 1, containerName: 'header',
    content: title,
    isEventCapture: 0,
  })

  const content = new TextContainerProperty({
    xPosition: 0, yPosition: 48,
    width: DISPLAY_W, height: DISPLAY_H - 48,
    borderWidth: 0, borderColor: 3,
    paddingLength: 4,
    containerID: 2, containerName: 'content',
    content: body,
    isEventCapture: 1,
  })

  if (rebuild) {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({ containerTotalNum: 2, textObject: [header, content] })
    )
  } else {
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: 2, textObject: [header, content] })
    )
  }
}

async function showListPage(title: string, items: string[]) {
  const header = new TextContainerProperty({
    xPosition: 0, yPosition: 0,
    width: DISPLAY_W, height: 40,
    borderWidth: 0, borderColor: 5,
    paddingLength: 4,
    containerID: 1, containerName: 'header',
    content: title,
    isEventCapture: 0,
  })

  const list = new ListContainerProperty({
    xPosition: 0, yPosition: 48,
    width: DISPLAY_W, height: DISPLAY_H - 48,
    borderWidth: 0, borderColor: 3,
    paddingLength: 4,
    containerID: 3, containerName: 'menu',
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: DISPLAY_W - 8,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  })

  await bridge.rebuildPageContainer(
    new RebuildPageContainer({ containerTotalNum: 2, textObject: [header], listObject: [list] })
  )
}

async function showPage(index: number, rebuild = true) {
  const page = pages[index]
  if (isListPage(page)) {
    await showListPage(page.title, page.items)
  } else {
    await showTextPage(page.title, page.body, rebuild)
  }
  updateWebUI()
}

async function loadDeviceInfo() {
  try {
    const info = await bridge.getDeviceInfo()
    const user = await bridge.getUserInfo()
    const target = pages[1] as TextPage
    target.body = [
      `Model: ${info?.model ?? 'G2'}`,
      `SN: ${info?.sn ?? 'N/A'}`,
      `Battery: ${info?.status?.batteryLevel ?? 'N/A'}%`,
      `User: ${user.name ?? 'Unknown'}`,
      `Country: ${user.country ?? 'N/A'}`,
    ].join('\n')
  } catch {
    (pages[1] as TextPage).body = 'Device info unavailable\n(running in simulator)'
  }
}

function handleEvent(event: EvenHubEvent) {
  // sysEvent contains OS-level gestures (click, scroll, double-click)
  if (event.sysEvent) {
    const osType = event.sysEvent.eventType

    switch (osType) {
      case OsEventTypeList.SCROLL_BOTTOM_EVENT:
        currentPage = (currentPage + 1) % pages.length
        showPage(currentPage)
        break
      case OsEventTypeList.SCROLL_TOP_EVENT:
        currentPage = (currentPage - 1 + pages.length) % pages.length
        showPage(currentPage)
        break
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        bridge.shutDownPageContainer(0)
        break
      case OsEventTypeList.CLICK_EVENT:
        showPage(currentPage)
        break
    }
  }
}

function updateWebUI() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const page = pages[currentPage]

  app.textContent = ''

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'max-width: 600px; margin: 0 auto; padding: 1rem;'

  const titleBar = document.createElement('h2')
  titleBar.textContent = 'Even Realities G2 — Demo App'
  titleBar.style.cssText = 'color: #0f0; background: #111; padding: 8px 16px; border-radius: 4px;'
  wrapper.appendChild(titleBar)

  const display = document.createElement('div')
  display.style.cssText = 'background: #000; color: #0f0; padding: 24px; border-radius: 8px; min-height: 200px; border: 2px solid #0f0; margin-top: 12px;'

  const meta = document.createElement('div')
  meta.textContent = `576 x 288 — Page ${currentPage + 1}/${pages.length}`
  meta.style.cssText = 'font-size: 11px; opacity: 0.5; margin-bottom: 8px;'
  display.appendChild(meta)

  const heading = document.createElement('h3')
  heading.textContent = page.title
  heading.style.cssText = 'margin: 0 0 12px 0;'
  display.appendChild(heading)

  if (isListPage(page)) {
    const ul = document.createElement('ul')
    ul.style.cssText = 'list-style: none; padding: 0;'
    for (const item of page.items) {
      const li = document.createElement('li')
      li.textContent = item
      li.style.cssText = 'padding: 4px 8px; border: 1px solid #0f03; margin: 2px 0;'
      ul.appendChild(li)
    }
    display.appendChild(ul)
  } else {
    const pre = document.createElement('pre')
    pre.textContent = page.body
    pre.style.cssText = 'margin: 0; white-space: pre-wrap;'
    display.appendChild(pre)
  }

  wrapper.appendChild(display)

  const help = document.createElement('div')
  help.textContent = 'Swipe Up/Down = navigate pages | Click = refresh | Double-click = exit'
  help.style.cssText = 'margin-top: 12px; color: #666; font-size: 13px;'
  wrapper.appendChild(help)

  app.appendChild(wrapper)
}

function navigatePage(direction: 'up' | 'down') {
  if (direction === 'down') {
    currentPage = (currentPage + 1) % pages.length
  } else {
    currentPage = (currentPage - 1 + pages.length) % pages.length
  }
  if (bridge) showPage(currentPage)
  else updateWebUI()
}

async function main() {
  updateWebUI()

  // Listen for simulator custom events on window (works even without bridge)
  window.addEventListener('evenHubEvent', ((e: CustomEvent) => {
    console.log('evenHubEvent (window):', e.detail)
    if (e.detail) {
      handleEvent(evenHubEventFromJson(e.detail))
    }
  }) as EventListener)

  // Keyboard fallback for testing in browser
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': navigatePage('down'); break
      case 'ArrowUp': navigatePage('up'); break
    }
  })

  try {
    bridge = await waitForEvenAppBridge()
    console.log('Bridge connected!')

    await loadDeviceInfo()
    await showPage(0, false)

    bridge.onEvenHubEvent(handleEvent)

    bridge.onDeviceStatusChanged((status) => {
      console.log('Device status:', status.connectType, 'Battery:', status.batteryLevel)
    })

  } catch (e) {
    console.warn('Bridge not available (simulator or standalone mode):', e)
  }
}

main()
