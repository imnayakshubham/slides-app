"use client"

import { useState } from "react"

import { SlideCanvas } from "@/components/canvas/SlideCanvas"
import { AgentPanel } from "@/components/chat/AgentPanel"
import { EditorToolbar } from "@/components/editor/EditorToolbar"
import { TopBar } from "@/components/editor/TopBar"
import { SlideNavigator } from "@/components/filmstrip/SlideNavigator"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useAgentChat } from "@/hooks/UseAgentChat"
import { useCanvasShortcuts } from "@/hooks/UseCanvasShortcuts"
import type { SaveStatus } from "@/hooks/UseAutosave"
import { useSlideKeyboardNavigation } from "@/hooks/UseSlideKeyboardNavigation"
import { useDeckStore } from "@/store/DeckStore"

type EditorShellProps = {
  saveStatus: SaveStatus
  onRetrySave: () => void
}

export function EditorShell({ saveStatus, onRetrySave }: EditorShellProps) {
  const deckTitle = useDeckStore((state) => state.deck?.title ?? "")
  const applyEdit = useDeckStore((state) => state.applyEdit)
  useSlideKeyboardNavigation()
  useCanvasShortcuts()
  const agentChat = useAgentChat()
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(true)
  const [isMobileAgentOpen, setIsMobileAgentOpen] = useState(false)
  // The navigator gives way to the agent panel: hidden while the panel is
  // open (still openable by hand), shown once the panel is closed.
  const [isSlideNavigatorOpen, setIsSlideNavigatorOpen] = useState(false)

  function setAgentPanelOpen(isOpen: boolean) {
    setIsAgentPanelOpen(isOpen)
    setIsSlideNavigatorOpen(!isOpen)
  }

  function renameDeck(title: string) {
    applyEdit({ type: "updateDeck", changes: { title } })
  }

  function openAgent() {
    const isDesktop = window.matchMedia("(min-width: 64rem)").matches
    if (isDesktop) setAgentPanelOpen(true)
    else setIsMobileAgentOpen(true)
  }

  return (
    <div className="flex h-svh gap-3 bg-background p-3">
      {isAgentPanelOpen && (
        <AgentPanel
          deckTitle={deckTitle}
          onRenameDeck={renameDeck}
          onClose={() => setAgentPanelOpen(false)}
          onSendMessage={agentChat.sendMessage}
          onStopAgent={agentChat.stop}
          onRetry={agentChat.retry}
          className="hidden w-88 shrink-0 lg:flex"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <TopBar
          deckTitle={deckTitle}
          onRenameDeck={renameDeck}
          isAgentPanelOpen={isAgentPanelOpen}
          onOpenAgentPanel={openAgent}
          saveStatus={saveStatus}
          onRetrySave={onRetrySave}
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          <EditorToolbar
            isSlideNavigatorOpen={isSlideNavigatorOpen}
            onToggleSlideNavigator={() =>
              setIsSlideNavigatorOpen((isOpen) => !isOpen)
            }
          />
          <div className="flex min-h-0 flex-1 bg-muted">
            {isSlideNavigatorOpen && (
              <SlideNavigator onClose={() => setIsSlideNavigatorOpen(false)} />
            )}
            <SlideCanvas />
          </div>
        </section>
      </div>

      <Sheet open={isMobileAgentOpen} onOpenChange={setIsMobileAgentOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-full p-3 sm:max-w-sm"
        >
          <SheetTitle className="sr-only">Agent</SheetTitle>
          <AgentPanel
            deckTitle={deckTitle}
            onRenameDeck={renameDeck}
            onClose={() => setIsMobileAgentOpen(false)}
            onSendMessage={agentChat.sendMessage}
            onStopAgent={agentChat.stop}
            onRetry={agentChat.retry}
            className="flex h-full"
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
