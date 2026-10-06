import { Maximize2Icon, Minimize2Icon } from "lucide-react"

import { ToolbarToggle } from "@/components/canvas/toolbar/ToolbarParts"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"

type ImageElementData = Extract<SlideElement, { type: "image" }>

export function ImageControls({ element }: { element: ImageElementData }) {
  return (
    <>
      <ToolbarToggle
        label="Fill the box (crop)"
        isActive={element.fit === "cover"}
        onClick={() => updateSelectedElement({ fit: "cover" })}
      >
        <Maximize2Icon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Fit inside the box"
        isActive={element.fit === "contain"}
        onClick={() => updateSelectedElement({ fit: "contain" })}
      >
        <Minimize2Icon />
      </ToolbarToggle>
    </>
  )
}
