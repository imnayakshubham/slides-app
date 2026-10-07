"use client"

import { memo, useEffect, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { CheckIcon, CircleAlertIcon, RotateCcwIcon } from "lucide-react"

import { GenerationProgress } from "@/components/chat/GenerationProgress"
import { OutlineReview } from "@/components/chat/OutlineReview"
import { Button } from "@/components/ui/button"
import type { ChatMessage } from "@/lib/schema/Conversation"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store/EditorStore"

const ESTIMATED_MESSAGE_HEIGHT_PX = 80
const GAP_BETWEEN_MESSAGES_PX = 16
// Within this distance of the bottom, the list keeps following new text.
const FOLLOW_BOTTOM_DISTANCE_PX = 48

type ChatMessageListProps = {
  onRetry: () => void
  className?: string
}

// Virtualized: only messages near the visible area are rendered, so long
// chats stay fast while a reply streams in.
export function ChatMessageList({ onRetry, className }: ChatMessageListProps) {
  const chatMessages = useEditorStore((state) => state.chatMessages)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // The React Compiler can't memoize this hook's result; it just skips it.
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

  // The virtualizer stays the same object, so this runs once, when the chat opens.
  useEffect(() => {
    virtualizer.scrollToEnd()
  }, [virtualizer])

  const lastMessage = chatMessages.at(-1)

  return (
    <div ref={scrollContainerRef} className={cn("overflow-y-auto", className)}>
      <ol
        aria-label="Messages"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
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
                onRetry={message === lastMessage ? onRetry : undefined}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// memo: while a reply streams, only that message re-renders.
const ChatMessageItem = memo(function ChatMessageItem({
  message,
  onRetry,
}: {
  message: ChatMessage
  onRetry?: () => void
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end ps-8">
        <p className="rounded-2xl bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    )
  }

  const isWaitingForText = message.status === "streaming" && !message.content

  return (
    <div className="flex flex-col gap-2 text-sm">
      {isWaitingForText && (
        <p className="animate-pulse text-muted-foreground">Thinking…</p>
      )}
      {message.content && (
        <p className="whitespace-pre-wrap">{message.content}</p>
      )}
      <OutlineReview messageId={message.id} />
      <GenerationProgress messageId={message.id} />

      {message.actions.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {message.actions.map((action, actionIndex) => (
            <li key={actionIndex} className="flex items-start gap-1.5">
              {action.failed ? (
                <CircleAlertIcon
                  className="mt-px size-3.5 shrink-0"
                  aria-label="Failed"
                />
              ) : (
                <CheckIcon
                  className="mt-px size-3.5 shrink-0"
                  aria-label="Done"
                />
              )}
              <span className={cn(action.failed && "opacity-70")}>
                {action.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {message.status === "error" && (
        <div className="flex flex-wrap items-center gap-2 text-destructive">
          <span>{message.errorMessage}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcwIcon />
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
})
