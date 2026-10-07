import type { Theme } from "@/lib/schema/Deck"

// Stand-in image the AI places when it has no photo; the user swaps it with "Replace image".

const WIDTH = 1600
const HEIGHT = 1200
const CHARACTERS_PER_LINE = 34
const MAX_LINES = 3

function escapeXml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

// Fits the description on MAX_LINES lines, ending in three dots when it is longer.
function wrapDescription(description: string) {
  const lines: string[] = []
  let currentLine = ""
  for (const word of description.trim().split(/\s+/)) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= CHARACTERS_PER_LINE) {
      currentLine = candidate
      continue
    }
    if (currentLine) lines.push(currentLine)
    currentLine = word.slice(0, CHARACTERS_PER_LINE)
  }
  if (currentLine) lines.push(currentLine)
  if (lines.length <= MAX_LINES) return lines
  const shownLines = lines.slice(0, MAX_LINES)
  shownLines[MAX_LINES - 1] = `${shownLines[MAX_LINES - 1]}…`
  return shownLines
}

export function imagePlaceholderSrc(description: string, theme: Theme) {
  const background = theme.colors.card[0]
  const ink = theme.colors.cardText
  const lines = wrapDescription(description)
  const firstLineY = HEIGHT / 2 + 40 - ((lines.length - 1) * 64) / 2

  // Content stays centered, so cropping to the element's shape only trims empty edges.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${escapeXml(background)}"/>
  <g fill="${escapeXml(ink)}" opacity="0.35" transform="translate(${WIDTH / 2 - 90} ${HEIGHT / 2 - 230})">
    <rect x="0" y="0" width="180" height="140" rx="20" fill="none" stroke="${escapeXml(ink)}" stroke-width="12"/>
    <circle cx="125" cy="45" r="18"/>
    <path d="M20 125 L70 65 L105 105 L130 80 L165 125 Z"/>
  </g>
  <g fill="${escapeXml(ink)}" font-family="system-ui, sans-serif" text-anchor="middle">
    ${lines
      .map(
        (line, lineIndex) =>
          `<text x="${WIDTH / 2}" y="${firstLineY + lineIndex * 64}" font-size="52" font-weight="600">${escapeXml(line)}</text>`
      )
      .join("\n    ")}
    <text x="${WIDTH / 2}" y="${firstLineY + lines.length * 64 + 40}" font-size="36" opacity="0.6">Replace image</text>
  </g>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
