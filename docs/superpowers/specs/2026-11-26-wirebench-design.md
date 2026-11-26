# Wirebench: design

Date: 2026-11-26. Status: reviewed once by a fresh reader, awaiting Brian's approval. "Wirebench" is a working name.

## Intent

Brian builds ESP32 radio gadgets (ESP32-DIV, HaleHound, nRFBox and his own forks of them) from dev boards and breakout modules joined by jumper wires. Today the wiring lives in Markdown tables and in his head. He wants a visual workbench: drag drawings of the parts he owns onto a desk, draw wires between their pins, and see wire colors that match the physical jumpers in his hand.

The app must know what a pin is. That is what lets it color wires by signal, catch a double-booked GPIO, and warn when three nRF24 modules hang off a CYD's 3.3 V rail.

Success: before soldering a build like ESP32-DIV on a CYD, Brian lays it out in Wirebench, wires it with the same colors he will use, and copies a wire table into his vault that matches what is on screen.

## Goals

1. A parts library seeded from his hardware inventory (`08 Wiki/Hardware Inventory.md` in the vault) and the parts his past projects use.
2. Drag parts onto a desk; parts snap to a grid; snap can be switched off.
3. Draw wires that snap to real, named pins.
4. Wire colors: a global setting maps each pin type (3V3, GND, SCK and so on) to a color, and applies to every part in the library. Any single wire can be overridden.
5. Checks for wrong or conflicting pin use (Phase 2).
6. Power budget, resistor helpers and other electrical logic (Phase 3).

## Non-goals

- Not schematic capture or PCB layout. KiCad does that.
- No circuit simulation.
- No full auto-routing of wires. Grid wires (added after Phase 1, see "Grid wires") pick a tidy default path, but they do not search for routes around parts; awkward cases are fixed by hand with bends.
- No cloud, accounts or sharing. It runs on his Mac and works offline.
- No breadboard internal-connection modelling in Phase 1.

## Anti-goals

These would make it a failure even if it runs:

- A pin map that looks authoritative but is wrong. Every part carries a `verified` flag and a `source` line. See "Verified parts" below for what the flag certifies and who may set it.
- A wire that looks connected but is not. A wire end is always attached to a pin; there are no free-floating ends.
- Per-part color setup. Colors come from pin types, set once.

## Constraints

- Local only: macOS, a current desktop browser, Node 26 is installed.
- Library, projects and settings are plain JSON files in the repo, so they can be read, diffed, committed, and edited by hand or by Claude.
- Vendor product photos are copyrighted; the app ships with placeholder shapes, and images Brian adds stay local.
- Brian's writing rule: no em dashes in code comments, docs or exports.

## Approaches

### How parts look

1. **Detailed drawn parts.** Each part drawn to resemble the real board: shield cans, antennas, connectors, silkscreen. Pins exact, but a lot of art effort for something a real photo does better.
2. **Photos.** Looks like the real bench, but Brian must supply each photo and every pin must be placed by hand.
3. **Both.** Drawn first; a part editor later lets him attach his own image and click to place pins.

Brian's decision: no detailed art. Every part starts as a **generic placeholder shape** (a plain board outline at true size) with its pins already mapped in their true positions and order. From Phase 1, each part has a settings screen where he uploads an image he found or shot, then clicks on the image to say where each already-mapped pin is (see "Placeholders and part images"). Creating whole new parts in the app stays in Phase 2.

A trial of AI-generated realistic images (8 parts, kept in `art/realistic-trial/`) was rejected: the views and colors were right, but pin counts, pin positions and silkscreen text were wrong on most parts. AI images are not used.

### How the desk is built (Claude's call; Brian handed over the how)

1. **Own SVG canvas (picked).** Parts and wires are SVG elements drawn by our code. Full control over wire look, bend points, pin hit-testing and snapping, which are the heart of the app. More code than option 2.
2. **A flowchart library (React Flow).** Nodes, handles, edges, pan and zoom for free. But its edges are built for flowcharts; curved jumper wires with draggable bends, many wires per pin and pins packed 2.54 mm apart all fight the library.
3. **Extend an existing tool (Fritzing, Cirkit Designer).** Closest prior art. Neither offers global pin-type colors, ESP32-specific checks or a power budget, and custom Fritzing parts are painful to author.

### Where data lives (Claude's call)

Plain JSON files in the repo, read and written through a small local server that is part of the app's run command. Picked over browser storage (opaque, lost when browser data is cleared, cannot be edited or committed) and over a packaged desktop app (more machinery than a single-user local tool needs; can be added later).

