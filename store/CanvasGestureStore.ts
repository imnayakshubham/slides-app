import { create } from "zustand"

import type { Box, SnapGuide } from "@/lib/edits/Geometry"

// Live state of a drag, resize or selection box on the canvas. Kept apart
// from the deck so a gesture re-renders only the moving elements and the
// overlay; the deck is written once, when the gesture ends.
type CanvasGestureStore = {
  isActive: boolean
  previewBoxes: Record<string, Box>
  guides: SnapGuide[]
  marqueeBox: Box | null
  setPreview: (previewBoxes: Record<string, Box>, guides: SnapGuide[]) => void
  setMarquee: (marqueeBox: Box) => void
  clearGesture: () => void
}

export const useCanvasGestureStore = create<CanvasGestureStore>()((set) => ({
  isActive: false,
  previewBoxes: {},
  guides: [],
  marqueeBox: null,

  setPreview: (previewBoxes, guides) =>
    set({ isActive: true, previewBoxes, guides }),

  setMarquee: (marqueeBox) => set({ isActive: true, marqueeBox }),

  clearGesture: () =>
    set({ isActive: false, previewBoxes: {}, guides: [], marqueeBox: null }),
}))
