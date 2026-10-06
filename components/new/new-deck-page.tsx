"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MenuIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { PromptComposer } from "@/components/chat/prompt-composer"
import { DeckTitleInput } from "@/components/editor/deck-title-input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { createEmptyDeck } from "@/lib/create-empty-deck"
import { deckRepository } from "@/lib/repository"
import type { DeckSummary } from "@/lib/schema/deck-record"

export function NewDeckPage() {
  const router = useRouter()
  const [deckSummaries, setDeckSummaries] = useState<DeckSummary[] | null>(null)
  const [isCreatingDeck, setIsCreatingDeck] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  useEffect(() => {
    void deckRepository.listDecks().then(setDeckSummaries)
  }, [])

  async function createDeckAndOpen(prompt?: string) {
    setIsCreatingDeck(true)
    const deck = createEmptyDeck()
    await deckRepository.saveDeck(deck)
    const promptQuery = prompt ? `?prompt=${encodeURIComponent(prompt)}` : ""
    router.push(`/slide/${deck.id}${promptQuery}`)
  }

  async function deleteDeck(deckId: string) {
    await deckRepository.deleteDeck(deckId)
    setDeckSummaries((summaries) =>
      (summaries ?? []).filter((summary) => summary.id !== deckId)
    )
  }

  async function renameDeck(deckId: string, title: string) {
    const record = await deckRepository.getDeck(deckId)
    if (!record) return
    await deckRepository.saveDeck({ ...record.deck, title })
    setDeckSummaries(await deckRepository.listDecks())
  }

  const decksSidebar = (
    <DecksSidebar
      deckSummaries={deckSummaries}
      onRenameDeck={(deckId, title) => void renameDeck(deckId, title)}
      onDeleteDeck={(deckId) => void deleteDeck(deckId)}
    />
  )

  return (
    <div className="flex h-svh bg-background">
      <aside className="hidden w-72 shrink-0 border-e bg-sidebar text-sidebar-foreground lg:flex">
        {decksSidebar}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex h-14 shrink-0 items-center px-3 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open your decks"
            title="Your decks"
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            <MenuIcon />
          </Button>
        </header>

        <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 pb-16">
          <h1 className="text-center text-3xl font-medium tracking-tight">
            What do you want to present?
          </h1>
          <PromptComposer
            placeholder="Describe your deck, e.g. a 6-slide Q3 roadmap with a revenue chart"
            onSubmitPrompt={(prompt) => void createDeckAndOpen(prompt)}
          />
          <Button
            variant="ghost"
            disabled={isCreatingDeck}
            onClick={() => void createDeckAndOpen()}
          >
            <PlusIcon />
            Start with a blank deck
          </Button>
        </section>
      </main>

      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="w-72 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Your decks</SheetTitle>
          {decksSidebar}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function DecksSidebar({
  deckSummaries,
  onRenameDeck,
  onDeleteDeck,
}: {
  deckSummaries: DeckSummary[] | null
  onRenameDeck: (deckId: string, title: string) => void
  onDeleteDeck: (deckId: string) => void
}) {
  // Rendered in both the desktop aside and the mobile sheet, so ids must be unique.
  const headingId = useId()

  return (
    <nav
      aria-labelledby={headingId}
      className="flex min-h-0 w-full flex-1 flex-col gap-2 p-3"
    >
      <h2
        id={headingId}
        className="px-2 pt-2 text-xs font-medium text-muted-foreground"
      >
        Your decks
      </h2>
      {deckSummaries === null ? (
        <Skeleton className="h-9 rounded-lg" />
      ) : deckSummaries.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">No decks yet.</p>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
          {deckSummaries.map((summary) => (
            <DeckListItem
              key={summary.id}
              deckSummary={summary}
              onRename={(title) => onRenameDeck(summary.id, title)}
              onDelete={() => onDeleteDeck(summary.id)}
            />
          ))}
        </ul>
      )}
    </nav>
  )
}

function DeckListItem({
  deckSummary,
  onRename,
  onDelete,
}: {
  deckSummary: DeckSummary
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)

  if (isRenaming) {
    return (
      <li className="flex items-center py-1">
        <DeckTitleInput
          title={deckSummary.title}
          onRename={onRename}
          onFinishEditing={() => setIsRenaming(false)}
          autoFocus
          className="flex-1 text-sm font-normal"
        />
      </li>
    )
  }

  return (
    <li className="group flex items-center rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
      <Link
        href={`/slide/${deckSummary.id}`}
        title={`${deckSummary.title}, edited ${new Date(deckSummary.updatedAt).toLocaleDateString()}`}
        className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-sm"
      >
        {deckSummary.title}
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
        aria-label={`Rename ${deckSummary.title}`}
        title="Rename"
        onClick={() => setIsRenaming(true)}
      >
        <PencilIcon />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
              aria-label={`Delete ${deckSummary.title}`}
              title="Delete"
            />
          }
        >
          <Trash2Icon />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deckSummary.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the deck from this browser. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
