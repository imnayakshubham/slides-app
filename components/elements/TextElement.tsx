import type { SlideElement } from "@/lib/schema/Deck"

type TextElementData = Extract<SlideElement, { type: "text" }>

export function TextElement({ element }: { element: TextElementData }) {
  const textStyle = {
    fontSize: element.fontSize,
    fontWeight: element.bold ? 700 : 400,
    fontStyle: element.italic ? "italic" : "normal",
    color: element.color,
    textAlign: element.align,
  } as const

  if (element.listStyle === "none") {
    return (
      <div className="size-full leading-tight" style={textStyle}>
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
      className="size-full ps-[1.25em] leading-tight"
      style={{
        ...textStyle,
        listStyleType: element.listStyle === "bullet" ? "disc" : "decimal",
      }}
    >
      {element.paragraphs.map((paragraph, index) => (
        <li key={index} className="mb-[0.4em] whitespace-pre-wrap">
          {paragraph}
        </li>
      ))}
    </ListTag>
  )
}
