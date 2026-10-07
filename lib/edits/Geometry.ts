import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  MIN_ELEMENT_SIZE,
  type Slide,
} from "@/lib/schema/Deck"

export type Box = { x: number; y: number; w: number; h: number }

const FREE_SPOT_GRID_STEP = 40

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function clampBox(box: Box): Box {
  let w = Math.max(box.w, MIN_ELEMENT_SIZE)
  let h = Math.max(box.h, MIN_ELEMENT_SIZE)

  const shrinkToFitArtboard = Math.min(
    1,
    ARTBOARD_WIDTH / w,
    ARTBOARD_HEIGHT / h
  )
  w = Math.round(w * shrinkToFitArtboard)
  h = Math.round(h * shrinkToFitArtboard)

  return {
    x: Math.round(clamp(box.x, 0, ARTBOARD_WIDTH - w)),
    y: Math.round(clamp(box.y, 0, ARTBOARD_HEIGHT - h)),
    w,
    h,
  }
}

export function boxesOverlap(a: Box, b: Box) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  )
}

// Nearest spot of the same size that covers no other element. Falls back
// to the requested (clamped) box when the slide has no room for it.
export function findFreeSpot(
  slide: Slide,
  box: Box,
  ignoreElementId?: string
): Box {
  const requestedBox = clampBox(box)
  const isFree = (candidate: Box) =>
    overlappingElementIds(slide, candidate, ignoreElementId).length === 0

  if (isFree(requestedBox)) return requestedBox

  const candidates: Box[] = []
  for (
    let y = 0;
    y + requestedBox.h <= ARTBOARD_HEIGHT;
    y += FREE_SPOT_GRID_STEP
  ) {
    for (
      let x = 0;
      x + requestedBox.w <= ARTBOARD_WIDTH;
      x += FREE_SPOT_GRID_STEP
    ) {
      candidates.push({ ...requestedBox, x, y })
    }
  }

  const distanceFromRequested = (candidate: Box) =>
    Math.hypot(candidate.x - requestedBox.x, candidate.y - requestedBox.y)

  const nearestFreeSpot = candidates
    .filter(isFree)
    .sort((a, b) => distanceFromRequested(a) - distanceFromRequested(b))[0]

  return nearestFreeSpot ?? requestedBox
}

export function overlappingElementIds(
  slide: Slide,
  box: Box,
  ignoreElementId?: string
) {
  return slide.elements
    .filter((element) => element.id !== ignoreElementId)
    .filter((element) => boxesOverlap(box, element))
    .map((element) => element.id)
}

// Sizes tried, in order, when the requested size has no free spot.
const SHRINK_SCALES = [1, 0.75, 0.5]

// Where the agent's new or changed element goes: the requested box if it
// is free, else the nearest free spot, else the same shape smaller. When
// nothing fits, the box is kept and the elements it covers are reported.
export function placeWithoutOverlap(
  slide: Slide,
  box: Box,
  ignoreElementId?: string
): { box: Box; overlapsWith: string[] } {
  for (const scale of SHRINK_SCALES) {
    const scaledBox = { ...box, w: box.w * scale, h: box.h * scale }
    const spot = findFreeSpot(slide, scaledBox, ignoreElementId)
    if (overlappingElementIds(slide, spot, ignoreElementId).length === 0) {
      return { box: spot, overlapsWith: [] }
    }
  }
  const keptBox = clampBox(box)
  return {
    box: keptBox,
    overlapsWith: overlappingElementIds(slide, keptBox, ignoreElementId),
  }
}

// Text sizes, matching how TextElement renders: `leading-tight` lines,
// list items indented 1.25em with a 0.4em gap after each.
const LINE_HEIGHT = 1.25
const AVERAGE_CHARACTER_WIDTH = 0.52
// Words wrap before the line is full, so lines hold a bit less than the
// average width suggests.
const WORD_WRAP_ALLOWANCE = 0.9
const LIST_INDENT = 1.25
const LIST_ITEM_GAP = 0.4

// A close estimate of a text box's rendered height, for placing text
// before the browser has laid it out.
export function estimateTextHeight(
  paragraphs: string[],
  fontSize: number,
  width: number,
  listStyle: "none" | "bullet" | "number"
) {
  const isList = listStyle !== "none"
  const textWidth = width - (isList ? LIST_INDENT * fontSize : 0)
  const charactersPerLine = Math.max(
    1,
    Math.floor(
      (textWidth / (AVERAGE_CHARACTER_WIDTH * fontSize)) * WORD_WRAP_ALLOWANCE
    )
  )
  const lineCount = paragraphs.reduce(
    (total, paragraph) =>
      total + Math.max(1, Math.ceil(paragraph.length / charactersPerLine)),
    0
  )
  const listGaps = isList ? paragraphs.length * LIST_ITEM_GAP * fontSize : 0
  return Math.ceil(lineCount * LINE_HEIGHT * fontSize + listGaps)
}

export type Corner = "nw" | "ne" | "sw" | "se"

export type SnapGuide = {
  orientation: "vertical" | "horizontal"
  position: number
}

