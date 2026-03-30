# cycleCAD Getting Started Tutorial

A friendly, step-by-step guide to learning cycleCAD from zero to building your first 3D parts, assemblies, and drawings.

**Time to complete:** ~45 minutes

**Prerequisites:** Nothing — cycleCAD runs in your browser.

---

## Part 1: Your First 3D Part (5 minutes)

Learn the fundamentals: sketch → extrude → fillet → export.

### Step 1.1: Open the App

Navigate to:

```
https://cyclecad.com/app
```

You'll see:
- **Left panel:** Feature tree (currently empty)
- **Center:** 3D viewport with grid floor
- **Right panel:** Properties, Chat, Help tabs

### Step 1.2: Create a New Part

Click **File → New Part** (or press `Ctrl+N`)

The app is ready for your first feature.

### Step 1.3: Sketch a Rectangle

The sketch is active (you're in 2D mode, shown at bottom).

1. Click the **Rectangle** tool (right panel, Sketch tab)
2. Click and drag to create a rectangle:
   - Start at: `0, 0`
   - Drag to: `100, 50`
3. You should see a blue rectangle on the grid

Your sketch now has one entity: a 100×50 rectangle.

### Step 1.4: Exit the Sketch

Click **Finish Sketch** (or press `Esc`)

The rectangle is now a closed profile ready for extrusion.

### Step 1.5: Extrude to 3D

1. Click the **Extrude** button (Analyze tab, or press `E`)
2. In the properties panel, set:
   - **Distance:** `50` mm
   - **Direction:** Default (up the Z axis)
3. Click **Apply**

You now have a 100×50×50 mm rectangular block! The 3D viewport shows it at an isometric angle.

**Tip:** Use middle-click to rotate the view, right-click to pan, scroll to zoom.

### Step 1.6: Fillet the Edges

Sharp corners look ugly. Let's round them.

1. Click **Fillet** (Analyze tab, or press `F`)
2. In the properties panel:
   - **Radius:** `5` mm
   - **Edges:** Click "Select All" to round all edges
3. Click **Apply**

Your block now has smooth rounded corners!

### Step 1.7: Export as STL

Ready to 3D print?

1. Click **File → Export → STL**
2. Choose format:
   - **ASCII** (larger file, human-readable)
   - **Binary** (smaller file, better)
3. Name it: `my-first-part.stl`
4. Save

You've exported your first 3D model! You can now upload it to Thingiverse, Printables, or send to a 3D printer.

---

## Part 2: Using the AI Copilot (3 minutes)

Let the AI do the heavy lifting.

### Step 2.1: Open Chat

Click the **Chat** tab on the right panel.

You'll see an empty chat history and an input box.

### Step 2.2: Ask the AI to Create a Cube

Type in the chat box:

```
create a 100mm cube
```

Press Enter.

**What happens:**
- The AI reads your request
- Recognizes "100mm cube"
- Automatically creates the 3D part for you
- A new feature appears in the tree: "Cube (100×100×100)"

The viewport shows a perfect cube!

### Step 2.3: Add Holes in the Corners

Type:

```
add 4 holes in the corners, 10mm radius
```

The AI:
- Understands "4 holes", "corners", "10mm radius"
- Calculates corner positions automatically
- Creates 4 holes from the top face
- Updates your model

You now have a cube with 4 corner holes!

### Step 2.4: Fillet All Edges

Type:

```
fillet all edges 3mm
```

The AI:
- Detects "fillet", "all edges", "3mm"
- Applies a 3mm radius to all 12 edges
- Smooth, professional appearance

### Step 2.5: Export

Type:

```
export as STEP
```

The AI exports the model as `cube-with-holes.step` — a professional CAD format compatible with Fusion 360, SolidWorks, and other tools.

**AI copilot is useful for:**
- Quick prototyping
- Complex shapes (gears, springs, threads)
- Batch operations
- Learning syntax

---

## Part 3: Working with Assemblies (10 minutes)

Combine multiple parts into a machine.

### Step 3.1: Create a Base Plate

Start fresh: **File → New Part**

Create a base plate:
1. **Sketch → Rectangle:** 200×200 mm
2. **Finish Sketch**
3. **Extrude:** 10 mm
4. **File → Save as:** `base-plate.ccad` (cycleCAD native format)

You now have a thick rectangular base.

### Step 3.2: Create a Mounting Bracket

In a new tab/window, open cycleCAD again.

Create a bracket:
1. **Sketch → Rectangle:** 50×100 mm
2. **Finish Sketch**
3. **Extrude:** 20 mm
4. **Save as:** `bracket.ccad`

### Step 3.3: Create an Assembly

**File → New Assembly**

You're now in assembly mode (shown at bottom: "Assembly Workspace").

The left panel now shows:
- **Components** (empty)
- **Joints** (empty)
- **BOM** (bill of materials)

### Step 3.4: Insert Components

1. Click **Insert Component**
2. Select `base-plate.ccad` from your files
3. Click **OK**

The base plate appears in the 3D viewport.

4. Click **Insert Component** again
5. Select `bracket.ccad`
6. Position it: Drag it to the top-left corner of the base plate
7. Click **OK**

Now you have two parts in one assembly!

### Step 3.5: Create a Joint

Let's say the bracket should rotate on a pin. Create a revolute joint:

1. Click **Create Joint** (right panel, Joints tab)
2. **Joint Type:** Revolute (rotation)
3. **Component 1:** bracket
4. **Component 2:** base-plate
5. **Axis:** Z (vertical)
6. Click **Create**

The bracket is now constrained to rotate around the Z axis.

### Step 3.6: Animate the Joint

Let's see it move!

1. **Assembly → Animate Joint** (or press `Shift+A`)
2. Drag the slider to rotate the bracket from 0° to 90°
3. Watch the 3D view update in real-time

Cool! The assembly animates smoothly.

### Step 3.7: Generate a BOM

Generate a bill of materials (parts list):

1. **Assembly → Export BOM**
2. Format: CSV or PDF
3. Name: `assembly-bom.csv`

The BOM shows:
```
Part Number | Name | Quantity | Material
1           | base-plate | 1 | Steel
2           | bracket | 1 | Steel
```

This can be sent to suppliers for ordering!

---

## Part 4: Engineering Drawings (10 minutes)

Create professional 2D drawings for manufacturing.

### Step 4.1: Open Drawing Workspace

**File → New Drawing**

The left panel now shows:
- **Views** (empty)
- **Dimensions** (empty)
- **Annotations** (empty)

### Step 4.2: Add Orthographic Views

Create standard front, top, right views:

1. **Drawing → Add View**
   - Type: **Front**
   - Position: Drag to the center-left of the canvas
2. **Drawing → Add View**
   - Type: **Top**
   - Position: Above the front view
3. **Drawing → Add View**
   - Type: **Right**
   - Position: To the right of the front view

You now have three aligned views showing your model from different angles.

### Step 4.3: Add a Section View

Show the internal holes:

1. **Drawing → Add View**
   - Type: **Section**
   - Plane: **A-A** (a line you'll draw)
2. Draw a line through the front view (left to right)
3. The section view appears showing the internal cross-section

### Step 4.4: Add Dimensions

Professional drawings show measurements:

1. **Drawing → Dimension Tool** (or press `D`)
2. Click the width of the front view
   - Annotation: `100 mm`
3. Click the height
   - Annotation: `50 mm`
4. Click the holes
   - Annotation: `Ø 10 mm` (diameter)

Dimensions appear as labeled lines on your views.

### Step 4.5: Add a Title Block

Every drawing needs a title block:

1. **Drawing → Add Title Block**
2. Fill in:
   - **Part Name:** cube-with-holes
   - **Revision:** 1.0
   - **Date:** Today's date
   - **Scale:** 1:1
   - **Units:** mm

A title block appears in the bottom-right corner.

### Step 4.6: Export to PDF

Time to share:

1. **File → Export**
2. Format: **PDF**
3. Name: `drawing.pdf`
4. Download

Open the PDF in your browser or print it for your shop floor!

---

## Part 5: Using the Agent API (5 minutes)

Power users can control cycleCAD from JavaScript.

### Step 5.1: Open the Browser Console

In cycleCAD, press `F12` to open Developer Tools.

Click the **Console** tab.

You're now in the JavaScript REPL where you can control cycleCAD programmatically.

### Step 5.2: Create a Box via Code

Type:

```javascript
await kernel.exec('ops.box', { width: 100, height: 50, depth: 30 });
```

Press Enter.

**Result:** A 100×50×30 box appears in the 3D viewport!

The kernel is the heart of cycleCAD — it manages all modules (viewport, sketch, operations, etc.) and coordinates them via an event bus.

### Step 5.3: Add a Fillet

```javascript
await kernel.exec('ops.fillet', { edges: 'all', radius: 5 });
```

All edges of the box are now rounded with a 5 mm radius.

### Step 5.4: Export

```javascript
await kernel.exec('step.export', { filename: 'my-part.step' });
```

The model is exported as a STEP file and downloaded automatically.

### Step 5.5: Get the Current Part Info

```javascript
const part = kernel.state.get('current-part');
console.log(part);
```

**Output:**
```javascript
{
  id: 'part_123',
  name: 'Untitled Part',
  features: [
    { id: 'feat_1', type: 'box', ... },
    { id: 'feat_2', type: 'fillet', ... }
  ],
  material: 'Steel',
  ...
}
```

The Agent API exposes the full power of cycleCAD to scripts, AI agents, external tools, and custom automation.

---

## Part 6: Building a Custom Module (15 minutes)

Want to extend cycleCAD with your own tools? Modules are easy.

### Step 6.1: Create the Module File

In your text editor, create `part-counter.js`:

```javascript
const PartCounterModule = {
  id: 'part-counter',
  name: 'Part Counter',
  version: '1.0.0',
  category: 'tool',
  dependencies: ['viewport'],
  memoryEstimate: 2,

  async load(kernel) {
    console.log('[PartCounter] Loading...');
    this.count = 0;
  },

  async activate(kernel) {
    console.log('[PartCounter] Activating...');

    // Subscribe to feature creation
    kernel.on('feature:created', (data) => {
      this.count++;
      console.log(`[PartCounter] Part count: ${this.count}`);

      // Update badge
      const badge = document.querySelector('#pc-badge');
      if (badge) badge.textContent = `📊 ${this.count} Parts`;
    });

    // Inject a badge into the UI
    const badge = document.createElement('div');
    badge.id = 'pc-badge';
    badge.textContent = `📊 ${this.count} Parts`;
    badge.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2563eb;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: bold;
      z-index: 1000;
    `;
    document.body.appendChild(badge);
  },

  async deactivate(kernel) {
    console.log('[PartCounter] Deactivating...');
    kernel.off('feature:created');
    const badge = document.querySelector('#pc-badge');
    if (badge) badge.remove();
  },

  async unload(kernel) {
    this.count = 0;
  },

  provides: {
    commands: {
      'part-counter.getCount': async () => {
        return { count: this.count };
      },
    },
  },
};

