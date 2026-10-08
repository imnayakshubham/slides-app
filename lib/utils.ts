import { v7 as uuidv7 } from "uuid"
import { deckThemeFor } from "@/lib/themes/Themes"
import { Deck } from "./schema/deck"

export { cn } from "cn"

export function createId() {
    return uuidv7()
}

export function messageFromError(error: unknown) {
    if (error instanceof Error && error.message) return error.message
    return "Something went wrong"
}

export function currentTime() {
    return new Date().toISOString()
}

export function newTimestamps() {
    const time = currentTime()
    return { createdAt: time, updatedAt: time }
}

export function createEmptyDeck(): Deck {
    return {
        id: createId(),
        ...newTimestamps(),
        title: "Untitled deck",
        aspectRatio: "16:9",
        theme: deckThemeFor("classic"),
        slides: [],
    }
}
