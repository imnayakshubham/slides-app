import type { SlideElement } from "@/lib/schema/Deck"

type ShapeElementData = Extract<SlideElement, { type: "shape" }>

export function ShapeElement({ element }: { element: ShapeElementData }) {
  // Inset by half the stroke so the outline stays inside the element's box.
  const inset = element.strokeWidth / 2
  const shapeProps = {
    fill: element.fill,
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
  }

  return (
    <svg className="size-full" viewBox={`0 0 ${element.w} ${element.h}`} preserveAspectRatio="none" aria-hidden>
      {element.shape === "rect" ? (
        <rect
          x={inset}
          y={inset}
          width={Math.max(element.w - element.strokeWidth, 0)}
          height={Math.max(element.h - element.strokeWidth, 0)}
          {...shapeProps}
        />
      ) : (
        <ellipse
          cx={element.w / 2}
          cy={element.h / 2}
          rx={Math.max(element.w / 2 - inset, 0)}
          ry={Math.max(element.h / 2 - inset, 0)}
          {...shapeProps}
        />
      )}
    </svg>
  )
}
