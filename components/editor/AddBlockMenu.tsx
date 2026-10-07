"use client"

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import {
  ChartAreaIcon,
  ChartColumnIcon,
  ChartColumnStackedIcon,
  ChartLineIcon,
  ChartPieIcon,
  CircleIcon,
  Heading1Icon,
  Heading2Icon,
  ImageIcon,
  ImageUpIcon,
  LayoutGridIcon,
  ListIcon,
  ListOrderedIcon,
  SearchIcon,
  ShapesIcon,
  SquareIcon,
  TableIcon,
  TextIcon,
  TypeIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAgentLabel } from "@/hooks/UseAgentLabel"
import {
  createChartBlock,
  createImageBlock,
  createShapeBlock,
  createTableBlock,
  createTextBlock,
  insertElement,
} from "@/lib/client/InsertElement"
import { TEXT_PRESETS, type TextPresetName } from "@/lib/layouts/TextPresets"
import { deckRepository } from "@/lib/repository"
import { cn } from "@/lib/utils"
import { useDeckStore } from "@/store/DeckStore"
import { useEditorStore } from "@/store/EditorStore"

type BlockCategory = "text" | "data" | "shapes" | "images"
type SlidePoint = { x: number; y: number }

type Block = {
  label: string
  category: BlockCategory
  Icon: typeof TextIcon
  // `at` is the top-left corner in slide units; without it the block goes to a free spot.
  insert: ((at?: SlidePoint) => void) | "upload"
}

const CATEGORIES: {
  id: BlockCategory | "all"
  label: string
  Icon: typeof TextIcon
}[] = [
  { id: "all", label: "All", Icon: LayoutGridIcon },
  { id: "text", label: "Text", Icon: TypeIcon },
  { id: "data", label: "Charts & tables", Icon: ChartColumnIcon },
  { id: "shapes", label: "Shapes", Icon: ShapesIcon },
  { id: "images", label: "Images", Icon: ImageIcon },
]

function getTheme() {
  const deck = useDeckStore.getState().deck
  if (!deck) throw new Error("Add block needs a loaded deck.")
  return deck.theme
}

function textBlock(presetName: TextPresetName, Icon: typeof TextIcon): Block {
  return {
    label: TEXT_PRESETS[presetName].label,
    category: "text",
    Icon,
    insert: (at) => insertElement(createTextBlock(presetName, getTheme()), at),
  }
}

const BLOCKS: Block[] = [
  textBlock("title", Heading1Icon),
  textBlock("subtitle", Heading2Icon),
  textBlock("body", TextIcon),
  textBlock("bullets", ListIcon),
  textBlock("numbers", ListOrderedIcon),
  {
    label: "Bar chart",
    category: "data",
    Icon: ChartColumnIcon,
    insert: (at) => insertElement(createChartBlock("bar", getTheme()), at),
  },
  {
    label: "Line chart",
    category: "data",
    Icon: ChartLineIcon,
    insert: (at) => insertElement(createChartBlock("line", getTheme()), at),
  },
  {
    label: "Pie chart",
    category: "data",
    Icon: ChartPieIcon,
    insert: (at) => insertElement(createChartBlock("pie", getTheme()), at),
  },
  {
    label: "Area chart",
    category: "data",
    Icon: ChartAreaIcon,
    insert: (at) => insertElement(createChartBlock("area", getTheme()), at),
  },
  {
    label: "Stacked bar",
    category: "data",
    Icon: ChartColumnStackedIcon,
    insert: (at) => insertElement(createChartBlock("stackedBar", getTheme()), at),
  },
  {
    label: "Table",
    category: "data",
    Icon: TableIcon,
    insert: (at) => insertElement(createTableBlock(), at),
  },
  {
    label: "Rectangle",
    category: "shapes",
    Icon: SquareIcon,
    insert: (at) => insertElement(createShapeBlock("rect", getTheme()), at),
  },
  {
    label: "Ellipse",
    category: "shapes",
    Icon: CircleIcon,
    insert: (at) => insertElement(createShapeBlock("ellipse", getTheme()), at),
  },
  {
    label: "Upload image",
    category: "images",
    Icon: ImageUpIcon,
    insert: "upload",
  },
]

