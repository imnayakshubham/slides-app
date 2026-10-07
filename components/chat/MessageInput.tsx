"use client"

import { useId, useState } from "react"
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type MessageInputProps = {
  placeholder: string
  onSubmitPrompt?: (prompt: string) => void
  // While busy the input is disabled and Send becomes Stop.
  isBusy?: boolean
  onStop?: () => void
  className?: string
}

export function MessageInput({ placeholder, onSubmitPrompt, isBusy = false, onStop, className }: MessageInputProps) {
  const promptInputId = useId()
  const [prompt, setPrompt] = useState("")
  const trimmedPrompt = prompt.trim()

  function submitPrompt() {
    if (!trimmedPrompt || !onSubmitPrompt || isBusy) return
    onSubmitPrompt(trimmedPrompt)
    setPrompt("")
  }

  return (
    <form
      className={cn("flex w-full flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm", className)}
      onSubmit={(event) => {
        event.preventDefault()
        submitPrompt()
      }}
    >
      <label htmlFor={promptInputId} className="sr-only">
        Prompt
      </label>
      <Textarea
        id={promptInputId}
        value={prompt}
        disabled={isBusy}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submitPrompt()
          }
        }}
        placeholder={placeholder}
        className="max-h-40 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" aria-label="Attach" title="Attach">
          <PlusIcon />
        </Button>
        {isBusy ? (
          <Button type="button" size="icon" className="rounded-full" aria-label="Stop" title="Stop" onClick={onStop}>
            <SquareIcon className="fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="rounded-full"
            disabled={!trimmedPrompt}
            aria-label="Send"
            title="Send"
          >
            <ArrowUpIcon />
          </Button>
        )}
      </div>
    </form>
  )
}
