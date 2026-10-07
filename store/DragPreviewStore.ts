import { create } from "zustand"

import type { Box, SnapGuide } from "@/lib/edits/Geometry"

// The slide an element would land on if dropped now (a thumbnail or another canvas slide).
export type DropTarget = {
  slideId: string
  slideNumber: number
  // Alt/Option held: copy instead of move.
  isCopy: boolean
  // What is being dragged, e.g. "chart" or "2 elements".
  itemLabel: string
}

// Live drag, resize and selection-box state, kept out of the deck so only moving parts re-render.
type DragPreviewStore = {
  isActive: boolean
  previewBoxes: Record<string, Box>
  guides: SnapGuide[]
  marqueeBox: Box | null
  dropTarget: DropTarget | null
  setPreview: (previewBoxes: Record<string, Box>, guides: SnapGuide[]) => void
  setMarquee: (marqueeBox: Box) => void
  setDropTarget: (dropTarget: DropTarget | null) => void
  clearGesture: () => void
}

function isSameDropTarget(a: DropTarget | null, b: DropTarget | null) {
  return a?.slideId === b?.slideId && a?.isCopy === b?.isCopy
}

export const useDragPreviewStore = create<DragPreviewStore>()((set, get) => ({
  isActive: false,
  previewBoxes: {},
  guides: [],
  marqueeBox: null,
  dropTarget: null,

  setPreview: (previewBoxes, guides) => set({ isActive: true, previewBoxes, guides }),

  setMarquee: (marqueeBox) => set({ isActive: true, marqueeBox }),

  // Called on every pointer move; only writes when the target changes.
  setDropTarget: (dropTarget) => {
    if (isSameDropTarget(get().dropTarget, dropTarget)) return
    set({ dropTarget })
  },

  clearGesture: () =>
    set({
      isActive: false,
      previewBoxes: {},
      guides: [],
      marqueeBox: null,
      dropTarget: null,
    }),
}))
