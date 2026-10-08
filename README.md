# Slides App

An AI slide deck builder. You type what you want to present, the AI plans an outline, you check it, and then the AI writes the slides one by one. After that you can keep changing the deck by chatting with the AI or by editing it yourself on the canvas.

Decks and chats are saved in your browser (IndexedDB). There is no database server and no login.

## Setup

You need Node.js and npm.

```bash
git clone https://github.com/imnayakshubham/slides-app
cd slides-app
npm install
cp .env.example .env
```

Open `.env` and add your API key:

```bash
AI_API_KEY=your-key-here
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
```

Groq is the default, but any OpenAI-compatible API works. Just change the base URL and model name.

Start the app:

```bash
npm run dev
```

Then open <http://localhost:8000>.

If `AI_API_KEY` is missing, the AI routes answer with an error (503). You can still create and edit decks by hand.

### Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Starts the dev server on port 8000             |
| `npm run build`     | Makes a production build                       |
| `npm run start`     | Runs the production build on port 8000         |
| `npm run lint`      | Checks the code with ESLint                    |
| `npm run typecheck` | Checks the types with TypeScript               |
| `npm run format`    | Formats `.ts` and `.tsx` files with Prettier   |

There are no automated tests. Each feature was checked by hand.

## What the app can do today

### Home page (`/new`)

- A prompt box: type what the deck is about and press send.
- "Start with a blank deck".
- A list of your saved decks. You can open, rename or delete them.
- "Load sample deck" (only in development).
- `/` sends you to `/new`.

### Making a deck with AI

1. Your prompt goes to the AI, which plans an outline: a deck title, a theme and a list of slides.
2. You review the outline in the agent panel. You can rename, reorder or remove slides, then press Generate (or Cmd/Ctrl+Enter).
3. The AI writes the slides one at a time. You see a progress list while it works.
4. If a slide fails you can retry it. If you press Stop, you can continue later.

If the prompt is not a clear topic, the AI asks what the deck should be about instead of guessing.

### Editing with chat

- Ask for changes in plain words, for example "make this a bar chart" or "move the chart to slide 3".
- The AI makes small changes to what is already there. It does not rebuild the deck.
- It knows which slide you are on and what you have selected, so "this" and "this slide" work.
- Each slide has an "Edit with agent" button.
- Changes show up while the AI is still replying.
- A whole AI reply undoes in one step.
- Slides the AI is changing are locked until it finishes.
- You can stop a reply at any time.

### Editing by hand

- Click to select, Shift-click to add to the selection, or drag on an empty area to draw a selection box.
- Drag to move. Use the handles to resize. Snap guides line things up with other elements.
- Drag an element onto another slide (a thumbnail or a slide on the canvas) to move it there. Hold Alt/Option to copy it.
- Double-click a text box or table to type into it.
- When something is selected, a small toolbar shows up above it. It has controls for that type of element, plus bring forward, send backward, duplicate and delete.
- "Add block" in the toolbar adds text, charts, tables, shapes or images. It has search and categories.
- Clicking an empty spot on a slide opens an "Add here" menu, which puts the new block where you clicked.

### Element types

| Type  | What you can change                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| Text  | Font size, color, bold, italic, underline (for the whole box or only the selected words), alignment, bullet and numbered lists, "Turn into" (title, subtitle, body, bullets, numbers) |
| Image | Upload, replace, fill the box (crop) or fit inside it, alt text                                                         |
| Chart | Bar, stacked bar, line, area or pie; title, axis labels, legend, series names and colors, and the data itself            |
| Table | Header row on or off, add or remove rows and columns, type into cells                                                    |
| Shape | Rectangle or ellipse, fill color, outline color and width, width and height with a ratio lock                            |

### Slides

- Add, duplicate, rename, delete.
- Drag to reorder, in the slide navigator or with the handle next to each slide.
- 7 layouts: title, content, two-column, comparison, section, chart-forward, blank.
- Background: a color, a gradient, or an image. "Reset to theme" and "Apply to all slides".
- 7 themes: Classic, Sunrise, Midnight, Editorial, Forest, Electric, Graphite. Changing the theme recolors the whole deck, but colors you picked by hand stay.

### Keyboard shortcuts

