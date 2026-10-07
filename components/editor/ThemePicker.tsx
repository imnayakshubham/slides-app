"use client"

import { PaletteIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAgent } from "@/hooks/UseAgent"
import { THEME_IDS, THEMES, deckThemeFor, fontStack, type ThemeId } from "@/lib/themes/Themes"
import { cn } from "@/lib/utils"
import { useDeckStore } from "@/store/DeckStore"

// Switches the whole deck's colors and fonts in one undo step.
export function ThemePicker() {
  const currentThemeId = useDeckStore((state) => state.deck?.theme.id)
  // Slides being written keep the theme they started with.
  const isAgentBusy = useAgent((agent) => agent.run !== null)

  function applyTheme(themeId: ThemeId) {
    if (themeId === currentThemeId) return
    useDeckStore.getState().applyEdit({ type: "setTheme", theme: deckThemeFor(themeId) })
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            disabled={!currentThemeId || isAgentBusy}
            title={isAgentBusy ? "The agent is busy" : "Theme"}
          />
        }
      >
        <PaletteIcon />
        <span className="max-sm:sr-only">Theme</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))]">
        <p className="font-medium">Theme</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEME_IDS.map((themeId) => (
            <button
              key={themeId}
              type="button"
              aria-pressed={themeId === currentThemeId}
              onClick={() => applyTheme(themeId)}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl p-1.5 text-start text-xs font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                themeId === currentThemeId && "bg-primary/10 text-primary"
              )}
            >
              <ThemePreview themeId={themeId} />
              {THEMES[themeId].name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// A tiny slide preview: background, "Aa" in the heading font, and the card colors.
function ThemePreview({ themeId, className }: { themeId: ThemeId; className?: string }) {
  const { colors, headingFont } = THEMES[themeId]
  return (
    <span
      aria-hidden
      className={cn(
        "flex aspect-video w-full flex-col justify-between overflow-hidden rounded-lg border p-2",
        className
      )}
      style={{ background: colors.background }}
    >
      <span
        className="text-lg leading-none font-bold"
        style={{ color: colors.heading, fontFamily: fontStack(headingFont) }}
      >
        Aa
      </span>
      <span className="flex gap-1">
        {colors.card.map((cardColor) => (
          <span key={cardColor} className="size-3 rounded-full" style={{ background: cardColor }} />
        ))}
      </span>
    </span>
  )
}
