import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  MIN_ELEMENT_SIZE,
  type Slide,
} from "@/lib/schema/deck"

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

function boxesOverlap(a: Box, b: Box) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  )
}

export function findFreeSpot(slide: Slide, box: Box): Box {
  const requestedBox = clampBox(box)
  const isFree = (candidate: Box) =>
    slide.elements.every((element) => !boxesOverlap(candidate, element))

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