| Keys                                  | Action                                 |
| ------------------------------------- | -------------------------------------- |
| Cmd/Ctrl+Z                            | Undo                                   |
| Shift+Cmd/Ctrl+Z or Cmd/Ctrl+Y        | Redo                                   |
| Delete or Backspace                   | Delete selected elements               |
| Cmd/Ctrl+D                            | Duplicate selected elements            |
| Arrow keys                            | Move selected elements 1 unit (Shift: 10) |
| Esc                                   | Clear the selection                    |
| Up / Down / Page Up / Page Down       | Go to the previous or next slide (when nothing is selected) |
| D                                     | Toggle dark mode                       |

None of these fire while you are typing.

### Other things

- Autosave: 1 second after your last change, when you switch tabs, when you leave the editor, and when the AI finishes. While the AI is working, saving waits until it is done. The top bar shows "Saving…", "Saved" or "Save failed — Retry".
- Export the deck as a PowerPoint file (.pptx).
- Light and dark mode.
- Works on phones. On small screens the agent panel and the deck list open as side sheets.

## API

There are 3 API routes. All of them are `POST`. They stream the reply back using the Vercel AI SDK's UI message stream, so text and changes arrive while the AI is still working.

The routes never read or write storage. The browser sends the deck in the request, and saves the result itself.

