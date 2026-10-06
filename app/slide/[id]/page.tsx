import { DeckEditor } from "@/components/editor/deck-editor"

export default async function SlidePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DeckEditor key={id} deckId={id} />
}
