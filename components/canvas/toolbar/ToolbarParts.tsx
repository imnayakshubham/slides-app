"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ToolbarToggle({
  label,
  isActive = false,
  onClick,
  children,
}: {
  label: string
  isActive?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

// Commits once when the native picker closes, not on every color it passes
// through, so picking a color is a single undo step.
export function ColorInput({
  label,
  color,
  onChange,
}: {
  label: string
  color: string
  onChange: (color: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const commitColor = () => onChange(input.value)
    input.addEventListener("change", commitColor)
    return () => input.removeEventListener("change", commitColor)
  }, [onChange])

  return (
    <label
      title={label}
      className="relative grid size-8 cursor-pointer place-items-center rounded-md hover:bg-muted"
    >
      <span
        className="size-4.5 rounded-full border shadow-xs"
        style={{ background: color }}
      />
      <input
        ref={inputRef}
        key={color}
        type="color"
        aria-label={label}
        defaultValue={HEX_COLOR_PATTERN.test(color) ? color : "#000000"}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

export function NumberInput({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string
  value: number
  step: number
  min: number
  onChange: (value: number) => void
}) {
  function commit(nextValue: number) {
    if (Number.isFinite(nextValue) && nextValue >= min) onChange(nextValue)
  }

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Decrease ${label}`}
        title={`Decrease ${label}`}
        onClick={() => commit(value - step)}
      >
        <MinusIcon />
      </Button>
      <input
        key={value}
        aria-label={label}
        title={label}
        inputMode="numeric"
        defaultValue={value}
        onBlur={(event) => commit(Number(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        className="h-7 w-10 rounded-md border bg-transparent text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Increase ${label}`}
        title={`Increase ${label}`}
        onClick={() => commit(value + step)}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
