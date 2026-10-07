"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useDeckStore } from "@/store/DeckStore"

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

// Applies changes live while the whole adjustment stays one undo step.
function useSingleUndoStep() {
  const isGroupOpenRef = useRef(false)

  function startStep() {
    if (isGroupOpenRef.current) return
    const deckStore = useDeckStore.getState()
    if (deckStore.deckBeforeGroup) return
    deckStore.startUndoGroup()
    isGroupOpenRef.current = true
  }

  function finishStep() {
    if (!isGroupOpenRef.current) return
    isGroupOpenRef.current = false
    useDeckStore.getState().finishUndoGroup()
  }

  // The toolbar can vanish mid-adjustment, so end the undo step on unmount too.
  useEffect(() => {
    return () => {
      if (!isGroupOpenRef.current) return
      isGroupOpenRef.current = false
      useDeckStore.getState().finishUndoGroup()
    }
  }, [])

  return { startStep, finishStep }
}

// Applies the color live while the native picker is open, as one undo step.
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
  const { startStep, finishStep } = useSingleUndoStep()

  // onChange fires for every color; the native "change" event fires once, when the picker closes.
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.addEventListener("change", finishStep)
    return () => input.removeEventListener("change", finishStep)
  })

  return (
    <label title={label} className="relative grid size-8 cursor-pointer place-items-center rounded-md hover:bg-muted">
      <span className="size-4.5 rounded-full border shadow-xs" style={{ background: color }} />
      <input
        ref={inputRef}
        type="color"
        aria-label={label}
        value={HEX_COLOR_PATTERN.test(color) ? color : "#000000"}
        onChange={(event) => {
          startStep()
          onChange(event.target.value)
        }}
        onBlur={finishStep}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

// Applies as you type, as one undo step per edit.
export function TextInput({
  label,
  value,
  placeholder,
  onChange,
  className,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  className?: string
}) {
  const { startStep, finishStep } = useSingleUndoStep()

  return (
    <input
      aria-label={label}
      title={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => {
        startStep()
        onChange(event.target.value)
      }}
      onBlur={finishStep}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
      className={cn(
        "h-7 min-w-0 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    />
  )
}

// Typed values apply once valid; without an undo step it is a plain field (e.g. a chart cell).
export function NumberInput({
  label,
  value,
  step,
  min = -Infinity,
  onChange,
  className,
}: {
  label: string
  value: number
  step?: number
  min?: number
  onChange: (value: number) => void
  className?: string
}) {
  // Null while not typing, so outside changes (undo, the agent) show through.
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const { startStep, finishStep } = useSingleUndoStep()

  function isAllowed(nextValue: number) {
    return Number.isFinite(nextValue) && nextValue >= min
  }

  const input = (
    <input
      aria-label={label}
      title={label}
      inputMode="numeric"
      value={draftValue ?? String(value)}
      onChange={(event) => {
        setDraftValue(event.target.value)
        const typedValue = Number(event.target.value)
        if (event.target.value !== "" && isAllowed(typedValue)) {
          startStep()
          onChange(typedValue)
        }
      }}
      onBlur={() => {
        setDraftValue(null)
        finishStep()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
      className={cn(
        "h-7 w-10 rounded-md border bg-transparent text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    />
  )
  if (step === undefined) return input

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Decrease ${label}`}
        title={`Decrease ${label}`}
        disabled={!isAllowed(value - step)}
        onClick={() => onChange(value - step)}
      >
        <MinusIcon />
      </Button>
      {input}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Increase ${label}`}
        title={`Increase ${label}`}
        onClick={() => onChange(value + step)}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
