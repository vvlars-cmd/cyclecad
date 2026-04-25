# sim.pentamachine.com — clone reference notes

Captured live via Chrome MCP on 2026-04-25. Use this as the single reference for `app/pentacad-sim.html` v0.4.

## Top-level layout (1710×985 reference window)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ TitleBar  height=64  bg=#333  white text   PENTA  "Penta Simulator vX.Y"  │
│           right side: SIMULATION ZIP / GCODE / MODEL / ⤴ Share / ? Help   │
├──────────┬────────────────────────────────────────────────────────────────┤
│          │                                                                │
│  GCode   │             Three.js viewport (full width canvas)              │
│  Pane    │                                                                │
│  320px   │                  floating widgets (z=10):                      │
│          │                  • ViewCube  (top-right)                       │
│          │                  • locate icon + camera icon (FAB)             │
│          │                  • DRO panel  (rgba(100,100,100,0.75))         │
│          │                  • Show Options button                         │
│          │                  • CHANGE MACHINE  bottom-right green pill     │
│  ⌜sim.ngc⌟ ⤓ │                                                            │
└──────────┴────────────────────────────────────────────────────────────────┘
```

Divider between GCode pane and viewport: 5px wide, class `Divider-divider css-xdzv46`.

## TitleBar (height 64)

- `header.MuiAppBar-root.TitleBar-appBar` with `bg=rgb(51,51,51)` (`#333`), white text
- Logo: PENTA SVG link, 41×54 at (24, 5)
- Title: `<p class="TitleBar-title"><a>Penta Simulator vX.Y</a></p>` — 174×19 at (81, 23), white, font-size 16, weight 400
- Right-side buttons (small text MUI buttons, padding 4px 5px, 13px/500/uppercase, letter-spacing 0.37px):
  - `Simulation Zip` (icon: OpenInBrowserIcon)
  - `GCode` (icon: OpenInBrowserIcon)
  - `Model` (icon: OpenInBrowserIcon)
  - Share icon-only
  - Help icon-only (?)
- Toolbar root: `.MuiToolbar-root.MuiToolbar-gutters.MuiToolbar-regular`

## GCode pane (321×985 starting at 0,0; toolbar 64px overlap with title bar)

