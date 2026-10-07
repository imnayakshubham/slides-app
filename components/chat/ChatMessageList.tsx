"use client"

import { memo, useEffect, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { BotIcon, CheckIcon, CircleAlertIcon, RotateCcwIcon } from "lucide-react"

import { GenerationProgress } from "@/components/chat/GenerationProgress"
import { OutlineReview } from "@/components/chat/OutlineReview"
import { Button } from "@/components/ui/button"
import { useDeckChat } from "@/hooks/UseAgentChat"
import type { SlidesMessage } from "@/lib/ai/SlidesMessage"
import { changesIn, outlineIn, textOf } from "@/lib/client/DeckChat"
import { messageFromError } from "@/lib/ErrorMessage"
import { cn } from "@/lib/utils"

const ESTIMATED_MESSAGE_HEIGHT_PX = 80
const GAP_BETWEEN_MESSAGES_PX = 16
// Within this distance of the bottom, the list keeps following new text.
const FOLLOW_BOTTOM_DISTANCE_PX = 48

type ChatMessageListProps = {
  onRetry: () => void
  className?: string
}

// Only messages near the visible area are drawn, so long chats stay fast.
export function ChatMessageList({ onRetry, className }: ChatMessageListProps) {
  const { messages: chatMessages, status, error } = useDeckChat()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // The React Compiler can't handle this hook's result, so it just skips it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: chatMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    getItemKey: (index) => chatMessages[index].id,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
    gap: GAP_BETWEEN_MESSAGES_PX,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: FOLLOW_BOTTOM_DISTANCE_PX,
  })

  // The list helper stays the same object, so this runs only once, when the chat opens.
  useEffect(() => {
    virtualizer.scrollToEnd()
  }, [virtualizer])

  const isWaitingForReply = status === "submitted"

  return (
    <div ref={scrollContainerRef} className={cn("overflow-y-auto", className)}>
      <ol aria-label="Messages" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const message = chatMessages[virtualItem.index]
          return (
            <li
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <ChatMessageItem
                message={message}
                isReplying={status === "streaming" && virtualItem.index === chatMessages.length - 1}
              />
            </li>
          )
        })}
      </ol>
      {isWaitingForReply && <p className="animate-pulse px-1 pt-4 text-sm text-muted-foreground">Thinking...</p>}
      {status === "error" && (
        <div className="flex flex-wrap items-center gap-2 px-1 pt-4 text-sm text-destructive">
          <span>{messageFromError(error)}</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcwIcon />
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}

// While a reply streams in, only that message redraws.
const ChatMessageItem = memo(function ChatMessageItem({
  message,
  isReplying,
}: {
  message: SlidesMessage
  isReplying: boolean
}) {
  const text = textOf(message)
  if (message.role === "user") {
    return (
      <div className="flex justify-end ps-8">
        <p className="rounded-2xl bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">{text}</p>
      </div>
    )
  }

  const outline = outlineIn(message)
  const changes = changesIn(message)

  if (!text && changes.length === 0 && !outline) {
    if (isReplying) return null
    return (
      <p className="flex items-center gap-1.5 text-sm text-destructive">
        <CircleAlertIcon className="size-4 shrink-0" />
        No reply. The request failed or was stopped.
      </p>
    )
  }
  return (
    <div className="flex gap-2.5 rounded-2xl bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">
      <span
        aria-label="Agent"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <BotIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        {changes.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {changes.map((change, changeIndex) => (
              <li key={changeIndex} className="flex items-start gap-1.5">
                {change.failed ? (
                  <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-label="Failed" />
                ) : (
                  <CheckIcon className="mt-px size-3.5 shrink-0" aria-label="Done" />
                )}
                <span className={cn(change.failed && "opacity-70")}>{change.label}</span>
              </li>
            ))}
          </ul>
        )}
        {text && <p className="whitespace-pre-wrap">{text}</p>}
        {outline && (
          <p>
            Here is the outline for {outline.title} ({outline.slides.length} slides). Edit, reorder or remove slides,
            then generate.
          </p>
        )}
        <OutlineReview messageId={message.id} />
        <GenerationProgress messageId={message.id} />
      </div>
    </div>
  )
})
