import { FilmIcon, LayoutGridIcon, Redo2Icon, Undo2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useDeckStore } from "@/store/deck-store"

type EditorToolbarProps = {
  isSlideNavigatorOpen: boolean
  onToggleSlideNavigator: () => void
}

export function EditorToolbar({
  isSlideNavigatorOpen,
  onToggleSlideNavigator,
}: EditorToolbarProps) {
  const canUndo = useDeckStore((state) => state.past.length > 0)
  const canRedo = useDeckStore((state) => state.future.length > 0)
  const undo = useDeckStore((state) => state.undo)
  const redo = useDeckStore((state) => state.redo)

  return (
    <div
      role="toolbar"
      aria-label="Editor"
      className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
    >
      <Button
        variant={isSlideNavigatorOpen ? "secondary" : "ghost"}
        size="icon"
        aria-label="Slides"
        aria-pressed={isSlideNavigatorOpen}
        title="Slides"
        onClick={onToggleSlideNavigator}
      >
        <FilmIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Undo"
        title="Undo"
        disabled={!canUndo}
        onClick={undo}
      >
        <Undo2Icon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Redo"
        title="Redo"
        disabled={!canRedo}
        onClick={redo}
      >
        <Redo2Icon />
      </Button>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Button variant="ghost">
        <LayoutGridIcon />
        Add block
      </Button>
    </div>
  )
}
