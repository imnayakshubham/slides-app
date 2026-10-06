import { PanelTopIcon } from "lucide-react"

import { ToolbarToggle } from "@/components/canvas/toolbar/ToolbarParts"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"

type TableElementData = Extract<SlideElement, { type: "table" }>

export function TableControls({ element }: { element: TableElementData }) {
  return (
    <ToolbarToggle
      label="Header row"
      isActive={element.headerRow}
      onClick={() => updateSelectedElement({ headerRow: !element.headerRow })}
    >
      <PanelTopIcon />
    </ToolbarToggle>
  )
}
