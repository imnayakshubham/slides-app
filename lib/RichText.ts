import type { CSSProperties } from "react"

import type { Paragraph, TextRun } from "@/lib/schema/Deck"

export type TextMark = "bold" | "italic" | "underline" | "color" | "fontSize"

// The box-wide style that runs fall back to.
export type TextBoxStyle = {
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  fontSize: number
}

export type TextStyleChanges = Partial<TextBoxStyle>

const TEXT_MARKS: TextMark[] = [
  "bold",
  "italic",
  "underline",
  "color",
  "fontSize",
]

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

// Drops marks that only repeat the box style, joins neighbours with the same
// marks, and turns an unstyled paragraph back into a plain string.
export function normalizeRuns(runs: TextRun[], box: TextBoxStyle): Paragraph {
  const mergedRuns: TextRun[] = []
  for (const run of runs) {
    if (run.text === "") continue
    const cleanRun: TextRun = { text: run.text }
    for (const mark of TEXT_MARKS) {
      const value = run[mark]
      if (value !== undefined && value !== box[mark]) {
        Object.assign(cleanRun, { [mark]: value })
      }
    }
    const previousRun = mergedRuns.at(-1)
    if (previousRun && sameMarks(previousRun, cleanRun)) {
      previousRun.text += cleanRun.text
    } else {
      mergedRuns.push(cleanRun)
    }
  }
  if (!mergedRuns.some(hasMarks))
    return mergedRuns.map((run) => run.text).join("")
  return mergedRuns
}

// Applies the changes to the characters from start to end (end exclusive),
// splitting runs where the highlight begins and ends.
export function styleRunRange(
  runs: TextRun[],
  start: number,
  end: number,
  changes: TextStyleChanges,
  box: TextBoxStyle
): Paragraph {
  const styledRuns: TextRun[] = []
  let runStart = 0
  for (const run of runs) {
    const runEnd = runStart + run.text.length
    const highlightStart = Math.min(
      Math.max(start - runStart, 0),
      run.text.length
    )
    const highlightEnd = Math.min(Math.max(end - runStart, 0), run.text.length)
    styledRuns.push(
      { ...run, text: run.text.slice(0, highlightStart) },
      {
        ...run,
        ...changes,
        text: run.text.slice(highlightStart, highlightEnd),
      },
      { ...run, text: run.text.slice(highlightEnd) }
    )
    runStart = runEnd
  }
  return normalizeRuns(styledRuns, box)
}

// When a setting is applied to the whole text box, words that overrode that
// setting follow the box again.
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

// Every run states its own weight, slant and underline, so a word can turn
// underline off inside an underlined box (CSS underlines can't be undone by
// a child element).
export function runStyle(run: TextRun, box: TextBoxStyle): CSSProperties {
  return {
    fontWeight: (run.bold ?? box.bold) ? 700 : 400,
    fontStyle: (run.italic ?? box.italic) ? "italic" : "normal",
    textDecorationLine: (run.underline ?? box.underline) ? "underline" : "none",
    color: run.color,
    fontSize: run.fontSize,
  }
}
