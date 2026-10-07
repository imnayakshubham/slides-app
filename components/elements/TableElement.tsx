"use client"

import type { FocusEvent, KeyboardEvent } from "react"

import { focusAtEnd } from "@/components/elements/TextElement"
import type { SlideElement } from "@/lib/schema/Deck"

type TableElementData = Extract<SlideElement, { type: "table" }>

const TABLE_FONT_SIZE = 28

type TableElementProps = {
  element: TableElementData
  isEditing?: boolean
  onFinishEditing?: (rows: string[][]) => void
}

export function TableElement({ element, isEditing = false, onFinishEditing }: TableElementProps) {
  const [firstRow, ...otherRows] = element.rows
  const headerCells = element.headerRow ? firstRow : null
  const bodyRows = element.headerRow ? otherRows : element.rows
  const cellStyle = {
    borderColor: "color-mix(in srgb, currentColor 20%, transparent)",
  }

  // While editing, cells are typed into directly and the rows are read back when focus leaves.
  const cellEditingProps = {
    contentEditable: isEditing,
    suppressContentEditableWarning: true,
    onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
      if (event.key === "Escape") event.currentTarget.blur()
      if (event.key === "Enter") {
        event.preventDefault()
        focusNextCell(event.currentTarget)
      }
    },
  }

  function finishWhenFocusLeavesTable(event: FocusEvent<HTMLTableElement>) {
    if (!isEditing) return
    const table = event.currentTarget
    const nextFocus = event.relatedTarget
    if (nextFocus instanceof Node && table.contains(nextFocus)) return
    onFinishEditing?.(readRows(table))
  }

  return (
    <table
      // A fresh node each edit, so React never fights the browser over typed cell text.
      key={isEditing ? "editing" : "viewing"}
      ref={isEditing ? focusFirstCell : undefined}
      onBlur={finishWhenFocusLeavesTable}
      className="size-full table-fixed border-collapse wrap-anywhere"
      style={{ fontSize: TABLE_FONT_SIZE }}
    >
      {headerCells && (
        <thead
          style={{
            background: "color-mix(in srgb, var(--slide-accent) 18%, transparent)",
            color: "var(--slide-heading)",
          }}
        >
          <tr>
            {headerCells.map((cell, cellIndex) => (
              <th
                key={cellIndex}
                className="border px-[0.6em] py-[0.4em] text-start font-semibold outline-none focus:bg-accent/40"
                style={cellStyle}
                {...cellEditingProps}
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
                className="border px-[0.6em] py-[0.4em] outline-none focus:bg-accent/40"
                style={cellStyle}
                {...cellEditingProps}
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

function readRows(table: HTMLTableElement) {
  return Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => cell.textContent ?? ""))
}

function getCells(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLElement>("th, td"))
}

function focusFirstCell(table: HTMLTableElement | null) {
  if (!table || table.contains(document.activeElement)) return
  const firstCell = getCells(table)[0]
  if (firstCell) focusAtEnd(firstCell)
}

function focusNextCell(cell: HTMLElement) {
  const table = cell.closest("table")
  if (!table) return
  const cells = getCells(table)
  const nextCell = cells[cells.indexOf(cell) + 1]
  if (nextCell) focusAtEnd(nextCell)
  else cell.blur()
}
