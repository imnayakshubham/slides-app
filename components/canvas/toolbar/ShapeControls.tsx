import { CircleIcon, SquareIcon } from "lucide-react"

import {
  ColorInput,
  NumberInput,
  ToolbarDivider,
  ToolbarToggle,
} from "@/components/canvas/toolbar/ToolbarParts"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"

type ShapeElementData = Extract<SlideElement, { type: "shape" }>

export function ShapeControls({ element }: { element: ShapeElementData }) {
  return (
    <>
      <ToolbarToggle
        label="Rectangle"
        isActive={element.shape === "rect"}
        onClick={() => updateSelectedElement({ shape: "rect" })}
      >
        <SquareIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Ellipse"
        isActive={element.shape === "ellipse"}
        onClick={() => updateSelectedElement({ shape: "ellipse" })}
      >
        <CircleIcon />
      </ToolbarToggle>
      <ToolbarDivider />
      <ColorInput
        label="Fill color"
        color={element.fill}
        onChange={(fill) => updateSelectedElement({ fill })}
      />
      <ColorInput
        label="Outline color"
        color={element.stroke}
        onChange={(stroke) => updateSelectedElement({ stroke })}
      />
      <NumberInput
        label="Outline width"
        value={element.strokeWidth}
        step={1}
        min={0}
        onChange={(strokeWidth) => updateSelectedElement({ strokeWidth })}
      />
    </>
  )
}