## The how, as decided

### Stack (Claude's call)

- TypeScript, React, Vite. SVG for the desk.
- A small state store with undo and redo (Zustand suggested).
- Vitest for the logic that has no UI: nets, wire color resolution, snapping maths, checks, power sums.
- One command starts everything (`npm run dev`), serving the app and a small file API on localhost only.
- Its own git repo, named `wirebench`.

### Screen

```
┌──────────────────────────────────────────────────────────────────┐
│ Project ▾   Undo Redo   Snap [on]   Wire color [Auto ▾]   ⚙      │
├──────────┬─────────────────────────────────────────┬─────────────┤
│ LIBRARY  │  DESK (pan, zoom, dotted grid)          │ INSPECTOR   │
│ search   │                                         │ selection   │
│ ☑ on hand│   ┌─────────┐          ┌───────┐        │ details     │
│ Boards   │   │ CYD 2.8 ●━━purple━━● SCK   │        ├─────────────┤
│ Radios   │   │         ●━━red━━━━━● VCC   │        │ WIRE LIST   │
│ Displays │   │         ●━━black━━━● GND   │        │ copy as     │
│ Sensors  │   └─────────┘          └───────┘        │ Markdown    │
│ Passives │                                         │             │
└──────────┴─────────────────────────────────────────┴─────────────┘
```

### Units and grid

Everything is stored in millimetres. The grid is 2.54 mm (0.1 inch), the pitch of the headers themselves, so snapped parts line up pin to pin. Part positions snap to the grid when snap is on. Holding Alt while dragging inverts the snap setting for that drag.

### Which side you see (Claude's call)

Each part is drawn from one stated face, recorded in the part file as `face`: `top` (component side) or `bottom`. The default is the face standard pinout diagrams use, which is the component side. The CYD is the exception: it is drawn from the back, because every connector and solder tap is there. The face is printed on the part ("top view", "back view") so there is never doubt about which way round a header reads.

A part on the desk can be flipped to see its other face. Flipping mirrors the pin positions left to right, keeps labels readable, and draws the mirrored placeholder for that face. This matters for parts like the plain nRF24L01+, whose 2x4 header has no per-pin silkscreen: viewed from the pin side it is the mirror image, and a wrong assumption swaps VCC and GND.

### Verified parts (Claude's call)

`verified: true` certifies the whole pin map: names, types, GPIO numbers, and the physical order and position of the pins as seen from the stated face. Only Brian sets it, by checking the drawing against the physical part and pressing "Mark as checked" in part settings, which writes the flag and the date to the part file. The builder never sets it.

