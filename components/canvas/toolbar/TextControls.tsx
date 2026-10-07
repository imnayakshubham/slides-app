import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  UnderlineIcon,
} from "lucide-react"

import {
  ColorInput,
  NumberInput,
  ToolbarDivider,
  ToolbarToggle,
} from "@/components/canvas/toolbar/ToolbarInputs"
import {
  endActiveTextEdit,
  styleHighlightedWordsOf,
} from "@/lib/client/RichTextEditing"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import { findElementLocation } from "@/lib/edits/DeckEdits"
import {
  TEXT_PRESET_NAMES,
  TEXT_PRESETS,
  findTextPreset,
  type TextPresetName,
} from "@/lib/layouts/TextPresets"
import {
  clearRunMark,
  type TextMark,
  type TextStyleChanges,
} from "@/lib/RichText"
import type { ElementChanges, SlideElement } from "@/lib/schema/Deck"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

type TextElementData = Extract<SlideElement, { type: "text" }>

const FONT_SIZE_STEP = 4
const MIN_FONT_SIZE = 8

const ALIGN_OPTIONS = [
  { align: "left", label: "Align left", Icon: AlignLeftIcon },
  { align: "center", label: "Align center", Icon: AlignCenterIcon },
  { align: "right", label: "Align right", Icon: AlignRightIcon },
] as const

// Saves any edit in progress, then changes the whole box. A style mark
// (bold, color…) also replaces the words that overrode it.
function updateWholeTextBox(
  elementId: string,
  changes: ElementChanges,
  markToClear?: TextMark
) {
  endActiveTextEdit()
  const deck = useDeckStore.getState().deck
  const savedElement = deck
    ? findElementLocation(deck, elementId)?.element
    : undefined
  if (!markToClear || savedElement?.type !== "text") {
    updateSelectedElement(changes)
    return
  }
  updateSelectedElement({
    ...changes,
    paragraphs: clearRunMark(savedElement.paragraphs, markToClear),
  })
}

export function TextControls({ element }: { element: TextElementData }) {
  // Highlighted words while this box is being typed into; then the style
  // settings below apply to those words only.
  const highlightStyle = useEditorStore((state) =>
    state.editingElementId === element.id ? state.highlightedTextStyle : null
  )
  const boxUnderline = element.underline ?? false
  const shownStyle = highlightStyle ?? {
    bold: element.bold,
    italic: element.italic,
    underline: boxUnderline,
    color: element.color,
    fontSize: element.fontSize,
  }

  function applyTextStyle(changes: TextStyleChanges, mark: TextMark) {
    if (highlightStyle) {
      styleHighlightedWordsOf(element.id, changes, boxUnderline)
    } else {
      updateWholeTextBox(element.id, changes, mark)
    }
  }

  function toggleListStyle(listStyle: "bullet" | "number") {
    updateWholeTextBox(element.id, {
      listStyle: element.listStyle === listStyle ? "none" : listStyle,
    })
  }

  function turnInto(presetName: TextPresetName) {
    const { fontSize, bold, listStyle } = TEXT_PRESETS[presetName]
    updateWholeTextBox(element.id, { fontSize, bold, listStyle })
  }

  return (
    <>
      <select
        aria-label="Turn into"
        title="Turn into"
        value={findTextPreset(element) ?? "custom"}
        onChange={(event) => turnInto(event.target.value as TextPresetName)}
        className="h-8 rounded-md bg-transparent px-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {TEXT_PRESET_NAMES.map((presetName) => (
          <option key={presetName} value={presetName}>
            {TEXT_PRESETS[presetName].label}
          </option>
        ))}
        <option value="custom" disabled>
          Custom
        </option>
      </select>
      <ToolbarDivider />
      <NumberInput
        label="Font size"
        value={shownStyle.fontSize}
        step={FONT_SIZE_STEP}
        min={MIN_FONT_SIZE}
        onChange={(fontSize) => applyTextStyle({ fontSize }, "fontSize")}
      />
      <ColorInput
        label="Text color"
        color={shownStyle.color}
        onChange={(color) => applyTextStyle({ color }, "color")}
      />
      <ToolbarDivider />
      <ToolbarToggle
        label="Bold"
        isActive={shownStyle.bold}
        onClick={() => applyTextStyle({ bold: !shownStyle.bold }, "bold")}
      >
        <BoldIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Italic"
        isActive={shownStyle.italic}
        onClick={() => applyTextStyle({ italic: !shownStyle.italic }, "italic")}
      >
        <ItalicIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Underline"
        isActive={shownStyle.underline}
        onClick={() =>
          applyTextStyle({ underline: !shownStyle.underline }, "underline")
        }
      >
        <UnderlineIcon />
      </ToolbarToggle>
      <ToolbarDivider />
      {ALIGN_OPTIONS.map(({ align, label, Icon }) => (
        <ToolbarToggle
          key={align}
          label={label}
          isActive={element.align === align}
          onClick={() => updateWholeTextBox(element.id, { align })}
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
