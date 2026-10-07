import {
  normalizeRuns,
  paragraphRuns,
  runStyle,
  styleRunRange,
  type TextBoxStyle,
  type TextStyleChanges,
} from "@/lib/RichText"
import type { Paragraph, TextRun } from "@/lib/schema/Deck"
import { useEditorStore } from "@/store/EditorStore"

// Reads and restyles the text box being typed into. Each paragraph (<p> or
// <li>) is read back as runs from the browser's computed styles, so any
// markup the browser creates while typing (Cmd+B adds <b>, Enter adds
// elements) is read the same way.

// The last highlight inside the text being edited. Kept here because
// clicking the toolbar's color picker or font size box moves the browser
// selection away from the text.
let highlightedRange: Range | null = null

export function getHighlightedRange() {
  return highlightedRange
}

export function setHighlightedRange(range: Range | null) {
  highlightedRange = range
}

// Set by the text box being typed into. A whole-box setting ends the edit
// first, so what was typed is saved before the box changes under it.
let finishActiveTextEdit: (() => void) | null = null

export function setActiveTextEditFinisher(finish: (() => void) | null) {
  finishActiveTextEdit = finish
}

export function endActiveTextEdit() {
  finishActiveTextEdit?.()
}

function toHexColor(cssColor: string) {
  const channels = cssColor.match(/\d+(\.\d+)?/g)
  if (!cssColor.startsWith("rgb") || !channels) return cssColor
  return (
    "#" +
    channels
      .slice(0, 3)
      .map((channel) =>
        Math.round(Number(channel)).toString(16).padStart(2, "0")
      )
      .join("")
      .toUpperCase()
  )
}

// Our own spans always set text-decoration-line; <u> comes from Cmd+U.
// Without either, the text follows the box.
function isUnderlined(textNode: Node, block: Element, box: TextBoxStyle) {
  for (
    let element = textNode.parentElement;
    element && element !== block;
    element = element.parentElement
  ) {
    if (element.tagName === "U") return true
    if (element instanceof HTMLElement && element.style.textDecorationLine) {
      return element.style.textDecorationLine.includes("underline")
    }
  }
  return box.underline
}

function readTextStyle(textNode: Node, block: Element, box: TextBoxStyle) {
  const computed = getComputedStyle(textNode.parentElement ?? block)
  return {
    bold: Number(computed.fontWeight) >= 600,
    italic: computed.fontStyle === "italic",
    underline: isUnderlined(textNode, block, box),
    color: toHexColor(computed.color),
    fontSize: Math.round(parseFloat(computed.fontSize)),
  }
}

// The box style as the browser computes it, so colors and sizes compare
// exactly against what readTextStyle reports.
export function readBoxStyle(root: HTMLElement, underline: boolean) {
  const computed = getComputedStyle(root)
  return {
    bold: Number(computed.fontWeight) >= 600,
    italic: computed.fontStyle === "italic",
    underline,
    color: toHexColor(computed.color),
    fontSize: Math.round(parseFloat(computed.fontSize)),
  }
}

function getTextNodes(block: Element) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
  return textNodes
}

function readBlockRuns(block: Element, box: TextBoxStyle): TextRun[] {
  return getTextNodes(block).map((textNode) => ({
    text: textNode.data,
    ...readTextStyle(textNode, block, box),
  }))
}

function getBlocks(root: HTMLElement) {
  return Array.from(root.children)
}

export function readParagraphsFromEditor(
  root: HTMLElement,
  box: TextBoxStyle
): Paragraph[] {
  const blocks = getBlocks(root)
  if (blocks.length === 0) return [root.textContent ?? ""]
  return blocks.map((block) => normalizeRuns(readBlockRuns(block, box), box))
}

// Style of the first highlighted character, for the toolbar buttons.
export function readHighlightStyle(
  range: Range,
  root: HTMLElement,
  box: TextBoxStyle
) {
  const startNode = range.startContainer
  const block = getBlocks(root).find((candidate) =>
    candidate.contains(startNode)
  )
  if (!block) return null
  const textNode =
    startNode.nodeType === Node.TEXT_NODE ? startNode : getTextNodes(block)[0]
  if (!textNode) return null
  return readTextStyle(textNode, block, box)
}

function characterOffset(block: Element, node: Node, offset: number) {
  const rangeToPoint = document.createRange()
  rangeToPoint.selectNodeContents(block)
  rangeToPoint.setEnd(node, offset)
  return rangeToPoint.toString().length
}

function pointAtCharacter(block: Element, characterIndex: number) {
  let remaining = characterIndex
  const textNodes = getTextNodes(block)
  for (const textNode of textNodes) {
    if (remaining <= textNode.data.length)
      return { node: textNode, offset: remaining }
    remaining -= textNode.data.length
  }
  return { node: block, offset: block.childNodes.length }
}

function renderBlockRuns(
  block: Element,
  paragraph: Paragraph,
  box: TextBoxStyle
) {
  block.replaceChildren(
    ...paragraphRuns(paragraph).map((run) => {
      const style = runStyle(run, box)
      const span = document.createElement("span")
      span.textContent = run.text
      span.style.fontWeight = String(style.fontWeight)
      span.style.fontStyle = String(style.fontStyle)
      span.style.textDecorationLine = String(style.textDecorationLine)
      if (run.color) span.style.color = run.color
      if (run.fontSize) span.style.fontSize = `${run.fontSize}px`
      return span
    })
  )
}

// Restyles the highlighted characters of every paragraph the highlight
// touches, then highlights the same characters again so repeated presses
// (e.g. "+" on font size) keep working on them.
export function styleHighlightedText(
  root: HTMLElement,
  changes: TextStyleChanges,
  box: TextBoxStyle
) {
  const range = highlightedRange
  if (!range || range.collapsed) return

  const touchedBlocks = getBlocks(root).filter((block) =>
    range.intersectsNode(block)
  )
  const restyledParts = touchedBlocks.map((block) => {
    const start = block.contains(range.startContainer)
      ? characterOffset(block, range.startContainer, range.startOffset)
      : 0
    const end = block.contains(range.endContainer)
      ? characterOffset(block, range.endContainer, range.endOffset)
      : (block.textContent ?? "").length
    const runs = normalizeRuns(readBlockRuns(block, box), box)
    renderBlockRuns(
      block,
      styleRunRange(paragraphRuns(runs), start, end, changes, box),
      box
    )
    return { block, start, end }
  })

  const firstPart = restyledParts[0]
  const lastPart = restyledParts.at(-1)
  if (!firstPart || !lastPart) return
  const startPoint = pointAtCharacter(firstPart.block, firstPart.start)
  const endPoint = pointAtCharacter(lastPart.block, lastPart.end)
  const newRange = document.createRange()
  newRange.setStart(startPoint.node, startPoint.offset)
  newRange.setEnd(endPoint.node, endPoint.offset)
  highlightedRange = newRange

  if (document.activeElement === root) {
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(newRange)
  }
}

// Styles the highlighted words of the text box being edited and refreshes
// the toolbar's view of them.
export function styleHighlightedWordsOf(
  elementId: string,
  changes: TextStyleChanges,
  boxUnderline: boolean
) {
  const root = document.querySelector<HTMLElement>(
    `[data-canvas-slide-id] [data-element-id="${elementId}"] [contenteditable="true"]`
  )
  if (!root) return
  const box = readBoxStyle(root, boxUnderline)
  styleHighlightedText(root, changes, box)
  const range = highlightedRange
  useEditorStore
    .getState()
    .setHighlightedTextStyle(
      range ? readHighlightStyle(range, root, box) : null
    )
}
