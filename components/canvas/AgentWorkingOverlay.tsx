import type { CSSProperties } from "react"

const DOT_GAP_PX = { slide: 10, thumbnail: 5 }

type AgentWorkingOverlayProps = {
  size: "slide" | "thumbnail"
  // Shown in a chip on full slides; thumbnails are too small for it.
  label?: string
}

// Sits on top of a slide the agent is working on. The slide stays visible,
// and clicks pass through, so finished parts can still be edited.
export function AgentWorkingOverlay({ size, label }: AgentWorkingOverlayProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-sm bg-primary/5"
    >
      <div
        className="agent-working-overlay absolute inset-0"
        style={{ "--dot-gap": `${DOT_GAP_PX[size]}px` } as CSSProperties}
      />
      {label && (
        <span className="absolute end-3 bottom-3 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-xs">
          {label}
        </span>
      )}
    </div>
  )
}
