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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAgentSlideActivity } from "@/hooks/UseAgentSlideActivity"
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

type Block = {
  label: string
  category: BlockCategory
  Icon: typeof TextIcon
  // "upload" opens the file picker instead of inserting right away.
  insert: (() => void) | "upload"
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
    insert: () => insertElement(createTextBlock(presetName, getTheme())),
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
    insert: () => insertElement(createChartBlock("bar", getTheme())),
  },
  {
    label: "Line chart",
    category: "data",
    Icon: ChartLineIcon,
    insert: () => insertElement(createChartBlock("line", getTheme())),
  },
  {
    label: "Pie chart",
    category: "data",
    Icon: ChartPieIcon,
    insert: () => insertElement(createChartBlock("pie", getTheme())),
  },
  {
    label: "Area chart",
    category: "data",
    Icon: ChartAreaIcon,
    insert: () => insertElement(createChartBlock("area", getTheme())),
  },
  {
    label: "Stacked bar",
    category: "data",
    Icon: ChartColumnStackedIcon,
    insert: () => insertElement(createChartBlock("stackedBar", getTheme())),
  },
  {
    label: "Table",
    category: "data",
    Icon: TableIcon,
    insert: () => insertElement(createTableBlock()),
  },
  {
    label: "Rectangle",
    category: "shapes",
    Icon: SquareIcon,
    insert: () => insertElement(createShapeBlock("rect", getTheme())),
  },
  {
    label: "Ellipse",
    category: "shapes",
    Icon: CircleIcon,
    insert: () => insertElement(createShapeBlock("ellipse", getTheme())),
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
  const isCurrentSlideLocked = useAgentSlideActivity(currentSlideId) !== null
  const hasSlides = useDeckStore(
    (state) => (state.deck?.slides.length ?? 0) > 0
  )
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<BlockCategory | "all">("all")
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Searching looks through every category.
  const searchText = search.trim().toLowerCase()
  const visibleBlocks = searchText
    ? BLOCKS.filter((block) => block.label.toLowerCase().includes(searchText))
    : BLOCKS.filter(
        (block) => category === "all" || block.category === category
      )

  function openOrClose(open: boolean) {
    setIsOpen(open)
    if (open) {
      setSearch("")
      setCategory("all")
    }
  }

  function addBlock(block: Block) {
    setIsOpen(false)
    if (block.insert === "upload") imageInputRef.current?.click()
    else block.insert()
  }

  function addFirstMatchOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && visibleBlocks.length > 0) {
      event.preventDefault()
      addBlock(visibleBlocks[0])
    }
  }

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
      <Popover open={isOpen} onOpenChange={openOrClose}>
        <PopoverTrigger
          render={
            <Button
              variant={isOpen ? "secondary" : "ghost"}
              disabled={!hasSlides || isCurrentSlideLocked}
            />
          }
        >
          <LayoutGridIcon />
          Add block
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(40rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0"
        >
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
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No blocks match “{search.trim()}”.
                </p>
              ) : (
                <BlockGroups blocks={visibleBlocks} onAddBlock={addBlock} />
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
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

// Blocks grouped under their category name, in the category list's order.
function BlockGroups({
  blocks,
  onAddBlock,
}: {
  blocks: Block[]
  onAddBlock: (block: Block) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {CATEGORIES.map(({ id, label }) => {
        const blocksInCategory = blocks.filter((block) => block.category === id)
        if (blocksInCategory.length === 0) return null
        return (
          <section key={id} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {label}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {blocksInCategory.map((block) => (
                <button
                  key={block.label}
                  type="button"
                  onClick={() => onAddBlock(block)}
                  className="flex flex-col items-center gap-2 rounded-xl border bg-card px-2 py-4 text-center text-sm font-medium shadow-xs transition outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
                >
                  <block.Icon className="size-7 text-primary" />
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
