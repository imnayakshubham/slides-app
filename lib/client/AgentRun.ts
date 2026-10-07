import { endActiveTextEdit } from "@/components/elements/TextEditor"
import { findElementLocation, type DeckEdit } from "@/lib/edits/DeckEdits"
import { createId } from "@/lib/Ids"
import type { Deck } from "@/lib/schema/Deck"
import { agentFor, agentLabelFor, useAgentStore } from "@/store/AgentStore"
import type { AgentRunKind, DeckAgent } from "@/store/AgentStore"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

// An "agent run" is one chat reply or one slide generation.
// While it runs, the user can't edit the slides it changes, and Cmd+Z undoes the whole run in one step.

// Lets the Stop button cancel the right slide generation.
const abortControllersByRunId = new Map<string, AbortController>()

export function getOpenDeckId() {
  return useDeckStore.getState().deck?.id
}

export function getAgentStateForDeck(deckId: string) {
  return agentFor(useAgentStore.getState().agents, deckId)
}

export function updateAgentStateForDeck(deckId: string, changes: Partial<DeckAgent>) {
  useAgentStore.getState().updateAgent(deckId, changes)
}

export function isAgentWorkingOnDeck(deckId: string | undefined) {
  if (!deckId) return false
  return getAgentStateForDeck(deckId).run !== null
}

export function isAgentEditingSlide(slideId: string) {
  const deckId = getOpenDeckId()
  if (!deckId) return false
  return agentLabelFor(getAgentStateForDeck(deckId), slideId) !== null
}

export function startAgentRun(deckId: string, kind: AgentRunKind) {
  const runId = createId()
  updateAgentStateForDeck(deckId, { run: { runId, kind, editingSlideIds: [] } })
  useDeckStore.getState().startUndoGroup()
  return runId
}

// Ends only its own run, so an old run that was stopped can't end a newer one.
export function finishAgentRun(deckId: string, runId: string) {
  const isStillThisRun = getAgentStateForDeck(deckId).run?.runId === runId
  if (!isStillThisRun) return
  updateAgentStateForDeck(deckId, { run: null })
  if (getOpenDeckId() === deckId) useDeckStore.getState().finishUndoGroup()
}

export async function runAgentJobThatCanBeStopped(
  deckId: string,
  kind: AgentRunKind,
  job: (abortSignal: AbortSignal) => Promise<void>
) {
  const runId = startAgentRun(deckId, kind)
  const abortController = new AbortController()
  abortControllersByRunId.set(runId, abortController)
  try {
    await job(abortController.signal)
  } finally {
    abortControllersByRunId.delete(runId)
    finishAgentRun(deckId, runId)
  }
}

export function stopAgentRun(runId: string) {
  abortControllersByRunId.get(runId)?.abort()
}

export function stopAllAgentRuns() {
  for (const abortController of abortControllersByRunId.values()) {
    abortController.abort()
  }
}

// Returns false when the change was skipped.
export function applyAgentEdit(deckId: string, edit: DeckEdit, options: { lockSlides: boolean }) {
  // The user may have opened another deck in the meantime.
  if (getOpenDeckId() !== deckId) return false
  const deckBeforeEdit = useDeckStore.getState().deck
  // Lock first, so the user's typing on those slides is saved before the agent's change lands.
  if (options.lockSlides && deckBeforeEdit) {
    markSlidesAsEditedByAgent(deckId, slideIdsChangedBy(edit, deckBeforeEdit))
  }
  // Fails if the user deleted what the agent is changing.
  const result = useDeckStore.getState().applyEdit(edit)
  if (!result.ok) return false
  useAgentStore.getState().highlightElements(elementIdsChangedBy(edit))
  return true
}

// Saves any typing on these slides and unselects their elements, before the agent changes them.
export function stopUserEditingOnSlides(slideIds: string[]) {
  const deck = useDeckStore.getState().deck
  if (!deck) return

  function isElementOnSlides(elementId: string) {
    if (!deck) return false
    const location = findElementLocation(deck, elementId)
    if (!location) return false
    return slideIds.includes(location.slide.id)
  }

  const editorState = useEditorStore.getState()
  if (editorState.editingElementId && isElementOnSlides(editorState.editingElementId)) {
    endActiveTextEdit()
    // A table saves its typed cells when it loses focus.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }
  const selectionOffTheseSlides = editorState.selectedElementIds.filter((elementId) => !isElementOnSlides(elementId))
  if (selectionOffTheseSlides.length !== editorState.selectedElementIds.length) {
    editorState.setSelectedElementIds(selectionOffTheseSlides)
  }
}

function markSlidesAsEditedByAgent(deckId: string, slideIds: string[]) {
  const run = getAgentStateForDeck(deckId).run
  if (!run) return
  const newSlideIds = slideIds.filter((slideId) => !run.editingSlideIds.includes(slideId))
  // Most changes are on a slide that is already locked.
  if (newSlideIds.length === 0) return
  stopUserEditingOnSlides(newSlideIds)
  updateAgentStateForDeck(deckId, { run: { ...run, editingSlideIds: [...run.editingSlideIds, ...newSlideIds] } })
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

// Uses the deck from before the change, so a moved element counts both the slide it left and the one it joined.
function slideIdsChangedBy(edit: DeckEdit, deckBeforeEdit: Deck): string[] {
  function findSlideIdOfElement(elementId: string) {
    return findElementLocation(deckBeforeEdit, elementId)?.slide.id
  }

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
      return [findSlideIdOfElement(edit.elementId)].filter((slideId) => slideId !== undefined)
    case "moveElement":
      return [findSlideIdOfElement(edit.elementId), edit.toSlideId].filter((slideId) => slideId !== undefined)
    case "batch":
      return edit.edits.flatMap((innerEdit) => slideIdsChangedBy(innerEdit, deckBeforeEdit))
    default:
      return []
  }
}
