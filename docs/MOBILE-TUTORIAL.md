# cycleCAD Mobile Tutorial

Complete guide to using cycleCAD on mobile and tablet devices.

## Table of Contents

1. [Supported Devices & Browsers](#supported-devices--browsers)
2. [Getting Started](#getting-started)
3. [Touch Gestures](#touch-gestures)
4. [Mobile UI Overview](#mobile-ui-overview)
5. [Working with Panels](#working-with-panels)
6. [3D Viewport Touch Controls](#3d-viewport-touch-controls)
7. [Creating a Sketch on Mobile](#creating-a-sketch-on-mobile)
8. [Viewing STEP Files](#viewing-step-files)
9. [Using the Bottom Toolbar](#using-the-bottom-toolbar)
10. [Tips for Effective Mobile CAD](#tips-for-effective-mobile-cad)
11. [Performance Optimization](#performance-optimization)
12. [Known Limitations](#known-limitations)
13. [Troubleshooting](#troubleshooting)

## Supported Devices & Browsers

### Tablets
- **iPad** (7th gen and newer) — Recommended for optimal experience
- **iPad Pro** (all models) — Best performance and screen real estate
- **Samsung Galaxy Tab** — S7 and newer recommended
- **Android tablets** (10" and larger) — Works well
- **Microsoft Surface** (tablet mode) — Full support

### Phones
- **iPhone 12** and newer — Recommended minimum
- **iPhone SE** (2nd gen) — Supported but cramped
- **Samsung Galaxy S20** and newer — Recommended
- **Android phones** (6" and larger) — Works better than smaller screens
- **Foldable devices** — Tested on Samsung Galaxy Z Fold/Flip

### Browsers
- **Safari** (iOS 14+) — Recommended for iPhones/iPads (best performance)
- **Chrome** (iOS/Android) — Fully supported
- **Firefox** (iOS/Android) — Supported
- **Edge** (iOS/Android) — Supported
- **Samsung Internet** — Fully supported on Samsung devices

**Minimum Requirements:**
- Screen: 480px wide (landscape phone) or taller (portrait)
- RAM: 2GB+
- Storage: 500MB free for app cache
- Connection: 4G LTE or WiFi recommended

## Getting Started

### First Launch
1. Navigate to **cyclecad.com/app** on your mobile device
2. Allow browser permissions:
   - Microphone (optional, for voice commands)
   - Camera (optional, for AR features)
   - Storage (for saving files)
3. Browser will download ~50MB of app data on first load
4. Tap **"Open App"** to start

### Offline Access
cycleCAD works offline after first load. Your work is saved to device storage:
- **Auto-save**: Every 30 seconds
- **Manual save**: Tap **Settings** → **Save Project**
- **Cloud sync**: Requires Pro account (coming Q3 2026)

### Landscape vs Portrait
- **Landscape (480+ px wide)**: Full UI with left panel, viewport, right panel
- **Portrait (<480 px wide)**: Single-panel mode, swipe to navigate

The app automatically adapts. On notch devices (iPhone X+), safe areas are respected.

## Touch Gestures

### Single-Finger Gestures

#### Tap (Quick touch and release)
- **On 3D part**: Select the part, show info panel
- **On button**: Activate the button
- **On tree item**: Expand/collapse folder or select feature
- **On viewport**: Deselect current part

#### Double-Tap
- **On 3D part**: Fit selected part to viewport with zoom animation
- **On toolbar button**: Activate and show tool options
- **On 3D area**: Fit all parts to view

#### Long-Press (Press for 500ms)
- **On 3D part**: Show context menu with options:
  - Hide/Show
  - Isolate
  - Move
  - Delete
  - Export STL
  - Copy properties
- **On tree item**: Show advanced options
- **On toolbar**: Show tool tip and keyboard shortcut hint

#### Swipe (Drag and release)
- **Left swipe**: Open right properties panel
- **Right swipe**: Open left model tree panel
- **Up swipe**: Expand timeline or expand bottom sheet
- **Down swipe**: Collapse timeline or close bottom sheet

### Two-Finger Gestures

#### Pinch (Two fingers apart/together)
- **Spread (apart)**: Zoom in
- **Pinch (together)**: Zoom out
- **Scale**: Controlled by how fast you move
- Works over 3D viewport and sketcher canvas

#### Two-Finger Rotate
- **Clockwise**: Rotate viewport clockwise
- **Counter-clockwise**: Rotate viewport counter-clockwise
- Useful for viewing part from different angles without using buttons
- Works smoothly with pinch (independent gestures)

#### Two-Finger Pan
- **Drag together**: Pan the viewport left/right/up/down
- Used to move the view without rotating
- Right-click equivalent on desktop

### Three-Finger Gesture

#### Three-Finger Tap
- Triggers **Undo** (Ctrl+Z equivalent)
- Useful shortcut without accessing menu
- Four-finger tap = Redo

### Context Menu (Long-Press)

When you long-press a part or feature:

```
┌────────────────────────┐
│ Select                │
├────────────────────────┤
│ 👁️ Hide               │
│ 🔍 Isolate            │
│ ➡️ Move               │
│ 📋 Copy               │
│ ✂️ Cut                │
│ 🗑️ Delete             │
│ 📊 Properties         │
│ 💾 Export STL         │
│ 🔗 Suppress           │
└────────────────────────┘
```

Press the X button or swipe down to close.

## Mobile UI Overview

### Portrait Phone (<480px width)

**Header** (44px)
- Hamburger menu button (⋯ three lines)
- App title

**3D Viewport** (Main area)
- Full available space
- Touch to interact with model
- Long-press for context menu

**Bottom Toolbar** (44px)
- 6-8 most-used tools
- Icons only (no labels in portrait)
- Tap ⋯ "More" for full grid

**Safe Areas**
- Top: notch (iPhone X+)
- Bottom: home indicator

```
┌─────────────────────────────┐
│  ≡ cycleCAD                  │ ← Menu (44px header)
├─────────────────────────────┤
│                             │
│                             │
│      3D Viewport            │ ← Touch to interact
│                             │
│                             │
├─────────────────────────────┤
│ ✏️ 🧊 📐 👁️ ⚙️ ⋯            │ ← Toolbar (44px)
└─────────────────────────────┘
```

### Landscape Phone (480-600px)

Same as portrait, but narrower sidebar panels.

```
┌────────────────────────────────────────┐
│ ≡  cycleCAD                            │
├────────────────────────────────────────┤
│ 📂 │                              │ ⚙️ │
│ ▼  │      3D Viewport             │ ▼  │
│    │                              │    │
├────┤                              ├────┤
│ ✏️ 🧊 📐 👁️ ⚙️ ⋯  ...        │
└────────────────────────────────────────┘
```

### Tablet Portrait (600-900px)

```
┌──────────────────────────────────────────┐
│ cycleCAD     Menu         Menu Bar        │
├────────┬─────────────────────────┬────────┤
│  Model │                         │ Props  │
│  Tree  │    3D Viewport         │ Panel  │
│        │                         │        │
│  (260) │                         │ (280)  │
└────────┴─────────────────────────┴────────┘
│ Toolbar - Full width                    │
└──────────────────────────────────────────┘
```

### Tablet Landscape (900px+)

Full desktop layout with all panels visible side-by-side.

## Working with Panels

### Left Panel (Model Tree)

**Opening** (if not visible):
- **Landscape/Portrait**: Swipe right or tap hamburger menu → "Model"
- **Tablet**: Always visible as sidebar

**Tree Features**:
- Expand/collapse feature folders
- Tap feature name to select and highlight in 3D view
- Long-press for context menu:
  - Suppress/unsuppress feature
  - Rename feature
  - Delete feature
  - Show/hide feature
  - Reorder features

**Closing**:
- Swipe left or tap viewport

### Right Panel (Properties)

**Opening** (if not visible):
- **Landscape/Portrait**: Swipe left or tap right-panel icon
- **Tablet**: Always visible as sidebar

**Properties Tab**:
- Current selection details
- Dimensions and parameters
- Material and appearance
- Edit directly on the card

**Chat Tab** (AI):
- Ask questions about the model
- Get suggestions
- Describe what you want to do

**Closing**:
- Swipe right or tap viewport

### Bottom Sheet (More Options)

When you tap ⋯ "More" button:

```
┌─────────────────────────┐
│ ──────  (drag handle)   │
│                         │
│ ✏️ Sketch Tools         │ ← Category
│                         │
│ [icon] [icon] [icon]    │
│ Tool    Tool    Tool     │
│                         │
│ 🧊 Solid Tools          │
│                         │
│ [icon] [icon] [icon]    │
│                         │
└─────────────────────────┘
```

**Usage**:
- Drag handle to resize
- Scroll to see all tools
- Tap tool to select it
- Bottom sheet auto-closes after tool selection
- Swipe down to close manually

## 3D Viewport Touch Controls

### Rotation
- **1 finger drag**: Rotate model around center
- **2 fingers rotate**: Free rotation (around all axes)
- Smooth momentum scrolling

### Zoom
- **Pinch in/out**: Zoom in/out
- **Double-tap**: Fit selection to view
- **Double-tap empty area**: Fit all to view
- Min/max zoom limits prevent going too close or far

### Pan (Move)
- **2 fingers drag**: Pan the viewport
- **Right-click equivalent**: Two-finger drag without rotating
- Useful for repositioning without orbiting

### Center Model
- **Tap center button** in view controls (bottom-right)
- Or **double-tap** on a part to center it

### Reset View
- **Tap home button** in view controls
- Resets to default front view and fit-all
- Works from any orientation

### View Presets
- **Tap view button** (bottom-right)
- Shows 6 preset views:
  - Front (Z-)
  - Back (Z+)
  - Top (Y+)
  - Bottom (Y-)
  - Left (X-)
  - Right (X+)
- Tap any preset for instant view change

### ViewCube (Corner Indicator)
- Located top-right of viewport
- Shows current orientation
- Tap faces/edges/corners to snap to that view
- Long-press and drag to rotate continuously

## Creating a Sketch on Mobile

### Starting a Sketch

1. **Tap ✏️ Sketch button** in toolbar
2. Select **Face or Plane**:
   - Tap the face/plane in 3D view
   - Or choose from dropdown (XY/YZ/XZ planes)
3. **Canvas appears** as overlay on 3D view

### Sketch Tools

**Available in portrait bottom toolbar**:
- ✏️ **Line**: Tap to start, tap points to draw
- ⬜ **Rectangle**: Tap corner 1, corner 2
- ⭕ **Circle**: Tap center, tap edge point
- ⌒ **Arc**: Tap start, tap arc point, tap end

**More tools** (tap ⋯ More):
- Polyline (continuous lines)
- Bezier curve
- Ellipse
- Construction line
- Point
- Dimension tool
- Constraint tool

### Drawing Lines

```
Tap canvas to start
     ↓
[Point 1] ← First tap
     ↓
[Point 2] ← Drag and tap
     ↓
[Point 3] ← Continue tapping
     ↓
Double-tap → Finish line
```

### Grid & Snapping

- **Grid visible** when zoomed in
- **Snapping enabled** automatically:
  - Snap to grid points
  - Snap to endpoints
  - Snap perpendicular
  - Snap tangent
- Toggle grid: **Settings → Grid**

### Constraints

After drawing, add constraints:

1. **Tap constraint button** (📐)
2. **Select constraint type**:
   - Horizontal/Vertical
   - Parallel/Perpendicular
   - Equal length
   - Tangent
   - Distance/Angle
   - Fixed point
3. **Select geometry** to constrain
4. **Enter value** if required

### Finishing Sketch

1. **Tap ✓ Done** button (top-right)
2. Sketch converts to 3D face
3. Ready for next operation

## Viewing STEP Files

### Importing STEP Files

1. **Tap File → Import** or **⋯ More → Import**
2. **Choose source**:
   - Camera/Photos (if saved to device)
   - iCloud Drive (if signed in)
   - Files app
   - Drag and drop on web app
3. **Wait for import** (may take 1-3 minutes for large files)
4. **Model loads** in 3D viewport

### File Limitations (Mobile)

- **Max file size**: 100MB (browser limit)
- **Max parts**: ~500 parts recommended
- For larger files:
  - Use desktop cycleCAD or Fusion 360
  - Split STEP assembly into sub-assemblies
  - Export individual parts

### Viewing Imported Models

- **Rotate**: Drag with 1 finger
- **Zoom**: Pinch with 2 fingers
- **Pan**: Drag with 2 fingers
- **View presets**: Tap view button
- **Hide parts**: Long-press → Hide
- **Select part**: Tap to highlight

### Exporting Back

After modifying:

1. **Tap 💾 Export** in toolbar
2. **Choose format**:
   - STL (3D printing)
   - OBJ (universal)
   - glTF (web viewing)
   - JSON (cycleCAD native)
3. **Download** to device
4. **Share** via email, cloud, etc.

## Using the Bottom Toolbar

### Portrait Mode (Phone)

Icons only, 6-8 tools:

```
│ ✏️ 🧊 📐 👁️ ⚙️ ⋯  │
```

- **✏️ Sketch**: Enter sketch mode
- **🧊 Solid**: Extrude, revolve, etc.
- **📐 Measure**: Measure distances/angles
- **👁️ View**: Preset views and options
- **⚙️ Settings**: App settings
- **⋯ More**: Full tool grid

### Landscape Mode (Phone)

Same icons, but with text labels.

### Tablet Mode

Full toolbar visible at top or side, with all buttons and labels.

### Customizing Toolbar

**Settings → Toolbar**:
- Reorder tools with drag-and-drop
- Add/remove tools from quick bar
- Set auto-hide behavior
- Adjust opacity

### Tool Options

Some tools have sub-options:

1. **Tap and hold** the tool button (1 second)
2. Menu appears with options
3. Tap desired option
4. Tool activates with that setting

Example for **Extrude**:
- Extrude up
- Extrude down
- Extrude symmetric
- Extrude new part

## Tips for Effective Mobile CAD

### 1. Orientation Strategy

**Portrait mode**:
- Good for: Reading text, using tree, making sketches
- Not ideal for: Viewing complex assemblies, precise selection

**Landscape mode**:
- Good for: Viewing large models, precise work
- Better touch real estate
- **Recommendation**: Use landscape for detailed work

### 2. Touch Accuracy

- **Larger parts**: Easy to select
- **Small parts**: Zoom in first (pinch out)
- **Overlapping parts**: Use tree to select
- **Double-tap**: Center view before detailed work

### 3. Sketching on Phone

- Sketches are cramped on phone screens
- **Landscape mode** is essential for sketching
- For complex sketches:
  - Start on phone
  - Finish on tablet/desktop
  - Use cloud sync (Pro) to switch devices

### 4. Battery & Performance

**Battery usage**:
- Disable auto-save if not needed (Settings)
- Reduce quality on older devices
- Disable shadows/reflections
- Close other apps

**Performance tips**:
- Hide assemblies you're not working on
- Reduce part count (isolate what you need)
- Restart app if sluggish
- Close and reopen project

### 5. Screen Glare

For working outdoors:
- Rotate to landscape for better angle
- Use screen brightness control
- Work in shade when possible
- Consider anti-glare screen protector

### 6. Precision Work

For accurate measurements:
- **Zoom in** to where you're working
- Use **dimension constraints** in sketches
- Use **measurement tool** for verification
- Reference parts with **dimensions shown**

### 7. Project Organization

On mobile:
- Keep projects small (under 50 parts)
- Use clear naming conventions
- Organize features in logical order
- Add comments to complex features

## Performance Optimization

### Device Settings

**Enable High Performance Mode** (if available):
- Settings → Battery → High Performance
- Increases frame rate and responsiveness

**Browser Optimization**:
- Clear cache regularly: **Settings → Clear Cache**
- Disable browser extensions
- Use latest browser version
- Disable background tabs

### App Settings

**Graphics Quality**:
- **Settings → Graphics → Quality**
- Options:
  - Low (faster, less detailed)
  - Medium (balanced, recommended)
  - High (slower, very detailed)

**Shadows**:
- Can be disabled for performance: **Settings → Shadows**
- Saves ~20% GPU load

**Anti-aliasing**:
- Smooth edges: Usually enabled
- Disable if needed for speed

**Model Simplification**:
- **Hide unused parts**: Select and tap ✏️ eye button
- **Isolate part**: Long-press → Isolate
- **Delete hidden parts**: Right-click → Delete Hidden

### Network

- **Auto-save**: Toggle in Settings (saves bandwidth)
- **Cloud sync**: Available Pro only
- **Offline work**: Fully supported, sync when connected

## Known Limitations

### Mobile Limitations

1. **File Size**: Max 100MB (browser limit)
2. **Part Count**: 500+ parts may slow down
3. **Resolution**: Lower viewport resolution on older devices
4. **Export Format**: Limited to STL, OBJ, glTF (not DWG)
5. **Collaboration**: Not available on mobile (Pro feature, desktop only)
6. **Plugins**: Not supported on mobile

### Touch Interaction

1. **Precision**: Touch is less accurate than mouse/trackpad
2. **Multi-select**: Hold Shift not supported; use tree instead
3. **Keyboard**: On-screen keyboard cramped; use physical if possible
4. **Context menu**: Via long-press, not right-click
5. **Dragging**: Limited; use tree panel instead

### Performance

1. **3D rendering**: 30-60 FPS on tablets, 20-30 FPS on phones
2. **Large sketches**: May lag with 100+ constraints
3. **Import time**: 1-3 minutes for 100MB files
4. **Export time**: 30s-2min depending on format and size

## Troubleshooting

### App Won't Load

**Problem**: Blank screen or "Loading..." forever

**Solutions**:
1. **Hard refresh** browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Clear cache**: **Settings → Clear Cache**
3. **Restart browser**: Close all tabs, reopen
4. **Restart device**: Full power cycle
5. **Check connection**: Ensure good WiFi or 4G LTE

### Touch Not Responding

**Problem**: Taps not registering or slow response

**Solutions**:
1. **Clean screen**: Remove dust/oil (common on phones)
2. **Hard restart app**: Close and reopen
3. **Restart device**: Sometimes helps
4. **Check for updates**: Browser and app updates
5. **Use older version**: If recent update broken, downgrade browser

### Model Won't Import

**Problem**: "Import failed" or blank import dialog

**Solutions**:
1. **File size**: Check file is under 100MB
2. **Format**: Ensure it's valid STEP (.stp or .step)
3. **File corruption**: Try different file
4. **Browser compatibility**: Try Chrome instead of Safari
5. **Network**: Ensure stable connection during import

### Performance Lag

**Problem**: Slow, choppy interaction

**Solutions**:
1. **Reduce quality**: **Settings → Graphics → Low**
2. **Hide parts**: Hide parts you're not using
3. **Restart app**: Close and reopen
4. **Close other apps**: Free up device memory
5. **Disable shadows**: **Settings → Shadows → Off**
6. **Zoom out**: May improve performance on very complex models

### Viewport Touch Not Working

**Problem**: Can't rotate/zoom model with touch

**Solutions**:
1. **Check gesture**: Ensure you're using correct gesture
   - Single drag = rotate (not pan)
   - Pinch = zoom (two fingers apart/together)
   - Two-finger drag = pan
2. **Restart app**: Close and reopen
3. **Test in different area**: Try tapping 3D view center
4. **Check for overlay**: Modal or panel may be intercepting touches

### Saving Issues

**Problem**: Changes not saving or "Save failed"

**Solutions**:
1. **Check space**: Ensure device has free storage space
2. **Check network**: For cloud save, ensure connected
3. **Permissions**: Go to Settings → App Permissions → Storage
4. **Auto-save**: Enable in **Settings → Auto-save**
5. **Manual save**: Try **File → Save Project**

### Export Not Working

**Problem**: Export button unresponsive or download fails

**Solutions**:
1. **Check format**: STL/OBJ/glTF supported; not DWG
2. **File size**: Ensure project not >100MB
3. **Browser permission**: Allow downloads in browser settings
4. **Restart download**: Try exporting again
5. **Use email**: Export and email yourself file instead

### Sketch Canvas Not Appearing

**Problem**: Clicked sketch but canvas didn't open

**Solutions**:
1. **Select face first**: Must select a face/plane before sketching
2. **Deselect and retry**: Click viewport to deselect, try again
3. **Restart**: Close and reopen app
4. **Zoom in**: Sometimes canvas appears but off-screen; zoom to find it

### ViewCube Not Responding

**Problem**: Can't rotate via ViewCube or view presets not working

**Solutions**:
1. **Tap center**: Tap cube corner/edge precisely
2. **Rotate gesture**: Use two-finger rotate instead
3. **View button**: Use preset view buttons instead
4. **Reset**: Double-tap empty area to reset view

---

## Support & Feedback

Found a bug? Have feature request?

- **Report issue**: https://github.com/vvlars-cmd/cyclecad/issues
- **Email support**: support@cyclecad.com (coming soon)
- **Chat with AI**: In-app chat for quick help

Last updated: March 2026
