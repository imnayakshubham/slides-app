import { z } from "zod"

import { clampBox, findFreeSpot } from "@/lib/ops/geometry"
import {
  slideElementSchema,
  slideSchema,
  type Deck,
  type ElementChanges,
  type Slide,
  type SlideElement,
} from "@/lib/schema/deck"

export type DeckOp =
  | { type: "updateDeck"; changes: { title?: string } }
  | { type: "addSlide"; slide: Slide; index?: number }
  | {
      type: "updateSlide"
      slideId: string
      changes: Partial<Pick<Slide, "title" | "layout" | "background" | "notes">>
    }
  | { type: "deleteSlide"; slideId: string }
  | { type: "moveSlide"; slideId: string; toIndex: number }
  | { type: "addElement"; slideId: string; element: SlideElement }
  | { type: "updateElement"; elementId: string; changes: ElementChanges }
  | { type: "deleteElement"; elementId: string }
  | {
      type: "moveElement"
      elementId: string
      toSlideId: string
      x?: number
      y?: number
    }
  | {
      type: "reorderElement"
      elementId: string
      direction: "forward" | "backward" | "front" | "back"
    }
  | { type: "batch"; ops: DeckOp[] }

export type ApplyOpResult =
  { ok: true; deck: Deck } | { ok: false; error: string }

// Pure: never mutates `deck`, never throws. Unchanged slides and elements keep
// their references so undo snapshots stay cheap and untouched UI does not re-render.
export function applyOp(deck: Deck, op: DeckOp): ApplyOpResult {
  switch (op.type) {
    case "updateDeck":
      return succeed({ ...deck, ...op.changes })

    case "addSlide": {
      const parsedSlide = slideSchema.safeParse(op.slide)
      if (!parsedSlide.success) {
        return fail(
          `Slide "${op.slide.id}" is invalid: ${z.prettifyError(parsedSlide.error)}`
        )
      }
      const duplicateId = findDuplicateId(deck, [
        op.slide.id,
        ...op.slide.elements.map((element) => element.id),
      ])
      if (duplicateId)
        return fail(
          `Id "${duplicateId}" is already used in this deck. Use a new id.`
        )

      const insertIndex = clampIndex(
        op.index ?? deck.slides.length,
        deck.slides.length
      )
      return succeed({
        ...deck,
        slides: insertAt(deck.slides, insertIndex, parsedSlide.data),
      })
    }

    case "updateSlide": {
      const slide = findSlide(deck, op.slideId)
      if (!slide) return fail(slideNotFoundMessage(deck, op.slideId))

      const parsedSlide = slideSchema.safeParse({ ...slide, ...op.changes })
      if (!parsedSlide.success) {
        return fail(
          `Slide "${op.slideId}" update is invalid: ${z.prettifyError(parsedSlide.error)}`
        )
      }
      return succeed(mapSlide(deck, op.slideId, () => parsedSlide.data))
    }

    case "deleteSlide": {
      if (!findSlide(deck, op.slideId))
        return fail(slideNotFoundMessage(deck, op.slideId))
      return succeed({
        ...deck,
        slides: deck.slides.filter((slide) => slide.id !== op.slideId),
      })
    }

    case "moveSlide": {
      const fromIndex = deck.slides.findIndex(
        (slide) => slide.id === op.slideId
      )
      if (fromIndex === -1) return fail(slideNotFoundMessage(deck, op.slideId))

      const toIndex = clampIndex(op.toIndex, deck.slides.length - 1)
      return succeed({
        ...deck,
        slides: moveItem(deck.slides, fromIndex, toIndex),
      })
    }

    case "addElement": {
      if (!findSlide(deck, op.slideId))
        return fail(slideNotFoundMessage(deck, op.slideId))
      if (findDuplicateId(deck, [op.element.id])) {
        return fail(
          `Id "${op.element.id}" is already used in this deck. Use a new id.`
        )
      }

      const placed = placeElement(op.element)
      if (!placed.ok) return placed
      return succeed(
        mapSlide(deck, op.slideId, (slide) => ({
          ...slide,
          elements: [...slide.elements, placed.element],
        }))
      )
    }

    case "updateElement": {
      const location = findElementLocation(deck, op.elementId)
      if (!location) return fail(elementNotFoundMessage(op.elementId))

      const { slide, element } = location
      const placed = placeElement({
        ...element,
        ...op.changes,
        id: element.id,
        type: element.type,
      } as SlideElement)
      if (!placed.ok) return placed
      return succeed(
        mapSlide(deck, slide.id, (currentSlide) =>
          mapElement(currentSlide, element.id, () => placed.element)
        )
      )
    }

    case "deleteElement": {
      const location = findElementLocation(deck, op.elementId)
      if (!location) return fail(elementNotFoundMessage(op.elementId))

      return succeed(
        mapSlide(deck, location.slide.id, (slide) => ({
          ...slide,
          elements: slide.elements.filter(
            (element) => element.id !== op.elementId
          ),
        }))
      )
    }

    case "moveElement": {
      const location = findElementLocation(deck, op.elementId)
      if (!location) return fail(elementNotFoundMessage(op.elementId))
      const targetSlide = findSlide(deck, op.toSlideId)
      if (!targetSlide) return fail(slideNotFoundMessage(deck, op.toSlideId))

      const { slide: sourceSlide, element } = location
      const requestedBox = {
        x: op.x ?? element.x,
        y: op.y ?? element.y,
        w: element.w,
        h: element.h,
      }

      if (sourceSlide.id === targetSlide.id) {
        return applyOp(deck, {
          type: "updateElement",
          elementId: element.id,
          changes: { x: requestedBox.x, y: requestedBox.y },
        })
      }

      const movedElement = {
        ...element,
        ...findFreeSpot(targetSlide, requestedBox),
      }
      const deckWithoutElement = mapSlide(deck, sourceSlide.id, (slide) => ({
        ...slide,
        elements: slide.elements.filter(
          (candidate) => candidate.id !== element.id
        ),
      }))
      return succeed(
        mapSlide(deckWithoutElement, targetSlide.id, (slide) => ({
          ...slide,
          elements: [...slide.elements, movedElement],
        }))
      )
    }

    case "reorderElement": {
      const location = findElementLocation(deck, op.elementId)
      if (!location) return fail(elementNotFoundMessage(op.elementId))

      const { slide } = location
      const fromIndex = slide.elements.findIndex(
        (element) => element.id === op.elementId
      )
      const topIndex = slide.elements.length - 1
      const toIndexByDirection = {
        forward: Math.min(fromIndex + 1, topIndex),
        backward: Math.max(fromIndex - 1, 0),
        front: topIndex,
        back: 0,
      }
      return succeed(
        mapSlide(deck, slide.id, (currentSlide) => ({
          ...currentSlide,
          elements: moveItem(
            currentSlide.elements,
            fromIndex,
            toIndexByDirection[op.direction]
          ),
        }))
      )
    }

    case "batch": {
      let currentDeck = deck
      for (const [index, batchedOp] of op.ops.entries()) {
        const result = applyOp(currentDeck, batchedOp)
        if (!result.ok) {
          return fail(
            `Step ${index + 1} of ${op.ops.length} (${batchedOp.type}) failed, so none of the batch was applied: ${result.error}`
          )
        }
        currentDeck = result.deck
      }
      return succeed(currentDeck)
    }
  }
}

