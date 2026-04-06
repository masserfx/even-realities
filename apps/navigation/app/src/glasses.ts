// glasses.ts — Glasses display formatting for navigation

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import {
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  CreateStartUpPageContainer,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'
import type { RouteStep } from './navigation.ts'
import { formatDistance, formatDuration } from './navigation.ts'

function formatTime(): string {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

// ── Page type ──────────────────────────────────────────────────────────

export interface GlassesNavPage {
  step: RouteStep
  distanceToStep: number    // metres to next waypoint
  remainingDuration: number // seconds to destination
  totalDistance: number     // total route distance in metres
  profile: string           // 'walking' | 'cycling'
}

// ── SDK integration ───────────────────────────────────────────────────

let isFirstDisplay = true

// Layout (576×288 display):
//  Row 0:   [0,0,576,32]   header — profile · time · distance · ETA
//  TL:      [0,32,144,144] turn arrow image (ID 11)
//  TR-text: [148,32,140,144] street name + distance to maneuver (ID 2)
//  Map:     [288,72,288,144] map image (ID 10)

export async function displayNavStep(
  bridge: EvenAppBridge,
  page: GlassesNavPage,
  mapImageBase64: string | null,
  turnArrowBase64: string | null,
): Promise<void> {
  const { step, distanceToStep, remainingDuration, totalDistance, profile } = page

  const profileText = profile === 'walking' ? 'PĚŠÍ' : 'CYKLO'
  const headerContent =
    `${profileText}   ${formatTime()}   ${formatDistance(totalDistance)}   ${formatDuration(remainingDuration)}`

  const streetLine = step.streetName || step.instruction
  const navContent = `${streetLine}\n\nza ${formatDistance(distanceToStep)}`

  const textContainers = [
    new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 32,
      borderWidth: 0, borderColor: 0, paddingLength: 4,
      containerID: 1, containerName: 'nav-header',
      content: headerContent,
      isEventCapture: 0,
    }),
    new TextContainerProperty({
      xPosition: 148, yPosition: 32, width: 140, height: 144,
      borderWidth: 0, borderColor: 0, paddingLength: 8,
      containerID: 2, containerName: 'nav-text',
      content: navContent,
      isEventCapture: 1,
    }),
  ]

  const imageContainers = [
    new ImageContainerProperty({
      xPosition: 0, yPosition: 32, width: 144, height: 144,
      containerID: 11, containerName: 'nav-arrow',
    }),
    new ImageContainerProperty({
      xPosition: 288, yPosition: 72, width: 288, height: 144,
      containerID: 10, containerName: 'nav-map',
    }),
  ]

  const totalNum = textContainers.length + imageContainers.length

  if (isFirstDisplay) {
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: totalNum,
        textObject: textContainers,
        imageObject: imageContainers,
      })
    )
    isFirstDisplay = false
  } else {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: totalNum,
        textObject: textContainers,
        imageObject: imageContainers,
      })
    )
  }

  if (turnArrowBase64 !== null) {
    await bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: 11,
        containerName: 'nav-arrow',
        imageData: Array.from(Uint8Array.from(atob(turnArrowBase64), c => c.charCodeAt(0))),
      })
    )
  }

  if (mapImageBase64 !== null) {
    await bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: 10,
        containerName: 'nav-map',
        imageData: Array.from(Uint8Array.from(atob(mapImageBase64), c => c.charCodeAt(0))),
      })
    )
  }
}

export async function displayArrived(bridge: EvenAppBridge): Promise<void> {
  const textContainers = [
    new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 288,
      borderWidth: 0, borderColor: 0, paddingLength: 10,
      containerID: 1, containerName: 'arrived',
      content: 'Jsi v cili!',
      isEventCapture: 0,
    }),
  ]
  await bridge.rebuildPageContainer(
    new RebuildPageContainer({ containerTotalNum: 1, textObject: textContainers })
  )
  isFirstDisplay = false
}

export async function displayIdle(bridge: EvenAppBridge, message: string): Promise<void> {
  const textContainers = [
    new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 288,
      borderWidth: 0, borderColor: 0, paddingLength: 10,
      containerID: 1, containerName: 'idle',
      content: `Navigace\n\n${message}`,
      isEventCapture: 0,
    }),
  ]
  if (isFirstDisplay) {
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: textContainers })
    )
    isFirstDisplay = false
  } else {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({ containerTotalNum: 1, textObject: textContainers })
    )
  }
}

export function resetGlassesState(): void {
  isFirstDisplay = true
}
