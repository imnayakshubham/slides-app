import type { Deck, Paragraph, Slide, SlideElement, Theme } from "@/lib/schema/Deck"

// Every color the old theme gave out, paired with the new theme's color
// for the same role. The heading color is handled separately, because some
// themes use the same color for headings and body text.
function colorPairs(oldTheme: Theme, newTheme: Theme) {
  const pairs: [string, string][] = [
    [oldTheme.colors.text, newTheme.colors.text],
    [oldTheme.colors.accent, newTheme.colors.accent],
    [oldTheme.colors.cardText, newTheme.colors.cardText],
    [oldTheme.colors.background, newTheme.colors.background],
  ]
  oldTheme.colors.card.forEach((cardColor, cardIndex) => {
    const newCards = newTheme.colors.card
    pairs.push([cardColor, newCards[cardIndex % newCards.length]])
  })
  return pairs
}

function sameColor(color: string, otherColor: string) {
  return color.toLowerCase() === otherColor.toLowerCase()
}

// Pure: returns a new deck with the new theme and swapped colors.
export function recolorDeck(deck: Deck, newTheme: Theme): Deck {
  const oldTheme = deck.theme
  const pairs = colorPairs(oldTheme, newTheme)

  function recolor(color: string) {
    const pair = pairs.find(([oldColor]) => sameColor(oldColor, color))
    return pair ? pair[1] : color
  }

  function recolorTextColor(color: string, isHeading: boolean) {
    const isOldHeadingColor = sameColor(color, oldTheme.colors.heading)
    if (isHeading && isOldHeadingColor) return newTheme.colors.heading
    const recolored = recolor(color)
    if (recolored === color && isOldHeadingColor) return newTheme.colors.heading
    return recolored
  }

  function recolorParagraph(paragraph: Paragraph): Paragraph {
    if (typeof paragraph === "string") return paragraph
    if (!paragraph.some((run) => run.color)) return paragraph
    return paragraph.map((run) => (run.color ? { ...run, color: recolor(run.color) } : run))
  }

  function recolorElement(element: SlideElement): SlideElement {
    switch (element.type) {
      case "text":
        return {
          ...element,
          color: recolorTextColor(element.color, element.font === "heading"),
          paragraphs: element.paragraphs.map(recolorParagraph),
        }
      case "shape":
        return {
          ...element,
          fill: recolor(element.fill),
          stroke: recolor(element.stroke),
        }
      case "chart":
        return {
          ...element,
          series: element.series.map((series) => (series.color ? { ...series, color: recolor(series.color) } : series)),
        }
      default:
        return element
    }
  }

  function recolorSlide(slide: Slide): Slide {
    const background = slide.background
    let newBackground = background
    if (background?.type === "color") {
      newBackground = { ...background, color: recolor(background.color) }
    }
    if (background?.type === "gradient") {
      newBackground = {
        ...background,
        from: recolor(background.from),
        to: recolor(background.to),
      }
    }
    return {
      ...slide,
      background: newBackground,
      elements: slide.elements.map(recolorElement),
    }
  }

  return { ...deck, theme: newTheme, slides: deck.slides.map(recolorSlide) }
}
