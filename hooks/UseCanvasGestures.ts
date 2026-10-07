import { useEffect, useRef, type PointerEvent } from "react"
import type { DragMoveEvent } from "@dnd-kit/core"

import { positionDropCursorBadge } from "@/components/canvas/DropCursorBadge"
import { RESIZE_CURSORS } from "@/components/canvas/SelectionFrame"
import { isSlideLockedByAgent } from "@/lib/client/AgentActions"
import type { DeckEdit } from "@/lib/edits/DeckEdits"
import {
  boxesOverlap,
  clampBox,
  resizeBox,
  snapBox,
  snapResizedEdges,
  unionBox,
  type Box,
  type ResizeHandle,
  type SnapGuide,
} from "@/lib/edits/Geometry"
import { createId } from "@/lib/Ids"
import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, type Slide } from "@/lib/schema/Deck"
import { useDragPreviewStore, type DropTarget } from "@/store/DragPreviewStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const SNAP_DISTANCE_PX = 6
const SLIDE_BOX: Box = { x: 0, y: 0, w: ARTBOARD_WIDTH, h: ARTBOARD_HEIGHT }
// slideId: the slide the gesture started on.
type Gesture = { scale: number; artboard: HTMLElement; slideId: string } & (
  | {
      kind: "move"
      startBoxes: Map<string, Box>
      snapTargets: Box[]
      // Where the pointer grabbed, in slide units, so a drop on another
      // slide keeps the element under the pointer the same way.
      grabPoint: { x: number; y: number }
      itemLabel: string
    }
  | {
      kind: "resize"
      elementId: string
      handle: ResizeHandle
      startBox: Box
      isText: boolean
      snapTargets: Box[]
    }
  | {
      kind: "marquee"
      startPoint: { x: number; y: number }
      elementBoxes: Map<string, Box>
    }
)

