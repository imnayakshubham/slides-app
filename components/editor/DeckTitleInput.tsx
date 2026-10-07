"use client"

import { useRef, useState } from "react"

import { cn } from "@/lib/utils"

type DeckTitleInputProps = {
  title: string
  // Read by screen readers; this input also renames slides.
  label?: string
  onRename: (title: string) => void
  onFinishEditing?: () => void
  autoFocus?: boolean
  className?: string
}

export function DeckTitleInput({
  title,
  label = "Deck title",
  onRename,
  onFinishEditing,
  autoFocus,
  className,
}: DeckTitleInputProps) {
  // Null while not editing, so outside changes (undo, the agent) show through.
  const [draftTitle, setDraftTitle] = useState<string | null>(null)
  const isCancellingRef = useRef(false)

  return (
    <input
      aria-label={label}
      value={draftTitle ?? title}
      autoFocus={autoFocus}
      onChange={(event) => setDraftTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          isCancellingRef.current = true
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => {
        const trimmedTitle = event.currentTarget.value.trim()
        const shouldRename =
          !isCancellingRef.current && trimmedTitle && trimmedTitle !== title
        if (shouldRename) onRename(trimmedTitle)
        isCancellingRef.current = false
        setDraftTitle(null)
        onFinishEditing?.()
      }}
      className={cn(
        "min-w-0 truncate rounded-md bg-transparent px-1.5 py-0.5 font-medium outline-none hover:bg-muted focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    />
  )
}