| Route                | Request body                                                        | What comes back                                                                 |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /api/plan`     | `{ prompt }`                                                        | The outline as a `data-outline` part (or a short question if the prompt is unclear). 1 step. |
| `POST /api/populate` | `{ deck, outline, slideId, outlineSlideIndex }`                     | The content of one slide as a `data-edit` part. Up to 3 tries if the AI's answer is rejected. |
| `POST /api/chat`     | `{ deck, messages, currentSlideId, selectedIds, userMessage }`      | Reply text, plus one `data-edit` part for every change. Up to 8 steps. Only the last 12 messages are sent to the AI. |

Errors:

- `400`: the request body is wrong. The response says what is wrong.
- `503`: `AI_API_KEY` is not set on the server.

Every `data-edit` part holds one `DeckEdit` and a short label like `Added a table to slide 2`. The browser applies it with the same code that hand edits use.

## AI tools

There are **19 tools** in total.

**Planning (`/api/plan`): 1 tool**

| Tool             | What it does                                      |
| ---------------- | ------------------------------------------------- |
| `create_outline` | Sends the deck title, theme and every slide in order |

**Writing a slide (`/api/populate`): 1 tool**

| Tool         | What it does                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| `fill_slide` | Writes one slide's text, chart or table, and speaker notes. Layout code places it.  |

**Chat editing (`/api/chat`): 17 tools**

| Tool                | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `get_slide`         | Gets the full details of a slide and its elements               |
| `add_slide`         | Adds a slide                                                    |
| `update_slide`      | Changes a slide's title, background or notes                    |
| `delete_slide`      | Deletes a slide and everything on it                            |
| `reorder_slides`    | Moves a slide to a new position                                 |
| `duplicate_slide`   | Copies a slide to right after it                                |
| `change_layout`     | Changes a slide's layout                                        |
| `add_element`       | Adds a text box, image or shape                                 |
| `update_element`    | Edits a text box, image or shape                                |
| `delete_element`    | Deletes an element                                              |
| `move_element`      | Moves an element on its slide or to another slide               |
| `resize_element`    | Resizes an element                                              |
| `reorder_elements`  | Brings an element forward or sends it back                      |
| `add_chart`         | Adds a chart                                                    |
| `update_chart_data` | Changes a chart's title, data, legend or axis labels            |
| `change_chart_type` | Switches the chart type and keeps the data                      |
| `add_table`         | Adds a table                                                    |

New elements go into free space when there is any. If something ends up overlapping, the tool tells the AI so it can fix it.

### Deck edits

Every change to a deck, from the AI or from you, is one `DeckEdit`, applied by `applyDeckEdit` in `lib/edits/DeckEdits.ts`. There are 13 kinds:

`updateDeck`, `addSlide`, `updateSlide`, `deleteSlide`, `moveSlide`, `addElement`, `updateElement`, `deleteElement`, `moveElement`, `copyElement`, `reorderElement`, `setTheme`, `batch`

## Data and storage

### IndexedDB collections

Database name: `ai-slides`, version 2. It has 3 stores:

| Store           | Key                         | What is inside                                                     |
| --------------- | --------------------------- | ------------------------------------------------------------------ |
| `decks`         | `deck.id`                   | `{ schemaVersion: 1, version, createdAt, updatedAt, deck }`        |
| `deckIndex`     | `id` (indexed by `updatedAt`) | `{ id, title, createdAt, updatedAt }`, so the home page can list decks quickly |
| `conversations` | `deckId`                    | `{ schemaVersion: 2, deckId, createdAt, updatedAt, messages }`, the deck's chat |

- `version` goes up by 1 on every save.
- Deleting a deck also deletes its chat.
- Uploaded images are shrunk to at most 1600px on the long side and kept inside the deck as data URLs.
- The app only talks to storage through the `DeckRepository` interface (`lib/repository`), so IndexedDB can be swapped for a server later.

### Saved shapes

These are the exact shapes saved in each store. They come from the Zod schemas in `lib/schema/`. A `?` means the field is optional.

Dates are UTC ISO strings, like `"2026-10-08T09:30:00.000Z"`. The deck, its theme, every slide and every element have a `createdAt` and an `updatedAt`:

- Something new gets both set to now. A copy or duplicate counts as new.
- Every edit gives the deck a new `updatedAt`, plus the slide and the element it changed.
- The built-in themes have fixed dates, because the themes themselves are fixed (`THEMES` in `lib/themes/Themes.ts`).

**`deckIndex` store: one row per deck, used for the deck list**

```ts
{
  id: string          // same as the deck id
  title: string
  createdAt: string
  updatedAt: string
}
```

**`decks` store: one row per deck**

```ts
{
  schemaVersion: 1
  version: number     // 1 on the first save, then +1 on every save
  createdAt: string
  updatedAt: string
  deck: Deck
}
```

**`Deck`**

```ts
{
  id: string              // UUID
  createdAt: string
  updatedAt: string
  title: string
  aspectRatio: "16:9"
  theme: {
    id: string            // fixed UUID of the built-in theme; used to tell which theme this is
    themeType: "classic" | "sunrise" | "midnight" | "editorial" | "forest" | "electric" | "graphite"   // readable name; the AI picks themes by it
    createdAt: string     // fixed date of the built-in theme
    updatedAt: string
    fontFamily: string    // body font
    headingFont: string
    colors: {
      background: string
      text: string
      heading: string
      accent: string
      card: string[]      // at least 1
      cardText: string
      chart?: string[]
    }
  }
  slides: Slide[]         // array order = slide order
}
```

**`Slide`**

```ts
{
  id: string              // UUID
  createdAt: string
  updatedAt: string
  title: string
  layout: "title" | "content" | "two-column" | "comparison" | "section" | "chart-forward" | "blank"
  background?:            // missing = use the theme background
    | { type: "color", color: string }
    | { type: "gradient", from: string, to: string, angle: number }   // angle 0 to 360
    | { type: "image", src: string }
  notes: string           // speaker notes
  elements: Element[]     // array order = stacking order, last one on top
}
```

**`Element`**: every element has these fields, plus the fields for its type.

```ts
{
  id: string              // UUID
  createdAt: string
  updatedAt: string
  x: number
  y: number
  w: number               // at least 40
  h: number               // at least 40
}
```

| `type`  | Extra fields |
| ------- | ------------ |
| `text`  | `role` ("title", "heading", "subtitle", "body", "eyebrow"), `paragraphs`, `fontSize`, `bold`, `italic`, `underline?`, `color`, `align` ("left", "center", "right"), `listStyle` ("none", "bullet", "number") |
| `image` | `src`, `alt`, `fit` ("cover", "contain") |
| `chart` | `chartType` ("bar", "line", "pie", "area", "stackedBar"), `title`, `categories: string[]`, `series: { name, data: number[], color? }[]`, `showLegend`, `xAxisLabel?`, `yAxisLabel?` |
| `table` | `rows: string[][]` (first row is the header when `headerRow` is true), `headerRow` |
| `shape` | `shape` ("rect", "ellipse"), `fill`, `stroke`, `strokeWidth` |

Rules the schema checks:

- A text paragraph is either a plain string, or a list of styled pieces: `{ text, bold?, italic?, underline?, color?, fontSize? }`.
- Every chart series has exactly one number per category.
- Every table row has the same number of cells.

**`conversations` store: one row per deck**

```ts
{
  schemaVersion: 2
  deckId: string
  createdAt: string
  updatedAt: string
  messages: Message[]
}
```

**`Message`**: the AI SDK's `UIMessage` format, saved as it is.

```ts
{
  id: string
  role: "user" | "assistant"
  parts: Part[]
}
```

The parts you will see in a saved chat:

| Part type        | What it holds |
| ---------------- | ------------- |
| `text`           | The words of a user message or an AI reply |
| `tool-<name>`    | One AI tool call, e.g. `tool-add_chart`, with its input and its result. A good result looks like `{ ok: true, label, createdIds, warning? }` and a failed one like `{ ok: false, error }`. |
| `data-outline`   | The planned outline: `{ outline: { title, themeType, slides[] } }` |
| `step-start`     | Added by the AI SDK where a new AI step begins |

Chat edits are sent to the browser as `data-edit` parts marked "transient". They are applied to the deck as they arrive, but they are not kept in the saved message. The `tool-<name>` part keeps the label of each change instead.

## Libraries used

| Library                                                      | Used for                                              |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `next` 16                                                    | The app framework (App Router and API routes)         |
| `react` 19, `react-dom` 19                                   | UI                                                    |
| `tailwindcss` 4                                              | Styling                                               |
| `shadcn`, `@base-ui/react`                                   | UI components (buttons, popovers, sheets, dialogs)    |
| `class-variance-authority`, `cn`, `tw-animate-css`           | Class name helpers and animations for the UI components |
| `lucide-react`                                               | Icons                                                 |
| `next-themes`                                                | Light and dark mode                                   |
| `sonner`                                                     | Toast messages                                        |
| `ai` 7                                                       | Vercel AI SDK: streaming text and tool calls          |
| `@ai-sdk/openai-compatible`                                  | Connects to any OpenAI-compatible API (Groq by default) |
| `@ai-sdk/react`                                              | Chat state in the browser                             |
| `zod` 4                                                      | Checks the deck, requests and AI tool inputs          |
| `zustand` 5                                                  | App state (deck, editor, agent, drag preview)         |
| `idb`                                                        | A simple wrapper around IndexedDB                     |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`    | Dragging elements, resizing, and reordering slides    |
| `@tiptap/*`                                                  | Rich text editing inside text boxes                   |
| `recharts`                                                   | Charts                                                |
| `pptxgenjs`                                                  | PowerPoint export                                     |
| `@tanstack/react-virtual`                                    | Only draws the chat messages you can see, so long chats stay fast |
| `uuid`                                                       | Ids (UUID v7)                                         |
| `server-only`                                                | Stops server code from being used in the browser      |

