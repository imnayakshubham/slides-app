"use client"

import { useState } from "react"
import { ImageOffIcon } from "lucide-react"

import type { SlideElement } from "@/lib/schema/Deck"

type ImageElementData = Extract<SlideElement, { type: "image" }>

export function ImageElement({ element }: { element: ImageElementData }) {
  // Remembering which src failed (not just "failed") resets the fallback
  // when the image is replaced.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (failedSrc === element.src) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-4 bg-current/5 p-8 text-center text-[28px]">
        <ImageOffIcon className="size-16 opacity-50" aria-hidden />
        <span className="opacity-60">
          {element.alt || "Image could not be loaded"}
        </span>
      </div>
    )
  }

  return (
    // next/image needs every remote host configured up front; slide images
    // come from anywhere (AI-chosen URLs, uploaded data URLs).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={element.src}
      alt={element.alt}
      draggable={false}
      onError={() => setFailedSrc(element.src)}
      className="size-full"
      style={{ objectFit: element.fit }}
    />
  )
}
