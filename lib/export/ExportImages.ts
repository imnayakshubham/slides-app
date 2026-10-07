// PowerPoint can't use CSS gradients, SVG or cross-site URLs, so these are drawn as fitted PNGs.

const MAX_IMAGE_SIDE_PX = 1600

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

// PowerPoint takes "RRGGBB"; non-hex CSS colors are resolved by the canvas.
export function colorToHex(color: string) {
  if (HEX_COLOR.test(color)) {
    const digits = color.slice(1)
    if (digits.length === 3) {
      return digits
        .split("")
        .map((digit) => digit + digit)
        .join("")
        .toUpperCase()
    }
    return digits.slice(0, 6).toUpperCase()
  }
  const context = createCanvas(1, 1).getContext("2d")
  if (!context) return "000000"
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return [red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

// pptxgenjs expects the data URL without its "data:" prefix.
function canvasToPngData(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png").replace(/^data:/, "")
}

function canvasSizeFor(boxWidth: number, boxHeight: number) {
  const scale = Math.min(1, MAX_IMAGE_SIDE_PX / Math.max(boxWidth, boxHeight))
  return { width: boxWidth * scale, height: boxHeight * scale }
}

// Remote images are fetched first; drawing them directly would block reading the canvas back.
async function loadImage(src: string) {
  const isRemote = /^https?:/i.test(src)
  const objectUrl = isRemote ? URL.createObjectURL(await (await fetch(src)).blob()) : null
  try {
    const image = new Image()
    image.src = objectUrl ?? src
    await image.decode()
    return image
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export async function imageToPngData(src: string, boxWidth: number, boxHeight: number, fit: "cover" | "contain") {
  const image = await loadImage(src)
  const { width, height } = canvasSizeFor(boxWidth, boxHeight)
  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available.")

  const imageWidth = image.naturalWidth || width
  const imageHeight = image.naturalHeight || height
  const scale =
    fit === "cover"
      ? Math.max(canvas.width / imageWidth, canvas.height / imageHeight)
      : Math.min(canvas.width / imageWidth, canvas.height / imageHeight)
  const drawnWidth = imageWidth * scale
  const drawnHeight = imageHeight * scale
  context.drawImage(image, (canvas.width - drawnWidth) / 2, (canvas.height - drawnHeight) / 2, drawnWidth, drawnHeight)
  return canvasToPngData(canvas)
}

// Same angle math as CSS linear-gradient: the gradient line reaches the corners.
export function gradientToPngData(from: string, to: string, angleDegrees: number, boxWidth: number, boxHeight: number) {
  const { width, height } = canvasSizeFor(boxWidth, boxHeight)
  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available.")

  const angle = (angleDegrees * Math.PI) / 180
  const directionX = Math.sin(angle)
  const directionY = -Math.cos(angle)
  const halfLength = Math.abs((canvas.width / 2) * directionX) + Math.abs((canvas.height / 2) * directionY)
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2
  const gradient = context.createLinearGradient(
    centerX - directionX * halfLength,
    centerY - directionY * halfLength,
    centerX + directionX * halfLength,
    centerY + directionY * halfLength
  )
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  return canvasToPngData(canvas)
}
