"use client"

import { useEffect, useEffectEvent } from "react"
import { createPortal } from "react-dom"
import { XIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Artboard } from "@/components/canvas/Artboard"
import { Button } from "@/components/ui/button"
import { useDeckStore } from "@/store/DeckStore"

type PrintViewProps = {
  onClose: () => void
}

// Every slide, one per landscape page, then the browser's print dialog
// ("Save as PDF"). Pages are a fixed 13.333×7.5in (1280×720px) on screen
// too, so nothing has to re-measure when the browser lays out the print.
export function PrintView({ onClose }: PrintViewProps) {
  const slideIds = useDeckStore(
    useShallow((state) => state.deck?.slides.map((slide) => slide.id) ?? [])
  )

  const closeFromListener = useEffectEvent(onClose)

  useEffect(() => {
    let isCancelled = false

    async function printWhenReady() {
      await document.fonts.ready
      await Promise.all(
        Array.from(
          document.querySelectorAll<HTMLImageElement>("[data-print-view] img"),
          (image) => image.decode().catch(() => undefined)
        )
      )
      // Two frames: one for the artboards to measure their scale, one for
      // the charts to draw at that size.
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      if (!isCancelled) window.print()
    }
    void printWhenReady()

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeFromListener()
    }
    function closeAfterPrint() {
      closeFromListener()
    }
    window.addEventListener("keydown", closeOnEscape)
    window.addEventListener("afterprint", closeAfterPrint)
    return () => {
      isCancelled = true
      window.removeEventListener("keydown", closeOnEscape)
      window.removeEventListener("afterprint", closeAfterPrint)
    }
  }, [])

  return createPortal(
    <div
      data-print-view
      role="dialog"
      aria-modal
      aria-label="Print preview"
      className="fixed inset-0 z-50 overflow-auto bg-muted print:static print:overflow-visible print:bg-transparent"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2 print:hidden">
        <span className="text-sm text-muted-foreground">
          Choose “Save as PDF” in the print dialog.
        </span>
        <Button className="ms-auto" onClick={() => window.print()}>
          Print
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Close"
          title="Close (Esc)"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>

      <div className="flex w-max flex-col gap-4 p-4 print:gap-0 print:p-0">
        {slideIds.map((slideId) => (
          <div
            key={slideId}
            className="print-page h-[720px] w-[1280px] shadow-sm print:shadow-none"
          >
            <Artboard slideId={slideId} isThumbnail className="size-full" />
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}
