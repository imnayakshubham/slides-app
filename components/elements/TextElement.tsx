"use client"

import type { CSSProperties, FocusEvent, KeyboardEvent } from "react"

import type { SlideElement } from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"

type TextElementData = Extract<SlideElement, { type: "text" }>

type TextElementProps = {
  element: TextElementData
  isEditing?: boolean
  onFinishEditing?: (paragraphs: string[], height: number) => void
}

export function TextElement({
  element,
  isEditing = false,
  onFinishEditing,
}: TextElementProps) {
  const textStyle: CSSProperties = {
    fontSize: element.fontSize,
    fontWeight: element.bold ? 700 : 400,
    fontStyle: element.italic ? "italic" : "normal",
    color: element.color,
    textAlign: element.align,
  }

  // The browser edits the paragraphs (or list items) directly; on blur we
  // read them back as one string per child element.
  const editingProps = {
    ref: isEditing ? focusAtEnd : undefined,
    contentEditable: isEditing,
    suppressContentEditableWarning: true,
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!isEditing) return
      const root = event.currentTarget
      onFinishEditing?.(readParagraphs(root), root.offsetHeight)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") event.currentTarget.blur()
    },
  }

  if (element.listStyle === "none") {
    return (
      <div
        // A fresh node per edit session, so React never has to reconcile
        // paragraphs the browser added while typing.
        key={isEditing ? "editing" : "viewing"}
        className={cn("leading-tight outline-none", isEditing && "select-text")}
        style={textStyle}
        {...editingProps}
      >
        {element.paragraphs.map((paragraph, index) => (
          <p key={index} className="min-h-[1lh] whitespace-pre-wrap">
            {paragraph}
          </p>
        ))}
      </div>
    )
  }

  const ListTag = element.listStyle === "bullet" ? "ul" : "ol"
  return (
    <ListTag
      key={isEditing ? "editing" : "viewing"}
      className={cn(
        "ps-[1.25em] leading-tight outline-none",
        isEditing && "select-text"
      )}
      style={{
        ...textStyle,
        listStyleType: element.listStyle === "bullet" ? "disc" : "decimal",
      }}
      {...editingProps}
    >
      {element.paragraphs.map((paragraph, index) => (
        <li key={index} className="mb-[0.4em] whitespace-pre-wrap">
          {paragraph}
        </li>
      ))}
    </ListTag>
  )
}

function readParagraphs(root: HTMLElement) {
  const blocks = Array.from(root.children)
  if (blocks.length === 0) return [root.textContent ?? ""]
  return blocks.map((block) => block.textContent ?? "")
}

function focusAtEnd(root: HTMLElement | null) {
  if (!root) return
  root.focus()
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
