import { nanoid } from "nanoid"

// Prefixed ids read clearly in AI context, e.g. "el_V1StGXR8" vs "slide_k3Jd92Lq".
export function createId(prefix: "deck" | "slide" | "el") {
  return `${prefix}_${nanoid(8)}`
}
