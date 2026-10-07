"use client"

import { useState, type KeyboardEvent } from "react"
import type { useSortable } from "@dnd-kit/sortable"
import { ArrowUpIcon, GripVerticalIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useDeckAgent } from "@/hooks/UseDeckAgent"
import { sendAgentMessage } from "@/lib/client/AgentActions"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store/EditorStore"

type Sortable = ReturnType<typeof useSortable>

type SlideRailProps = {
  slideId: string
  slideNumber: number
  dragHandleListeners: Sortable["listeners"]
  setDragHandleRef: Sortable["setActivatorNodeRef"]
  className?: string
}

const RAIL_BUTTON_CLASS = "rounded-xl bg-card shadow-sm"

// Buttons beside a slide: drag to reorder, or ask the AI about this slide.
export function SlideRail({ slideId, slideNumber, dragHandleListeners, setDragHandleRef, className }: SlideRailProps) {
  return (
    <div className={cn("flex gap-2 sm:flex-col", className)}>
      <Button
        ref={setDragHandleRef}
        {...dragHandleListeners}
        variant="outline"
        size="icon"
        aria-label={`Drag to reorder slide ${slideNumber}`}
        title="Drag to reorder"
        className={cn(RAIL_BUTTON_CLASS, "cursor-grab touch-none")}
      >
        <GripVerticalIcon />
      </Button>
      <EditWithAgentPopover slideId={slideId} slideNumber={slideNumber} />
    </div>
  )
}

// The chat already treats the open slide as "this slide", so a normal message is enough.
function EditWithAgentPopover({ slideId, slideNumber }: { slideId: string; slideNumber: number }) {
  const isAgentBusy = useDeckAgent((agent) => agent.run !== null)
  const [isOpen, setIsOpen] = useState(false)
  const [request, setRequest] = useState("")

  function send() {
    const text = request.trim()
    if (!text || isAgentBusy) return
    useEditorStore.getState().goToSlide(slideId)
    void sendAgentMessage(text)
    setRequest("")
    setIsOpen(false)
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (open) useEditorStore.getState().goToSlide(slideId)
        setIsOpen(open)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={`Edit slide ${slideNumber} with agent`}
            title={isAgentBusy ? "The agent is busy" : "Edit with agent"}
            disabled={isAgentBusy}
            className={RAIL_BUTTON_CLASS}
          />
        }
      >
        <SparklesIcon />
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80">
        <p className="font-medium">Edit with agent</p>
        <Textarea
          autoFocus
          value={request}
          placeholder="Make this slide more concise…"
          aria-label={`What should the agent change on slide ${slideNumber}?`}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={sendOnEnter}
          className="max-h-40"
        />
        <Button size="sm" className="self-end" disabled={!request.trim() || isAgentBusy} onClick={send}>
          <ArrowUpIcon />
          Send
        </Button>
      </PopoverContent>
    </Popover>
  )
}