Dev tools: `typescript`, `eslint` with `eslint-config-next`, `prettier` with `prettier-plugin-tailwindcss`.

## What each file does

### Root

| File                       | What it does                                         |
| -------------------------- | ---------------------------------------------------- |
| `package.json`             | Dependencies and scripts                             |
| `.env.example`             | The env variables you need to copy into `.env`       |
| `next.config.ts`           | Next.js settings                                     |
| `tsconfig.json`            | TypeScript settings (`@/*` points to the project root) |
| `eslint.config.mjs`        | ESLint rules                                         |
| `.prettierrc`              | Prettier settings (no semicolons, 120 wide, Tailwind class sorting) |
| `postcss.config.mjs`       | Loads Tailwind                                       |
| `components.json`          | shadcn settings                                      |

### `app/`

| File                          | What it does                                                  |
| ----------------------------- | ------------------------------------------------------------- |
| `layout.tsx`                  | Root layout: fonts, theme provider and toasts                 |
| `globals.css`                 | Tailwind setup and the light/dark color tokens                |
| `page.tsx`                    | Sends `/` to `/new`                                           |
| `new/page.tsx`                | The home page                                                 |
| `slide/[id]/page.tsx`         | The editor for one deck                                       |
| `api/plan/route.ts`           | AI plans the outline                                          |
| `api/populate/route.ts`       | AI writes one slide                                           |
| `api/chat/route.ts`           | AI edits the deck from a chat message                         |

### `components/`

