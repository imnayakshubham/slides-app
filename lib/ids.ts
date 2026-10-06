import { v7 as uuidv7 } from "uuid"

// UUIDv7 starts with a timestamp, so ids sort by creation time.
export function createId() {
  return uuidv7()
}
