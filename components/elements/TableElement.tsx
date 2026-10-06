import type { Deck, SlideElement } from "@/lib/schema/Deck"

type TableElementData = Extract<SlideElement, { type: "table" }>

const TABLE_FONT_SIZE = 28

export function TableElement({
  element,
  theme,
}: {
  element: TableElementData
  theme: Deck["theme"]
}) {
  const [firstRow, ...otherRows] = element.rows
  const headerCells = element.headerRow ? firstRow : null
  const bodyRows = element.headerRow ? otherRows : element.rows
  const cellStyle = {
    borderColor: `color-mix(in srgb, ${theme.colors.text} 20%, transparent)`,
  }

  return (
    <table
      className="size-full table-fixed border-collapse"
      style={{ fontSize: TABLE_FONT_SIZE, color: theme.colors.text }}
    >
      {headerCells && (
        <thead
          style={{
            background: `color-mix(in srgb, ${theme.colors.accent} 12%, transparent)`,
          }}
        >
          <tr>
            {headerCells.map((cell, cellIndex) => (
              <th
                key={cellIndex}
                className="border px-[0.6em] py-[0.4em] text-start font-semibold"
                style={cellStyle}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {bodyRows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className="border px-[0.6em] py-[0.4em]"
                style={cellStyle}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
