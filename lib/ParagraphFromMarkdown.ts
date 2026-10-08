import "server-only"

import Bold from "@tiptap/extension-bold"
import Document from "@tiptap/extension-document"
import Italic from "@tiptap/extension-italic"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import { MarkdownManager } from "@tiptap/markdown"

import { convertEditorContentToParagraphs, type TextBoxStyle } from "@/lib/RichText"
import type { Paragraph as DeckParagraph } from "@/lib/schema/Deck"

const markdownManager = new MarkdownManager({ extensions: [Document, Paragraph, Text, Bold, Italic] })

const PLAIN_TEXT_BOX: TextBoxStyle = { bold: false, italic: false, underline: false, color: "", fontSize: 0 }

// The AI may mark words as **bold** or *italic*; text that isn't one plain paragraph (e.g. a list) is kept as written.
export function paragraphFromMarkdown(text: string): DeckParagraph {
  const editorContent = markdownManager.parse(text)
  const isOneParagraph = editorContent.content?.length === 1 && editorContent.content[0].type === "paragraph"
  if (!isOneParagraph) return text
  const [paragraph] = convertEditorContentToParagraphs(editorContent, PLAIN_TEXT_BOX)
  return paragraph
}
