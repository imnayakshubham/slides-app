"use client"

import { PaletteIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useOpenDeckAgent } from "@/hooks/UseOpenDeckAgent"
import { THEMES, deckThemeFor, fontStack, type ThemePreset } from "@/lib/themes/Themes"
import { cn } from "@/lib/utils"
import { useDeckStore } from "@/store/DeckStore"

export function ThemePicker() {
  const currentThemeId = useDeckStore((state) => state.deck?.theme.id)
  const isAgentBusy = useOpenDeckAgent().run !== null

  function applyTheme(preset: ThemePreset) {
    if (preset.id === currentThemeId) return
    useDeckStore.getState().applyEdit({ type: "setTheme", theme: deckThemeFor(preset.themeType) })
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
          {THEMES.map((preset) => {
            const isCurrentTheme = preset.id === currentThemeId
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isCurrentTheme}
                onClick={() => applyTheme(preset)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl p-1.5 text-start text-xs font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  isCurrentTheme && "bg-primary/10 text-primary"
                )}
              >
                <ThemePreview preset={preset} />
                {preset.name}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ThemePreview({ preset, className }: { preset: ThemePreset; className?: string }) {
  const { colors, headingFont } = preset
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
