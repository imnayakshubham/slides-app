import { CLASSIC_CARD_COLORS, type Theme } from "@/lib/schema/Deck"

export const THEME_IDS = ["classic", "sunrise", "midnight", "editorial", "forest", "electric", "graphite"] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const THEMES: Record<ThemeId, Theme & { name: string; mood: string }> = {
  classic: {
    id: "classic",
    name: "Classic",
    mood: "plain white, neutral, all-purpose",
    fontFamily: "Inter",
    headingFont: "Inter",
    colors: {
      background: "#FFFFFF",
      text: "#111827",
      heading: "#111827",
      accent: "#4F46E5",
      card: CLASSIC_CARD_COLORS,
      cardText: "#111827",
    },
  },
  sunrise: {
    id: "sunrise",
    name: "Sunrise",
    mood: "warm cream and coral, friendly and upbeat: startups, products, teams",
    fontFamily: "Space Grotesk",
    headingFont: "Fredoka",
    colors: {
      background: "#F8F0E3",
      text: "#1F1A17",
      heading: "#E85D3A",
      accent: "#E85D3A",
      card: ["#EF8A9A", "#F0B75A", "#EEA5A8", "#A8CBB4"],
      cardText: "#1F1A17",
    },
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    mood: "dark navy, techy and confident: engineering, AI, data, security",
    fontFamily: "Inter",
    headingFont: "Outfit",
    colors: {
      background: "#0B1220",
      text: "#CBD5E1",
      heading: "#F8FAFC",
      accent: "#38BDF8",
      card: ["#1D4ED8", "#0E7490", "#7C3AED", "#0F766E"],
      cardText: "#F8FAFC",
    },
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    mood: "off-white with a serif headline, serious and polished: strategy, finance, research, reports",
    fontFamily: "Inter",
    headingFont: "Playfair Display",
    colors: {
      background: "#FBF8F3",
      text: "#292524",
      heading: "#1C1917",
      accent: "#B91C1C",
      card: ["#F2E8DC", "#E7DED3", "#F5E1DA", "#E4E7DD"],
      cardText: "#1C1917",
      chart: ["#B91C1C", "#57534E", "#B45309", "#1E40AF"],
    },
  },
  forest: {
    id: "forest",
    name: "Forest",
    mood: "soft sage and deep green, calm and natural: health, sustainability, education, wellbeing",
    fontFamily: "Space Grotesk",
    headingFont: "Playfair Display",
    colors: {
      background: "#EEF3EC",
      text: "#1F2A24",
      heading: "#1F4D3A",
      accent: "#2F855A",
      card: ["#CFE3D3", "#E3EBC8", "#D5E6E3", "#EFE3C8"],
      cardText: "#1F2A24",
      chart: ["#2F855A", "#6B8E23", "#B7791F", "#2B6CB0"],
    },
  },
  electric: {
    id: "electric",
    name: "Electric",
    mood: "white with indigo and pastels, modern and energetic: marketing, launches, pitches",
    fontFamily: "Space Grotesk",
    headingFont: "Space Grotesk",
    colors: {
      background: "#FFFFFF",
      text: "#1E1B4B",
      heading: "#4338CA",
      accent: "#6366F1",
      card: ["#E0E7FF", "#FCE7F3", "#CFFAFE", "#FEF3C7"],
      cardText: "#1E1B4B",
      chart: ["#6366F1", "#EC4899", "#06B6D4", "#F59E0B"],
    },
  },
  graphite: {
    id: "graphite",
    name: "Graphite",
    mood: "charcoal with bright lime, bold and high-contrast: sales, sports, events, bold statements",
    fontFamily: "Inter",
    headingFont: "Outfit",
    colors: {
      background: "#18181B",
      text: "#D4D4D8",
      heading: "#FAFAFA",
      accent: "#A3E635",
      card: ["#BEF264", "#7DD3FC", "#FCD34D", "#F9A8D4"],
      cardText: "#18181B",
    },
  },
}

// Strips the picker-only fields, leaving what is saved in the deck.
export function deckThemeFor(themeId: ThemeId): Theme {
  const { id, fontFamily, headingFont, colors } = THEMES[themeId]
  return { id, fontFamily, headingFont, colors }
}

// Font names map to the CSS variables set up by next/font in app/layout.tsx.
const FONT_VARIABLES: Record<string, string> = {
  Inter: "var(--font-sans)",
  "Space Grotesk": "var(--font-space-grotesk)",
  Fredoka: "var(--font-fredoka)",
  Outfit: "var(--font-outfit)",
  "Playfair Display": "var(--font-playfair)",
}

export function fontStack(fontName: string) {
  return `${FONT_VARIABLES[fontName] ?? fontName}, var(--font-sans), sans-serif`
}

// Fallback color for a chart series that has no color of its own.
export function seriesColorFor(theme: Theme, seriesIndex: number) {
  const chartColors = theme.colors.chart ?? [theme.colors.accent, ...theme.colors.card]
  return chartColors[seriesIndex % chartColors.length]
}