Every part therefore ships unverified, with a `source` line saying where its pin map came from (Brian's wiring note, a manufacturer drawing, or "common pinout, from memory"). Brian's notes give pin names and GPIO assignments but not physical positions, so they cannot verify a layout by themselves. The unverified badge is small and unobtrusive, since at first it is on everything; it clears part by part as he uses each one.

### Placeholders and part images

**Placeholder.** With no image, a part is a plain rounded rectangle at its true size in a board color, showing its name, its face ("top view", "back view") and its pins as labelled pads at their true positions and in their true order. No decorative art.

**Part settings.** Every part in the library has a settings screen, opened from the library or from a selected part on the desk. It holds the part's image, its pin placement, its source line and notes, and the "Mark as checked" button.

**Uploading an image.** "Upload image" takes a PNG, JPG or WebP (file picker or drag and drop). The app copies it to `data/library/images/` and records it in the part file. "Remove image" returns the part to its placeholder.

**Placing pins on the image.** The settings screen shows the image large, beside the list of the part's existing pins. Brian clicks on the image where a pin is and assigns that spot to one of the mapped pins. The pin list is fixed by the part's pin map; this step only says where each of those pins sits on this image. It never adds, removes or renames pins.

Claude's calls on how placing works, to keep a 30-pin board from being tedious:

- The next unplaced pin is preselected in the list, so the usual flow is click, click, click down a header in order. Clicking a different pin in the list selects that one instead, and a pin picker is there for out-of-order work.
- **Fill a row:** after placing the first and last pin of a header row, the app offers to place the pins between them at even spacing. He can accept and then nudge any that are off.
- A placed marker can be dragged to adjust it, or cleared. The list shows progress ("12 of 30 placed").
- The image is used on the desk only once every pin is placed. Until then the part keeps its placeholder, so a half-finished image never leaves a pin with nowhere to snap.
- **Size on the desk:** the image is scaled to the part's true width in mm, so it sits at the right size next to other parts. A size control in part settings corrects a loosely cropped image.

On the desk, a part with a finished image shows the image with its pins as hotspots at the clicked spots; wires snap to them exactly as they do on a placeholder. Pin names appear on hover.

**Face.** The image must show the part's stated face (top view, or back view for the CYD); the settings screen says which. A flipped part falls back to the mirrored placeholder unless a second image is added for the other face.

**Good source images:** shot straight down, tightly cropped, evenly lit; a transparent or plain background looks best. Because every pin is placed by hand, a slightly tilted image still works.

**Copyright:** images found online are fine for private use on his own Mac but are usually the vendor's. `data/library/images/` is left out of git by default, so they are not published if the repo ever is.

Uploading an image does not mark a part verified. Placing pins on a real photo is, however, a natural moment to compare with the physical part and press "Mark as checked".

### Pin types

A pin has a **name** (what the silkscreen says: `IO18`, `VCC`, `CSN`) and a **type** (what it does). Types are a global list, each with a default color and label, editable in Settings and saved to `data/settings.json`:

| Type | Default color |
|---|---|
| 3V3 | red |
| 5V / VIN | orange |
| GND | black |
| SPI SCK | purple |
| SPI MOSI | blue |
| SPI MISO | green |
| SPI CS | yellow |
| I2C SDA | blue |
| I2C SCL | yellow |
| UART TX | green |
| UART RX | white |
| Interrupt / data-ready (IRQ, GDO) | brown |
| Enable / reset (CE, EN, RST) | gray |
| Analog | brown |
| Plain GPIO | gray |
| Antenna / no-connect / other | gray |

These defaults are Claude's proposal apart from red, black and purple, which Brian named. Brian can change any of them and add types. Changing a type's color repaints every wire that takes its color from that type, in every project.

The color picker offers the ten standard jumper-ribbon colors (black, brown, red, orange, yellow, green, blue, purple, gray, white) plus a custom color, so the screen can match the wires physically on hand.

### Wire color rule

1. A wire with a manual color uses it.
2. Otherwise the wire takes the color of the more specific end. Any type beats Plain GPIO, because a board pin is just `IO18` while the module pin is `SCK`.
3. If both ends are specific and differ (TX to RX, for example), the end on the non-board part wins; if still tied, the end where the wire was started.

The toolbar's wire color control is `Auto` (use the rule) or a fixed color applied to wires drawn next.

### Grid wires (added 2026-11-26 at Brian's request)

Wires snap to the grid so a layout reads cleanly. With "Grid wires" on (the default):

- Every run is horizontal or vertical, with slightly rounded corners.
- A wire leaves its pin straight out from the part: a column of pins exits sideways through the nearer edge, a row exits up or down. The inner row of a two-row header exits the opposite way from the outer row.
- Wires leaving the same side of a part fan out into lanes 1.27 mm apart, ordered so they nest instead of crossing, and two wires share a lane only when their runs are well clear of each other.
- A wire never doubles back over its own pin; where one turn is not enough it steps half a pitch sideways so the long run passes between pin columns.
- Bend points snap to the half grid (1.27 mm) while Snap is on, and Alt inverts that. A wire with bends is joined through them with right-angle elbows and takes no part in the lanes.

"Grid wires" off restores the loose curved jumpers. The choice is saved in `data/settings.json` as `wireStyle`. The half grid, not the full 2.54 mm grid, is Claude's call: it lets a wire pass between two header pins.

### The ESP32 module on a board (added 2026-11-26 at Brian's request)

Boards built around a castellated ESP32 module show that module on the placeholder: a labelled outline with every pad as a pin at 1.27 mm pitch. This covers the CYD and the ESP32 DevKit V1 (ESP32-WROOM-32) and the ESP32-S3 DevKitC-1 (ESP32-S3-WROOM-1). The two bare modules are also library parts.

- Pad order for the WROOM-32, and what the CYD uses each pad for, come from Brian's vault note "CYD WROOM ESP32 Chip Pinout". The S3 module's order is from memory. Where a module sits on its board is approximate.
- Each module pad is linked inside the part to every other pin with the same GPIO number, plus grounds, 3V3 and reset. The CYD's tap pins stay, as the easier solder points, and are linked to their module pads.
- Pads the board already uses carry `internalUse`; the module's flash pins are marked "do not use".
- Pad and label sizes are worked out per pin from its nearest neighbour, so a fine-pitch module does not shrink the labels of the 2.54 mm headers beside it. A header's labels flip to the outside of the board together when the module is in their way.
- With grid wires, a module pad leaves outward from the module's outline.
- Parts carry optional `outlines` (boxes with a label) for this.

The ESP32-C3 Super Mini and XIAO ESP32-C6 use bare chips whose pads are under the package, so there is nothing to wire to and they are unchanged.

### Rails (added 2026-11-26 at Brian's request)

Three library parts, "5V rail", "3V3 rail" and "GND rail", let one supply fan out to several parts. A rail is the one kind of part whose pins are not fixed in its library file:

- The library file marks it with `rail: { type, label }` and has no pins.
- Each rail on the desk stores its own pin count (`pins` on the placed part, 2 to 40, default 4), changed with plus and minus buttons in the inspector. Each change is one undo step.
- Its pins are generated at 2.54 mm pitch with ids `p1`, `p2` and so on, so growing a rail never disturbs existing wires. All of a rail's pins are linked as one net.
- A pin that still has a wire cannot be removed; the minus button is disabled and says why.
- Rails show their name once, not a label per pin, and carry no "unverified" badge, since they are a drawing aid, not a physical part.
- With grid wires, a rail pin has no fixed side: the wire leaves toward its other end.

Every place that reads a part's pins goes through one function that returns the library definition, or the generated one for a rail.

### Part definition (one JSON file per part, `data/library/<id>.json`)

- Identity: `id`, `name`, `category`, `tags`, `onHand` (in the inventory) and `verified` plus `source` for the pin map.
- Size in mm and board color, which is all the placeholder needs.
- `pins`: each has `id`, `name`, `type`, position in mm, and optional facts used by later phases: GPIO number, capabilities (input-only, strapping, ADC1 or ADC2), logic voltage, and `internalUse` for pins the board already uses (the CYD's IO34 light sensor, IO4/16/17 RGB LED, IO5/18/19/23 SD slot).
- Optional `power`: current this part draws per rail (typical and peak mA), and current its regulator pins can supply.
- `links`: groups of pins that are joined inside the part, for example all of a board's GND pins, the CYD's IO22 on both P3 and CN1, a buck module's input and output ground, or the paired legs of a push button.
- `face` and `verified`, as described above.
- Optional `notes` shown in the inspector (for example, the PN532 DIP switch setting for SPI mode).
- Optional `image` per face: the file name, its size on the desk, and where each pin was placed on it.

Phase 1 reads identity, size, image and pin name, type and position. The other fields are filled in wherever known so Phases 2 and 3 need no data migration.

Boards expose the pins people actually wire to. For the CYD that means the P1, P3 and CN1 connectors and also the solder tap points Brian's builds use (RGB LED pads, SD slot pins, speaker pin), since HaleHound and ESP32-DIV wire to those.

### Project file (`data/projects/<id>.json`)

- Parts on the desk: instance id, part id, position, rotation in 90 degree steps, flipped or not, optional label.
- Wires: id, two ends (each an instance and a pin), optional manual color, optional bend points.

Connected pins form a net. Nets are computed from the wires plus each part's internal `links`, never stored. So a module grounded to CN1 and another grounded to P1 are on one ground net.

### Phase 1 behaviour

- **Library:** grouped by category, searchable, with an "on hand" filter and the unverified badge. Drag a part onto the desk.
- **Desk:** pan, zoom, select, multi-select, move, rotate, duplicate, delete. Grid snap with a toolbar toggle.
- **Wiring:** hovering a pin highlights it and shows its name and type. Drag from one pin to another; while dragging, the nearest pin within reach lights up and the wire end snaps to it. Releasing away from a pin cancels the wire. Many wires may share a pin. Wires follow the grid (see "Grid wires") or draw as smooth curves, and can be given bend points. Wires follow their parts when parts move or rotate.
- **Desk, continued:** flip a part to its other face.
- **Inspector:** for a part, its notes, a button to open its part settings, and a pin list showing what each pin connects to (unconnected pins are listed as open); for a wire, its two ends and color.
- **Wire list (Claude's call):** one row per wire exactly as drawn, with a "copy as Markdown" button. Columns: from part, from pin, function, to part, to pin, wire color. When one end is on a board it goes in the "from" columns, so board-to-module rows read like Brian's existing wiring briefs. "Function" is the label of the pin type that gave the wire its color. A wire from a buck module to a radio, or a capacitor across VCC and GND, is listed as it is, not traced back to a board pin. Unconnected pins are not listed here. A second table that resolves each module pin through its net back to a board GPIO is the Phase 2 `BoardConfig.h` export.
- **Part settings:** upload or remove a part's image and place its pins on it, as described under "Placeholders and part images".
- **Settings:** the pin type color table.
- **Projects:** new, open, rename, delete (with confirmation), autosave. Undo and redo.

### Phase 1 library

About 25 parts, each a placeholder with a full pin map, picked for the builds Brian named. Pin names and GPIO numbers come from his wiring notes where they exist; physical layouts come from standard pinout drawings. All ship unverified, as described under "Verified parts".

- **Boards:** CYD 2.8 inch (ESP32-2432S028R, 2 USB), ESP32 DevKit V1 30-pin, ESP32-S3 DevKitC-1 (N16R8), ESP32-C3 Super Mini, XIAO ESP32-C6, LilyGO T-Display-S3, Heltec WiFi LoRa 32 V4, Raspberry Pi Zero W.
- **Radios:** nRF24L01+, nRF24L01+ PA/LNA, Ebyte E01-2G4M27SX, CC1101 module, Ebyte E07-433M20S, PN532 V3, GPS (ATGM336H class).
- **Displays and input:** SSD1306 0.96 inch OLED, ILI9341 SPI TFT.
- **Sensors:** BME280, ADS1115.
- **Power and passives:** 3.3 V buck module, resistor, capacitor, LED, addressable RGB LED (PL9823), push button, IR receiver, microSD breakout.

M5Stack devices (CoreS3, StickS3, Tab5 and the Grove units) connect by Grove cable or M-Bus, not loose jumpers, and come in a later batch.

### Phase 2: checks and authoring

- A checks panel listing warnings; each warning highlights the pins and wires involved. Rules:
  - one GPIO wired to two unrelated things
  - output or chip-select on an input-only pin (ESP32 IO34 to IO39)
  - strapping pins and flash pins
  - a pin the board already uses internally
  - TX wired to TX, MISO to MOSI, power to ground
  - SPI devices sharing a chip-select; I2C address clashes
  - 5 V signal into a 3.3 V pin
  - a module with power but no ground, or the reverse
- Pin labels always visible (toggle), not only on hover.
- Part editor: create a new part in the app, or add, remove and rename pins on an existing one. (Uploading an image and placing existing pins on it is already in Phase 1.)
- Exports: `#define` block for a `BoardConfig.h`, and PNG or SVG of the desk.
- Starter layouts for ESP32-DIV on CYD, HaleHound and nRFBox, built from Brian's wiring notes.

### Phase 3: electrical logic

- Power budget per rail: sum typical and peak draw of everything on a supply's net (which, through `links`, covers a rail exposed on several pins) against what that supply can deliver; a meter in the inspector and a warning when over. The motivating case is three nRF24 modules on a CYD's 3.3 V pin.
- Hints attached to parts: "add 10 uF across VCC and GND" on PA/LNA radios; "needs its own 3.3 V supply" on the E01-2G4M27SX.
- Resistor helpers: LED series resistor, I2C pull-ups, voltage divider for 5 V to 3.3 V.
- Other ideas to weigh then: ADC2 pins unusable while Wi-Fi is on, bill of materials checked against the inventory.

Phases 2 and 3 each get their own short design pass before they are built; this document fixes their scope and makes sure Phase 1's data can carry them.

## Left to the builder

- File and component structure, naming, the exact shape of the JSON beyond the fields listed.
- Curve maths for wires, pin snap radius, zoom limits, keyboard shortcuts.
- Visual styling of the app chrome (a calm, dark workbench look is suggested so wire colors stand out; white and black wires must both stay visible against it).
- How undo history is stored.
- Whether the file API is a Vite plugin or a separate small server, so long as one command starts it and it listens on localhost only.

## Testing

- Unit tests for pin placement on images: fill-a-row spacing, and that an image is only used once every pin is placed.
- Unit tests for the pure logic: wire color rule, net computation including internal links, grid snapping, pin positions under rotation and flip, wire list generation.
- A scripted check that every library file parses and that no two pins of a part share an id or a position.
- Browser check of the Phase 1 flows before calling it done: drag a part, snap, wire two pins, change a pin type color and see wires repaint, upload an image to a part, place its pins and wire to them, reload and see the project restored.