| File                                  | What it does                                                        |
| ------------------------------------- | ------------------------------------------------------------------- |
| `ThemeProvider.tsx`                   | Light/dark mode, and the `D` key to switch it                       |
| `ui/*`                                | shadcn components (alert dialog, button, popover, sheet, skeleton, sonner, textarea) |
| `new/NewDeckPage.tsx`                 | Home page: prompt box, blank deck, sample deck, deck list           |
| `editor/DeckEditor.tsx`               | Loads the deck and its chat, then shows the editor                  |
| `editor/EditorLayout.tsx`             | Puts the agent panel, top bar, toolbar, navigator and canvas together |
| `editor/TopBar.tsx`                   | Home, Agent button, deck title, save status, Export                 |
| `editor/EditorToolbar.tsx`            | Slides toggle, undo, redo, Add block, background and theme pickers  |
| `editor/AddBlockMenu.tsx`             | "Add block" menu and the "Add here" menu                            |
| `editor/SlideBackgroundPicker.tsx`    | Pick a slide background: color, gradient or image                   |
| `editor/ThemePicker.tsx`              | Pick the deck theme                                                 |
| `editor/DeckTitleInput.tsx`           | Inline input to rename a deck or slide                              |
| `editor/SlideInsertionLine.tsx`       | The line that shows where a dragged slide will land                 |
| `navigator/SlideNavigator.tsx`        | Slide thumbnails: add, rename, duplicate, delete, reorder            |
| `canvas/SlideCanvas.tsx`              | All slides stacked in one scroll, with drag handling                |
| `canvas/EditableSlide.tsx`            | One slide you can click, drag and select on                         |
| `canvas/Artboard.tsx`                 | Draws a 1920×1080 slide scaled to fit its space                     |
| `canvas/SlideRail.tsx`                | Buttons beside a slide: drag to reorder, edit with agent            |
| `canvas/SelectionFrame.tsx`           | Selection outline, resize handles, snap guides and selection box    |
| `canvas/SelectionToolbar.tsx`         | The floating toolbar above the selected element                     |
| `canvas/DropCursorBadge.tsx`          | The "Move chart → slide 4" badge next to the pointer                |
| `canvas/AgentWorkingOverlay.tsx`      | Overlay on a slide while the AI is changing it                      |
| `canvas/toolbar/TextControls.tsx`     | Text toolbar controls                                               |
| `canvas/toolbar/ImageControls.tsx`    | Image toolbar controls                                              |
| `canvas/toolbar/ChartControls.tsx`    | Chart type and legend controls                                      |
| `canvas/toolbar/ChartDataEditor.tsx`  | Popover to edit a chart's data, labels and colors                   |
| `canvas/toolbar/TableControls.tsx`    | Table toolbar controls                                              |
| `canvas/toolbar/ShapeControls.tsx`    | Shape toolbar controls                                              |
| `canvas/toolbar/ToolbarInputs.tsx`    | Shared toolbar buttons and inputs (toggle, color, text, number)     |
| `elements/ElementRenderer.tsx`        | Picks the right component for each element type                     |
| `elements/TextElement.tsx`            | Shows a text box                                                    |
| `elements/TextEditor.tsx`             | Tiptap editor used while typing in a text box                       |
| `elements/ImageElement.tsx`           | Shows an image                                                      |
| `elements/ChartElement.tsx`           | Shows a chart with Recharts                                         |
| `elements/TableElement.tsx`           | Shows a table and lets you type in cells                            |
| `elements/ShapeElement.tsx`           | Shows a rectangle or ellipse                                        |
| `chat/AgentPanel.tsx`                 | The left chat panel                                                 |
| `chat/ChatMessageList.tsx`            | The list of chat messages                                           |
| `chat/MessageInput.tsx`               | The text box with Send / Stop                                       |
| `chat/OutlineReview.tsx`              | Review and edit the outline before generating                       |
| `chat/GenerationProgress.tsx`         | Progress list while slides are being written                        |

### `hooks/`

