import "server-only"

import { slideLayoutSlots } from "@/lib/layouts/SlideLayouts"
import type { Deck, SlideElement } from "@/lib/schema/Deck"

const MAX_TEXT_SUMMARY_LENGTH = 120
const MAX_HISTORY_MESSAGES = 12

export type ChatMessage = { role: "user" | "assistant"; content: string }

// Compact text the model reads instead of the full deck JSON; get_slide
// gives full detail on demand.
export function buildDeckContext(
  deck: Deck,
  currentSlideId: string | null,
  selectedElementIds: string[]
) {
  const lines = [
    `Deck "${deck.title}", ${deck.slides.length} slides. Boxes are [x, y, w, h] on a 1920×1080 artboard.`,
    `Theme: font ${deck.theme.fontFamily}; background ${deck.theme.colors.background}, text ${deck.theme.colors.text}, accent ${deck.theme.colors.accent}.`,
    currentSlideId
      ? `Current slide: ${currentSlideId}. "This slide" means this one.`
      : "No current slide.",
    selectedElementIds.length > 0
      ? `Selected elements: ${selectedElementIds.join(", ")}. "This", "it" and "the selected element" mean these.`
      : "Nothing is selected.",
    "",
  ]

  deck.slides.forEach((slide, slideIndex) => {
    const slotNames = Object.keys(slideLayoutSlots[slide.layout])
    lines.push(
      `Slide ${slideIndex + 1} id=${slide.id} layout=${slide.layout} slots=[${slotNames.join(", ")}] title="${slide.title}"`
    )
    for (const element of slide.elements) {
      lines.push(
        `  - ${element.id} ${element.type} [${element.x}, ${element.y}, ${element.w}, ${element.h}] ${summarizeElement(element)}`
      )
    }
  })

  return lines.join("\n")
}

export function recentMessages(messages: ChatMessage[]) {
  return messages.slice(-MAX_HISTORY_MESSAGES)
}

function summarizeElement(element: SlideElement) {
  switch (element.type) {
    case "text":
      return `${element.listStyle === "none" ? "" : `${element.listStyle} list `}"${truncate(element.paragraphs.join(" / "))}"`
    case "image":
      return `alt="${element.alt}"`
    case "chart": {
      const seriesSummary = element.series
        .map((series) => `${series.name}=[${series.data.join(", ")}]`)
        .join("; ")
      return `${element.chartType} chart "${element.title}" categories=[${element.categories.join(", ")}] ${seriesSummary}`
    }
    case "table": {
      const columnCount = element.rows[0].length
      const header = element.headerRow
        ? ` header=[${element.rows[0].join(", ")}]`
        : ""
      return `${element.rows.length}×${columnCount} table${header}`
    }
    case "shape":
      return `${element.shape} fill=${element.fill}`
  }
}

function truncate(text: string) {
  return text.length > MAX_TEXT_SUMMARY_LENGTH
    ? `${text.slice(0, MAX_TEXT_SUMMARY_LENGTH)}…`
    : text
}
