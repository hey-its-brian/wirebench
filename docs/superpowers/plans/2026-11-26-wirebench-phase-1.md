# Wirebench Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local browser app where Brian drags placeholder parts with true pin maps onto a desk, wires pin to pin with colors driven by one global pin-type setting, and can swap any placeholder for his own image by clicking each pin's spot on it.

**Architecture:** Pure TypeScript model functions (geometry, nets, colors, wire list, image placement) with unit tests, a Zustand store that owns the project and talks to a small file API, and React components that render the desk as one SVG in millimetre units. The file API is a Vite plugin that reads and writes JSON under `data/`.

**Tech Stack:** Node 26, Vite, React, TypeScript, Zustand, Vitest. No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-wirebench-design.md`

## Global Constraints

- Everything is stored in millimetres. Grid is 2.54 mm.
- Server listens on `127.0.0.1` only. One command starts everything: `npm run dev`.
- Library, projects and settings are JSON files under `data/`. `data/library/images/` is in `.gitignore`.
- A wire end is always attached to a pin. No free-floating ends.
- `verified` is never set to `true` by code or seed data; only the "Mark as checked" button sets it.
- Every seeded part has a `source` line.
- No em dashes in code comments, docs, UI copy or exports.
- White and black wires must both be visible on the desk.

## Review Focus

1. A project names a part id that is not in the library (file deleted or renamed): the desk shows a "missing part" stub and keeps working; it does not crash. Test in Task 2 (`partGeometry` callers) and Task 6.
2. A pin type is removed in Settings while pins still use it: those pins and wires fall back to gray, nothing throws. Test in Task 3.
3. Deleting a part removes every wire attached to it, in one undo step. Test in Task 5.
4. A wire is started and ended on the same pin, or duplicates an existing wire between the same two pins: it is not created. Test in Task 5.
5. An id or file name sent to the file API contains `..`, slashes or uppercase: rejected with 400, nothing written outside `data/`. Test in Task 1.

---

## File Structure

```
package.json  vite.config.ts  tsconfig.json  index.html  .gitignore  README.md
server/fileApi.ts          Vite plugin: JSON and image read/write under data/
server/ids.ts              isSafeId, isSafeImageName
scripts/seed-library.mjs   writes data/library/*.json that do not exist yet
scripts/check-library.mjs  validates every library file
data/settings.json  data/library/*.json  data/library/images/  data/projects/*.json
src/main.tsx  src/App.tsx  src/styles.css
src/model/types.ts         all shared types
src/model/defaults.ts      default pin types, jumper palette
src/model/geometry.ts      snap, rotate, flip, pin world positions
src/model/placement.ts     image pin placement helpers
src/model/nets.ts          union-find nets from wires and links
src/model/colors.ts        wire color rule
src/model/wirelist.ts      wire table and Markdown
src/model/validate.ts      part file validation
src/store/api.ts           fetch wrappers
src/store/store.ts         state, actions, undo, autosave
src/ui/Toolbar.tsx  LibraryPanel.tsx  Desk.tsx  PartView.tsx  WireView.tsx
src/ui/Inspector.tsx  WireList.tsx  SettingsDialog.tsx  PartSettingsDialog.tsx  ProjectMenu.tsx
tests/*.test.ts
```

---

### Task 1: Scaffold, types, defaults, file API

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `src/main.tsx`, `src/model/types.ts`, `src/model/defaults.ts`, `server/ids.ts`, `server/fileApi.ts`, `tests/ids.test.ts`.

**Interfaces (produces):**

```ts
// types.ts
type PinTypeId = string
interface PinType { id: PinTypeId; label: string; color: string }
interface PaletteColor { name: string; color: string }
interface Settings { pinTypes: PinType[]; palette: PaletteColor[]; snap: boolean }
interface Point { x: number; y: number }
interface PinDef { id: string; name: string; type: PinTypeId; x: number; y: number;
  row?: string; gpio?: number; caps?: string[]; voltage?: number; internalUse?: string; note?: string }
interface PartImage { file: string; widthMm: number; aspect: number; pins: Record<string, { u: number; v: number }> }
type Face = 'top' | 'bottom'
interface PartDef { id: string; name: string; category: string; tags?: string[]; onHand: boolean;
  face: Face; verified: boolean; verifiedOn?: string; source: string;
  width: number; height: number; color: string; pins: PinDef[]; links?: string[][];
  power?: { draws?: { rail: PinTypeId; typicalMa: number; peakMa: number }[]; supplies?: { pins: string[]; rail: PinTypeId; maxMa: number }[] };
  notes?: string; images?: { front?: PartImage; flipped?: PartImage } }
type Rotation = 0 | 90 | 180 | 270
interface PlacedPart { id: string; partId: string; x: number; y: number; rotation: Rotation; flipped: boolean; label?: string }
interface PinRef { part: string; pin: string }
interface Wire { id: string; a: PinRef; b: PinRef; color?: string; points?: Point[] }
interface Project { id: string; name: string; parts: PlacedPart[]; wires: Wire[]; updated?: string }
type Library = Record<string, PartDef>
```

`images.front` is the image for the part's stated face; `images.flipped` is the other face. `aspect` is image height divided by width. `u`, `v` are fractions of image width and height.

```ts
// defaults.ts
const DEFAULT_PIN_TYPES: PinType[]   // ids: 3v3 5v gnd spi_sck spi_mosi spi_miso spi_cs i2c_sda i2c_scl uart_tx uart_rx irq enable analog gpio other
const JUMPER_PALETTE: PaletteColor[] // black brown red orange yellow green blue purple gray white
const FALLBACK_COLOR = '#8a8f98'
const DEFAULT_SETTINGS: Settings
// ids.ts
isSafeId(s: string): boolean          // ^[a-z0-9][a-z0-9-]{0,63}$
isSafeImageName(s: string): boolean   // safe id + '.' + png|jpg|jpeg|webp
```

Default colors come from the spec's pin type table.

File API routes, all JSON unless noted:

| Route | Does |
|---|---|
| `GET /api/library` | array of every part file |
| `PUT /api/library/:id` | write one part file |
| `GET /api/settings`, `PUT /api/settings` | `data/settings.json`; GET returns `DEFAULT_SETTINGS` when the file is missing or unreadable |
| `GET /api/projects` | `[{id, name, updated}]` |
| `GET/PUT/DELETE /api/projects/:id` | one project file |
| `POST /api/images/:name` | raw image bytes, 15 MB limit, saved to `data/library/images/:name` |
| `DELETE /api/images/:name` | remove one image |
| `GET /images/:name` | serve one image |

- [x] Write `tests/ids.test.ts`: `isSafeId` accepts `nrf24l01` and `esp32-devkit-v1`; rejects `''`, `../x`, `a/b`, `Abc`, `a.b`, a 65-character string. `isSafeImageName` accepts `nrf24l01-front.png`; rejects `x.svg`, `../x.png`, `x.png/..`.
- [x] Run `npx vitest run tests/ids.test.ts`, expect failure.
- [x] Create the scaffold, types, defaults, ids, and the plugin. Every route checks `isSafeId` or `isSafeImageName` first and answers 400 otherwise. `vite.config.ts` sets `server.host` to `127.0.0.1`.
- [x] Run the test, expect pass. Run `npm run dev`, `curl -s localhost:5173/api/settings` returns the defaults; `curl -s -o /dev/null -w '%{http_code}' -X PUT localhost:5173/api/projects/..%2Fx -d '{}'` prints 400.

### Task 2: Geometry

**Files:** Create `src/model/geometry.ts`, `src/model/placement.ts`, `tests/geometry.test.ts`, `tests/placement.test.ts`.

**Interfaces (produces):**

```ts
const GRID = 2.54
snapTo(v: number, grid?: number): number
interface PartGeometry { w: number; h: number; pins: Record<string, Point>; image?: PartImage; mirrored: boolean }
partGeometry(def: PartDef, flipped: boolean): PartGeometry
rotatedSize(size: { w: number; h: number }, r: Rotation): { w: number; h: number }
localToWorld(p: Point, size: { w: number; h: number }, placed: { x: number; y: number; rotation: Rotation }): Point
pinWorld(def: PartDef, placed: PlacedPart, pinId: string): Point | null
snapPlaced(def: PartDef, placed: PlacedPart, grid?: number): Point
rotatePlaced(def: PartDef, placed: PlacedPart): PlacedPart
// placement.ts
isImageComplete(def: PartDef, img?: PartImage): boolean
nextUnplacedPin(def: PartDef, img: PartImage): string | null
fillRow(a: { u: number; v: number }, b: { u: number; v: number }, count: number): { u: number; v: number }[]
rowsOf(def: PartDef): { row: string; pins: string[] }[]
```

Rules:
- `placed.x, placed.y` is the top-left of the part's rotated bounding box.
- `partGeometry`: if the image for the requested face is complete, size is `widthMm` by `widthMm * aspect` and pins are at `u * w, v * h`. Otherwise the placeholder: size `width` by `height`, pins at their `x, y`, and when `flipped` each pin's x becomes `w - x` with `mirrored: true`.
- `localToWorld` for rotation 0, 90, 180, 270 maps `(px, py)` to `(px, py)`, `(h - py, px)`, `(w - px, h - py)`, `(py, w - px)`, then adds `placed.x, placed.y`.
- `snapPlaced` returns the position that puts the part's first pin on a grid point (so headers of different parts line up); a part with no pins snaps its top-left.
- `rotatePlaced` turns 90 degrees clockwise keeping the bounding box centre fixed.
- `fillRow` returns `count` evenly spaced points from `a` to `b` inclusive.

- [x] Tests: `snapTo(3.0)` is `2.54`; `snapTo(3.9)` is `5.08`. For a 10 by 4 part with a pin at (1, 1) placed at (100, 50): rotation 0 gives (101, 51); 90 gives (103, 51); 180 gives (109, 53); 270 gives (101, 59). Flipped placeholder moves that pin to local x 9. `rotatePlaced` four times returns the original position and rotation. `snapPlaced` puts the first pin's world x and y on multiples of 2.54 for every rotation. `pinWorld` returns `null` for an unknown pin id. `fillRow({u:0,v:0},{u:1,v:0},5)` gives u of 0, 0.25, 0.5, 0.75, 1. `isImageComplete` is false with one pin unplaced and true with all placed; an image with all pins placed changes `partGeometry` size to `widthMm` by `widthMm * aspect`.
- [x] Run, expect failure. Implement. Run, expect pass.

### Task 3: Nets, colors, wire list, validation

**Files:** Create `src/model/nets.ts`, `colors.ts`, `wirelist.ts`, `validate.ts`, and `tests/nets.test.ts`, `colors.test.ts`, `wirelist.test.ts`, `validate.test.ts`.

**Interfaces (produces):**

```ts
pinKey(ref: PinRef): string                       // `${part}:${pin}`
computeNets(project: Project, lib: Library): PinRef[][]   // only nets with 2+ pins
connectionsOf(project: Project, lib: Library, ref: PinRef): PinRef[]
wireAutoType(wire: Wire, project: Project, lib: Library): PinTypeId | null
resolveWireColor(wire: Wire, project: Project, lib: Library, settings: Settings): string
interface WireRow { fromPart: string; fromPin: string; fn: string; toPart: string; toPin: string; color: string }
buildWireList(project: Project, lib: Library, settings: Settings): WireRow[]
wireListMarkdown(rows: WireRow[]): string
validatePart(def: PartDef): string[]
```

Rules:
- Nets join pins by wires and by each placed part's `links`.
- Auto type: a type other than `gpio` beats `gpio`. If both ends are specific and differ, the end on the part whose category is not `Boards` wins; if still tied, end `a`. Both `gpio` gives `gpio`. A missing part or pin gives `null`.
- `resolveWireColor`: `wire.color` if set; else the color of the auto type in `settings.pinTypes`; else `FALLBACK_COLOR`.
- Wire list: one row per wire. The end on a `Boards` part goes in the from columns; otherwise end `a`. `fn` is the auto type's label, or empty. `color` is the palette name when the resolved hex matches a palette entry, otherwise the hex. Part names use `label` when set, else the part name, with `#2`, `#3` appended to repeats of the same part in placement order.
- Markdown columns, in order: `From part | From pin | Function | To part | To pin | Wire color`.
- `validatePart` reports: duplicate pin ids, two pins at the same position, a pin outside the part's bounds, a link naming an unknown pin, `verified` true with no `verifiedOn`.

- [x] Tests: two modules grounded to different linked GND pins of one board are one net; a board `gpio` pin wired to a module `spi_sck` pin resolves to the `spi_sck` color; board `uart_tx` to GPS `uart_rx` resolves to `uart_rx`; a manual color wins; a wire whose pin type was removed from settings resolves to `FALLBACK_COLOR` (Review Focus 2); a wire naming a missing part gives `null` type and the fallback color; wire list puts the board end first even when the wire was drawn module to board; two nRF24 parts are named `nRF24L01+` and `nRF24L01+ #2`; the Markdown has the six headers and one row per wire; `validatePart` returns one message for each listed fault and none for a clean part.
- [x] Run, expect failure. Implement. Run, expect pass.

### Task 4: Library seed

**Files:** Create `scripts/seed-library.mjs`, `scripts/check-library.mjs`, `data/library/*.json`.

- [x] Write `seed-library.mjs` with helpers that lay out header rows at 2.54 mm pitch and write one file per part. It skips any file that already exists unless run with `--force`, so it never overwrites Brian's image placements or checked flags.
- [x] Seed the parts named in the spec's Phase 1 library. Every part: `verified: false`, a `source` line, `face`, `row` on header pins, `links` for pins joined inside the part, `internalUse` and `caps` where known.
- [x] `check-library.mjs` loads every file, runs the same rules as `validatePart`, prints faults and exits non-zero if any. Add `npm run check:library`.
- [x] Run `npm run seed && npm run check:library`, expect a count of parts and no faults.

### Task 5: Store

**Files:** Create `src/store/api.ts`, `src/store/store.ts`, `tests/store.test.ts`.

**Interfaces (produces):** a Zustand hook `useStore` with state `{ library, settings, project, projects, selection, wireColor, view }` and actions:

```ts
load(): Promise<void>
addPart(partId: string, at: Point): string
moveParts(ids: string[], dx: number, dy: number, snap: boolean): void
rotateSelected(): void;  flipSelected(): void;  duplicateSelected(): void;  deleteSelected(): void
addWire(a: PinRef, b: PinRef): string | null
setWireColor(id: string, color: string | undefined): void
setWirePoints(id: string, points: Point[]): void
select(sel: Selection, additive?: boolean): void
undo(): void;  redo(): void;  beginDrag(): void
newProject(name: string): Promise<void>;  openProject(id: string): Promise<void>
renameProject(name: string): void;  deleteProject(id: string): Promise<void>
updateSettings(s: Settings): void
updatePart(def: PartDef): Promise<void>
```

`type Selection = { parts: string[]; wires: string[] }`. `wireColor` is `'auto'` or a hex string and is applied to new wires.

Rules: every project change pushes one undo snapshot (a drag is one snapshot, taken by `beginDrag`). `addWire` returns `null` for the same pin at both ends or a duplicate of an existing wire in either direction. `deleteSelected` also removes wires attached to deleted parts. Project changes autosave after 500 ms.

- [x] Tests (api module mocked): `addWire` same pin returns `null`; duplicate returns `null` (Review Focus 4); deleting a part removes its wires and one `undo` restores both (Review Focus 3); `undo` then `redo` round-trips a move; `addPart` with an unknown part id still adds the placement and `computeNets` does not throw (Review Focus 1).
- [x] Run, expect failure. Implement. Run, expect pass.

### Task 6: Desk and wiring UI

**Files:** Create `src/App.tsx`, `src/styles.css`, `src/ui/Desk.tsx`, `PartView.tsx`, `WireView.tsx`.

- [x] Desk: one SVG whose inner group is scaled from mm to pixels by `view.zoom` and offset by `view.pan`. Dotted 2.54 mm grid. Wheel pans; Ctrl or Cmd wheel and pinch zoom about the cursor; dragging empty desk draws a selection box; Space drag or middle drag pans.
- [x] PartView: placeholder is a rounded rectangle in the part color with name, face label, and pads with names; with a complete image it draws the image and pads as hotspots. An unknown part id draws a dashed "missing part" box. Drag moves the selection, snapping when `settings.snap` differs from Alt held.
- [x] Wiring: pointer down on a pad starts a wire; while dragging, the nearest pad within 2 mm lights up and the wire end snaps to it; release on a pad calls `addWire`, release elsewhere cancels. Hovering a pad shows name and type.
- [x] WireView: smooth curve through `points`, a contrasting outline so black and white both show, thicker hit area. Double-click adds a bend point; drag moves it; double-click a bend removes it.
- [x] Keys: R rotate, F flip, Delete or Backspace delete, Cmd D duplicate, Cmd Z undo, Shift Cmd Z redo, Escape cancels a wire or clears selection.
- [x] Run `npm run dev` and check in the browser: drag, snap, rotate, flip, wire two pins, bend, undo.

### Task 7: Panels, settings, projects

**Files:** Create `src/ui/Toolbar.tsx`, `LibraryPanel.tsx`, `Inspector.tsx`, `WireList.tsx`, `SettingsDialog.tsx`, `ProjectMenu.tsx`.

- [x] Library: grouped by category, search box, "on hand" filter, unverified badge, drag onto the desk.
- [x] Toolbar: project menu, undo, redo, snap toggle, wire color (`Auto` plus the palette), settings.
- [x] Inspector: part notes, source, pin list with what each pin connects to (open pins say "open"), button to open part settings; for a wire, both ends and a color picker with "Auto".
- [x] Wire list: table from `buildWireList` and a "Copy as Markdown" button.
- [x] Settings dialog: edit, add and remove pin types and their colors; saved through `updateSettings`.
- [x] Project menu: new, open, rename, delete with confirmation.
- [x] Browser check: change the SCK color and see wires repaint; reload and see the project restored.

### Task 8: Part settings and image pins

**Files:** Create `src/ui/PartSettingsDialog.tsx`.

- [x] Upload (file picker and drop) posts the image as `<partId>-<face>.<ext>`, reads its natural size for `aspect`, sets `widthMm` to the part's width, and starts with no pins placed.
- [x] Placing: the next unplaced pin is preselected; clicking the image places it and advances; clicking a pin in the list selects it; markers drag to adjust; a marker can be cleared; progress reads "n of m placed".
- [x] Fill row: for a row whose first and last pins are placed and that has pins unplaced between them, a "Fill row" button places them with `fillRow`.
- [x] Size control changes `widthMm`. Face tabs switch between the stated face and the other face. "Remove image" deletes the file and the record.
- [x] "Mark as checked" sets `verified` and `verifiedOn`; "Mark as unchecked" clears them.
- [x] Browser check: upload an image to a part, place all pins, see it on the desk, wire to its pins, reload.

### Task 9: README and final check

- [x] `README.md`: what it is, `npm install`, `npm run dev`, where data lives, how to add a part, the phases.
- [x] Run `npx vitest run`, `npx tsc --noEmit`, `npm run check:library`; all clean. Grep the repo (outside `node_modules`) for the em dash character; none.
