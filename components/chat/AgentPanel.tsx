import Link from "next/link"
import { HouseIcon, PanelLeftCloseIcon, SparklesIcon } from "lucide-react"

import { ChatMessageList } from "@/components/chat/ChatMessageList"
import { MessageInput } from "@/components/chat/MessageInput"
import { DeckTitleInput } from "@/components/editor/DeckTitleInput"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useOpenDeckAgent } from "@/hooks/UseOpenDeckAgent"
import { useDeckChat } from "@/hooks/UseAgentChat"
import { useDeckStore } from "@/store/DeckStore"
import type { AgentRunKind } from "@/store/AgentStore"

// On an empty deck a message plans a new deck; otherwise it edits this one.
const GENERATE_EXAMPLE_PROMPTS = [
  "Create a 6-slide deck on our Q3 product roadmap with a revenue chart and a pricing table",
  "A 5-slide pitch for a meal-planning app, with a market size chart",
  "Onboarding deck for new engineers: tools, team, first-week plan",
]

const EDIT_EXAMPLE_PROMPTS = [
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
  const hasMessages = useDeckChat().messages.length > 0
  const agentRunKind = useOpenDeckAgent().run?.kind
  const isDeckEmpty = useDeckStore((state) => (state.deck?.slides.length ?? 0) === 0)
  const examplePrompts = isDeckEmpty ? GENERATE_EXAMPLE_PROMPTS : EDIT_EXAMPLE_PROMPTS

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
        <DeckTitleInput title={deckTitle} onRename={onRenameDeck} className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Close agent panel" title="Close agent panel" onClick={onClose}>
          <PanelLeftCloseIcon />
        </Button>
      </header>

      {hasMessages ? (
        <ChatMessageList onRetry={onRetry} className="min-h-0 flex-1 px-1" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <SparklesIcon className="size-6 text-muted-foreground" />
          <p className="font-medium">{isDeckEmpty ? "Describe the deck you want" : "Ask the agent to change slides"}</p>
          <p className="text-sm text-muted-foreground">
            {isDeckEmpty
              ? "The agent plans an outline for you to review, then writes each slide."
              : "It edits the deck directly, and you can keep editing it by hand."}
          </p>
          <ul className="mt-2 flex w-full flex-col gap-1.5">
            {examplePrompts.map((examplePrompt) => (
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

      <MessageInput
        placeholder={messagePlaceholder(agentRunKind, isDeckEmpty)}
        onSubmitPrompt={onSendMessage}
        isBusy={agentRunKind !== undefined}
        onStop={onStopAgent}
      />
    </section>
  )
}

// While the agent works, the input says what it is doing on this deck.
function messagePlaceholder(agentRunKind: AgentRunKind | undefined, isDeckEmpty: boolean) {
  if (agentRunKind === "planning") return "Planning your deck…"
  if (agentRunKind === "generating") return "Writing your slides…"
  if (agentRunKind === "chat") return "Editing your deck…"
  return isDeckEmpty ? "Describe your deck…" : "Message the agent…"
}
