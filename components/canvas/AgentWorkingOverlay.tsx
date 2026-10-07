import type { CSSProperties } from "react"
import { LockIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const DOT_GAP_PX = { slide: 10, thumbnail: 5 }

type AgentWorkingOverlayProps = {
  size: "slide" | "thumbnail"
  // Shown in a chip on full slides; thumbnails are too small for it.
  label?: string
  // On the canvas the slide is locked: the overlay takes the pointer and
  // shows a lock. Thumbnails stay clickable for navigation.
  isLocked?: boolean
}

// Sits on top of a slide the agent is working on. The slide stays visible
// underneath while the agent works.
export function AgentWorkingOverlay({
  size,
  label,
  isLocked = false,
}: AgentWorkingOverlayProps) {
  return (
    <div
      aria-hidden
      title={
        isLocked ? "Locked while the agent works on this slide" : undefined
      }
      className={cn(
        "absolute inset-0 overflow-hidden rounded-sm bg-primary/5",
        isLocked ? "cursor-not-allowed" : "pointer-events-none"
      )}
    >
      <div
        className="agent-working-overlay absolute inset-0"
        style={{ "--dot-gap": `${DOT_GAP_PX[size]}px` } as CSSProperties}
      />
      {label && (
        <span className="absolute end-3 bottom-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-xs">
          {isLocked && <LockIcon className="size-3" />}
          {label}
        </span>
      )}
    </div>
  )
}
