"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { ImageIcon, PaintBucketIcon, UploadIcon } from "lucide-react"

import { ColorInput } from "@/components/canvas/toolbar/ToolbarInputs"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { DeckEdit } from "@/lib/edits/DeckEdits"
import { deckRepository } from "@/lib/repository"
import type { SlideBackground } from "@/lib/schema/Deck"
import { cn } from "@/lib/utils"
import { useAgentLabel } from "@/hooks/UseAgentLabel"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const COLOR_SWATCHES = [
  "#FFFFFF",
  "#F8FAFC",
  "#F1F5F9",
  "#FEF3C7",
  "#DCFCE7",
  "#DBEAFE",
  "#EDE9FE",
  "#FCE7F3",
  "#1E293B",
  "#0F172A",
]

const GRADIENT_PRESETS = [
  { name: "Sky", from: "#E0F2FE", to: "#EDE9FE" },
  { name: "Peach", from: "#FFEDD5", to: "#FCE7F3" },
  { name: "Mint", from: "#DCFCE7", to: "#CFFAFE" },
  { name: "Sand", from: "#FEF9C3", to: "#FFEDD5" },
  { name: "Indigo", from: "#4F46E5", to: "#7C3AED" },
  { name: "Sunset", from: "#F97316", to: "#DB2777" },
  { name: "Ocean", from: "#0EA5E9", to: "#1E3A8A" },
  { name: "Night", from: "#1E293B", to: "#020617" },
]
const PRESET_GRADIENT_ANGLE = 135

const GRADIENT_DIRECTIONS = [
  { angle: 90, arrow: "→", label: "Left to right" },
  { angle: 135, arrow: "↘", label: "Top left to bottom right" },
  { angle: 180, arrow: "↓", label: "Top to bottom" },
  { angle: 225, arrow: "↙", label: "Top right to bottom left" },
]

function setCurrentSlideBackground(background: SlideBackground | undefined) {
  const slideId = useEditorStore.getState().currentSlideId
  if (!slideId) return
  useDeckStore.getState().applyEdit({
    type: "updateSlide",
    slideId,
    changes: { background },
  })
}

// One batch, so applying to every slide is a single undo step.
function applyCurrentBackgroundToAllSlides() {
  const { deck, applyEdit } = useDeckStore.getState()
  const currentSlideId = useEditorStore.getState().currentSlideId
  const currentSlide = deck?.slides.find((slide) => slide.id === currentSlideId)
  if (!deck || !currentSlide) return
  const edits: DeckEdit[] = deck.slides.map((slide) => ({
    type: "updateSlide",
    slideId: slide.id,
    changes: { background: currentSlide.background },
  }))
  applyEdit({ type: "batch", edits })
}

export function SlideBackgroundPicker() {
  const currentSlideId = useEditorStore((state) => state.currentSlideId)
  const isCurrentSlideLocked = useAgentLabel(currentSlideId) !== null
  const currentSlideIndex = useDeckStore(
    (state) => state.deck?.slides.findIndex((slide) => slide.id === currentSlideId) ?? -1
  )
  const background = useDeckStore((state) => state.deck?.slides[currentSlideIndex]?.background)
  const theme = useDeckStore((state) => state.deck?.theme)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  if (!theme) return null

  const gradient =
    background?.type === "gradient"
      ? background
      : {
          type: "gradient" as const,
          from: theme.colors.background,
          to: theme.colors.accent,
          angle: PRESET_GRADIENT_ANGLE,
        }

  async function setBackgroundFromPickedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    event.target.value = ""
    if (!file) return
    setUploadError(null)
    try {
      const image = await deckRepository.uploadImage(file)
      setCurrentSlideBackground({ type: "image", src: image.src })
    } catch {
      setUploadError("That image couldn't be read. Try a PNG or JPEG.")
    }
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" disabled={currentSlideIndex === -1 || isCurrentSlideLocked} />}>
        <PaintBucketIcon />
        <span className="max-sm:sr-only">Background</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3">
        <p className="font-medium">Slide {currentSlideIndex + 1} background</p>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Color</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {[theme.colors.background, theme.colors.accent, ...COLOR_SWATCHES].map((color, swatchIndex) => (
              <SwatchButton
                key={`${color}-${swatchIndex}`}
                label={`Color ${color}`}
                swatch={color}
                isSelected={background?.type === "color" && background.color === color}
                onClick={() => setCurrentSlideBackground({ type: "color", color })}
              />
            ))}
            <ColorInput
              label="Custom color"
              color={background?.type === "color" ? background.color : "#FFFFFF"}
              onChange={(color) => setCurrentSlideBackground({ type: "color", color })}
            />
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Gradient</h3>
          <div className="flex flex-wrap gap-1.5">
            {GRADIENT_PRESETS.map((preset) => (
              <SwatchButton
                key={preset.name}
                label={`${preset.name} gradient`}
                swatch={`linear-gradient(${PRESET_GRADIENT_ANGLE}deg, ${preset.from}, ${preset.to})`}
                isSelected={
                  background?.type === "gradient" && background.from === preset.from && background.to === preset.to
                }
                onClick={() =>
                  setCurrentSlideBackground({
                    type: "gradient",
                    from: preset.from,
                    to: preset.to,
                    angle: PRESET_GRADIENT_ANGLE,
                  })
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <ColorInput
              label="Gradient start color"
              color={gradient.from}
              onChange={(from) => setCurrentSlideBackground({ ...gradient, from })}
            />
            <ColorInput
              label="Gradient end color"
              color={gradient.to}
              onChange={(to) => setCurrentSlideBackground({ ...gradient, to })}
            />
            <div className="ms-auto flex gap-0.5">
              {GRADIENT_DIRECTIONS.map(({ angle, arrow, label }) => (
                <Button
                  key={angle}
                  variant={background?.type === "gradient" && background.angle === angle ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={label}
                  title={label}
                  onClick={() => setCurrentSlideBackground({ ...gradient, angle })}
                >
                  {arrow}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Image</h3>
          <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
            {background?.type === "image" ? <ImageIcon /> : <UploadIcon />}
            {background?.type === "image" ? "Replace image" : "Upload image"}
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void setBackgroundFromPickedImage(event)}
          />
          {uploadError && (
            <p role="alert" className="text-xs text-destructive">
              {uploadError}
            </p>
          )}
        </section>

        <div className="flex gap-2 border-t pt-2.5">
          <Button variant="ghost" size="sm" disabled={!background} onClick={() => setCurrentSlideBackground(undefined)}>
            Reset to theme
          </Button>
          <Button variant="outline" size="sm" className="ms-auto" onClick={applyCurrentBackgroundToAllSlides}>
            Apply to all slides
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SwatchButton({
  label,
  swatch,
  isSelected,
  onClick,
}: {
  label: string
  swatch: string
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isSelected}
      title={label}
      onClick={onClick}
      style={{ background: swatch }}
      className={cn(
        "size-7 rounded-full border shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-popover"
      )}
    />
  )
}
