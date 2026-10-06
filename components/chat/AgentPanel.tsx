import Link from "next/link"
import { HouseIcon, PanelLeftCloseIcon, SparklesIcon } from "lucide-react"

import { ChatMessageList } from "@/components/chat/ChatMessageList"
import { PromptComposer } from "@/components/chat/PromptComposer"
import { DeckTitleInput } from "@/components/editor/DeckTitleInput"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store/EditorStore"

const EXAMPLE_PROMPTS = [
  "Make slide 2 more concise",
  "Add a bar chart: Q1 10, Q2 14, Q3 19",
  "Move the chart to the last slide",
  "Add a summary slide at the end",
]

type AgentPanelProps = {
  deckTitle: string
  onRenameDeck: (title: string) => void
  onClose: () => void
  onSendMessage: (text: string) => void
  onStopAgent: () => void
  onRetry: () => void
  className?: string
}

export function AgentPanel({
  deckTitle,
  onRenameDeck,
  onClose,
  onSendMessage,
  onStopAgent,
  onRetry,
  className,
}: AgentPanelProps) {
  const hasMessages = useEditorStore((state) => state.chatMessages.length > 0)
  const isAgentRunning = useEditorStore((state) => state.isAgentRunning)

  return (
    <section aria-label="Agent" className={cn("flex-col gap-3", className)}>
      <header className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          aria-label="Home"
          title="Home"
          nativeButton={false}
          render={<Link href="/new" />}
        >
          <HouseIcon />
        </Button>
        <DeckTitleInput
          title={deckTitle}
          onRename={onRenameDeck}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close agent panel"
          title="Close agent panel"
          onClick={onClose}
        >
          <PanelLeftCloseIcon />
        </Button>
      </header>

      {hasMessages ? (
        <ChatMessageList onRetry={onRetry} className="min-h-0 flex-1 px-1" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <SparklesIcon className="size-6 text-muted-foreground" />
          <p className="font-medium">Ask the agent to build or change slides</p>
          <p className="text-sm text-muted-foreground">
            It edits the deck directly, and you can keep editing it by hand.
          </p>
          <ul className="mt-2 flex w-full flex-col gap-1.5">
            {EXAMPLE_PROMPTS.map((examplePrompt) => (
              <li key={examplePrompt}>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start rounded-xl py-2 text-start whitespace-normal"
                  onClick={() => onSendMessage(examplePrompt)}
                >
                  {examplePrompt}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PromptComposer
        placeholder="Message the agent…"
        onSubmitPrompt={onSendMessage}
        isBusy={isAgentRunning}
        onStop={onStopAgent}
      />
    </section>
  )
}
