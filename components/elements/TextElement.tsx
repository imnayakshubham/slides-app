"use client"

import type { CSSProperties } from "react"

import { TextEditor } from "@/components/elements/TextEditor"
import { paragraphRuns, runStyle, type TextBoxStyle } from "@/lib/RichText"
import { usesHeadingFont } from "@/lib/schema/Deck"
import type { Paragraph, SlideElement } from "@/lib/schema/Deck"

type TextElementData = Extract<SlideElement, { type: "text" }>

type TextElementProps = {
  element: TextElementData
  isEditing?: boolean
  onFinishEditing?: (paragraphs: Paragraph[], height: number) => void
}

export function TextElement({ element, isEditing = false, onFinishEditing }: TextElementProps) {
  const box: TextBoxStyle = {
    bold: element.bold,
    italic: element.italic,
    underline: element.underline ?? false,
    color: element.color,
    fontSize: element.fontSize,
  }
  const textStyle: CSSProperties = {
    fontSize: element.fontSize,
    fontWeight: element.bold ? 700 : 400,
    fontStyle: element.italic ? "italic" : "normal",
    color: element.color,
    textAlign: element.align,
    fontFamily: usesHeadingFont(element.role) ? "var(--slide-heading-font)" : undefined,
  }

  if (isEditing && onFinishEditing) {
    return <TextEditor element={element} box={box} textStyle={textStyle} onFinishEditing={onFinishEditing} />
  }

  const paragraphContent = (paragraph: Paragraph) =>
    paragraphRuns(paragraph).map((run, runIndex) => (
      <span key={runIndex} style={runStyle(run, box)}>
        {run.text}
      </span>
    ))

  if (element.listStyle === "none") {
    return (
      <div className="leading-tight wrap-anywhere" style={textStyle}>
        {element.paragraphs.map((paragraph, index) => (
          <p key={index} className="min-h-[1lh] whitespace-pre-wrap">
            {paragraphContent(paragraph)}
          </p>
        ))}
      </div>
    )
  }

  const ListTag = element.listStyle === "bullet" ? "ul" : "ol"
  return (
    <ListTag
      className="ps-[1.25em] leading-tight wrap-anywhere"
      style={{
        ...textStyle,
        listStyleType: element.listStyle === "bullet" ? "disc" : "decimal",
      }}
    >
      {element.paragraphs.map((paragraph, index) => (
        <li key={index} className="mb-[0.4em] whitespace-pre-wrap">
          {paragraphContent(paragraph)}
        </li>
      ))}
    </ListTag>
  )
}

export function focusAtEnd(root: HTMLElement | null) {
  if (!root) return
  root.focus()
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
