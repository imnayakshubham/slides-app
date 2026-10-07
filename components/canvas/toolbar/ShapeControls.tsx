import { CircleIcon, SquareIcon } from "lucide-react"

import {
  ColorInput,
  NumberInput,
  ToolbarDivider,
  ToolbarToggle,
} from "@/components/canvas/toolbar/ToolbarInputs"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"

type ShapeElementData = Extract<SlideElement, { type: "shape" }>

// Picking an outline color on a shape without an outline gives it one,
// otherwise the new color would not show.
const DEFAULT_OUTLINE_WIDTH = 4

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
        onChange={(stroke) =>
          updateSelectedElement({
            stroke,
            strokeWidth: element.strokeWidth || DEFAULT_OUTLINE_WIDTH,
          })
        }
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
