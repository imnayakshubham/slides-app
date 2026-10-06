import Link from "next/link"
import { HouseIcon, PanelLeftCloseIcon, SparklesIcon } from "lucide-react"

import { PromptComposer } from "@/components/chat/prompt-composer"
import { DeckTitleInput } from "@/components/editor/deck-title-input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AgentPanelProps = {
  deckTitle: string
  onRenameDeck: (title: string) => void
  onClose: () => void
  className?: string
}

export function AgentPanel({
  deckTitle,
  onRenameDeck,
  onClose,
  className,
}: AgentPanelProps) {
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

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <SparklesIcon className="size-6 text-muted-foreground" />
        <p className="font-medium">Ask the agent to build or change slides</p>
        <p className="text-sm text-muted-foreground">
          It edits the deck directly, and you can keep editing it by hand.
        </p>
      </div>

      <PromptComposer placeholder="Message the agent…" />
    </section>
  )
}
