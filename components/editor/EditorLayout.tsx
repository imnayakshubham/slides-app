"use client"

import { useEffect, useEffectEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { SlideCanvas } from "@/components/canvas/SlideCanvas"
import { AgentPanel } from "@/components/chat/AgentPanel"
import { EditorToolbar } from "@/components/editor/EditorToolbar"
import { TopBar, type ExportStatus } from "@/components/editor/TopBar"
import { SlideNavigator } from "@/components/navigator/SlideNavigator"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useAgentChat } from "@/hooks/UseAgentChat"
import { useCanvasShortcuts } from "@/hooks/UseCanvasShortcuts"
import type { SaveStatus } from "@/hooks/UseAutosave"
import { messageFromError } from "@/lib/ErrorMessage"
import { exportDeckToPptx } from "@/lib/export/ExportPptx"
import { useSlideKeyboardNavigation } from "@/hooks/UseSlideKeyboardNavigation"
import { useDeckStore } from "@/store/DeckStore"
import { agentFor, useAgentStore } from "@/store/AgentStore"

type EditorLayoutProps = {
  saveStatus: SaveStatus
  onRetrySave: () => void
}

export function EditorLayout({ saveStatus, onRetrySave }: EditorLayoutProps) {
  const deckTitle = useDeckStore((state) => state.deck?.title ?? "")
  const hasSlides = useDeckStore((state) => (state.deck?.slides.length ?? 0) > 0)
  const applyEdit = useDeckStore((state) => state.applyEdit)
  useSlideKeyboardNavigation()
  useCanvasShortcuts()
  const agentChat = useAgentChat()
  const router = useRouter()
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(true)
  const [isMobileAgentOpen, setIsMobileAgentOpen] = useState(false)
  // The navigator hides while the agent panel is open (still openable by hand).
  const [isSlideNavigatorOpen, setIsSlideNavigatorOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle")

  function setAgentPanelOpen(isOpen: boolean) {
    setIsAgentPanelOpen(isOpen)
    setIsSlideNavigatorOpen(!isOpen)
  }

  function renameDeck(title: string) {
    applyEdit({ type: "updateDeck", changes: { title } })
  }

  async function exportToPowerPoint() {
    const deck = useDeckStore.getState().deck
    if (!deck) return
    setExportStatus("exporting")
    try {
      await exportDeckToPptx(deck)
      setExportStatus("idle")
    } catch (error) {
      setExportStatus("error")
      toast.error("Export failed", { description: messageFromError(error) })
    }
  }

  function openAgent() {
    const isDesktop = window.matchMedia("(min-width: 64rem)").matches
    if (isDesktop) setAgentPanelOpen(true)
    else setIsMobileAgentOpen(true)
  }

  // Sends the /new prompt only once. It is removed from the URL and sent a moment later, because dev mode starts the page twice.
  const startPromptFromUrl = useEffectEvent(() => {
    const prompt = new URLSearchParams(window.location.search).get("prompt")
    if (!prompt) return
    router.replace(window.location.pathname)
    void agentChat.sendMessage(prompt)
  })
  useEffect(() => {
    const timeoutId = setTimeout(startPromptFromUrl, 0)
    return () => clearTimeout(timeoutId)
  }, [])

  // Opens the agent panel when there is an outline to approve, since the review lives there.
  const showAgentForReview = useEffectEvent(() => openAgent())
  useEffect(
    () =>
      useAgentStore.subscribe((state, previousState) => {
        const deckId = useDeckStore.getState().deck?.id
        const hasReview = agentFor(state.agents, deckId).outlineReview
        const hadReview = agentFor(previousState.agents, deckId).outlineReview
        if (hasReview && !hadReview) showAgentForReview()
      }),
    []
  )

  // Any click or scroll means the user is in control, so stop jumping to the slide being generated.
  function stopFollowingGeneration() {
    const deckId = useDeckStore.getState().deck?.id
    const { agents, updateAgent } = useAgentStore.getState()
    if (deckId && agentFor(agents, deckId).isFollowingGeneration) {
      updateAgent(deckId, { isFollowingGeneration: false })
    }
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
          canExport={hasSlides}
          exportStatus={exportStatus}
          onExport={() => void exportToPowerPoint()}
        />

        <section
          onPointerDownCapture={stopFollowingGeneration}
          onWheelCapture={stopFollowingGeneration}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <EditorToolbar
            isSlideNavigatorOpen={isSlideNavigatorOpen}
            onToggleSlideNavigator={() => setIsSlideNavigatorOpen((isOpen) => !isOpen)}
          />
          <div className="flex min-h-0 flex-1 bg-muted">
            {isSlideNavigatorOpen && <SlideNavigator onClose={() => setIsSlideNavigatorOpen(false)} />}
            <SlideCanvas onOpenAgent={openAgent} />
          </div>
        </section>
      </div>

      <Sheet open={isMobileAgentOpen} onOpenChange={setIsMobileAgentOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-full p-3 sm:max-w-sm">
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
