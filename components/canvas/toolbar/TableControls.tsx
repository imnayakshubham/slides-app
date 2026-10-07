import { PanelTopIcon } from "lucide-react"

import { ToolbarDivider, ToolbarToggle } from "@/components/canvas/toolbar/ToolbarInputs"
import { Button } from "@/components/ui/button"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import type { SlideElement } from "@/lib/schema/Deck"

type TableElementData = Extract<SlideElement, { type: "table" }>

// Rows and columns are added and removed at the end, so every row keeps the same cell count.
export function TableControls({ element }: { element: TableElementData }) {
  const { rows } = element
  const columnCount = rows[0].length

  return (
    <>
      <ToolbarToggle
        label="Header row"
        isActive={element.headerRow}
        onClick={() => updateSelectedElement({ headerRow: !element.headerRow })}
      >
        <PanelTopIcon />
      </ToolbarToggle>
      <ToolbarDivider />
      <TableSizeButton
        label="Remove last row"
        disabled={rows.length === 1}
        onClick={() => updateSelectedElement({ rows: rows.slice(0, -1) })}
      >
        − Row
      </TableSizeButton>
      <TableSizeButton
        label="Add row"
        onClick={() =>
          updateSelectedElement({
            rows: [...rows, Array.from({ length: columnCount }, () => "")],
          })
        }
      >
        + Row
      </TableSizeButton>
      <ToolbarDivider />
      <TableSizeButton
        label="Remove last column"
        disabled={columnCount === 1}
        onClick={() => updateSelectedElement({ rows: rows.map((row) => row.slice(0, -1)) })}
      >
        − Column
      </TableSizeButton>
      <TableSizeButton
        label="Add column"
        onClick={() => updateSelectedElement({ rows: rows.map((row) => [...row, ""]) })}
      >
        + Column
      </TableSizeButton>
    </>
  )
}

function TableSizeButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: string
}) {
  return (
    <Button variant="ghost" size="xs" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}
