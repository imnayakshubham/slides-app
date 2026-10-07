"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import type { Deck, SlideElement } from "@/lib/schema/Deck"
import { seriesColorFor } from "@/lib/themes/Themes"

type ChartElementData = Extract<SlideElement, { type: "chart" }>

// Artboard pixels (1920x1080), not screen pixels.
const TITLE_FONT_SIZE = 36
const LABEL_FONT_SIZE = 24
const LINE_WIDTH = 4
const CHART_MARGIN = { top: 8, right: 16, bottom: 8, left: 16 }

type ChartElementProps = {
  element: ChartElementData
  theme: Deck["theme"]
  animate: boolean
}

export function ChartElement({ element, theme, animate }: ChartElementProps) {
  return (
    <figure className="flex size-full flex-col" style={{ color: theme.colors.text }}>
      {element.title && (
        <figcaption className="shrink-0 pb-4 text-center font-semibold" style={{ fontSize: TITLE_FONT_SIZE }}>
          {element.title}
        </figcaption>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {element.chartType === "pie" ? (
            <PieChartContent element={element} theme={theme} animate={animate} />
          ) : (
            <AxisChartContent element={element} theme={theme} animate={animate} />
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

// Keyed by position because series names can repeat.
function dataKeyForSeries(seriesIndex: number) {
  return `series${seriesIndex}`
}

function buildChartRows(element: ChartElementData) {
  return element.categories.map((category, categoryIndex) => {
    const row: Record<string, string | number> = { category }
    element.series.forEach((series, seriesIndex) => {
      row[dataKeyForSeries(seriesIndex)] = series.data[categoryIndex]
    })
    return row
  })
}

function AxisChartContent({ element, theme, animate }: ChartElementProps) {
  const rows = buildChartRows(element)
  const textColor = theme.colors.text
  const labelStyle = { fill: textColor, fontSize: LABEL_FONT_SIZE }
  const seriesColors = element.series.map((series, seriesIndex) => series.color ?? seriesColorFor(theme, seriesIndex))

  let xAxisLabel = undefined
  let xAxisHeight = undefined
  if (element.xAxisLabel) {
    xAxisLabel = {
      value: element.xAxisLabel,
      position: "insideBottom" as const,
      ...labelStyle,
    }
    xAxisHeight = LABEL_FONT_SIZE * 3
  }

  let yAxisLabel = undefined
  let yAxisWidth: number | "auto" = "auto"
  if (element.yAxisLabel) {
    yAxisLabel = {
      value: element.yAxisLabel,
      angle: -90,
      position: "insideLeft" as const,
      style: { textAnchor: "middle" as const },
      ...labelStyle,
    }
    yAxisWidth = LABEL_FONT_SIZE * 5
  }

  // An array, not a component: Recharts needs them as direct chart children.
  const gridAxesAndLegend = [
    <CartesianGrid key="grid" vertical={false} stroke={textColor} strokeOpacity={0.12} />,
    <XAxis
      key="x-axis"
      dataKey="category"
      tick={labelStyle}
      stroke={textColor}
      strokeOpacity={0.3}
      height={xAxisHeight}
      label={xAxisLabel}
    />,
    <YAxis
      key="y-axis"
      tick={labelStyle}
      stroke={textColor}
      strokeOpacity={0.3}
      width={yAxisWidth}
      label={yAxisLabel}
    />,
  ]
  if (element.showLegend) {
    gridAxesAndLegend.push(<Legend key="legend" wrapperStyle={{ fontSize: LABEL_FONT_SIZE, color: textColor }} />)
  }

  if (element.chartType === "line") {
    return (
      <LineChart data={rows} margin={CHART_MARGIN}>
        {gridAxesAndLegend}
        {element.series.map((series, seriesIndex) => (
          <Line
            key={seriesIndex}
            dataKey={dataKeyForSeries(seriesIndex)}
            name={series.name}
            stroke={seriesColors[seriesIndex]}
            strokeWidth={LINE_WIDTH}
            dot={{ r: LINE_WIDTH * 1.5 }}
            isAnimationActive={animate}
          />
        ))}
      </LineChart>
    )
  }

  if (element.chartType === "area") {
    return (
      <AreaChart data={rows} margin={CHART_MARGIN}>
        {gridAxesAndLegend}
        {element.series.map((series, seriesIndex) => (
          <Area
            key={seriesIndex}
            dataKey={dataKeyForSeries(seriesIndex)}
            name={series.name}
            stroke={seriesColors[seriesIndex]}
            fill={seriesColors[seriesIndex]}
            fillOpacity={0.25}
            strokeWidth={LINE_WIDTH}
            isAnimationActive={animate}
          />
        ))}
      </AreaChart>
    )
  }

  const stackId = element.chartType === "stackedBar" ? "stack" : undefined
  return (
    <BarChart data={rows} margin={CHART_MARGIN}>
      {gridAxesAndLegend}
      {element.series.map((series, seriesIndex) => (
        <Bar
          key={seriesIndex}
          dataKey={dataKeyForSeries(seriesIndex)}
          name={series.name}
          fill={seriesColors[seriesIndex]}
          stackId={stackId}
          isAnimationActive={animate}
        />
      ))}
    </BarChart>
  )
}

// A pie chart shows only the first series.
function PieChartContent({ element, theme, animate }: ChartElementProps) {
  const firstSeries = element.series[0]
  const slices = element.categories.map((category, categoryIndex) => ({
    category,
    value: firstSeries.data[categoryIndex],
  }))

  return (
    <PieChart>
      <Pie
        data={slices}
        dataKey="value"
        nameKey="category"
        outerRadius="85%"
        stroke={theme.colors.background}
        strokeWidth={LINE_WIDTH}
        isAnimationActive={animate}
      >
        {slices.map((slice, sliceIndex) => (
          <Cell key={sliceIndex} fill={seriesColorFor(theme, sliceIndex)} />
        ))}
      </Pie>
      {element.showLegend && <Legend wrapperStyle={{ fontSize: LABEL_FONT_SIZE, color: theme.colors.text }} />}
    </PieChart>
  )
}
