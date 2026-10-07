import { endActiveTextEdit } from "@/lib/client/RichTextEditing"
import { findElementLocation, type DeckEdit } from "@/lib/edits/DeckEdits"
import { createId } from "@/lib/Ids"
import type { Deck } from "@/lib/schema/Deck"
import { agentFor, agentLabelFor, useAgentStore } from "@/store/AgentStore"
import type { AgentRunKind, DeckAgent } from "@/store/AgentStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// What every agent run shares (chat replies and slide generation): one run per deck, one undo step,
// the slide lock, and applying the agent's edits safely.

// Running generation requests by run id, so Stop aborts exactly the right one.
const abortControllersByRunId = new Map<string, AbortController>()

export function openDeckId() {
  return useDeckStore.getState().deck?.id
}

export function getAgent(deckId: string) {
  return agentFor(useAgentStore.getState().agents, deckId)
}

export function updateAgent(deckId: string, changes: Partial<DeckAgent>) {
  useAgentStore.getState().updateAgent(deckId, changes)
}

export function isAgentBusyOn(deckId: string | undefined) {
  return Boolean(deckId && getAgent(deckId).run)
}

// True while the agent is changing (or has yet to write) this slide; the user can't edit it then.
export function isSlideLockedByAgent(slideId: string) {
  const deckId = openDeckId()
  if (!deckId) return false
  return agentLabelFor(getAgent(deckId), slideId) !== null
}

// Starts a run and its undo group; returns the run id that finishRun needs.
export function startRun(deckId: string, kind: AgentRunKind) {
  const runId = createId()
  updateAgent(deckId, { run: { runId, kind, editingSlideIds: [] } })
  useDeckStore.getState().startUndoGroup()
  return runId
}

// Only ends its own run, so a run stopped when the user left this deck can't end a newer one.
export function finishRun(deckId: string, runId: string) {
  const isStillThisRun = getAgent(deckId).run?.runId === runId
  if (!isStillThisRun) return
  updateAgent(deckId, { run: null })
  if (openDeckId() === deckId) useDeckStore.getState().finishUndoGroup()
}

// Runs awaited work (slide generation) as one run that Stop can abort.
export async function runAgentWork(
  deckId: string,
  kind: AgentRunKind,
  work: (abortSignal: AbortSignal) => Promise<void>
) {
  const runId = startRun(deckId, kind)
  const abortController = new AbortController()
  abortControllersByRunId.set(runId, abortController)
  try {
    await work(abortController.signal)
  } finally {
    abortControllersByRunId.delete(runId)
    finishRun(deckId, runId)
  }
}

export function stopRun(runId: string) {
  abortControllersByRunId.get(runId)?.abort()
}

export function stopAllRuns() {
  for (const abortController of abortControllersByRunId.values()) {
    abortController.abort()
  }
}

// Applies one agent edit to the open deck. Returns false when it was skipped.
export function applyAgentEdit(deckId: string, edit: DeckEdit, options: { lockSlides: boolean }) {
  // The user may have opened another deck: never apply this deck's edits to it.
  if (openDeckId() !== deckId) return false
  const deckBeforeEdit = useDeckStore.getState().deck
  // Lock the slides first so the user's typing is saved before the agent's change lands.
  if (options.lockSlides && deckBeforeEdit) {
    markSlidesBeingEdited(deckId, slideIdsChangedBy(edit, deckBeforeEdit))
  }
  // Fails when the target was deleted meanwhile.
  const result = useDeckStore.getState().applyEdit(edit)
  if (!result.ok) return false
  useAgentStore.getState().highlightElements(elementIdsChangedBy(edit))
  return true
}

// Saves any typing on these slides and unselects their elements before the agent changes them.
export function releaseSlidesToAgent(slideIds: string[]) {
  const deck = useDeckStore.getState().deck
  if (!deck) return
  const isOnLockedSlide = (elementId: string) => {
    const location = findElementLocation(deck, elementId)
    return location !== undefined && slideIds.includes(location.slide.id)
  }

  const editor = useEditorStore.getState()
  if (editor.editingElementId && isOnLockedSlide(editor.editingElementId)) {
    endActiveTextEdit()
    // A table being typed into saves when its cell loses focus.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }
  const unlockedSelection = editor.selectedElementIds.filter((elementId) => !isOnLockedSlide(elementId))
  if (unlockedSelection.length !== editor.selectedElementIds.length) {
    editor.setSelectedElementIds(unlockedSelection)
  }
}

function markSlidesBeingEdited(deckId: string, slideIds: string[]) {
  const run = getAgent(deckId).run
  if (!run) return
  const newSlideIds = slideIds.filter((slideId) => !run.editingSlideIds.includes(slideId))
  // Most edits touch a slide that is already marked: no update then.
  if (newSlideIds.length === 0) return
  releaseSlidesToAgent(newSlideIds)
  updateAgent(deckId, { run: { ...run, editingSlideIds: [...run.editingSlideIds, ...newSlideIds] } })
}

function elementIdsChangedBy(edit: DeckEdit): string[] {
  switch (edit.type) {
    case "addElement":
      return [edit.element.id]
    case "copyElement":
      return [edit.newElementId]
    case "updateElement":
    case "moveElement":
    case "reorderElement":
      return [edit.elementId]
    case "batch":
      return edit.edits.flatMap(elementIdsChangedBy)
    default:
      return []
  }
}

// Read before the edit, so a moved element marks both the slide it left and the one it joined.
function slideIdsChangedBy(edit: DeckEdit, deckBeforeEdit: Deck): string[] {
  const slideOfElement = (elementId: string) => findElementLocation(deckBeforeEdit, elementId)?.slide.id
  switch (edit.type) {
    case "addSlide":
      return [edit.slide.id]
    case "updateSlide":
    case "moveSlide":
      return [edit.slideId]
    case "addElement":
      return [edit.slideId]
    case "copyElement":
      return [edit.toSlideId]
    case "updateElement":
    case "deleteElement":
    case "reorderElement":
      return [slideOfElement(edit.elementId)].filter((slideId) => slideId !== undefined)
    case "moveElement":
      return [slideOfElement(edit.elementId), edit.toSlideId].filter((slideId) => slideId !== undefined)
    case "batch":
      return edit.edits.flatMap((innerEdit) => slideIdsChangedBy(innerEdit, deckBeforeEdit))
    default:
      return []
  }
}