// Drags one corner while the opposite corner stays put.
export function resizeBox(
  startBox: Box,
  corner: Corner,
  deltaX: number,
  deltaY: number,
  options: { keepRatio: boolean; widthOnly: boolean }
): Box {
  const movesLeftEdge = corner === "nw" || corner === "sw"
  const movesTopEdge = corner === "nw" || corner === "ne"

  let width = startBox.w + (movesLeftEdge ? -deltaX : deltaX)
  let height = startBox.h + (movesTopEdge ? -deltaY : deltaY)

  if (options.widthOnly) {
    width = Math.max(width, MIN_ELEMENT_SIZE)
    height = startBox.h
  } else if (options.keepRatio) {
    const scale = Math.max(
      width / startBox.w,
      height / startBox.h,
      MIN_ELEMENT_SIZE / startBox.w,
      MIN_ELEMENT_SIZE / startBox.h
    )
    width = startBox.w * scale
    height = startBox.h * scale
  } else {
    width = Math.max(width, MIN_ELEMENT_SIZE)
    height = Math.max(height, MIN_ELEMENT_SIZE)
  }

  return {
    x: movesLeftEdge ? startBox.x + startBox.w - width : startBox.x,
    y: movesTopEdge ? startBox.y + startBox.h - height : startBox.y,
    w: width,
    h: height,
  }
}

// The start, middle and end of a box along one axis.
function alignmentLines(start: number, size: number) {
  return [start, start + size / 2, start + size]
}

function findClosestSnap(
  movingLines: number[],
  targetLines: number[],
  threshold: number
) {
  let closest: { offset: number; position: number } | null = null
  for (const movingLine of movingLines) {
    for (const targetLine of targetLines) {
      const offset = targetLine - movingLine
      const isCloser = !closest || Math.abs(offset) < Math.abs(closest.offset)
      if (Math.abs(offset) <= threshold && isCloser) {
        closest = { offset, position: targetLine }
      }
    }
  }
  return closest
}

// Lines a moving box up with the edges and centers of the targets.
export function snapBox(
  box: Box,
  snapTargets: Box[],
  threshold: number
): { box: Box; guides: SnapGuide[] } {
  const verticalTargetLines = snapTargets.flatMap((target) =>
    alignmentLines(target.x, target.w)
  )
  const horizontalTargetLines = snapTargets.flatMap((target) =>
    alignmentLines(target.y, target.h)
  )
  const xSnap = findClosestSnap(
    alignmentLines(box.x, box.w),
    verticalTargetLines,
    threshold
  )
  const ySnap = findClosestSnap(
    alignmentLines(box.y, box.h),
    horizontalTargetLines,
    threshold
  )

  const guides: SnapGuide[] = []
  if (xSnap) guides.push({ orientation: "vertical", position: xSnap.position })
  if (ySnap)
    guides.push({ orientation: "horizontal", position: ySnap.position })

  return {
    box: {
      ...box,
      x: box.x + (xSnap?.offset ?? 0),
      y: box.y + (ySnap?.offset ?? 0),
    },
    guides,
  }
}

// Snaps only the edges that the dragged corner moves.
export function snapResizedEdges(
  box: Box,
  corner: Corner,
  snapTargets: Box[],
  threshold: number,
  options: { snapHeight: boolean }
): { box: Box; guides: SnapGuide[] } {
  const movesLeftEdge = corner === "nw" || corner === "sw"
  const movesTopEdge = corner === "nw" || corner === "ne"
  const snappedBox = { ...box }
  const guides: SnapGuide[] = []

  const movingX = movesLeftEdge ? box.x : box.x + box.w
  const xSnap = findClosestSnap(
    [movingX],
    snapTargets.flatMap((target) => alignmentLines(target.x, target.w)),
    threshold
  )
  const widthAfterSnap = box.w + (movesLeftEdge ? -1 : 1) * (xSnap?.offset ?? 0)
  if (xSnap && widthAfterSnap >= MIN_ELEMENT_SIZE) {
    if (movesLeftEdge) snappedBox.x += xSnap.offset
    snappedBox.w = widthAfterSnap
    guides.push({ orientation: "vertical", position: xSnap.position })
  }

  if (!options.snapHeight) return { box: snappedBox, guides }

  const movingY = movesTopEdge ? box.y : box.y + box.h
  const ySnap = findClosestSnap(
    [movingY],
    snapTargets.flatMap((target) => alignmentLines(target.y, target.h)),
    threshold
  )
  const heightAfterSnap = box.h + (movesTopEdge ? -1 : 1) * (ySnap?.offset ?? 0)
  if (ySnap && heightAfterSnap >= MIN_ELEMENT_SIZE) {
    if (movesTopEdge) snappedBox.y += ySnap.offset
    snappedBox.h = heightAfterSnap
    guides.push({ orientation: "horizontal", position: ySnap.position })
  }

  return { box: snappedBox, guides }
}

// The smallest box that contains all the given boxes.
export function unionBox(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...boxes.map((box) => box.y + box.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}
