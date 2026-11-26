# Wirebench

A local workbench for laying out electronics builds. Drag parts onto a desk, draw wires between their pins, and get wire colors that match the jumpers in your hand.

Every part knows its pins: what each is called (`IO18`, `CSN`) and what it does (SPI SCK, 3V3, GND). That is what lets one global setting color every wire, and what later phases use to check for conflicts and power draw.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. It listens on your own machine only and needs no internet.

## Using it

- **Add a part:** drag it from the Parts list onto the desk, or double-click it.
- **Wire:** drag from one pin to another. Or click a pin, then click the other. The wire end snaps to the nearest pin.
- **Wire color:** `Auto` colors a wire by the pin type it connects. Pick a swatch in the toolbar to draw the next wires in a fixed color, or select a wire and change it in the inspector.
- **Pin colors:** the "Pin colors" button sets one color per pin type for every part in the library.
- **Snap:** parts snap so their first pin lands on a 2.54 mm grid, which lines headers up pin to pin. Toggle it in the toolbar, or hold Alt while dragging to do the opposite.
- **Rotate and flip:** `R` rotates, `F` flips a part to its other face (pins mirror correctly).
- **Grid wires:** wires run straight across and up and down, with square corners, and fan out into separate lanes so they do not sit on top of each other. Turn "Grid wires" off in the toolbar for loose, curved jumpers.
- **Bends:** double-click a wire to add a bend and route it yourself, drag it, double-click it to remove it. Bends snap to the half grid (1.27 mm) while Snap is on.
- **Wire list:** the table at the bottom right has every connection. "Copy as Markdown" puts it on the clipboard for a vault note.
- **Undo and redo:** Cmd Z and Shift Cmd Z. Projects save by themselves.

## The ESP32 chip on a board

The CYD, the ESP32 DevKit V1 and the ESP32-S3 DevKitC-1 are drawn with their ESP32 module on them, every pad wireable, so you can wire straight to the chip. Each module pad is joined inside the part to the header or connector pin that carries the same signal, so the app knows `IO22` on the CYD's P3, on CN1 and on the module are one net. Hover a pad to see what the board already uses it for. The bare modules (ESP32-WROOM-32 and ESP32-S3-WROOM-1) are in the library too.

To refresh one part from the seed without touching the rest: `node scripts/seed-library.mjs --only=cyd-2432s028r`.

## Power and ground rails

The 5V rail, 3V3 rail and GND rail are strips of pins that are all joined together, for fanning one supply out to several parts. Drop one on the desk, select it, and use the plus and minus buttons under "Pins on this rail" to add or remove pins (2 to 40). Each rail on the desk keeps its own count. A pin that still has a wire cannot be removed: take the wire off first. Press `R` to stand a rail upright. With grid wires on, a wire leaves a rail on whichever side its other end is.

## Part images

Every part starts as a plain placeholder with its pins in their real positions. To use a picture instead:

1. Open the part's settings (hover it in the Parts list and press Edit, or select it on the desk and press "Part settings and image").
2. Drop in a PNG, JPG or WebP, shot straight down and tightly cropped.
3. Click the image where each pin is. The next pin to place is always preselected. Once the first and last pin of a header are placed, "Fill row" spaces the rest.

The image goes live on the desk once every pin is placed. Images are kept in `data/library/images/`, which git ignores.

## Checked or unverified

Every part ships marked "unverified", with a line saying where its pin map came from. Many came from memory of common pinouts. Compare a part with the real one in your hand, then press "Mark as checked" in its settings. Only that button sets the flag.

## Where things live

| Path | What |
|---|---|
| `data/library/*.json` | one file per part: size, pins, notes |
| `data/library/images/` | images you uploaded (not in git) |
| `data/projects/*.json` | one file per project (not in git) |
| `data/settings.json` | pin type colors, snap and wire style (not in git; defaults are used until you change one) |
| `scripts/seed-library.mjs` | the starter library; `npm run seed` adds missing parts and never overwrites existing files |
| `docs/superpowers/specs/` | the design |

## Adding a part

Add an entry to `scripts/seed-library.mjs` and run `npm run seed`, or write a JSON file in `data/library/` by hand using an existing one as a pattern. Then run `npm run check:library`. A part editor inside the app is planned for Phase 2.

## Checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run check:library
```

## Phases

1. **Done:** desk, library, snapping, pin-accurate wiring, global pin colors, wire list, part images.
2. **Next:** checks for wrong or conflicting pin use (a GPIO used twice, input-only pins, strapping pins, pins the board already uses), an in-app part editor, `BoardConfig.h` export, starter layouts for ESP32-DIV, HaleHound and nRFBox.
3. **Later:** power budget per rail, resistor helpers, voltage level warnings.

Not in the library yet: LilyGO T-Display-S3 and Heltec WiFi LoRa 32 V4 (no reliable header order was found in the notes), and the M5Stack devices (they connect by Grove cable, not loose jumpers).