export function AddBlockMenu() {
  const currentSlideId = useEditorStore((state) => state.currentSlideId)
  const isCurrentSlideLocked = useAgentLabel(currentSlideId) !== null
  const hasSlides = useDeckStore((state) => (state.deck?.slides.length ?? 0) > 0)
  const { addBlock, imageInput, uploadError } = useBlockAdder()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<BlockCategory | "all">("all")

  // Searching looks through every category.
  const searchText = search.trim().toLowerCase()
  const visibleBlocks = searchText
    ? BLOCKS.filter((block) => block.label.toLowerCase().includes(searchText))
    : BLOCKS.filter((block) => category === "all" || block.category === category)

  function openOrClose(open: boolean) {
    setIsOpen(open)
    if (open) {
      setSearch("")
      setCategory("all")
    }
  }

  function addBlockAndClose(block: Block) {
    setIsOpen(false)
    addBlock(block)
  }

  function addFirstMatchOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && visibleBlocks.length > 0) {
      event.preventDefault()
      addBlockAndClose(visibleBlocks[0])
    }
  }

  return (
    <>
      <Popover open={isOpen} onOpenChange={openOrClose}>
        <PopoverTrigger
          render={<Button variant={isOpen ? "secondary" : "ghost"} disabled={!hasSlides || isCurrentSlideLocked} />}
        >
          <LayoutGridIcon />
          Add block
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(40rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0">
          <div className="border-b p-3">
            <label className="flex items-center gap-2 rounded-xl border bg-background px-3 focus-within:ring-3 focus-within:ring-ring/50">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                placeholder="Search all blocks"
                aria-label="Search all blocks"
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={addFirstMatchOnEnter}
                className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
              />
            </label>
          </div>

          <div className="flex max-h-[min(28rem,70svh)] flex-col sm:flex-row">
            <nav
              aria-label="Block categories"
              className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:border-e sm:border-b-0"
            >
              {CATEGORIES.map(({ id, label, Icon }) => {
                const isActive = !searchText && category === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setSearch("")
                      setCategory(id)
                    }}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      isActive && "bg-primary/10 font-medium text-primary"
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                )
              })}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {visibleBlocks.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No blocks match “{search.trim()}”.</p>
              ) : (
                <BlockGroups blocks={visibleBlocks} onAddBlock={addBlockAndClose} />
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {imageInput}
      {uploadError && (
        <p role="alert" className="text-xs text-destructive">
          {uploadError}
        </p>
      )}
    </>
  )
}

// Adds blocks to the current slide; render `imageInput` once wherever this hook is used.
function useBlockAdder() {
  const imageInputRef = useRef<HTMLInputElement>(null)
  // Where the picked image goes once the file is read.
  const imagePointRef = useRef<SlidePoint | undefined>(undefined)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function addBlock(block: Block, at?: SlidePoint) {
    if (block.insert !== "upload") {
      block.insert(at)
      return
    }
    imagePointRef.current = at
    imageInputRef.current?.click()
  }

  async function insertPickedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    event.target.value = ""
    if (!file) return
    setUploadError(null)
    try {
      const image = await deckRepository.uploadImage(file)
      insertElement(createImageBlock(image), imagePointRef.current)
    } catch {
      setUploadError("That image couldn't be read. Try a PNG or JPEG.")
    }
  }

  const imageInput = (
    <input
      ref={imageInputRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(event) => void insertPickedImage(event)}
    />
  )

  return { addBlock, imageInput, uploadError }
}

// Opened by clicking an empty spot on the slide; the new block goes where the click was.
export function AddHereMenu() {
  const addHereMenu = useEditorStore((state) => state.addHereMenu)
  const setAddHereMenu = useEditorStore((state) => state.setAddHereMenu)
  const { addBlock, imageInput, uploadError } = useBlockAdder()

  // A zero-size box at the click, for the menu to open from.
  const anchor = addHereMenu
    ? {
        getBoundingClientRect: () =>
          DOMRect.fromRect({
            x: addHereMenu.screenPoint.x,
            y: addHereMenu.screenPoint.y,
            width: 0,
            height: 0,
          }),
      }
    : null

  function addBlockHere(block: Block) {
    const slidePoint = addHereMenu?.slidePoint
    setAddHereMenu(null)
    addBlock(block, slidePoint)
  }

  return (
    <>
      <Popover
        open={addHereMenu !== null}
        onOpenChange={(open) => {
          if (!open) setAddHereMenu(null)
        }}
      >
        <PopoverContent
          anchor={anchor}
          align="start"
          className="max-h-[min(26rem,70svh)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-3"
        >
          <p className="font-medium">Add here</p>
          <BlockGroups blocks={BLOCKS} onAddBlock={addBlockHere} isCompact />
        </PopoverContent>
      </Popover>
      {imageInput}
      {uploadError && (
        <p
          role="alert"
          className="fixed start-1/2 bottom-6 z-50 -translate-x-1/2 rounded-full bg-destructive px-3 py-1.5 text-sm text-white shadow-md"
        >
          {uploadError}
        </p>
      )}
    </>
  )
}

function BlockGroups({
  blocks,
  onAddBlock,
  isCompact = false,
}: {
  blocks: Block[]
  onAddBlock: (block: Block) => void
  // Smaller cards, three across, for the "Add here" menu.
  isCompact?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {CATEGORIES.map(({ id, label }) => {
        const blocksInCategory = blocks.filter((block) => block.category === id)
        if (blocksInCategory.length === 0) return null
        return (
          <section key={id} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
            <div className={cn("grid gap-2", isCompact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
              {blocksInCategory.map((block) => (
                <button
                  key={block.label}
                  type="button"
                  onClick={() => onAddBlock(block)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border bg-card px-2 text-center font-medium shadow-xs transition outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]",
                    isCompact ? "py-2.5 text-xs" : "py-4 text-sm"
                  )}
                >
                  <block.Icon className={cn("text-primary", isCompact ? "size-5" : "size-7")} />
                  {block.label}
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