// dnd-kit reports how far the pointer moved; this turns that into element
// boxes with the pure functions in Geometry.ts. Boxes are previewed in the
// gesture store and written to the deck once, when the pointer is released.
export function useCanvasGestures() {
  const gestureRef = useRef<Gesture | null>(null)
  const heldKeysRef = useRef({ shift: false, alt: false })
  // The pointer's real screen position. dnd-kit's delta also counts
  // scrolling, so it can't tell which slide is under the pointer.
  const pointerRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    function rememberHeldKeys(event: KeyboardEvent) {
      heldKeysRef.current = { shift: event.shiftKey, alt: event.altKey }
      // Alt switches between move and copy without moving the pointer.
      const { dropTarget, setDropTarget } = useDragPreviewStore.getState()
      if (dropTarget) setDropTarget({ ...dropTarget, isCopy: event.altKey })
    }
    function rememberPointer(event: globalThis.PointerEvent) {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener("keydown", rememberHeldKeys)
    window.addEventListener("keyup", rememberHeldKeys)
    window.addEventListener("pointermove", rememberPointer)
    return () => {
      window.removeEventListener("keydown", rememberHeldKeys)
      window.removeEventListener("keyup", rememberHeldKeys)
      window.removeEventListener("pointermove", rememberPointer)
    }
  }, [])

  // Runs on pointerdown on a slide: updates the selection and decides which
  // gesture a drag would be. Returns false when there is nothing to drag.
  function prepareGesture(event: PointerEvent<HTMLElement>, slideId: string) {
    if (event.button !== 0) return false
    const artboard =
      event.currentTarget.querySelector<HTMLElement>("[data-artboard]")
    const slide = useDeckStore
      .getState()
      .deck?.slides.find((candidate) => candidate.id === slideId)
    if (!artboard || !slide) return false

    const editor = useEditorStore.getState()
    if (slideId !== editor.currentSlideId) editor.goToSlide(slideId)

    const target = event.target as HTMLElement
    const elementNode = target.closest<HTMLElement>("[data-element-id]")
    const elementId = elementNode?.dataset.elementId
    // Clicks inside the text being typed into place the caret instead.
    if (elementId && elementId === editor.editingElementId) return false

    heldKeysRef.current = { shift: event.shiftKey, alt: event.altKey }
    const artboardRect = artboard.getBoundingClientRect()
    const scale = artboardRect.width / ARTBOARD_WIDTH
    const elementBoxes = measureElementBoxes(slide, artboard)
    const { setSelectedElementIds } = useEditorStore.getState()

    const handle = target.closest<HTMLElement>("[data-handle]")
    const handleElementId = handle?.dataset.handleElementId
    if (handle && handleElementId) {
      const startBox = elementBoxes.get(handleElementId)
      if (!startBox) return false
      const resizeHandle = handle.dataset.handle as ResizeHandle
      document.body.style.cursor = RESIZE_CURSORS[resizeHandle]
      gestureRef.current = {
        kind: "resize",
        scale,
        artboard,
        slideId,
        elementId: handleElementId,
        handle: resizeHandle,
        startBox,
        isText: elementBoxIsText(artboard, handleElementId),
        snapTargets: snapTargetsExcept(elementBoxes, [handleElementId]),
      }
      return true
    }

    if (elementId) {
      let selectedIds = useEditorStore.getState().selectedElementIds
      if (event.shiftKey) {
        selectedIds = selectedIds.includes(elementId)
          ? selectedIds.filter((selectedId) => selectedId !== elementId)
          : [...selectedIds, elementId]
        setSelectedElementIds(selectedIds)
        if (!selectedIds.includes(elementId)) return false
      } else if (!selectedIds.includes(elementId)) {
        selectedIds = [elementId]
        setSelectedElementIds(selectedIds)
      }

      const startBoxes = new Map<string, Box>()
      for (const selectedId of selectedIds) {
        const box = elementBoxes.get(selectedId)
        if (box) startBoxes.set(selectedId, box)
      }
      pointerRef.current = { x: event.clientX, y: event.clientY }
      gestureRef.current = {
        kind: "move",
        scale,
        artboard,
        startBoxes,
        snapTargets: snapTargetsExcept(elementBoxes, selectedIds),
        slideId,
        grabPoint: {
          x: (event.clientX - artboardRect.left) / scale,
          y: (event.clientY - artboardRect.top) / scale,
        },
        itemLabel: describeDraggedItems(slide, selectedIds),
      }
      return true
    }

    if (!event.shiftKey) setSelectedElementIds([])
    gestureRef.current = {
      kind: "marquee",
      scale,
      artboard,
      slideId,
      startPoint: {
        x: (event.clientX - artboardRect.left) / scale,
        y: (event.clientY - artboardRect.top) / scale,
      },
      elementBoxes,
    }
    return true
  }

  function handleDragMove({ delta }: DragMoveEvent) {
    const gesture = gestureRef.current
    if (!gesture) return

    const deltaX = delta.x / gesture.scale
    const deltaY = delta.y / gesture.scale
    const snapDistance = SNAP_DISTANCE_PX / gesture.scale
    const { shift: isShiftHeld, alt: isAltHeld } = heldKeysRef.current
    const { setPreview, setMarquee, setDropTarget } =
      useDragPreviewStore.getState()

    if (gesture.kind === "move") {
      // Over another slide (thumbnail or canvas): the elements stay where
      // they are while the target shows what a drop would do.
      const target = findSlideUnderPointer(pointerRef.current, gesture.slideId)
      if (target) {
        setDropTarget({
          slideId: target.slideId,
          slideNumber: slideNumberOf(target.slideId),
          isCopy: isAltHeld,
          itemLabel: gesture.itemLabel,
        })
        positionDropCursorBadge(pointerRef.current)
        setPreview(Object.fromEntries(gesture.startBoxes), [])
        return
      }
      setDropTarget(null)

      const movedElements = [...gesture.startBoxes].map(([elementId, box]) => ({
        elementId,
        box: { ...box, x: box.x + deltaX, y: box.y + deltaY },
      }))
      let snapOffsetX = 0
      let snapOffsetY = 0
      let guides: SnapGuide[] = []
      if (!isAltHeld) {
        const selectionBox = unionBox(movedElements.map(({ box }) => box))
        const snapped = snapBox(selectionBox, gesture.snapTargets, snapDistance)
        snapOffsetX = snapped.box.x - selectionBox.x
        snapOffsetY = snapped.box.y - selectionBox.y
        guides = snapped.guides
      }

      const previewBoxes: Record<string, Box> = {}
      for (const { elementId, box } of movedElements) {
        previewBoxes[elementId] = clampBox({
          ...box,
          x: box.x + snapOffsetX,
          y: box.y + snapOffsetY,
        })
      }
      setPreview(previewBoxes, guides)
      return
    }

    if (gesture.kind === "resize") {
      const keepRatio = isShiftHeld && !gesture.isText
      let box = resizeBox(gesture.startBox, gesture.handle, deltaX, deltaY, {
        keepRatio,
        widthOnly: gesture.isText,
      })
      let guides: SnapGuide[] = []
      if (!isAltHeld && !keepRatio) {
        const snapped = snapResizedEdges(
          box,
          gesture.handle,
          gesture.snapTargets,
          snapDistance,
          { snapHeight: !gesture.isText }
        )
        box = snapped.box
        guides = snapped.guides
      }
      setPreview({ [gesture.elementId]: clampBox(box) }, guides)
      return
    }

    const currentPoint = {
      x: gesture.startPoint.x + deltaX,
      y: gesture.startPoint.y + deltaY,
    }
    setMarquee({
      x: Math.min(gesture.startPoint.x, currentPoint.x),
      y: Math.min(gesture.startPoint.y, currentPoint.y),
      w: Math.abs(currentPoint.x - gesture.startPoint.x),
      h: Math.abs(currentPoint.y - gesture.startPoint.y),
    })
  }

  function handleDragEnd() {
    const gesture = gestureRef.current
    endGesture()
    if (!gesture) return
    const { previewBoxes, marqueeBox, dropTarget, clearGesture } =
      useDragPreviewStore.getState()

    if (gesture.kind === "move" && dropTarget) {
      dropOnOtherSlide(gesture, dropTarget, pointerRef.current)
      clearGesture()
      return
    }
    // The agent started on this slide mid-drag: its changes win.
    if (isSlideLockedByAgent(gesture.slideId)) {
      clearGesture()
      return
    }

    if (gesture.kind === "marquee") {
      if (marqueeBox) {
        const touchedIds = [...gesture.elementBoxes]
          .filter(([, box]) => boxesOverlap(marqueeBox, box))
          .map(([elementId]) => elementId)
        useEditorStore.getState().setSelectedElementIds(touchedIds)
      }
      clearGesture()
      return
    }

    const edits: DeckEdit[] = Object.entries(previewBoxes).map(
      ([elementId, box]) => {
        // Text height follows its text, so store what the browser laid out.
        const height = elementBoxIsText(gesture.artboard, elementId)
          ? (findElementNode(gesture.artboard, elementId)?.offsetHeight ??
            box.h)
          : box.h
        return {
          type: "updateElement",
          elementId,
          changes: { ...box, h: Math.round(height) },
        }
      }
    )
    if (edits.length > 0) {
      useDeckStore
        .getState()
        .applyEdit(edits.length === 1 ? edits[0] : { type: "batch", edits })
    }
    clearGesture()
  }

  function handleDragCancel() {
    endGesture()
    useDragPreviewStore.getState().clearGesture()
  }

  function endGesture() {
    gestureRef.current = null
    document.body.style.cursor = ""
  }

  return { prepareGesture, handleDragMove, handleDragEnd, handleDragCancel }
}

