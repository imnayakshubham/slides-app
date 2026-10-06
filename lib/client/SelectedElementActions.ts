import type { DeckEdit } from "@/lib/edits/DeckEdits"
import { findElementLocation } from "@/lib/edits/DeckEdits"
import { duplicateElement } from "@/lib/layouts/SlideLayouts"
import type { ElementChanges } from "@/lib/schema/Deck"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// Actions on the selected canvas elements, shared by the floating toolbar
// and the keyboard shortcuts. Each one is a single undo step.

function getSelectedElements() {
  const deck = useDeckStore.getState().deck
  if (!deck) return []
  return useEditorStore
    .getState()
    .selectedElementIds.map((elementId) => findElementLocation(deck, elementId))
    .filter((location) => location !== undefined)
}

function applyEdits(edits: DeckEdit[]) {
  if (edits.length === 0) return
  useDeckStore
    .getState()
    .applyEdit(edits.length === 1 ? edits[0] : { type: "batch", edits })
}

export function updateSelectedElement(changes: ElementChanges) {
  const [selected] = getSelectedElements()
  if (!selected) return
  applyEdits([
    { type: "updateElement", elementId: selected.element.id, changes },
  ])
}

export function deleteSelectedElements() {
  applyEdits(
    getSelectedElements().map(({ element }) => ({
      type: "deleteElement",
      elementId: element.id,
    }))
  )
}

export function duplicateSelectedElements() {
  const copies = getSelectedElements().map(({ slide, element }) => ({
    slideId: slide.id,
    element: duplicateElement(element),
  }))
  applyEdits(
    copies.map((copy) => ({
      type: "addElement",
      slideId: copy.slideId,
      element: copy.element,
    }))
  )
  useEditorStore
    .getState()
    .setSelectedElementIds(copies.map((copy) => copy.element.id))
}

export function nudgeSelectedElements(deltaX: number, deltaY: number) {
  applyEdits(
    getSelectedElements().map(({ element }) => ({
      type: "updateElement",
      elementId: element.id,
      changes: { x: element.x + deltaX, y: element.y + deltaY },
    }))
  )
}

export function moveSelectedElementInStack(direction: "forward" | "backward") {
  const [selected] = getSelectedElements()
  if (!selected) return
  applyEdits([
    { type: "reorderElement", elementId: selected.element.id, direction },
  ])
}
