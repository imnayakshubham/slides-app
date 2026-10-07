"use client"

import { useEffect, useEffectEvent, useState } from "react"
import { useRouter } from "next/navigation"

import { SlideCanvas } from "@/components/canvas/SlideCanvas"
import { AgentPanel } from "@/components/chat/AgentPanel"
import { EditorToolbar } from "@/components/editor/EditorToolbar"
import { PrintView } from "@/components/editor/PrintView"
import { TopBar } from "@/components/editor/TopBar"
import { SlideNavigator } from "@/components/navigator/SlideNavigator"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useAgentChat } from "@/hooks/UseAgentChat"
import { useCanvasShortcuts } from "@/hooks/UseCanvasShortcuts"
import type { SaveStatus } from "@/hooks/UseAutosave"
import { useSlideKeyboardNavigation } from "@/hooks/UseSlideKeyboardNavigation"
import { useDeckStore } from "@/store/DeckStore"
import { deckAgentOf, useEditorStore } from "@/store/EditorStore"

type EditorLayoutProps = {
  saveStatus: SaveStatus
  onRetrySave: () => void
}

export function EditorLayout({ saveStatus, onRetrySave }: EditorLayoutProps) {
  const deckTitle = useDeckStore((state) => state.deck?.title ?? "")
  const hasSlides = useDeckStore(
    (state) => (state.deck?.slides.length ?? 0) > 0
  )
  const applyEdit = useDeckStore((state) => state.applyEdit)
  useSlideKeyboardNavigation()
  useCanvasShortcuts()
  const agentChat = useAgentChat()
  const router = useRouter()
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(true)
  const [isMobileAgentOpen, setIsMobileAgentOpen] = useState(false)
  // The navigator gives way to the agent panel: hidden while the panel is
  // open (still openable by hand), shown once the panel is closed.
  const [isSlideNavigatorOpen, setIsSlideNavigatorOpen] = useState(false)
  const [isPrintViewOpen, setIsPrintViewOpen] = useState(false)

  function setAgentPanelOpen(isOpen: boolean) {
    setIsAgentPanelOpen(isOpen)
    setIsSlideNavigatorOpen(!isOpen)
  }

  function renameDeck(title: string) {
    applyEdit({ type: "updateDeck", changes: { title } })
  }

  // Nothing stays selected behind the print view, so Delete or the arrow
  // keys can't change a slide nobody can see.
  function openPrintView() {
    useEditorStore.getState().setSelectedElementIds([])
    setIsPrintViewOpen(true)
  }

  function openAgent() {
    const isDesktop = window.matchMedia("(min-width: 64rem)").matches
    if (isDesktop) setAgentPanelOpen(true)
    else setIsMobileAgentOpen(true)
  }

  // A prompt from /new becomes the first chat message. It is removed from
  // the URL first, so a refresh never runs it twice. Deferred one tick so a
  // development double mount (React StrictMode) doesn't start it twice.
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

  // The outline review lives in the agent panel, which may be closed (it is
  // a sheet on small screens), so it opens when there is an outline to approve.
  const showAgentForReview = useEffectEvent(() => openAgent())
  useEffect(
    () =>
      useEditorStore.subscribe((state, previousState) => {
        const deckId = useDeckStore.getState().deck?.id
        const hasReview = deckAgentOf(state.agentByDeckId, deckId).outlineReview
        const hadReview = deckAgentOf(
          previousState.agentByDeckId,
          deckId
        ).outlineReview
        if (hasReview && !hadReview) showAgentForReview()
      }),
    []
  )

  // Any click or scroll in the editor means the user is driving now, so the
  // canvas stops jumping to the slide being generated.
  function stopFollowingGeneration() {
    const deckId = useDeckStore.getState().deck?.id
    const { agentByDeckId, updateDeckAgent } = useEditorStore.getState()
    if (deckId && deckAgentOf(agentByDeckId, deckId).isFollowingGeneration) {
      updateDeckAgent(deckId, () => ({ isFollowingGeneration: false }))
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
          onExport={openPrintView}
        />

        <section
          onPointerDownCapture={stopFollowingGeneration}
          onWheelCapture={stopFollowingGeneration}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
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
            <SlideCanvas onOpenAgent={openAgent} />
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

      {isPrintViewOpen && (
        <PrintView onClose={() => setIsPrintViewOpen(false)} />
      )}
    </div>
  )
}
