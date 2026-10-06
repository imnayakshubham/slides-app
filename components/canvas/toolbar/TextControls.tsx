import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react"

import {
  ColorInput,
  NumberInput,
  ToolbarDivider,
  ToolbarToggle,
} from "@/components/canvas/toolbar/ToolbarParts"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"

type TextElementData = Extract<SlideElement, { type: "text" }>

const FONT_SIZE_STEP = 4
const MIN_FONT_SIZE = 8

const ALIGN_OPTIONS = [
  { align: "left", label: "Align left", Icon: AlignLeftIcon },
  { align: "center", label: "Align center", Icon: AlignCenterIcon },
  { align: "right", label: "Align right", Icon: AlignRightIcon },
] as const

export function TextControls({ element }: { element: TextElementData }) {
  function toggleListStyle(listStyle: "bullet" | "number") {
    updateSelectedElement({
      listStyle: element.listStyle === listStyle ? "none" : listStyle,
    })
  }

  return (
    <>
      <NumberInput
        label="Font size"
        value={element.fontSize}
        step={FONT_SIZE_STEP}
        min={MIN_FONT_SIZE}
        onChange={(fontSize) => updateSelectedElement({ fontSize })}
      />
      <ColorInput
        label="Text color"
        color={element.color}
        onChange={(color) => updateSelectedElement({ color })}
      />
      <ToolbarDivider />
      <ToolbarToggle
        label="Bold"
        isActive={element.bold}
        onClick={() => updateSelectedElement({ bold: !element.bold })}
      >
        <BoldIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Italic"
        isActive={element.italic}
        onClick={() => updateSelectedElement({ italic: !element.italic })}
      >
        <ItalicIcon />
      </ToolbarToggle>
      <ToolbarDivider />
      {ALIGN_OPTIONS.map(({ align, label, Icon }) => (
        <ToolbarToggle
          key={align}
          label={label}
          isActive={element.align === align}
          onClick={() => updateSelectedElement({ align })}
        >
          <Icon />
        </ToolbarToggle>
      ))}
      <ToolbarDivider />
      <ToolbarToggle
        label="Bulleted list"
        isActive={element.listStyle === "bullet"}
        onClick={() => toggleListStyle("bullet")}
      >
        <ListIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Numbered list"
        isActive={element.listStyle === "number"}
        onClick={() => toggleListStyle("number")}
      >
        <ListOrderedIcon />
      </ToolbarToggle>
    </>
  )
}
