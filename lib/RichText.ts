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

// Removes marks that repeat the box style, merges matching neighbours, unwraps unstyled paragraphs.
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

// Styles the characters from start up to end, splitting runs at the highlight's edges.
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
    const highlightStart = Math.min(Math.max(start - runStart, 0), run.text.length)
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
