import { z } from "zod"

import { clampBox, placeWithoutOverlap } from "@/lib/edits/Geometry"
import { deckSchema, slideElementSchema, slideSchema } from "@/lib/schema/Deck"
import type { Deck, ElementChanges, Slide, SlideElement, Theme } from "@/lib/schema/Deck"
import { recolorDeck } from "@/lib/themes/Recolor"

export type DeckEdit =
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
  // A copy on another (or the same) slide. The new id is passed in so this
  // stays a pure, repeatable function.
  | {
      type: "copyElement"
      elementId: string
      toSlideId: string
      newElementId: string
      x?: number
      y?: number
    }
  | {
      type: "reorderElement"
      elementId: string
      direction: "forward" | "backward" | "front" | "back"
    }
  // Switches the theme and swaps every color that came from the old theme
  // for the new theme's matching color. Colors picked by hand stay.
  | { type: "setTheme"; theme: Theme }
  | { type: "batch"; edits: DeckEdit[] }

export type DeckEditResult = { ok: true; deck: Deck } | { ok: false; error: string }

// Pure: never mutates `deck`, never throws. Unchanged slides and elements keep
// their references so undo snapshots stay cheap and untouched UI does not re-render.
export function applyDeckEdit(deck: Deck, edit: DeckEdit): DeckEditResult {
  switch (edit.type) {
    case "updateDeck":
      return succeed({ ...deck, ...edit.changes })

    case "setTheme": {
      const parsedDeck = deckSchema.safeParse({ ...deck, theme: edit.theme })
      if (!parsedDeck.success) {
        return fail(`Theme is invalid: ${z.prettifyError(parsedDeck.error)}`)
      }
      return succeed(recolorDeck(deck, parsedDeck.data.theme))
    }

    case "addSlide": {
      const parsedSlide = slideSchema.safeParse(edit.slide)
      if (!parsedSlide.success) {
        return fail(`Slide "${edit.slide.id}" is invalid: ${z.prettifyError(parsedSlide.error)}`)
      }
      const duplicateId = findDuplicateId(deck, [edit.slide.id, ...edit.slide.elements.map((element) => element.id)])
      if (duplicateId) return fail(`Id "${duplicateId}" is already used in this deck. Use a new id.`)

      const insertIndex = clampIndex(edit.index ?? deck.slides.length, deck.slides.length)
      return succeed({
        ...deck,
        slides: insertAt(deck.slides, insertIndex, parsedSlide.data),
      })
    }

    case "updateSlide": {
      const slide = findSlide(deck, edit.slideId)
      if (!slide) return fail(slideNotFoundMessage(deck, edit.slideId))

      const parsedSlide = slideSchema.safeParse({ ...slide, ...edit.changes })
      if (!parsedSlide.success) {
        return fail(`Slide "${edit.slideId}" update is invalid: ${z.prettifyError(parsedSlide.error)}`)
      }
      return succeed(replaceSlide(deck, parsedSlide.data))
    }

    case "deleteSlide": {
      if (!findSlide(deck, edit.slideId)) return fail(slideNotFoundMessage(deck, edit.slideId))
      return succeed({
        ...deck,
        slides: deck.slides.filter((slide) => slide.id !== edit.slideId),
      })
    }

    case "moveSlide": {
      const fromIndex = deck.slides.findIndex((slide) => slide.id === edit.slideId)
      if (fromIndex === -1) return fail(slideNotFoundMessage(deck, edit.slideId))

      const toIndex = clampIndex(edit.toIndex, deck.slides.length - 1)
      return succeed({
        ...deck,
        slides: moveItem(deck.slides, fromIndex, toIndex),
      })
    }

    case "addElement": {
      const slide = findSlide(deck, edit.slideId)
      if (!slide) return fail(slideNotFoundMessage(deck, edit.slideId))
      if (findDuplicateId(deck, [edit.element.id])) {
        return fail(`Id "${edit.element.id}" is already used in this deck. Use a new id.`)
      }

      const validated = fitAndValidateElement(edit.element)
      if (!validated.ok) return validated
      const elements = [...slide.elements, validated.element]
      return succeed(replaceSlide(deck, { ...slide, elements }))
    }

    case "updateElement": {
      const location = findElementLocation(deck, edit.elementId)
      if (!location) return fail(elementNotFoundMessage(edit.elementId))

      const { slide, element } = location
      // Changes from another element type fail validation below.
      const validated = fitAndValidateElement({
        ...element,
        ...edit.changes,
        id: element.id,
        type: element.type,
      } as SlideElement)
      if (!validated.ok) return validated
      const elements = slide.elements.map((current) => (current.id === element.id ? validated.element : current))
      return succeed(replaceSlide(deck, { ...slide, elements }))
    }

    case "deleteElement": {
      const location = findElementLocation(deck, edit.elementId)
      if (!location) return fail(elementNotFoundMessage(edit.elementId))

      const { slide } = location
      const elements = slide.elements.filter((element) => element.id !== edit.elementId)
      return succeed(replaceSlide(deck, { ...slide, elements }))
    }

    case "copyElement": {
      const location = findElementLocation(deck, edit.elementId)
      if (!location) return fail(elementNotFoundMessage(edit.elementId))
      const targetSlide = findSlide(deck, edit.toSlideId)
      if (!targetSlide) return fail(slideNotFoundMessage(deck, edit.toSlideId))
      if (findDuplicateId(deck, [edit.newElementId])) {
        return fail(`Id "${edit.newElementId}" is already used in this deck. Use a new id.`)
      }

      const { element } = location
      // Free space on the target slide, shrunk if needed to fit.
      const copiedElement = {
        ...element,
        id: edit.newElementId,
        ...placeWithoutOverlap(targetSlide, {
          x: edit.x ?? element.x,
          y: edit.y ?? element.y,
          w: element.w,
          h: element.h,
        }).box,
      }
      const elements = [...targetSlide.elements, copiedElement]
      return succeed(replaceSlide(deck, { ...targetSlide, elements }))
    }

    case "moveElement": {
      const location = findElementLocation(deck, edit.elementId)
      if (!location) return fail(elementNotFoundMessage(edit.elementId))
      const targetSlide = findSlide(deck, edit.toSlideId)
      if (!targetSlide) return fail(slideNotFoundMessage(deck, edit.toSlideId))

      const { slide: sourceSlide, element } = location
      const requestedBox = {
        x: edit.x ?? element.x,
        y: edit.y ?? element.y,
        w: element.w,
        h: element.h,
      }

      if (sourceSlide.id === targetSlide.id) {
        return applyDeckEdit(deck, {
          type: "updateElement",
          elementId: element.id,
          changes: { x: requestedBox.x, y: requestedBox.y },
        })
      }

      // Free space on the target slide, shrunk if needed to fit.
      const movedElement = {
        ...element,
        ...placeWithoutOverlap(targetSlide, requestedBox).box,
      }
      const sourceElements = sourceSlide.elements.filter((candidate) => candidate.id !== element.id)
      const targetElements = [...targetSlide.elements, movedElement]
      const deckWithoutElement = replaceSlide(deck, { ...sourceSlide, elements: sourceElements })
      return succeed(replaceSlide(deckWithoutElement, { ...targetSlide, elements: targetElements }))
    }

    case "reorderElement": {
      const location = findElementLocation(deck, edit.elementId)
      if (!location) return fail(elementNotFoundMessage(edit.elementId))

      const { slide } = location
      const fromIndex = slide.elements.findIndex((element) => element.id === edit.elementId)
      const topIndex = slide.elements.length - 1
      const toIndexByDirection = {
        forward: Math.min(fromIndex + 1, topIndex),
        backward: Math.max(fromIndex - 1, 0),
        front: topIndex,
        back: 0,
      }
      const elements = moveItem(slide.elements, fromIndex, toIndexByDirection[edit.direction])
      return succeed(replaceSlide(deck, { ...slide, elements }))
    }

    case "batch": {
      let currentDeck = deck
      for (const [index, batchedEdit] of edit.edits.entries()) {
        const result = applyDeckEdit(currentDeck, batchedEdit)
        if (!result.ok) {
          return fail(
            `Step ${index + 1} of ${edit.edits.length} (${batchedEdit.type}) failed, so none of the batch was applied: ${result.error}`
          )
        }
        currentDeck = result.deck
      }
      return succeed(currentDeck)
    }
  }
}

function succeed(deck: Deck): DeckEditResult {
  return { ok: true, deck }
}

function fail(error: string): DeckEditResult {
  return { ok: false, error }
}

function fitAndValidateElement(
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
    const element = slide.elements.find((candidate) => candidate.id === elementId)
    if (element) return { slide, element }
  }
  return undefined
}

function findDuplicateId(deck: Deck, newIds: string[]) {
  const usedIds = new Set(deck.slides.flatMap((slide) => [slide.id, ...slide.elements.map((element) => element.id)]))
  return newIds.find((id) => usedIds.has(id))
}

// Every other slide keeps its reference, so its UI doesn't re-render.
function replaceSlide(deck: Deck, updatedSlide: Slide): Deck {
  const slides = deck.slides.map((slide) => (slide.id === updatedSlide.id ? updatedSlide : slide))
  return { ...deck, slides }
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
  const existingSlideIds = deck.slides.map((slide) => slide.id).join(", ") || "none"
  return `Slide "${slideId}" does not exist. Existing slides: ${existingSlideIds}.`
}

function elementNotFoundMessage(elementId: string) {
  return `Element "${elementId}" does not exist on any slide. Check the element ids in the current deck.`
}
