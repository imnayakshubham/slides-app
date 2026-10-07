"use client"

import { CopyIcon, MoveRightIcon } from "lucide-react"

import { useDragPreviewStore } from "@/store/DragPreviewStore"

// Gap between the pointer and the badge, so the badge never hides what is
// under the pointer.
const OFFSET_FROM_POINTER_PX = 14

// Follows the pointer through two CSS variables written by the drag
// handler, so moving the pointer never re-renders React.
export function positionDropCursorBadge(pointer: { x: number; y: number }) {
  const rootStyle = document.documentElement.style
  rootStyle.setProperty(
    "--drop-cursor-x",
    `${pointer.x + OFFSET_FROM_POINTER_PX}px`
  )
  rootStyle.setProperty(
    "--drop-cursor-y",
    `${pointer.y + OFFSET_FROM_POINTER_PX}px`
  )
}

// "Move chart → slide 4" next to the pointer while it is over another slide.
export function DropCursorBadge() {
  const dropTarget = useDragPreviewStore((state) => state.dropTarget)
  if (!dropTarget) return null

  const Icon = dropTarget.isCopy ? CopyIcon : MoveRightIcon
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-lg"
      style={{
        transform:
          "translate(var(--drop-cursor-x, 0px), var(--drop-cursor-y, 0px))",
      }}
    >
      <Icon className="size-3.5" />
      {dropTarget.isCopy ? "Copy" : "Move"} {dropTarget.itemLabel} → slide{" "}
      {dropTarget.slideNumber}
    </div>
  )
}