type MoveGesture = Extract<Gesture, { kind: "move" }>

// One edit for the whole selection, so a single Undo brings it all back.
function dropOnOtherSlide(
  gesture: MoveGesture,
  dropTarget: DropTarget,
  pointer: { x: number; y: number }
) {
  // Dropped on a canvas slide: land where the pointer let go, keeping
  // each element's offset from the grab point. Dropped on a thumbnail:
  // keep the element's own position on the slide.
  const target = findSlideUnderPointer(pointer, gesture.slideId)
  let pointerOnTarget: { x: number; y: number } | null = null
  if (target?.artboard) {
    const targetRect = target.artboard.getBoundingClientRect()
    const targetScale = targetRect.width / ARTBOARD_WIDTH
    pointerOnTarget = {
      x: (pointer.x - targetRect.left) / targetScale,
      y: (pointer.y - targetRect.top) / targetScale,
    }
  }

  const edits: DeckEdit[] = [...gesture.startBoxes].map(([elementId, box]) => {
    const x = pointerOnTarget
      ? Math.round(pointerOnTarget.x - (gesture.grabPoint.x - box.x))
      : undefined
    const y = pointerOnTarget
      ? Math.round(pointerOnTarget.y - (gesture.grabPoint.y - box.y))
      : undefined
    if (dropTarget.isCopy) {
      return {
        type: "copyElement",
        elementId,
        toSlideId: dropTarget.slideId,
        newElementId: createId(),
        x,
        y,
      }
    }
    return {
      type: "moveElement",
      elementId,
      toSlideId: dropTarget.slideId,
      x,
      y,
    }
  })

  const result = useDeckStore.getState().applyEdit({ type: "batch", edits })
  // Moved elements left this slide; copied ones stay selected here.
  if (result.ok && !dropTarget.isCopy) {
    useEditorStore.getState().setSelectedElementIds([])
  }
}

