import type { CSSProperties } from "react"
import { Loader2Icon, LockIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const DOT_STYLE = {
  slide: { gap: "10px", size: "2.5px" },
  thumbnail: { gap: "5px", size: "1.5px" },
}

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
export function AgentWorkingOverlay({ size, label, isLocked = false }: AgentWorkingOverlayProps) {
  return (
    <div
      aria-hidden
      title={isLocked ? "Locked while the agent works on this slide" : undefined}
      className={cn(
        "absolute inset-0 overflow-hidden rounded-[inherit] bg-primary/10",
        isLocked ? "cursor-not-allowed" : "pointer-events-none"
      )}
    >
      <div
        className="agent-working-overlay absolute inset-0"
        style={
          {
            "--dot-gap": DOT_STYLE[size].gap,
            "--dot-size": DOT_STYLE[size].size,
          } as CSSProperties
        }
      />
      <div className="absolute inset-0 animate-pulse rounded-[inherit] ring-2 ring-primary ring-inset motion-reduce:animate-none" />
      {label && (
        <span className="absolute end-3 bottom-3 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-md">
          <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" />
          {label}
          {isLocked && <LockIcon className="size-3.5" />}
        </span>
      )}
    </div>
  )
}
