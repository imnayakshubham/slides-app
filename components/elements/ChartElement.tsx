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

type ChartElementData = Extract<SlideElement, { type: "chart" }>

// Artboard units: the whole slide is scaled down, so these read like a
// projected slide, not like app UI.
const CHART_TITLE_FONT_SIZE = 36
const CHART_LABEL_FONT_SIZE = 24
const CHART_LINE_WIDTH = 4
const PALETTE_HUE_STEP = 55

type ChartElementProps = {
  element: ChartElementData
  theme: Deck["theme"]
  animate: boolean
}

export function ChartElement({ element, theme, animate }: ChartElementProps) {
  return (
    <figure
      className="flex size-full flex-col"
      style={{ color: theme.colors.text }}
    >
      {element.title && (
        <figcaption
          className="shrink-0 pb-4 text-center font-semibold"
          style={{ fontSize: CHART_TITLE_FONT_SIZE }}
        >
          {element.title}
        </figcaption>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {element.chartType === "pie" ? (
            <PieChartBody element={element} theme={theme} animate={animate} />
          ) : (
            <CartesianChartBody
              element={element}
              theme={theme}
              animate={animate}
            />
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

// Series without their own color get the theme accent, then hue-rotated
// variants of it, so every chart matches the deck theme.
function paletteColor(accent: string, index: number) {
  if (index === 0) return accent
  return `oklch(from ${accent} l c calc(h + ${index * PALETTE_HUE_STEP}))`
}

function seriesKey(seriesIndex: number) {
  return `series${seriesIndex}`
}

// Series names can repeat or contain any text, so rows are keyed by index
// and the visible name is passed separately.
function toChartRows(element: ChartElementData) {
  return element.categories.map((category, categoryIndex) => {
    const row: Record<string, string | number> = { category }
    element.series.forEach((series, seriesIndex) => {
      row[seriesKey(seriesIndex)] = series.data[categoryIndex]
    })
    return row
  })
}

function CartesianChartBody({ element, theme, animate }: ChartElementProps) {
  const rows = toChartRows(element)
  const textColor = theme.colors.text
  const tickStyle = { fill: textColor, fontSize: CHART_LABEL_FONT_SIZE }
  const chartMargin = { top: 8, right: 16, bottom: 8, left: 16 }

  const axes = [
    <CartesianGrid
      key="grid"
      vertical={false}
      stroke={textColor}
      strokeOpacity={0.12}
    />,
    <XAxis
      key="x"
      dataKey="category"
      tick={tickStyle}
      stroke={textColor}
      strokeOpacity={0.3}
      height={element.xAxisLabel ? CHART_LABEL_FONT_SIZE * 3 : undefined}
      label={
        element.xAxisLabel
          ? {
              value: element.xAxisLabel,
              position: "insideBottom",
              ...tickStyle,
            }
          : undefined
      }
    />,
    <YAxis
      key="y"
      tick={tickStyle}
      stroke={textColor}
      strokeOpacity={0.3}
      width={element.yAxisLabel ? CHART_LABEL_FONT_SIZE * 5 : "auto"}
      label={
        element.yAxisLabel
          ? {
              value: element.yAxisLabel,
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
              ...tickStyle,
            }
          : undefined
      }
    />,
    element.showLegend && (
      <Legend
        key="legend"
        wrapperStyle={{ fontSize: CHART_LABEL_FONT_SIZE, color: textColor }}
      />
    ),
  ]

  const seriesColors = element.series.map(
    (series, seriesIndex) =>
      series.color ?? paletteColor(theme.colors.accent, seriesIndex)
  )

  if (element.chartType === "line") {
    return (
      <LineChart data={rows} margin={chartMargin}>
        {axes}
        {element.series.map((series, seriesIndex) => (
          <Line
            key={seriesIndex}
            dataKey={seriesKey(seriesIndex)}
            name={series.name}
            stroke={seriesColors[seriesIndex]}
            strokeWidth={CHART_LINE_WIDTH}
            dot={{ r: CHART_LINE_WIDTH * 1.5 }}
            isAnimationActive={animate}
          />
        ))}
      </LineChart>
    )
  }

  if (element.chartType === "area") {
    return (
      <AreaChart data={rows} margin={chartMargin}>
        {axes}
        {element.series.map((series, seriesIndex) => (
          <Area
            key={seriesIndex}
            dataKey={seriesKey(seriesIndex)}
            name={series.name}
            stroke={seriesColors[seriesIndex]}
            fill={seriesColors[seriesIndex]}
            fillOpacity={0.25}
            strokeWidth={CHART_LINE_WIDTH}
            isAnimationActive={animate}
          />
        ))}
      </AreaChart>
    )
  }

  const isStacked = element.chartType === "stackedBar"
  return (
    <BarChart data={rows} margin={chartMargin}>
      {axes}
      {element.series.map((series, seriesIndex) => (
        <Bar
          key={seriesIndex}
          dataKey={seriesKey(seriesIndex)}
          name={series.name}
          fill={seriesColors[seriesIndex]}
          stackId={isStacked ? "stack" : undefined}
          isAnimationActive={animate}
        />
      ))}
    </BarChart>
  )
}

// A pie shows one series: the first. Each category is a slice.
function PieChartBody({ element, theme, animate }: ChartElementProps) {
  const [firstSeries] = element.series
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
        strokeWidth={CHART_LINE_WIDTH}
        isAnimationActive={animate}
      >
        {slices.map((slice, sliceIndex) => (
          <Cell
            key={slice.category + sliceIndex}
            fill={paletteColor(theme.colors.accent, sliceIndex)}
          />
        ))}
      </Pie>
      {element.showLegend && (
        <Legend
          wrapperStyle={{
            fontSize: CHART_LABEL_FONT_SIZE,
            color: theme.colors.text,
          }}
        />
      )}
    </PieChart>
  )
}
