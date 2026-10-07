import type { SlideElement } from "@/lib/schema/Deck"

type TextElement = Extract<SlideElement, { type: "text" }>

export type TextPresetName = "title" | "subtitle" | "body" | "bullets" | "numbers"

export type TextPreset = {
  label: string
  startingParagraphs: string[]
  fontSize: number
  bold: boolean
  listStyle: TextElement["listStyle"]
  role: TextElement["role"]
  width: number
  height: number
}

// Text styles for "Add block" and "Turn into"; Title and Body match what createSlide uses.
export const TEXT_PRESETS: Record<TextPresetName, TextPreset> = {
  title: {
    label: "Title",
    startingParagraphs: ["Title"],
    fontSize: 60,
    bold: true,
    listStyle: "none",
    role: "title",
    width: 1680,
    height: 140,
  },
  subtitle: {
    label: "Subtitle",
    startingParagraphs: ["Subtitle"],
    fontSize: 36,
    bold: false,
    listStyle: "none",
    role: "subtitle",
    width: 1680,
    height: 100,
  },
  body: {
    label: "Body",
    startingParagraphs: ["Body text"],
    fontSize: 28,
    bold: false,
    listStyle: "none",
    role: "body",
    width: 880,
    height: 300,
  },
  bullets: {
    label: "Bulleted list",
    startingParagraphs: ["Point one", "Point two"],
    fontSize: 28,
    bold: false,
    listStyle: "bullet",
    role: "body",
    width: 880,
    height: 300,
  },
  numbers: {
    label: "Numbered list",
    startingParagraphs: ["Step one", "Step two"],
    fontSize: 28,
    bold: false,
    listStyle: "number",
    role: "body",
    width: 880,
    height: 300,
  },
}

export const TEXT_PRESET_NAMES = Object.keys(TEXT_PRESETS) as TextPresetName[]

// Undefined when the text box has been styled by hand into something else.
export function findTextPreset(element: TextElement) {
  return TEXT_PRESET_NAMES.find((presetName) => {
    const preset = TEXT_PRESETS[presetName]
    return (
      preset.fontSize === element.fontSize && preset.bold === element.bold && preset.listStyle === element.listStyle
    )
  })
}
