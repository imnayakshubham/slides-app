import { memo } from "react"

import { ChartElement } from "@/components/elements/ChartElement"
import { ImageElement } from "@/components/elements/ImageElement"
import { ShapeElement } from "@/components/elements/ShapeElement"
import { TableElement } from "@/components/elements/TableElement"
import { TextElement } from "@/components/elements/TextElement"
import type { Deck, SlideElement } from "@/lib/schema/Deck"

type ElementRendererProps = {
  element: SlideElement
  theme: Deck["theme"]
  animate: boolean
}

// memo: moving an element changes only its wrapper's position, so its
// content (e.g. a chart) doesn't need to render again.
export const ElementRenderer = memo(function ElementRenderer({
  element,
  theme,
  animate,
}: ElementRendererProps) {
  switch (element.type) {
    case "text":
      return <TextElement element={element} />
    case "image":
      return <ImageElement element={element} />
    case "chart":
      return <ChartElement element={element} theme={theme} animate={animate} />
    case "table":
      return <TableElement element={element} theme={theme} />
    case "shape":
      return <ShapeElement element={element} />
  }
})