// Another slide under the pointer: its thumbnail in the navigator, or the
// slide itself on the canvas (with its artboard, to place the drop).
function findSlideUnderPointer(
  pointer: { x: number; y: number },
  sourceSlideId: string
): { slideId: string; artboard: HTMLElement | null } | null {
  for (const node of document.elementsFromPoint(pointer.x, pointer.y)) {
    const thumbnail = node.closest<HTMLElement>("[data-slide-drop-id]")
    const thumbnailSlideId = thumbnail?.dataset.slideDropId
    if (thumbnailSlideId) {
      const isUnavailable =
        thumbnailSlideId === sourceSlideId ||
        isSlideLockedByAgent(thumbnailSlideId)
      if (isUnavailable) return null
      return { slideId: thumbnailSlideId, artboard: null }
    }
    const canvasSlide = node.closest<HTMLElement>("[data-canvas-slide-id]")
    const canvasSlideId = canvasSlide?.dataset.canvasSlideId
    if (canvasSlide && canvasSlideId) {
      const isUnavailable =
        canvasSlideId === sourceSlideId || isSlideLockedByAgent(canvasSlideId)
      if (isUnavailable) return null
      return {
        slideId: canvasSlideId,
        artboard: canvasSlide.querySelector<HTMLElement>("[data-artboard]"),
      }
    }
  }
  return null
}

function slideNumberOf(slideId: string) {
  const slides = useDeckStore.getState().deck?.slides ?? []
  return slides.findIndex((slide) => slide.id === slideId) + 1
}

function describeDraggedItems(slide: Slide, elementIds: string[]) {
  if (elementIds.length !== 1) return `${elementIds.length} elements`
  const element = slide.elements.find(
    (candidate) => candidate.id === elementIds[0]
  )
  return element?.type ?? "element"
}

function findElementNode(artboard: HTMLElement, elementId: string) {
  return artboard.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`)
}

function elementBoxIsText(artboard: HTMLElement, elementId: string) {
  return findElementNode(artboard, elementId)?.dataset.elementType === "text"
}

// Boxes as they appear: text uses its laid-out height, not the stored one.
function measureElementBoxes(slide: Slide, artboard: HTMLElement) {
  const boxes = new Map<string, Box>()
  for (const element of slide.elements) {
    const node = findElementNode(artboard, element.id)
    const h = element.type === "text" && node ? node.offsetHeight : element.h
    boxes.set(element.id, { x: element.x, y: element.y, w: element.w, h })
  }
  return boxes
}

function snapTargetsExcept(
  elementBoxes: Map<string, Box>,
  movingIds: string[]
) {
  const otherBoxes = [...elementBoxes]
    .filter(([elementId]) => !movingIds.includes(elementId))
    .map(([, box]) => box)
  return [SLIDE_BOX, ...otherBoxes]
}
