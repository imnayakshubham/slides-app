"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { EditorLayout } from "@/components/editor/EditorLayout"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutosave } from "@/hooks/UseAutosave"
import { openDeckChat } from "@/lib/client/DeckChat"
import { deckRepository } from "@/lib/repository"
import { useDeckStore } from "@/store/DeckStore"

type DeckLoadState =
  { status: "loading" } | { status: "ready" } | { status: "not-found" } | { status: "invalid"; message: string }

export function DeckEditor({ deckId }: { deckId: string }) {
  const [loadState, setLoadState] = useState<DeckLoadState>({
    status: "loading",
  })

  useEffect(() => {
    let isStale = false
    Promise.all([deckRepository.getDeck(deckId), deckRepository.getConversationMessages(deckId)])
      .then(([record, chatMessages]) => {
        if (isStale) return
        if (!record) {
          setLoadState({ status: "not-found" })
          return
        }
        // The chat opens first, so the chat panel finds it as soon as the deck shows.
        openDeckChat(deckId, chatMessages)
        useDeckStore.getState().loadDeck(record.deck)
        setLoadState({ status: "ready" })
      })
      .catch((error: Error) => {
        if (!isStale) setLoadState({ status: "invalid", message: error.message })
      })
    return () => {
      isStale = true
    }
  }, [deckId])

  if (loadState.status === "loading") {
    return (
      <div className="flex h-svh gap-3 p-3" aria-busy="true">
        <Skeleton className="hidden w-88 rounded-2xl lg:block" />
        <Skeleton className="flex-1 rounded-2xl" />
      </div>
    )
  }

  if (loadState.status === "not-found") {
    return (
      <DeckLoadProblem title="Deck not found" message="It may have been deleted, or it was saved in another browser." />
    )
  }

  if (loadState.status === "invalid") {
    return (
      <DeckLoadProblem title="This deck's saved data is invalid" message={loadState.message}>
        <DeleteBrokenDeckButton deckId={deckId} />
      </DeckLoadProblem>
    )
  }

  return <LoadedDeckEditor />
}

// Shown only after the deck loads, so autosave doesn't mistake loading for an edit.
function LoadedDeckEditor() {
  const { saveStatus, retrySave } = useAutosave()
  return <EditorLayout saveStatus={saveStatus} onRetrySave={retrySave} />
}

function DeckLoadProblem({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <div className="grid h-svh place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="text-sm break-words text-muted-foreground">{message}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/new" className={buttonVariants()}>
            Go to your decks
          </Link>
          {children}
        </div>
      </div>
    </div>
  )
}

// A deck that can't be read can't be fixed in the editor, so it can be removed from here.
function DeleteBrokenDeckButton({ deckId }: { deckId: string }) {
  const router = useRouter()

  async function deleteDeck() {
    await deckRepository.deleteDeck(deckId)
    router.push("/new")
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Delete this deck</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this deck?</AlertDialogTitle>
          <AlertDialogDescription>
            Its slides and chat are removed from this browser. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void deleteDeck()}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
