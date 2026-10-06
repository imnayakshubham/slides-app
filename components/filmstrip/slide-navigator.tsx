import { PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useDeckStore } from "@/store/deck-store"

export function SlideNavigator({ onClose }: { onClose: () => void }) {
  const slideCount = useDeckStore((state) => state.deck?.slides.length ?? 0)

  return (
    <nav
      aria-label="Slides"
      className="m-2 flex w-40 shrink-0 flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm"
    >
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="flex-1 rounded-full">
          <PlusIcon />
          Add
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close slides"
          title="Close slides"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      {slideCount === 0 && (
        <p className="px-1 py-2 text-xs text-muted-foreground">No slides yet</p>
      )}
    </nav>
  )
}
