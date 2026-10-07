import { useEffect } from "react"

import {
  deleteSelectedElements,
  duplicateSelectedElements,
  nudgeSelectedElements,
} from "@/lib/client/SelectedElementActions"
import { isTypingTarget } from "@/lib/IsTypingTarget"
import { useDragPreviewStore } from "@/store/DragPreviewStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const NUDGE_STEP = 1
const LARGE_NUDGE_STEP = 10

const ARROW_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function useCanvasShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return

      const isCommand = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      const { undo, redo } = useDeckStore.getState()

      if (isCommand && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (isCommand && key === "y") {
        event.preventDefault()
        redo()
        return
      }

      const { selectedElementIds, setSelectedElementIds } =
        useEditorStore.getState()
      if (selectedElementIds.length === 0) return

      // During a drag, Escape cancels the drag instead (handled by dnd-kit).
      if (event.key === "Escape") {
        if (!useDragPreviewStore.getState().isActive) setSelectedElementIds([])
        return
      }

      if (isCommand && key === "d") {
        event.preventDefault()
        duplicateSelectedElements()
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        deleteSelectedElements()
        return
      }

      const arrowDirection = ARROW_DIRECTIONS[event.key]
      if (arrowDirection && !isCommand && !event.altKey) {
        event.preventDefault()
        const step = event.shiftKey ? LARGE_NUDGE_STEP : NUDGE_STEP
        nudgeSelectedElements(
          arrowDirection[0] * step,
          arrowDirection[1] * step
        )
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}
