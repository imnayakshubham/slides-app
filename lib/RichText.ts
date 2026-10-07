import type { JSONContent } from "@tiptap/react"
import type { CSSProperties } from "react"

import type { Paragraph, TextRun } from "@/lib/schema/Deck"

export type TextMark = "bold" | "italic" | "underline" | "color" | "fontSize"

// The style of the whole text box, used by any words that don't set their own.
export type TextBoxStyle = {
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  fontSize: number
}

export type TextStyleChanges = Partial<TextBoxStyle>

const TEXT_MARKS: TextMark[] = ["bold", "italic", "underline", "color", "fontSize"]

export function paragraphText(paragraph: Paragraph) {
  if (typeof paragraph === "string") return paragraph
  return paragraph.map((run) => run.text).join("")
}

export function paragraphRuns(paragraph: Paragraph): TextRun[] {
  if (typeof paragraph === "string") return [{ text: paragraph }]
  return paragraph
}

function hasMarks(run: TextRun) {
  return TEXT_MARKS.some((mark) => run[mark] !== undefined)
}

function sameMarks(run: TextRun, otherRun: TextRun) {
  return TEXT_MARKS.every((mark) => run[mark] === otherRun[mark])
}

// Drops styles that match the box, joins neighbouring pieces with the same style,
// and turns a paragraph with no styles left back into plain text.
export function normalizeRuns(runs: TextRun[], box: TextBoxStyle): Paragraph {
  const mergedRuns: TextRun[] = []
  for (const run of runs) {
    if (run.text === "") continue
    let cleanRun: TextRun = { text: run.text }
    for (const mark of TEXT_MARKS) {
      const isDifferentFromBox = run[mark] !== undefined && run[mark] !== box[mark]
      if (isDifferentFromBox) cleanRun = { ...cleanRun, [mark]: run[mark] }
    }
    const previousRun = mergedRuns.at(-1)
    if (previousRun && sameMarks(previousRun, cleanRun)) {
      previousRun.text += cleanRun.text
    } else {
      mergedRuns.push(cleanRun)
    }
  }
  if (!mergedRuns.some(hasMarks)) return mergedRuns.map((run) => run.text).join("")
  return mergedRuns
}

// In the editor the box itself is plain, so a bold box means every word is made bold (same for italic and underline).
function getEditorStylesForText(run: TextRun, box: TextBoxStyle) {
  const editorStyles: { type: string; attrs?: Record<string, string | null> }[] = []
  if (run.bold ?? box.bold) editorStyles.push({ type: "bold" })
  if (run.italic ?? box.italic) editorStyles.push({ type: "italic" })
  if (run.underline ?? box.underline) editorStyles.push({ type: "underline" })
  if (run.color || run.fontSize) {
    const fontSize = run.fontSize ? `${run.fontSize}px` : null
    editorStyles.push({ type: "textStyle", attrs: { color: run.color ?? null, fontSize } })
  }
  return editorStyles
}

export function convertParagraphsToEditorContent(paragraphs: Paragraph[], box: TextBoxStyle): JSONContent {
  const editorParagraphs = paragraphs.map((paragraph) => {
    const editorTexts = paragraphRuns(paragraph)
      .filter((run) => run.text !== "")
      .map((run) => ({ type: "text", text: run.text, marks: getEditorStylesForText(run, box) }))
    return { type: "paragraph", content: editorTexts }
  })
  return { type: "doc", content: editorParagraphs }
}

function convertEditorTextToTextRun(editorText: JSONContent): TextRun {
  const editorStyles = editorText.marks ?? []
  const colorAndSize = editorStyles.find((style) => style.type === "textStyle")?.attrs
  return {
    text: editorText.text ?? "",
    bold: editorStyles.some((style) => style.type === "bold"),
    italic: editorStyles.some((style) => style.type === "italic"),
    underline: editorStyles.some((style) => style.type === "underline"),
    color: colorAndSize?.color ?? undefined,
    fontSize: colorAndSize?.fontSize ? parseFloat(colorAndSize.fontSize) : undefined,
  }
}

export function convertEditorContentToParagraphs(editorContent: JSONContent, box: TextBoxStyle): Paragraph[] {
  const editorParagraphs = editorContent.content ?? []
  return editorParagraphs.map((editorParagraph) => {
    const textRuns = (editorParagraph.content ?? []).map(convertEditorTextToTextRun)
    return normalizeRuns(textRuns, box)
  })
}

// When a setting is applied to the whole box, words that overrode it follow the box again.
export function clearRunMark(paragraphs: Paragraph[], mark: TextMark) {
  return paragraphs.map((paragraph) => {
    if (typeof paragraph === "string") return paragraph
    const runs = paragraph.map((run) => {
      const runWithoutMark = { ...run }
      delete runWithoutMark[mark]
      return runWithoutMark
    })
    if (runs.some(hasMarks)) return runs
    return paragraphText(runs)
  })
}

// Every run sets its own weight, slant and underline, since CSS can't undo a parent's underline.
export function runStyle(run: TextRun, box: TextBoxStyle): CSSProperties {
  return {
    fontWeight: (run.bold ?? box.bold) ? 700 : 400,
    fontStyle: (run.italic ?? box.italic) ? "italic" : "normal",
    textDecorationLine: (run.underline ?? box.underline) ? "underline" : "none",
    color: run.color,
    fontSize: run.fontSize,
  }
}