function succeed(deck: Deck): ApplyOpResult {
  return { ok: true, deck }
}

function fail(error: string): ApplyOpResult {
  return { ok: false, error }
}

function placeElement(
  element: SlideElement
): { ok: true; element: SlideElement } | { ok: false; error: string } {
  const parsedElement = slideElementSchema.safeParse({
    ...element,
    ...clampBox(element),
  })
  if (!parsedElement.success) {
    return {
      ok: false,
      error: `Element "${element.id}" is invalid: ${z.prettifyError(parsedElement.error)}`,
    }
  }
  return { ok: true, element: parsedElement.data }
}

function findSlide(deck: Deck, slideId: string) {
  return deck.slides.find((slide) => slide.id === slideId)
}

export function findElementLocation(deck: Deck, elementId: string) {
  for (const slide of deck.slides) {
    const element = slide.elements.find(
      (candidate) => candidate.id === elementId
    )
    if (element) return { slide, element }
  }
  return undefined
}

function findDuplicateId(deck: Deck, newIds: string[]) {
  const usedIds = new Set(
    deck.slides.flatMap((slide) => [
      slide.id,
      ...slide.elements.map((element) => element.id),
    ])
  )
  return newIds.find((id) => usedIds.has(id))
}

function mapSlide(
  deck: Deck,
  slideId: string,
  update: (slide: Slide) => Slide
): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId ? update(slide) : slide
    ),
  }
}

function mapElement(
  slide: Slide,
  elementId: string,
  update: (element: SlideElement) => SlideElement
): Slide {
  return {
    ...slide,
    elements: slide.elements.map((element) =>
      element.id === elementId ? update(element) : element
    ),
  }
}

function insertAt<Item>(items: Item[], index: number, item: Item) {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

function moveItem<Item>(items: Item[], fromIndex: number, toIndex: number) {
  const itemsWithoutMoved = items.filter((_, index) => index !== fromIndex)
  return insertAt(itemsWithoutMoved, toIndex, items[fromIndex])
}

function clampIndex(index: number, maxIndex: number) {
  return Math.min(Math.max(index, 0), Math.max(maxIndex, 0))
}

function slideNotFoundMessage(deck: Deck, slideId: string) {
  const existingSlideIds =
    deck.slides.map((slide) => slide.id).join(", ") || "none"
  return `Slide "${slideId}" does not exist. Existing slides: ${existingSlideIds}.`
}

function elementNotFoundMessage(elementId: string) {
  return `Element "${elementId}" does not exist on any slide. Check the element ids in the current deck.`
}
