import { useState } from "react"
import { CircleIcon, LinkIcon, SquareIcon, UnlinkIcon } from "lucide-react"

import { ColorInput, NumberInput, ToolbarDivider, ToolbarToggle } from "@/components/canvas/toolbar/ToolbarInputs"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import { MIN_ELEMENT_SIZE, type SlideElement } from "@/lib/schema/deck"

type ShapeElementData = Extract<SlideElement, { type: "shape" }>

// Picking an outline color adds an outline if the shape had none, so the color shows.
const DEFAULT_OUTLINE_WIDTH = 4

export function ShapeControls({ element }: { element: ShapeElementData }) {
  return (
    <>
      <ShapeSizeInputs element={element} />
      <ToolbarDivider />
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
      <ColorInput label="Fill color" color={element.fill} onChange={(fill) => updateSelectedElement({ fill })} />
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

// Width and height in slide units (1920x1080); with the lock on, proportions stay the same.
function ShapeSizeInputs({ element }: { element: ShapeElementData }) {
  // Saved when the lock turns on, so typing digit by digit doesn't let rounding drift the ratio.
  const [lockedRatio, setLockedRatio] = useState<number | null>(null)

  function changeWidth(width: number) {
    updateSelectedElement(lockedRatio ? { w: width, h: Math.round(width / lockedRatio) } : { w: width })
  }

  function changeHeight(height: number) {
    updateSelectedElement(lockedRatio ? { w: Math.round(height * lockedRatio), h: height } : { h: height })
  }

  return (
    <>
      <span className="text-xs text-muted-foreground">W</span>
      <NumberInput
        label="Width"
        value={Math.round(element.w)}
        min={MIN_ELEMENT_SIZE}
        onChange={changeWidth}
        className="w-14"
      />
      <span className="text-xs text-muted-foreground">H</span>
      <NumberInput
        label="Height"
        value={Math.round(element.h)}
        min={MIN_ELEMENT_SIZE}
        onChange={changeHeight}
        className="w-14"
      />
      <ToolbarToggle
        label={lockedRatio ? "Unlock proportions" : "Lock proportions"}
        isActive={lockedRatio !== null}
        onClick={() => setLockedRatio(lockedRatio ? null : element.w / element.h)}
      >
        {lockedRatio ? <LinkIcon /> : <UnlinkIcon />}
      </ToolbarToggle>
    </>
  )
}
