"use client"

import { PlusIcon, SlidersHorizontalIcon, XIcon } from "lucide-react"

import {
  ColorInput,
  NumberInput,
  TextInput,
} from "@/components/canvas/toolbar/ToolbarInputs"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"
import { seriesColorFor } from "@/lib/themes/Themes"
import { useDeckStore } from "@/store/DeckStore"

type ChartElementData = Extract<SlideElement, { type: "chart" }>

// Title, axis labels, series colors and the data grid of the selected chart.
// Categories and series are always replaced whole, so every series keeps
// exactly one value per category.
export function ChartDataEditor({ element }: { element: ChartElementData }) {
  const theme = useDeckStore((state) => state.deck?.theme)
  const { categories, series } = element
  const isPie = element.chartType === "pie"

  function renameCategory(categoryIndex: number, name: string) {
    updateSelectedElement({
      categories: categories.map((category, index) =>
        index === categoryIndex ? name : category
      ),
    })
  }

  function addCategory() {
    updateSelectedElement({
      categories: [...categories, `Item ${categories.length + 1}`],
      series: series.map((oneSeries) => ({
        ...oneSeries,
        data: [...oneSeries.data, 0],
      })),
    })
  }

  function removeCategory(categoryIndex: number) {
    updateSelectedElement({
      categories: categories.filter((_, index) => index !== categoryIndex),
      series: series.map((oneSeries) => ({
        ...oneSeries,
        data: oneSeries.data.filter((_, index) => index !== categoryIndex),
      })),
    })
  }

  function updateSeries(
    seriesIndex: number,
    changes: Partial<ChartElementData["series"][number]>
  ) {
    updateSelectedElement({
      series: series.map((oneSeries, index) =>
        index === seriesIndex ? { ...oneSeries, ...changes } : oneSeries
      ),
    })
  }

  function setValue(seriesIndex: number, categoryIndex: number, value: number) {
    updateSeries(seriesIndex, {
      data: series[seriesIndex].data.map((oldValue, index) =>
        index === categoryIndex ? value : oldValue
      ),
    })
  }

  function addSeries() {
    updateSelectedElement({
      series: [
        ...series,
        { name: `Series ${series.length + 1}`, data: categories.map(() => 0) },
      ],
    })
  }

  function removeSeries(seriesIndex: number) {
    updateSelectedElement({
      series: series.filter((_, index) => index !== seriesIndex),
    })
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Edit chart"
            title="Edit chart"
          />
        }
      >
        <SlidersHorizontalIcon />
        Edit
      </PopoverTrigger>
      <PopoverContent className="max-h-[70vh] w-[min(34rem,calc(100vw-2rem))] gap-3 overflow-y-auto">
        <section className="grid gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Labels</h3>
          <TextInput
            label="Chart title"
            placeholder="Chart title"
            value={element.title}
            onChange={(title) => updateSelectedElement({ title })}
          />
          {!isPie && (
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput
                label="X axis label"
                placeholder="X axis label"
                value={element.xAxisLabel ?? ""}
                onChange={(xAxisLabel) => updateSelectedElement({ xAxisLabel })}
              />
              <TextInput
                label="Y axis label"
                placeholder="Y axis label"
                value={element.yAxisLabel ?? ""}
                onChange={(yAxisLabel) => updateSelectedElement({ yAxisLabel })}
              />
            </div>
          )}
        </section>

        <section className="grid gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Data</h3>
          {isPie && (
            <p className="text-xs text-muted-foreground">
              A pie chart shows the first series; slice colors follow the theme.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1">
              <thead>
                <tr>
                  <th />
                  {series.map((oneSeries, seriesIndex) => (
                    <th key={seriesIndex} className="font-normal">
                      <div className="flex items-center">
                        <ColorInput
                          label={`Color of ${oneSeries.name}`}
                          color={
                            oneSeries.color ??
                            (theme ? seriesColorFor(theme, seriesIndex) : "")
                          }
                          onChange={(color) =>
                            updateSeries(seriesIndex, { color })
                          }
                        />
                        <TextInput
                          label={`Series ${seriesIndex + 1} name`}
                          value={oneSeries.name}
                          onChange={(name) =>
                            updateSeries(seriesIndex, { name })
                          }
                          className="w-24"
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${oneSeries.name}`}
                          title="Remove series"
                          disabled={series.length === 1}
                          onClick={() => removeSeries(seriesIndex)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((category, categoryIndex) => (
                  <tr key={categoryIndex}>
                    <td>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${category}`}
                          title="Remove row"
                          disabled={categories.length === 1}
                          onClick={() => removeCategory(categoryIndex)}
                        >
                          <XIcon />
                        </Button>
                        <TextInput
                          label={`Category ${categoryIndex + 1} name`}
                          value={category}
                          onChange={(name) =>
                            renameCategory(categoryIndex, name)
                          }
                          className="w-24"
                        />
                      </div>
                    </td>
                    {series.map((oneSeries, seriesIndex) => (
                      <td key={seriesIndex}>
                        <NumberInput
                          label={`${oneSeries.name}, ${category}`}
                          value={oneSeries.data[categoryIndex]}
                          onChange={(value) =>
                            setValue(seriesIndex, categoryIndex, value)
                          }
                          className="w-full min-w-16"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={addCategory}>
              <PlusIcon />
              Row
            </Button>
            <Button variant="outline" size="sm" onClick={addSeries}>
              <PlusIcon />
              Series
            </Button>
          </div>
        </section>
      </PopoverContent>
    </Popover>
  )
}
