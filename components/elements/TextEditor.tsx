"use client"

import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react"
import Bold from "@tiptap/extension-bold"
import Document from "@tiptap/extension-document"
import Italic from "@tiptap/extension-italic"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style"
import Underline from "@tiptap/extension-underline"
import { UndoRedo } from "@tiptap/extensions"
import { Fragment, Slice, type Node as EditorNode } from "@tiptap/pm/model"
import { EditorContent, useEditor } from "@tiptap/react"

import { convertEditorContentToParagraphs, convertParagraphsToEditorContent, type TextBoxStyle } from "@/lib/RichText"
import type { Paragraph as DeckParagraph, SlideElement } from "@/lib/schema/deck"
import { useEditorStore } from "@/store/EditorStore"

type TextElementData = Extract<SlideElement, { type: "text" }>

type TextEditorProps = {
  element: TextElementData
  box: TextBoxStyle
  textStyle: CSSProperties
  onFinishEditing: (paragraphs: DeckParagraph[], height: number) => void
}

// Set while a text box is being edited; box-wide toolbar changes save the typed text first.
let finishActiveTextEdit: (() => void) | null = null

export function endActiveTextEdit() {
  finishActiveTextEdit?.()
}

// Moving focus into the toolbar doesn't end the edit, so it can style the highlighted words.
function isInsideSelectionToolbar(node: EventTarget | null) {
  return node instanceof Element && node.closest("[data-selection-toolbar]") !== null
}

// Pasted text keeps bold, italic and underline, but takes the box's color and size.
function removeColorAndSizeFromPastedText(pastedContent: Fragment): Fragment {
  const cleanedPieces: EditorNode[] = []
  pastedContent.forEach((piece) => {
    if (piece.isText) {
      const stylesToKeep = piece.marks.filter((style) => style.type.name !== "textStyle")
      cleanedPieces.push(piece.mark(stylesToKeep))
    } else {
      cleanedPieces.push(piece.copy(removeColorAndSizeFromPastedText(piece.content)))
    }
  })
  return Fragment.fromArray(cleanedPieces)
}

export function TextEditor({ element, box, textStyle, onFinishEditing }: TextEditorProps) {
  const hasFinishedEditingRef = useRef(false)
  const isBulletOrNumberedList = element.listStyle !== "none"

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph.configure({ HTMLAttributes: { class: isBulletOrNumberedList ? "list-item mb-[0.4em]" : undefined } }),
      Text,
      Bold,
      Italic,
      Underline,
      TextStyle,
      Color,
      FontSize,
      UndoRedo,
    ],
    content: convertParagraphsToEditorContent(element.paragraphs, box),
    autofocus: "end",
    editorProps: {
      attributes: { class: "leading-tight wrap-anywhere outline-none select-text" },
      transformPasted: (pasted) =>
        new Slice(removeColorAndSizeFromPastedText(pasted.content), pasted.openStart, pasted.openEnd),
      handleKeyDown: (_editorView, event) => {
        if (event.key !== "Escape") return false
        editor.commands.blur()
        return true
      },
    },
    onBlur: ({ event }) => {
      if (isInsideSelectionToolbar(event.relatedTarget)) return
      finishEditing()
    },
  })

  // Ends the edit once, however it ends.
  function finishEditing() {
    if (hasFinishedEditingRef.current) return
    hasFinishedEditingRef.current = true
    onFinishEditing(convertEditorContentToParagraphs(editor.getJSON(), box), editor.view.dom.offsetHeight)
  }
  const finishEditingFromListener = useEffectEvent(finishEditing)

  useEffect(() => {
    function finishWhenPressingOutside(event: PointerEvent) {
      const isClickInsideText = editor.view.dom.contains(event.target as Node)
      if (isClickInsideText || isInsideSelectionToolbar(event.target)) return
      finishEditingFromListener()
    }
    document.addEventListener("pointerdown", finishWhenPressingOutside, true)
    finishActiveTextEdit = () => finishEditingFromListener()
    useEditorStore.getState().setActiveTextEditor(editor)
    return () => {
      document.removeEventListener("pointerdown", finishWhenPressingOutside, true)
      finishActiveTextEdit = null
      useEditorStore.getState().setActiveTextEditor(null)
    }
  }, [editor])

  return (
    <EditorContent
      editor={editor}
      className={isBulletOrNumberedList ? "ps-[1.25em]" : undefined}
      // While editing, bold, italic and underline are set on the words, so the box itself stays plain.
      style={{
        ...textStyle,
        fontWeight: 400,
        fontStyle: "normal",
        listStyleType: element.listStyle === "number" ? "decimal" : "disc",
      }}
    />
  )
}