| File                              | What it does                                                    |
| --------------------------------- | --------------------------------------------------------------- |
| `UseOpenDeckAgent.ts`             | Reads the open deck's agent state                               |
| `UseAgentChat.ts`                 | The open deck's chat messages and actions                       |
| `UseAgentLabel.ts`                | What the AI is doing on a slide, if anything                    |
| `UseAutosave.ts`                  | Saves the deck automatically                                    |
| `UseCanvasGestures.ts`            | Turns mouse/touch movement into move, resize and selection box  |
| `UseCanvasShortcuts.ts`           | Undo, redo, delete, duplicate, nudge and Esc shortcuts          |
| `UseSlideKeyboardNavigation.ts`   | Up/Down and Page Up/Down to change slides                       |

### `store/`

| File                    | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `DeckStore.ts`          | The open deck, `applyEdit`, and undo/redo                       |
| `EditorStore.ts`        | Current slide, selection and text editing state                 |
| `AgentStore.ts`         | AI state for each deck (running, outline, slide progress)       |
| `DragPreviewStore.ts`   | Live drag and resize preview, kept out of the deck              |

### `lib/`

| File                                  | What it does                                                       |
| ------------------------------------- | ------------------------------------------------------------------ |
| `schema/Deck.ts`                      | Zod schema for the deck, slides, elements and theme                |
| `schema/DeckRecord.ts`                | Shape of a saved deck                                              |
| `schema/Conversation.ts`              | Shape of a saved chat                                              |
| `schema/Outline.ts`                   | Shape of the AI's outline                                          |
| `schema/SlideContent.ts`              | What the AI must write for each layout                             |
| `edits/DeckEdits.ts`                  | All deck edits and `applyDeckEdit`                                 |
| `edits/Geometry.ts`                   | Box math: resize, snap, overlap, free space, text height           |
| `ai/Model.ts`                         | Creates the AI model from the env variables                        |
| `ai/Prompts.ts`                       | The instructions for the planner, slide writer and chat editor     |
| `ai/Tools.ts`                         | The 17 chat editing tools                                          |
| `ai/DeckContext.ts`                   | Describes the deck to the AI as short text                         |
| `ai/StreamAgentReply.ts`              | Runs the AI and streams its reply to the browser                   |
| `ai/SlidesMessage.ts`                 | Types for chat messages and their custom parts                     |
| `client/DeckChat.ts`                  | Sends chat messages to `/api/plan` or `/api/chat`                  |
| `client/AgentActions.ts`              | Edits the outline and writes slides through `/api/populate`        |
| `client/AgentRun.ts`                  | Starts, stops and tracks one AI run, and applies its edits         |
| `client/InsertElement.ts`             | Creates new blocks and adds them to the current slide              |
| `client/SelectedElementActions.ts`    | Update, delete, duplicate, nudge and layer the selection           |
| `client/SlideActions.ts`              | Add and duplicate slides                                           |
| `layouts/SlideLayouts.ts`             | Slot boxes for each layout, and creating or copying slides         |
| `layouts/BuildSlideElements.ts`       | Turns the AI's slide content into placed elements                  |
| `layouts/TextPresets.ts`              | Text styles for "Add block" and "Turn into"                        |
| `layouts/ImagePlaceholder.ts`         | Placeholder image when the AI has no picture                       |
| `themes/Themes.ts`                    | The 7 themes and their fonts and colors                            |
| `themes/Recolor.ts`                   | Recolors a deck when the theme changes                             |
| `repository/DeckRepository.ts`        | The storage interface                                              |
| `repository/IndexedDbDeckRepository.ts` | The IndexedDB version of it                                      |
| `repository/index.ts`                 | Picks which storage to use                                         |
| `export/ExportPptx.ts`                | Exports the deck as a .pptx file                                   |
| `export/ExportImages.ts`              | Turns colors, images and gradients into what PowerPoint accepts    |
| `fixtures/SampleDeck.ts`              | The sample deck for "Load sample deck"                             |
| `RichText.ts`                         | Converts styled text between the deck and the Tiptap editor        |
| `CreateEmptyDeck.ts`                  | Makes a new empty deck                                             |
| `Ids.ts`                              | Creates UUID v7 ids                                                |
| `Timestamps.ts`                       | Gives the current time and new createdAt/updatedAt dates (UTC)     |
| `ErrorMessage.ts`                     | Gets a readable message from an error                              |
| `IsTypingTarget.ts`                   | Checks if the user is typing, so shortcuts don't fire              |
| `utils.ts`                            | The `cn` class name helper                                         |
