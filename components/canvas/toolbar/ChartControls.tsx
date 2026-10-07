import { ListIcon } from "lucide-react"

import { ChartDataEditor } from "@/components/canvas/toolbar/ChartDataEditor"
import { ToolbarToggle } from "@/components/canvas/toolbar/ToolbarInputs"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"

type ChartElementData = Extract<SlideElement, { type: "chart" }>

const CHART_TYPE_OPTIONS = [
  { chartType: "bar", label: "Bar" },
  { chartType: "stackedBar", label: "Stacked bar" },
  { chartType: "line", label: "Line" },
  { chartType: "area", label: "Area" },
  { chartType: "pie", label: "Pie" },
] as const

export function ChartControls({ element }: { element: ChartElementData }) {
  return (
    <>
      <select
        aria-label="Chart type"
        title="Chart type"
        value={element.chartType}
        onChange={(event) =>
          updateSelectedElement({
            chartType: event.target.value as ChartElementData["chartType"],
          })
        }
        className="h-8 rounded-md bg-transparent px-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {CHART_TYPE_OPTIONS.map(({ chartType, label }) => (
          <option key={chartType} value={chartType}>
            {label}
          </option>
        ))}
      </select>
      <ToolbarToggle
        label="Show legend"
        isActive={element.showLegend}
        onClick={() => updateSelectedElement({ showLegend: !element.showLegend })}
      >
        <ListIcon />
      </ToolbarToggle>
      <ChartDataEditor element={element} />
    </>
  )
}
