import Link from "next/link"
import { HouseIcon, PanelLeftOpenIcon, UploadIcon } from "lucide-react"

import { DeckTitleInput } from "@/components/editor/deck-title-input"
import { Button } from "@/components/ui/button"
import type { SaveStatus } from "@/hooks/use-autosave"
import { cn } from "@/lib/utils"

type TopBarProps = {
  deckTitle: string
  onRenameDeck: (title: string) => void
  isAgentPanelOpen: boolean
  onOpenAgentPanel: () => void
  saveStatus: SaveStatus
  onRetrySave: () => void
}

export function TopBar({
  deckTitle,
  onRenameDeck,
  isAgentPanelOpen,
  onOpenAgentPanel,
  saveStatus,
  onRetrySave,
}: TopBarProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2">
      {/* Below lg the agent lives in a sheet, so these always show there. */}
      <div
        className={cn(
          "flex min-w-0 items-center gap-2",
          isAgentPanelOpen && "lg:hidden"
        )}
      >
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
        <Button
          variant="outline"
          className="rounded-full"
          onClick={onOpenAgentPanel}
        >
          <PanelLeftOpenIcon />
          Agent
        </Button>
        <DeckTitleInput
          title={deckTitle}
          onRename={onRenameDeck}
          className="field-sizing-content max-w-full"
        />
      </div>

      <div className="ms-auto flex items-center gap-2">
        <SaveStatusIndicator
          saveStatus={saveStatus}
          onRetrySave={onRetrySave}
        />
        <Button
          variant="outline"
          className="rounded-full"
          aria-label="Export"
          title="Export"
        >
          <UploadIcon />
          <span className="max-sm:sr-only">Export</span>
        </Button>
      </div>
    </header>
  )
}

function SaveStatusIndicator({
  saveStatus,
  onRetrySave,
}: {
  saveStatus: SaveStatus
  onRetrySave: () => void
}) {
  if (saveStatus === "error") {
    return (
      <Button variant="destructive" size="sm" onClick={onRetrySave}>
        Save failed — Retry
      </Button>
    )
  }

  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {saveStatus === "saving" ? "Saving…" : "Saved"}
    </span>
  )
}