- Container: `.MuiDrawer-paper` (white bg), then:
  - `.GCodePane-toolbar` 320×64 — empty/spacer
  - `header.MuiAppBar-positionStatic.GCodePane-appBar` — 320×48 — bg `rgb(245,245,245)` (#F5F5F5)
    - `.MuiTabs-root` → `.MuiTabs-flexContainer`:
      - Tab 1: `MuiTab-root.Mui-selected` — width 90, label "GCODE"
      - Tab 2: `MuiTab-root` — width 106, label "SUMMARY"
  - `.GCodePane-tab` 320×873 starting at (0, 112) — content area
    - Editor: `.Editor-container.ace_editor.ace_hidpi.ace-chrome` — Ace editor, 320×834 at (0, 112)
      - `textarea.ace_text-input`
      - `.ace_gutter` 48 wide — line numbers + warning markers
      - `.ace_scroller` — code body
      - vertical + horizontal scrollbars
  - `.Editor-gcodeTitleBar` 325×33 at (0, 946) — bottom bar with filename input + download icon
    - `input.MuiInputBase-input.Mui-disabled` — value `sim.ngc`, font Roboto 16

### Tab styling
- Active tab: green underline indicator (likely `var(--pt-green)` = `#03B188`)
- Inactive tab: black/grey
- Tab text: uppercase, font weight 500-ish

### Editor (Ace, `ace-chrome` theme)
- Light bg `#FFFFFF`
- Line numbers grey, monospace
- Gutter markers: ⚠ (warning, amber), ℹ (info, blue) on specific lines
- Syntax highlight (typical ace-chrome):
  - G/M codes: dark blue / purple
  - Numbers: green/red
  - Comments: grey italic

## Viewport overlays

### ViewCube cluster (top right corner)
- `gltf/viewCube.glb` — they load a real 3D GLB for the cube (so faces have real text labels Front/Back/Top/Bottom/Left/Right baked into the model)
- Tiny 3D viewport in top-right
- Below it is a separate `.CameraButtons-cameraButtons` wrapper (30×65 @ 1660,84):
  - 30×30 FAB `MuiFab-circular MuiFab-sizeLarge MuiFab-default` with bg `rgb(224,224,224)` — locate-icon (centers camera)
  - 30×30 FAB below it, same styling (`CameraButtons-marginTop`) — screenshot/camera icon
- FAB shadow: `0 3px 5px -1px rgba(0,0,0,0.2), 0 6px 10px 0 rgba(0,0,0,0.14), 0 1px 18px 0 rgba(0,0,0,0.12)` (MUI elevation)

### DRO panel
- `.DROPane-droPane` 106×120 at (1584, 160) — wrapper with z-index 10, position absolute
- `.DRO-dro` 106×110 at (1584, 170) — actual visible card
  - bg `rgba(100, 100, 100, 0.75)`
  - color `#FFFFFF`
  - borderRadius `10px`
  - padding `10px`
- `.DRO-pre` 86×90 — `<pre>` with 6 rows: `X:`, `Y:`, `Z:`, `A:`, `B:`, `T:` (monospace, 4-decimal precision for X-B, integer for T)

### Show Options button
- `.OtherOptionsPane-extendedButton` — 130×30 at (1560, 295)
- MUI `MuiButton-contained MuiButton-containedInherit` with bg `rgb(224, 224, 224)` (#E0E0E0)
- borderRadius `4px` (default MUI)
- font-size 14 / weight 500 / letter-spacing 0.4 / text-transform NONE
- Wrapper above is `321×32 @ (1369, 295)` — alignment band

### CHANGE MACHINE pill
- `MuiButton-containedPrimary` — 166×37 at (1536, 941) — bottom-right
- bg `rgb(3, 177, 136)` (#03B188 — Penta green)
- white text
- borderRadius `4px` (NOT a true pill — it's a 4px-radius rectangle)
- font-size 14 / weight 500 / text-transform uppercase (so "Change Machine" → "CHANGE MACHINE")
- MUI elevation shadow

## Color tokens (definitive — verified on live site)

```
Penta green (primary)     #03B188      DRO highlight, CHANGE MACHINE bg, active-tab indicator
Title bar dark            #333333      AppBar bg
Tab header surface        #F5F5F5      GCodePane header bg
Show-options grey         #E0E0E0      MuiButton-containedInherit bg
DRO overlay translucent   rgba(100,100,100,0.75)
DRO border-radius         10px
Other border-radius       4px (MUI default)
```

## Typography

- App body: `sans-serif` 16px / 400 (MUI default — Roboto on systems where it loads)
- Filename input: `Roboto, Helvetica, Arial, sans-serif` 16px
- Editor: monospace via Ace (Source Code Pro / Menlo / Monaco fallback)
- Toolbar buttons: 13px / 500 / uppercase / letter-spacing 0.37px (MuiButton-textSizeSmall override)

## Asset URLs

- `gltf/viewCube.glb` — relative to deployed root, custom view cube model
- One blob URL — likely a runtime-generated GLB (toolpath geometry?)
- Bundle: `static/js/main.<hash>.js` + `static/css/main.<hash>.css` + lazy chunk `159.<hash>.chunk.js`

## React component class-name conventions (MUI + custom)

Penta uses BEM-style two-part class names for their own components:
- `App-container`, `App-shiftDown`, `App-landscape`, `App-showTitleBar`
- `TitleBar-appBar`, `TitleBar-title`
- `GCodePane-toolbar`, `GCodePane-appBar`, `GCodePane-tab`
- `Editor-container`, `Editor-gcodeTitleBar`
- `Divider-divider`
- `DROPane-droPane`, `DRO-dro`, `DRO-pre`
- `CameraButtons-cameraButtons`, `CameraButtons-button`, `CameraButtons-marginTop`
- `OtherOptionsPane-extendedButton`

## Behaviors observed (more to capture)

- Default GCODE tab loaded with a sample program (28 lines, `sim.ngc`)
- GCODE tab highlighted with green underline; SUMMARY inactive
- Lines 8 + 26 have warning markers (⚠ amber); lines 2 + 10 have info markers (ℹ blue)
- DRO shows X=0, Y=1.5, Z=0, A=0, B=0, T=0 by default — Y of 1.5 suggests model is parked at safe height after parsing
- Show Options button is greyed/disabled until something is loaded
- Loading indicator: centered text "Loading… NN%" while machine GLB downloads

## Resolved interactions

### SUMMARY tab (sibling to GCODE in left pane)
Replaces editor with a vertical scrollable list of items, each an icon + text:
- ⚠ Top warning summary (yellow): "Found N codes on N lines that aren't implemented in the simulator. A real Penta machine's behavior may differ from what is shown."
- ⚠ Per-unimplemented-code line: "M0's intended usage: Pause program."
- ℹ "27 lines"
- ℹ "Approximately 39 seconds to run."
- ℹ "Encountered G20 on line 2. Setting units to inches."
- ℹ "Using tool 4"
- ℹ Tool fields (per active tool):
  - "Tool 4 Z offset" — text input, value `-3.0000`
  - "Tool 4 Diameter" — text input, value `0.1250`
  - "Tool 4 Holder" — radio: Short / Long (Long default)

### Show Options → Back Plot panel
- Button toggles label "Show Options" ↔ "Hide Options"
- When open, button bg switches from `#E0E0E0` to `#F5F5F5` and gets MUI elevation shadow
- Panel `.OtherOptionsPane-expanded`: 353×519 at (1337, 333)
  - bg `rgb(243, 243, 243)` (#F3F3F3)
  - borderRadius `8px`
  - border `1px solid rgba(0,0,0,0.25)`
  - padding `16px`
  - Contents (top to bottom):
    - Header: "Back Plot" (right-aligned)
    - ☑ Show between lines (default checked)
    - "From" text input (default 1)
    - "To" text input (default = total line count, e.g. 28)
    - Button "SET CURRENT TOOL PATH"
    - Button "SET WHOLE FILE"
    - ☑ Automatically update lines (default checked)
    - ☐ Isolate Playback Slider
    - ☐ Show time window
    - "Seconds" text input (default 10, disabled until previous toggle on)
    - ☐ Show past only

### CHANGE MACHINE menu
- 128×181 dropdown opens UPWARD from the button at bottom-right
- bg white, MUI elevation8 shadow, 4px radius
- Items (in order, currently selected highlighted with grey bg):
  - Solo
  - V1
  - V1 Kickstarter
  - V2-10
  - V2-50

### Playback overlay (`.ControlsOverlay-overlay`)
- Appears at viewport bottom-center when a program is loaded
- 670×80 centered horizontally
- bg `rgba(100, 100, 100, 0.75)`, color white, borderRadius `5px`
- Two rows:
  - Row 1 — left (34×48): toggle GCode pane icon button (📋)
    center (369×40): ⏮ ◀ ▶ ⏹ ▶ ⏭   ⏱ "1.00" speed slider
    right: speed slider track + thumb
  - Row 2: timestamp `00:00:00` (left) + timeline scrubber (full width)

### Help button → modal dialog
- Modal with grey backdrop covering full viewport
- White card centered, contains a YouTube embed iframe (tutorial video)
- Click outside or press Escape to close

### Locate icon (FAB top-right, first one)
- Centers camera on machine

### Camera/screenshot icon (FAB top-right, second one)
- Captures viewport as PNG download

## Reference layout map (final)

```
At 1710×985 reference:
- Title bar: 0,0 to 1710,64 (#333)
- GCode pane: 0,0 to 320,985 (white)
  - Toolbar spacer: 0,0 to 320,64
  - Tab header: 0,64 to 320,112 (#F5F5F5)
  - Editor body: 0,112 to 320,946
  - Filename row: 0,946 to 325,985 (white, top border)
- Divider: 318,64 to 323,985 (5px wide, #D8D8D8)
- Viewport canvas: 0,64 to 1710,985 (full width, behind gcode pane on left)
- Floating overlays (z=10):
  - ViewCube canvas: ~64×64 at (1370, 80)
  - CameraButtons col: 30×65 at (1660, 84) — 2 FABs vertical
  - DRO: 106×120 at (1584, 160)
  - Show Options btn: 130×30 at (1560, 295)
  - CHANGE MACHINE: 166×37 at (1536, 941) — bottom-right
  - Playback overlay: 670×80 at (520, 855) — center-bottom
```
