import "server-only"

import { slideLayoutSlots } from "@/lib/layouts/SlideLayouts"
import type { Deck, SlideElement } from "@/lib/schema/Deck"

const MAX_TEXT_PREVIEW_LENGTH = 120
const MAX_CHAT_HISTORY_MESSAGES = 12

export type AgentHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

export function buildDeckContext(
  deck: Deck,
  currentSlideId: string | null,
  selectedElementIds: string[]
) {
  const { colors, fontFamily } = deck.theme
  const lines = [
    `Deck "${deck.title}", ${deck.slides.length} slides. Element boxes are [x, y, w, h] on a 1920x1080 artboard.`,
    `Theme: font ${fontFamily}, background ${colors.background}, text ${colors.text}, accent ${colors.accent}.`,
  ]

  if (currentSlideId) {
    lines.push(`Current slide: ${currentSlideId}. "This slide" means this one.`)
  } else {
    lines.push("There is no current slide.")
  }

  if (selectedElementIds.length > 0) {
    lines.push(
      `Selected elements: ${selectedElementIds.join(", ")}. "This", "it" and "the selected element" mean these.`
    )
  } else {
    lines.push("Nothing is selected.")
  }

  lines.push("")

  deck.slides.forEach((slide, slideIndex) => {
    const slotNames = Object.keys(slideLayoutSlots[slide.layout]).join(", ")
    lines.push(
      `Slide ${slideIndex + 1} id=${slide.id} layout=${slide.layout} slots=[${slotNames}] title="${slide.title}"`
    )

    for (const element of slide.elements) {
      const box = `[${element.x}, ${element.y}, ${element.w}, ${element.h}]`
      lines.push(
        `  - ${element.id} ${element.type} ${box} ${describeElementContent(element)}`
      )
    }
  })

  return lines.join("\n")
}

export function recentMessages(messages: AgentHistoryMessage[]) {
  return messages.slice(-MAX_CHAT_HISTORY_MESSAGES)
}

function describeElementContent(element: SlideElement) {
  switch (element.type) {
    case "text": {
      const text = shortenText(element.paragraphs.join(" / "))
      if (element.listStyle === "none") return `"${text}"`
      return `${element.listStyle} list "${text}"`
    }

    case "image":
      return `alt="${element.alt}"`

    case "chart": {
      const categories = element.categories.join(", ")
      const seriesValues = element.series
        .map((series) => `${series.name}=[${series.data.join(", ")}]`)
        .join("; ")
      return `${element.chartType} chart "${element.title}" categories=[${categories}] ${seriesValues}`
    }

    case "table": {
      const rowCount = element.rows.length
      const columnCount = element.rows[0].length
      if (!element.headerRow) return `${rowCount}x${columnCount} table`
      return `${rowCount}x${columnCount} table, header=[${element.rows[0].join(", ")}]`
    }

    case "shape":
      return `${element.shape} fill=${element.fill}`
  }
}

function shortenText(text: string) {
  if (text.length <= MAX_TEXT_PREVIEW_LENGTH) return text
  return `${text.slice(0, MAX_TEXT_PREVIEW_LENGTH)}...`
}
