"use client"

import { useRef, useState, type ChangeEvent } from "react"
import {
  CircleIcon,
  Heading1Icon,
  Heading2Icon,
  ImageIcon,
  LayoutGridIcon,
  ListIcon,
  ListOrderedIcon,
  SquareIcon,
  TableIcon,
  TextIcon,
  ChartColumnIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  createChartBlock,
  createImageBlock,
  createShapeBlock,
  createTableBlock,
  createTextBlock,
  insertElement,
} from "@/lib/client/InsertElement"
import {
  TEXT_PRESET_NAMES,
  TEXT_PRESETS,
  type TextPresetName,
} from "@/lib/layouts/TextPresets"
import { deckRepository } from "@/lib/repository"
import { useAgentSlideActivity } from "@/hooks/UseAgentSlideActivity"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

const TEXT_PRESET_ICONS: Record<TextPresetName, typeof TextIcon> = {
  title: Heading1Icon,
  subtitle: Heading2Icon,
  body: TextIcon,
  bullets: ListIcon,
  numbers: ListOrderedIcon,
}

function getTheme() {
  const deck = useDeckStore.getState().deck
  if (!deck) throw new Error("Add block needs a loaded deck.")
  return deck.theme
}

export function AddBlockMenu() {
  const currentSlideId = useEditorStore((state) => state.currentSlideId)
  const isCurrentSlideLocked = useAgentSlideActivity(currentSlideId) !== null
  const hasSlides = useDeckStore(
    (state) => (state.deck?.slides.length ?? 0) > 0
  )
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function insertPickedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    event.target.value = ""
    if (!file) return
    setUploadError(null)
    try {
      insertElement(createImageBlock(await deckRepository.uploadImage(file)))
    } catch {
      setUploadError("That image couldn't be read. Try a PNG or JPEG.")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              disabled={!hasSlides || isCurrentSlideLocked}
            />
          }
        >
          <LayoutGridIcon />
          Add block
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Text</DropdownMenuLabel>
            {TEXT_PRESET_NAMES.map((presetName) => {
              const PresetIcon = TEXT_PRESET_ICONS[presetName]
              return (
                <DropdownMenuItem
                  key={presetName}
                  onClick={() =>
                    insertElement(createTextBlock(presetName, getTheme()))
                  }
                >
                  <PresetIcon />
                  {TEXT_PRESETS[presetName].label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Data</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => insertElement(createChartBlock(getTheme()))}
            >
              <ChartColumnIcon />
              Chart
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertElement(createTableBlock())}>
              <TableIcon />
              Table
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Shapes</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() =>
                insertElement(createShapeBlock("rect", getTheme()))
              }
            >
              <SquareIcon />
              Rectangle
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                insertElement(createShapeBlock("ellipse", getTheme()))
              }
            >
              <CircleIcon />
              Ellipse
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Media</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
              <ImageIcon />
              Image…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void insertPickedImage(event)}
      />
      {uploadError && (
        <p role="alert" className="text-xs text-destructive">
          {uploadError}
        </p>
      )}
    </>
  )
}
