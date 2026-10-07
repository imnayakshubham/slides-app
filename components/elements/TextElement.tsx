"use client"

import { useEffect, useEffectEvent, useRef, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react"

import {
  readBoxStyle,
  readHighlightStyle,
  readParagraphsFromEditor,
  setActiveTextEditFinisher,
  setHighlightedRange,
} from "@/lib/client/RichTextEditing"
import { paragraphRuns, runStyle, type TextBoxStyle } from "@/lib/RichText"
import type { Paragraph, SlideElement } from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store/EditorStore"

type TextElementData = Extract<SlideElement, { type: "text" }>

type TextElementProps = {
  element: TextElementData
  isEditing?: boolean
  onFinishEditing?: (paragraphs: Paragraph[], height: number) => void
}

// Focus can move into the floating toolbar (color picker, font size box)
// without ending the edit, so its settings can style the highlighted words.
function isInsideSelectionToolbar(node: EventTarget | null) {
  return node instanceof Element && node.closest("[data-selection-toolbar]")
}

export function TextElement({ element, isEditing = false, onFinishEditing }: TextElementProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const hasFinishedRef = useRef(false)
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
    fontFamily: element.font === "heading" ? "var(--slide-heading-font)" : undefined,
  }

  // Ends the edit exactly once, however it ends (blur, Escape, a press
  // outside), and reads the paragraphs back from the screen.
  function finishEditing() {
    const root = rootRef.current
    if (!root || hasFinishedRef.current) return
    hasFinishedRef.current = true
    setHighlightedRange(null)
    const paragraphs = readParagraphsFromEditor(root, readBoxStyle(root, box.underline))
    onFinishEditing?.(paragraphs, root.offsetHeight)
  }
  const finishEditingFromListener = useEffectEvent(finishEditing)

  const rememberHighlight = useEffectEvent(() => {
    const root = rootRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    // Focus moved to the toolbar: keep the last highlight.
    if (!root.contains(range.commonAncestorContainer)) return

    const { setHighlightedTextStyle } = useEditorStore.getState()
    if (range.collapsed) {
      setHighlightedRange(null)
      setHighlightedTextStyle(null)
      return
    }
    setHighlightedRange(range.cloneRange())
    setHighlightedTextStyle(readHighlightStyle(range, root, readBoxStyle(root, box.underline)))
  })

  useEffect(() => {
    if (!isEditing) return
    function finishWhenPressingOutside(event: PointerEvent) {
      const isInsideText = rootRef.current?.contains(event.target as Node)
      if (isInsideText || isInsideSelectionToolbar(event.target)) return
      finishEditingFromListener()
    }
    document.addEventListener("selectionchange", rememberHighlight)
    document.addEventListener("pointerdown", finishWhenPressingOutside, true)
    setActiveTextEditFinisher(() => finishEditingFromListener())
    return () => {
      setActiveTextEditFinisher(null)
      document.removeEventListener("selectionchange", rememberHighlight)
      document.removeEventListener("pointerdown", finishWhenPressingOutside, true)
    }
  }, [isEditing])

  // A new root node per edit session (see the key below), so this runs once
  // when each session starts.
  function startEditingSession(root: HTMLElement | null) {
    rootRef.current = root
    if (!root) return
    hasFinishedRef.current = false
    focusAtEnd(root)
  }

  // The browser edits the paragraphs (or list items) directly.
  const editingProps = {
    ref: isEditing ? startEditingSession : undefined,
    contentEditable: isEditing,
    suppressContentEditableWarning: true,
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!isEditing || isInsideSelectionToolbar(event.relatedTarget)) return
      finishEditing()
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") event.currentTarget.blur()
    },
  }

  const paragraphContent = (paragraph: Paragraph) =>
    paragraphRuns(paragraph).map((run, runIndex) => (
      <span key={runIndex} style={runStyle(run, box)}>
        {run.text}
      </span>
    ))

  if (element.listStyle === "none") {
    return (
      <div
        // A fresh node per edit session, so React never has to reconcile
        // paragraphs the browser added while typing.
        key={isEditing ? "editing" : "viewing"}
        className={cn("leading-tight wrap-anywhere outline-none", isEditing && "select-text")}
        style={textStyle}
        {...editingProps}
      >
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
      key={isEditing ? "editing" : "viewing"}
      className={cn("ps-[1.25em] leading-tight wrap-anywhere outline-none", isEditing && "select-text")}
      style={{
        ...textStyle,
        listStyleType: element.listStyle === "bullet" ? "disc" : "decimal",
      }}
      {...editingProps}
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