export default PartCounterModule;
```

### Step 6.2: Register and Load It

In the browser console:

```javascript
// Import the module
import PartCounterModule from './part-counter.js';

// Register it with the kernel
await kernel.register(PartCounterModule);

// Activate it
await kernel.activate('part-counter');
```

**What you'll see:**
- A blue badge in the top-right corner showing "📊 0 Parts"
- Console logs when you create features

### Step 6.3: Test It

Create a new box:

```javascript
await kernel.exec('ops.box', { width: 50, height: 50, depth: 50 });
```

Watch the badge update: "📊 1 Parts"

Create a fillet:

```javascript
await kernel.exec('ops.fillet', { edges: 'all', radius: 2 });
```

Badge updates: "📊 2 Parts"

### Step 6.4: Use the Command

```javascript
const result = await kernel.exec('part-counter.getCount');
console.log(result);  // { count: 2 }
```

That's it! You've written your first cycleCAD module.

**Next steps:**
- Add more commands (reset counter, export CSV, etc.)
- Add a UI panel for options
- Subscribe to other events (part:selected, sketch:finished, etc.)
- Read the [Developer Guide](./DEVELOPER-GUIDE.md) for full API details

---

## Part 7: Keyboard Shortcuts Reference

Fast keyboard shortcuts for power users.

### View & Navigation

| Shortcut | Action |
|----------|--------|
| `V` | Toggle viewport background (light/dark) |
| `G` | Toggle grid floor |
| `W` | Toggle wireframe mode |
| `1` | Front view |
| `2` | Top view |
| `3` | Right view |
| `4` | Isometric view |
| `5` | Fit all objects in view |
| `.` (period) | Reset camera to origin |
| `Mouse 3 (scroll)` | Zoom in/out |
| `Middle + drag` | Rotate view |
| `Right + drag` | Pan view |

### Sketching

| Shortcut | Action |
|----------|--------|
| `S` | Enter sketch mode |
| `Esc` | Exit sketch (finish) |
| `L` | Line tool |
| `C` | Circle tool |
| `R` | Rectangle tool |
| `A` | Arc tool |
| `P` | Polyline tool |
| `H` | Horizontal constraint |
| `V` | Vertical constraint |
| `T` | Tangent constraint |
| `E` | Equal constraint |
| `D` | Distance constraint |
| `Shift+D` | Delete constraint |
| `Space` | Finish current entity (line, arc, etc.) |

### 3D Modeling

| Shortcut | Action |
|----------|--------|
| `E` | Extrude feature |
| `R` | Revolve feature |
| `F` | Fillet edges |
| `Shift+C` | Chamfer edges |
| `H` | Create hole |
| `B` | Boolean operation (union, cut, intersect) |
| `Shift+P` | Pattern (rectangular/circular) |
| `Shift+U` | Undo last feature |
| `Shift+Y` | Redo last feature |
| `Shift+S` | Suppress feature (hide without deleting) |
| `Del` | Delete selected feature |
| `Tab` | Next feature in tree |
| `Shift+Tab` | Previous feature in tree |

### Workspace

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New part |
| `Ctrl+O` | Open part |
| `Ctrl+S` | Save part |
| `Ctrl+E` | Export |
| `Ctrl+P` | Print/Preview |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all |
| `Escape` | Deselect all |
| `?` | Show help panel |
| `F12` | Developer console |
| `Ctrl+Shift+T` | Open test agent |

### Assembly (Assembly Mode)

| Shortcut | Action |
|----------|--------|
| `Shift+A` | Animate selected joint |
| `Shift+E` | Explode/collapse assembly |
| `Shift+B` | Generate BOM |
| `Shift+I` | Interference check |
| `J` | Create new joint |

### Drawing (Drawing Mode)

| Shortcut | Action |
|----------|--------|
| `D` | Dimension tool |
| `N` | Add note/annotation |
| `T` | Add text |
| `Shift+V` | Add view |
| `Shift+L` | Add section line |
| `Ctrl+E` | Export to PDF/PNG |

### AI Copilot

| Shortcut | Action |
|----------|--------|
| `Alt+A` | Focus chat input |
| `Alt+/` | Show AI command suggestions |
| `Enter` (in chat) | Send message |
| `Shift+Enter` | New line in chat |

---

## Troubleshooting & Common Questions

### Q: The 3D view is blank / rotated weirdly

**Solution:**
- Press `5` to fit all objects
- Press `1` for front view to reset orientation
- Scroll to zoom out if you're too close

### Q: I created a sketch but can't see it

**Solution:**
- Press `S` to enter sketch mode
- Sketches are 2D (flat) — view from above: press `2`
- Exit sketch with `Esc` before extruding

### Q: Extrude didn't work

**Solution:**
- Make sure you finished the sketch (press `Esc`)
- Sketch must be closed (connected lines forming a profile)
- If sketch has constraints issues, the solver will warn you

### Q: How do I undo a mistake?

**Solution:**
- Press `Ctrl+Z` to undo
- Press `Ctrl+Y` to redo
- You can undo/redo multiple times to go back in history

### Q: Can I import my SolidWorks/Fusion 360 file?

**Solution:**
- Export your file as **STEP** (`.step` or `.stp`)
- In cycleCAD: **File → Import → STEP**
- The model will load (may take a few seconds for large files)

### Q: How do I share my design with others?

**Solution:**
- **File → Share** generates a link
- Others can view (not edit) your design
- For full collaboration, upgrade to **Pro** tier

### Q: Can I 3D print my model?

**Solution:**
- **File → Export → STL** (preferred for 3D printing)
- Upload the `.stl` file to Thingiverse, Printables, or your slicer software
- Or send directly to a 3D printing service

### Q: My assembly has collision issues

**Solution:**
- **Assembly → Interference Check** shows colliding parts
- Adjust joint angles or component positions
- Add additional constraints to prevent collisions

---

## Next Steps

Congratulations! You've learned cycleCAD's core features:

1. ✅ Sketch → Extrude → Fillet → Export
2. ✅ AI Copilot for rapid prototyping
3. ✅ Assemblies with joints
4. ✅ Engineering drawings
5. ✅ Agent API for automation
6. ✅ Custom modules to extend functionality

### Continue Learning

- **Advanced modeling:** Read `docs/ADVANCED-MODELING.md` for sweep, loft, sheet metal, springs, threads
- **AI workflows:** Explore more Chat commands like "create a bearing", "add threads M10", "stress analysis"
- **Custom modules:** Build your own tools following the [Developer Guide](./DEVELOPER-GUIDE.md)
- **Community:** Share designs on GitHub, ask questions in Discussions
- **Video tutorials:** Watch walkthroughs at cyclecad.com/learn

### Get Help

- **In-app Help:** Press `?` to open the help panel
- **GitHub Issues:** github.com/vvlars-cmd/cyclecad/issues
- **Community Discord:** (coming soon)
- **Email:** support@cyclecad.com

### Feedback

Found a bug? Have a feature request? Your feedback makes cycleCAD better.

Create an issue: https://github.com/vvlars-cmd/cyclecad/issues/new

---

**Happy designing!** 🚀

Built with ❤️ by the cycleCAD community.
