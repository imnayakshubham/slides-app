"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { ImageUpIcon, Maximize2Icon, Minimize2Icon } from "lucide-react"

import {
  TextInput,
  ToolbarDivider,
  ToolbarToggle,
} from "@/components/canvas/toolbar/ToolbarInputs"
import { updateSelectedElement } from "@/lib/client/SelectedElementActions"
import { deckRepository } from "@/lib/repository"
import type { SlideElement } from "@/lib/schema/Deck"

type ImageElementData = Extract<SlideElement, { type: "image" }>

export function ImageControls({ element }: { element: ImageElementData }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Keeps the box as it is; "Fill" or "Fit" decides how the new image sits in it.
  async function replaceWithPickedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    event.target.value = ""
    if (!file) return
    setUploadError(null)
    try {
      const image = await deckRepository.uploadImage(file)
      updateSelectedElement({ src: image.src })
    } catch {
      setUploadError("Couldn't read that image")
    }
  }

  return (
    <>
      <ToolbarToggle
        label="Fill the box (crop)"
        isActive={element.fit === "cover"}
        onClick={() => updateSelectedElement({ fit: "cover" })}
      >
        <Maximize2Icon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Fit inside the box"
        isActive={element.fit === "contain"}
        onClick={() => updateSelectedElement({ fit: "contain" })}
      >
        <Minimize2Icon />
      </ToolbarToggle>
      <ToolbarDivider />
      <ToolbarToggle
        label="Replace image"
        onClick={() => fileInputRef.current?.click()}
      >
        <ImageUpIcon />
      </ToolbarToggle>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void replaceWithPickedImage(event)}
      />
      <TextInput
        label="Alt text (describes the image for screen readers)"
        placeholder="Alt text"
        value={element.alt}
        onChange={(alt) => updateSelectedElement({ alt })}
        className="w-32"
      />
      {uploadError && (
        <span role="alert" className="px-1 text-xs text-destructive">
          {uploadError}
        </span>
      )}
    </>
  )
}
