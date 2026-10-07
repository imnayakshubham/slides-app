"use client"

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { continueStoppedGeneration, retrySlideBuild } from "@/lib/client/AgentActions"
import { cn } from "@/lib/utils"
import { useAgent } from "@/hooks/UseAgent"
import type { SlideBuildStatus } from "@/store/AgentStore"

const STATUS_LABELS: Record<SlideBuildStatus, string> = {
  waiting: "Waiting",
  filling: "Writing…",
  done: "Done",
  failed: "Failed",
}

// Checklist of slides being generated; failed slides can be retried and a stopped build continued.
export function GenerationProgress({ messageId }: { messageId: string }) {
  const generation = useAgent((agent) => (agent.generation?.messageId === messageId ? agent.generation : null))
  const isAgentRunning = useAgent((agent) => agent.run !== null)
  if (!generation) return null

  const { slides, isStopped, outline } = generation
  const doneCount = slides.filter((build) => build.status === "done").length
  const waitingCount = slides.filter((build) => build.status === "waiting").length
  const fillingIndex = slides.findIndex((build) => build.status === "filling")

  let heading = `Built “${outline.title}”: ${doneCount} of ${slides.length} slides`
  if (fillingIndex !== -1) {
    heading = `Writing slide ${fillingIndex + 1} of ${slides.length}…`
  } else if (isStopped) {
    heading = `Stopped: ${doneCount} of ${slides.length} slides done`
  }

  return (
    <section aria-label="Deck generation" className="flex flex-col gap-2 rounded-xl border bg-card p-2">
      <p aria-live="polite" className="px-1 text-sm font-medium">
        {heading}
      </p>
      <ol className="flex flex-col gap-0.5">
        {slides.map((slideBuild, slideIndex) => (
          <li
            key={slideBuild.slideId}
            className={cn(
              "flex items-center gap-2 rounded-lg px-1 py-1 text-sm",
              slideBuild.status === "filling" && "bg-muted"
            )}
          >
            <SlideBuildIcon status={slideBuild.status} />
            <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{slideIndex + 1}</span>
            <span className={cn("min-w-0 flex-1 truncate", slideBuild.status === "waiting" && "text-muted-foreground")}>
              {slideBuild.title}
            </span>
            {slideBuild.status === "failed" ? (
              <Button
                variant="ghost"
                size="xs"
                disabled={isAgentRunning}
                onClick={() => void retrySlideBuild(slideBuild.slideId)}
              >
                <RotateCcwIcon />
                Retry
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{STATUS_LABELS[slideBuild.status]}</span>
            )}
          </li>
        ))}
      </ol>
      {isStopped && waitingCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={isAgentRunning}
          onClick={() => void continueStoppedGeneration()}
        >
          <PlayIcon />
          Continue ({waitingCount} left)
        </Button>
      )}
    </section>
  )
}

function SlideBuildIcon({ status }: { status: SlideBuildStatus }) {
  const iconClassName = "size-4 shrink-0"
  if (status === "done") {
    return <CircleCheckIcon className={cn(iconClassName, "text-primary")} aria-label="Done" />
  }
  if (status === "filling") {
    return <LoaderCircleIcon className={cn(iconClassName, "animate-spin")} aria-label="Writing" />
  }
  if (status === "failed") {
    return <CircleAlertIcon className={cn(iconClassName, "text-destructive")} aria-label="Failed" />
  }
  return <CircleDashedIcon className={cn(iconClassName, "text-muted-foreground")} aria-label="Waiting" />
}
