"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { EditorShell } from "@/components/editor/EditorShell"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutosave } from "@/hooks/UseAutosave"
import { deckRepository } from "@/lib/repository"
import { useDeckStore } from "@/store/DeckStore"

type DeckLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "not-found" }
  | { status: "invalid"; message: string }

export function DeckEditor({ deckId }: { deckId: string }) {
  const [loadState, setLoadState] = useState<DeckLoadState>({
    status: "loading",
  })

  useEffect(() => {
    let isStale = false
    deckRepository
      .getDeck(deckId)
      .then((record) => {
        if (isStale) return
        if (!record) {
          setLoadState({ status: "not-found" })
          return
        }
        useDeckStore.getState().hydrate(record.deck)
        setLoadState({ status: "ready" })
      })
      .catch((error: Error) => {
        if (!isStale)
          setLoadState({ status: "invalid", message: error.message })
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
      <DeckLoadProblem
        title="Deck not found"
        message="It may have been deleted, or it was saved in another browser."
      />
    )
  }

  if (loadState.status === "invalid") {
    return (
      <DeckLoadProblem
        title="This deck's saved data is invalid"
        message={loadState.message}
      />
    )
  }

  return <LoadedDeckEditor />
}

// Mounted only after hydrate, so autosave never sees the initial load as an edit.
function LoadedDeckEditor() {
  const { saveStatus, retrySave } = useAutosave()
  return <EditorShell saveStatus={saveStatus} onRetrySave={retrySave} />
}

function DeckLoadProblem({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <div className="grid h-svh place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="text-sm break-words text-muted-foreground">{message}</p>
        <Link href="/new" className={buttonVariants()}>
          Go to your decks
        </Link>
      </div>
    </div>
  )
}
