# Killer Features Tutorial — Step-by-Step Guides

This tutorial walks you through each of the 10 killer features with real-world examples.

---

## Tutorial 1: AI Design Copilot Chat

### Goal: Create a custom gear in 30 seconds

**Time: 5 minutes**

### Step 1: Open the Copilot
1. Press **Ctrl+K** (or Cmd+K on Mac)
2. The Copilot panel appears in the bottom-right corner
3. You see the prompt: "Try: 'gear 24 teeth module 2'"

### Step 2: Create Your First Gear
1. In the input field, type: `gear 32 teeth module 3`
2. Press **Enter**
3. Watch the console: "Parsing intent... Creating gear 32T, module 3"
4. The gear appears in the 3D viewport with:
   - 32 teeth evenly distributed
   - Module 3 pitch
   - 10mm bore hole (default)
   - PBR material (shiny steel look)

### Step 3: Create More Complex Geometry
1. Try: `bracket 120x60x8 with holes`
2. An L-shaped bracket appears with mounting holes
3. Try: `cylinder 50mm diameter 100 tall`
4. A cylindrical shaft appears

### Step 4: Multi-Step Commands
1. Try: `gear 20 teeth module 2, bore 12mm`
2. A smaller pinion gear with 12mm bore is created
3. You can now have both gears in the scene

### Tips

- **Typos are OK**: "gear" works, "geer" works, "dieameter" works
- **Units implied**: All dimensions in mm
- **Parametric ready**: Any created geometry can be modified in the Parameter Table
- **Undo supported**: Press Ctrl+Z to undo copilot commands

### Next: Try These Commands

```
"gear 40 teeth, module 4, bore 15mm"
"bracket 100x80x10 with 4 holes"
"washer, inner 10mm, outer 25mm"
"shaft 50mm long, diameter 12mm"
```

---

## Tutorial 2: Physics Simulation

### Goal: Test if your bracket survives a drop

**Time: 10 minutes**

### Step 1: Create a Test Model
1. Use the Copilot to create: `bracket 100x50x5`
2. Or import an existing part

### Step 2: Enable Physics Simulation
1. Press **Ctrl+P** to toggle physics
2. The console shows: "[Physics] Simulation started"
3. All meshes become physics bodies
4. Gravity is applied immediately

### Step 3: Observe the Simulation
1. Your bracket falls due to gravity
2. When it hits the "ground" (at y = -50), it bounces
3. The bounce coefficient is 0.6 (60% energy rebound)
4. Watch for color changes:
   - **Blue**: Safe (stress < 25%)
   - **Yellow**: Warning (stress 25–50%)
   - **Red**: Critical (stress > 50%)

### Step 4: Identify Stress Hotspots
1. As the bracket falls, certain areas turn yellow then red
2. These are the areas most likely to crack
3. Take note of corners and edges
4. These are where you should add fillets

### Step 5: Optimize Based on Simulation
1. Press **Ctrl+T** to open the Parameter Table
2. Increase `fillet_radius` from 5 to 10
3. The bracket is rebuilt instantly
4. Press **Ctrl+P** again to re-run physics
5. Notice the bracket now handles impact better (less red stress)

### Tips

- **Damping**: Air resistance is built in (0.99x per frame)
- **Collision**: Any two meshes within bounding box volume collide
- **Stop simulation**: Press Ctrl+P again to toggle off
- **Multiple objects**: All meshes simulate together

### Understanding Stress Colors

```
Temperature gradient: Blue → Yellow → Red
0% stress (safe)      50% (warning)   100% (critical)
│                     │               │
└─────────────────────┴───────────────┘
```

### Experiment: Test Different Wall Thicknesses

1. Parameter Table → Set `wall_thickness = 1.5`
2. Run physics → Notice more red stress
3. Set `wall_thickness = 3.5`
4. Run physics → Less red stress
5. Find the sweet spot where stress is minimal

---

## Tutorial 3: Generative Design

### Goal: Create a lightweight bracket with 50% material

**Time: 12 minutes**

### Step 1: Set Up Your Base Model
1. Use Copilot: `bracket 100x50x10`
2. You have a solid rectangular bracket

### Step 2: Open Generative Design
1. Press **Ctrl+G**
2. The Generative Design panel appears on the right
3. You see sliders for:
   - Material Budget: 10–100% (default 50%)
   - Iterations: 1–100 (default 20)

### Step 3: Generate Optimized Topology
1. Keep Material Budget at **50%** (half the material)
2. Set Iterations to **40** (more iterations = more refinement)
3. Click **"Generate Optimized Structure"**
4. Watch the progress bar: "Generating struts: 25%"
5. The algorithm:
   - Creates 40 Voronoi cells in the design space
   - Connects nearby cells with struts
   - Prunes unnecessary connections
   - Shows the lattice structure

### Step 4: Analyze the Result
1. The lattice appears in the viewport
2. It's made of struts (lines) connecting nodes
3. The overall shape preserves the original bracket outline
4. But it's now 50% lighter

### Step 5: Compare Weight
1. Original bracket weight: ~500g (estimate)
2. Optimized bracket weight: ~250g (50% reduction)
3. Stiffness is preserved by smart strut placement
4. Perfect for aerospace or automotive

### Material Budget Examples

| Budget | Use Case | Weight Reduction |
|--------|----------|------------------|
| 30% | Racing drone frame | 70% lighter |
| 50% | Aircraft bracket | 50% lighter |
| 70% | Car suspension | 30% lighter |
| 90% | Industrial mounting | 10% lighter |

### Tips

- **More iterations = better topology** (but takes longer)
- **Lower budget = more sparse** (more artistic, less stiff)
- **Lattice is exportable** — Export as STL for 3D printing
- **You can refine** — Add fillets to struts, chamfer connections

### Advanced: Multi-Step Optimization

1. Generate with 50% budget
2. Analyze the result
3. Generate again with 40% budget
4. Compare both versions in Version Control
5. Pick the best one for your application

---

## Tutorial 4: Real-time Cost Estimator

### Goal: Compare manufacturing costs for three methods

**Time: 8 minutes**

### Step 1: Create a Part to Cost
1. Use Copilot: `bracket 100x50x10`
2. The cost estimator shows at the top-right
3. It shows three boxes:
   - **CNC Machining**: $XXX
   - **3D Printing**: $XXX
   - **Injection Mold**: $X.XX per unit

### Step 2: Understand the Costs
1. **CNC Machining**: $50–500 depending on size
   - Formula: $15 per minute × (volume/10)
   - Good for: One-offs, prototypes, small batches
   - Lead time: 5–10 days

2. **3D Printing**: $25–100
   - Formula: $0.10 per cm³
   - Good for: Rapid prototyping, complex geometry
   - Lead time: 1–3 days

3. **Injection Mold**: $5.05–50 per unit
   - Formula: ($5,000 tooling + $0.05 per cm³) / 1000 units
   - Good for: High-volume production
   - Lead time: 2–4 weeks

### Step 3: See the Recommendation
1. Look at the bottom of the cost panel
2. It says: **"3D Print is cheapest"** (or CNC, or Injection)
3. This changes as you modify the model

### Step 4: Experiment with Geometry
1. **Make it bigger**: Add features → cost goes up
2. Estimator recalculates every second
3. Watch how costs change in real-time

### Step 5: Make a Decision
1. If you need 1 unit: Choose 3D Print or CNC
2. If you need 100 units: CNC becomes cheaper
3. If you need 1,000+ units: Injection mold becomes best option

### Cost Decision Matrix

```
1 part:      3D Print ($50)  < CNC ($200)     << Injection ($5,050)
10 parts:    3D Print ($500) < CNC ($1,500)   << Injection ($500)
100 parts:   CNC ($1,200)    < 3D Print ($2,000) < Injection ($505)
1000 parts:  Injection ($5,050) < CNC ($12,000) << 3D Print ($20,000)
```

### Pro Tips

- **Combine methods**: Injection mold case + 3D print prototype inside
- **Consider post-processing**: Add finishing costs to final estimate
- **Account for material**: Titanium costs 5× steel in all methods
- **Use for ROI**: "At what volume does injection mold break even?"

---

## Tutorial 5: Smart Snap & Auto-Dimension

### Goal: Assemble parts automatically and generate drawing

**Time: 10 minutes**

### Step 1: Create Multiple Parts
1. Copilot: `bracket 100x50x5`
2. Copilot: `shaft 50mm diameter 12mm` (creates a shaft)
3. Copilot: `washer, inner 12mm, outer 25mm`
4. You now have 3 parts in the viewport, scattered

### Step 2: Enable Smart Snap
1. Smart Snap is enabled by default
2. Snap distance is 15 pixels

### Step 3: Drag Parts to Snap
1. Click and drag the washer towards the shaft
2. As you get within 15px, a snap preview appears
3. The system auto-detects: "concentric mate" (shaft through washer)
4. Release mouse → washer snaps onto shaft
5. They're now perfectly aligned

### Step 4: Snap the Bracket
1. Drag the shaft towards the bracket
2. System detects: "tangent mate" (shaft rests on bracket)
3. Release → shaft snaps into place on bracket
4. You've assembled all parts without manual positioning!

### Step 5: Auto-Generate Drawing
1. Menu: File → Generate Drawing
2. A new window opens with an engineering drawing
3. The drawing includes:
   - Three orthogonal views (Front, Top, Side)
   - Auto-placed dimensions (bolt holes, ø25, 100, etc.)
   - Title block with document info
   - Bill of Materials table (3 items)
   - ISO standard layout

### Step 6: Export Drawing
1. The drawing is shown as PNG at 200 DPI
2. Button: "Download Drawing"
3. You get a PDF-ready image that can be sent to a machine shop

### Bolt Circle Detection Example

If you create 4 holes in a circle:
```
Copilot: "gear 8 teeth"
Copilot: "gear 8 teeth" (again, 4 times)
Arrange them in a circle manually
```

Smart Snap detects: **"4 holes on Ø80 circle"**
And auto-dimensions them on the drawing.

### Tips

- **Snap distance**: Configurable, default 15px
- **Pattern detection**: Automatic, not manual
- **Drawing generation**: One-click, ISO 128 format
- **You can edit**: Download the PNG and add notes in Photoshop

---

## Tutorial 6: Version Control Visual Diff

### Goal: Track design iterations with visual comparison

**Time: 8 minutes**

### Step 1: Create Initial Design
1. Copilot: `bracket 100x50x10`
2. You have your first design

### Step 2: Save a Version
1. Bottom-left panel: Version Control
2. Click **"Save Version"**
3. The system creates a snapshot
4. You see in history: `main/a3f2c1 · 1 features`

### Step 3: Modify the Design
1. Parameter Table: Change `width = 120`
2. The bracket is now wider
3. The version control panel still shows the old version

### Step 4: Compare Two Versions
1. Click **"Show Diff"**
2. The visualization shows:
   - Modified areas: **ORANGE**
   - The wider section is highlighted
   - The diff overlay helps you see what changed

### Step 5: Create a Branch
1. Version Control dropdown: Switch to `feature/reinforced`
2. Modify design: Add fillets, increase wall thickness
3. Save as new version
4. You can now compare:
   - main/a3f2c1 (original)
   - feature/reinforced/b4g3d2 (your modification)

### Step 6: Visual Diff Examples

**Before:**
```
Original bracket:
100mm wide, 50mm tall, 5mm thick
```

**After:**
```
Modified bracket:
120mm wide, 50mm tall, 8mm thick
```

**Visual Diff:**
- Green areas: New added material
- Red areas: Removed material
- Orange areas: Modified dimensions

### Multi-Version Workflow

```
main/v1.0 (original design)
    ↓ (save)
feature/weight-opt (generative design applied)
    ↓ (compare)
main/v1.1 (approved for production)
    ↓ (branch)
feature/cad-fixups (fix issues found in testing)
    ↓ (merge)
main/v1.2 (production release)
```

### Tips

- **Save often**: Every design milestone
- **Name branches**: feature/*, bugfix/*, release/*
- **Diff is visual**: See changes instantly, no git commands
- **Restore anytime**: Click any version to load it

---

## Tutorial 7: Parametric Table

### Goal: Create a family of 10 bracket sizes with formulas

**Time: 10 minutes**

### Step 1: Create Your Base Bracket
1. Copilot: `bracket 100x50x10`
2. Press **Ctrl+T** to open Parameter Table
3. You see all parameters:
   - width: 100
   - height: 50
   - depth: 10
   - wall_thickness: 2
   - hole_diameter: 10
   - fillet_radius: 5

### Step 2: Add Formulas for Dependencies
1. Click the formula cell for `hole_diameter`
2. Enter: `=wall_thickness*5`
3. Press Enter → hole_diameter updates to 10 (2×5)
4. Click formula for `fillet_radius`
5. Enter: `=wall_thickness*2.5`
6. Press Enter → fillet_radius updates to 5 (2×2.5)

### Step 3: Create Variations
1. Change `wall_thickness` to 1 → everything recalculates
   - hole_diameter: 5
   - fillet_radius: 2.5
2. Change `wall_thickness` to 3 → everything recalculates
   - hole_diameter: 15
   - fillet_radius: 7.5
3. Geometry updates LIVE in viewport

### Step 4: Export as CSV
1. Click **"Export CSV"**
2. Download file: `parameters.csv`
3. Open in Excel or Google Sheets
4. File contents:
   ```csv
   Name,Value,Unit,Formula
   width,100,mm,
   height,50,mm,
   depth,10,mm,
   wall_thickness,3,mm,
   hole_diameter,15,mm,=wall_thickness*5
   fillet_radius,7.5,mm,=wall_thickness*2.5
   ```

### Step 5: Import and Modify
1. Edit the CSV in Excel:
   ```csv
   width,150,mm,   # Make it wider
   wall_thickness,2,mm,   # Thinner walls
   ```
2. Save as CSV
3. Back in cycleCAD: Click **"Import CSV"**
4. All parameters update, geometry rebuilds

### Step 6: Create a Family of Sizes

Create multiple copies with different parameters:

**Size S (small):**
```
width: 80, height: 40, depth: 8
wall_thickness: 1.5
Formulas calculate: hole_dia: 7.5, fillet: 3.75
```

**Size M (medium):**
```
width: 100, height: 50, depth: 10
wall_thickness: 2.0
Formulas calculate: hole_dia: 10, fillet: 5.0
```

**Size L (large):**
```
width: 150, height: 75, depth: 15
wall_thickness: 3.0
Formulas calculate: hole_dia: 15, fillet: 7.5
```

### Advanced Formula Examples

```
bolt_hole_count = =5 + (width/20)     # More holes for wider brackets
boss_height = =wall_thickness + 5      # Boss is always 5mm taller than walls
tab_width = =width * 0.3               # Tab is 30% of bracket width
```

### Tips

- **Formulas are live**: Change one value, everything updates
- **CSV roundtrip**: Export, modify, import
- **No limits**: Create 100+ parameter variations
- **Undo works**: Every change is tracked
- **Family of parts**: One spreadsheet = 10 similar parts

---

## Tutorial 8: Smart Assembly Mating

### Goal: Assemble a complete gearbox in 3 minutes

**Time: 8 minutes**

### Step 1: Create All Parts
1. Copilot: `shaft 30mm diameter 150 tall`
2. Copilot: `gear 24 teeth module 3, bore 30mm`
3. Copilot: `gear 32 teeth module 3, bore 30mm`
4. Copilot: `bearing, inner bore 30mm`
5. Copilot: `housing, cavity 80mm`
6. You have 5 parts, all in different locations

### Step 2: Position First Shaft
1. Click and drag the shaft towards the housing
2. System detects: "tangent mate" (shaft goes through housing)
3. Release → shaft snaps perfectly centered in housing

### Step 3: Add First Gear
1. Click and drag the first gear (24T) towards the shaft
2. System detects: "concentric mate" (bore aligned with shaft)
3. Release → gear snaps onto shaft, perfectly centered
4. The bore is now at the same height as the shaft axis

### Step 4: Add Bearing
1. Click and drag bearing onto the shaft
2. System detects: "concentric mate"
3. Release → bearing is on shaft, centered
4. Bearing can slide along shaft length

### Step 5: Add Second Gear
1. Click and drag 32T gear towards 24T gear
2. System detects: "tangent mate" (gears mesh)
3. Release → gears snap together at correct mesh distance
4. They're now properly engaged

### Step 6: Verify Assembly
1. All parts are now assembled correctly
2. Gears are meshed at the right distance
3. Shafts are centered
4. Everything is mechanically sound
5. No manual positioning needed!

### Mate Detection Rules

The system analyzes geometry:

```
IF both objects have high aspect ratio (cylinder-like):
  → CONCENTRIC mate (one inside the other)

ELSE IF one object is flat (aspect < 0.3):
  → TANGENT mate (flat on cylinder surface)

ELSE:
  → COINCIDENT mate (general overlap)
```

### Tips

- **Snap distance**: 20px (fairly forgiving)
- **Visual preview**: See snap point before releasing
- **Undo available**: Wrong snap? Ctrl+Z
- **Constraints are geometric**: Parts can slide along axes
- **Animation**: Snap happens with smooth easing

### Advanced: Kinematic Assembly

After assembly, you can:
1. Apply constraints (fixed points, sliding joints)
2. Animate: Rotate first shaft, second gear rotates too
3. Check interference: Do parts collide?
4. Export animation: Create assembly sequence video

---

## Tutorial 9: Manufacturing Drawings Auto-Generator

### Goal: Generate ISO 128 drawing in 10 seconds

**Time: 5 minutes**

### Step 1: Prepare Your Model
1. Create any part: `bracket 100x50x8`
2. Or use existing design

### Step 2: Generate Drawing
1. Menu: File → Generate Drawing
2. Or keyboard: (no shortcut, use menu)
3. The generator processes:
   - Analyzes geometry
   - Creates orthogonal projections
   - Places dimensions automatically
   - Adds title block
   - Creates BOM

### Step 3: Drawing Generated
1. New window opens showing PNG drawing
2. Layout is ISO 128 standard:
   - **Title block**: Bottom-right corner
   - **Three views**: Front (left), Top (right), Side (below)
   - **Dimensions**: Automatically placed
   - **Notes**: Generic manufacturing notes
   - **BOM**: List of all features

### Step 4: Customize (Optional)
1. Export as PNG
2. Open in Photoshop, Illustrator, or Inkscape
3. Add notes, change dimensions, adjust scale
4. Print to PDF for machine shop

### Step 5: Send to Manufacturing
1. You now have a complete engineering drawing
2. Send to:
   - CNC machine shop (for machining)
   - 3D print service (for printing)
   - Injection mold shop (for molding)
3. All required information is included

### Drawing Content Example

```
┌─────────────────────────────────┐
│     ORTHOGONAL PROJECTIONS      │
├─────────────────────────────────┤
│ FRONT              TOP           │
│ ┌──────────┐      ┌──────────┐  │
│ │ ø25      │      │  100     │  │
│ │ 100      │      │          │  │
│ │          │      └──────────┘  │
│ └──────────┘           50       │
│                                 │
│ SIDE                            │
│ ┌──────────┐                    │
│ │   50     │                    │
│ │          │                    │
│ │          │                    │
│ └──────────┘                    │
│       10                        │
│                                 │
│  BILL OF MATERIALS              │
│  ┌──────────────────────────┐  │
│  │ Item │ Description │ Qty │  │
│  │  1   │ Bracket     │  1  │  │
│  │  2   │ Fastener    │  4  │  │
│  └──────────────────────────┘  │
│                                 │
│         TITLE BLOCK             │
│    Document: Bracket ASM.pdf    │
│    Scale: 1:1                   │
│    Date: 3/31/2026              │
│    Rev: A                       │
└─────────────────────────────────┘
```

### Tips

- **One-click**: No configuration needed
- **Standard format**: ISO 128 (can use ANSI if needed)
- **Automatic dimensions**: You don't place them manually
- **BOM is live**: Changes in model → BOM updates
- **PDF export**: Download for archival

---

## Tutorial 10: Digital Twin Live Data

### Goal: Monitor a rotating shaft with live sensor data

**Time: 10 minutes**

### Step 1: Create Your Model
1. Copilot: `shaft 50mm diameter 200 tall`
2. A realistic industrial shaft appears

### Step 2: Enable Digital Twin
1. Menu: View → Digital Twin
2. Or check right sidebar
3. HUD appears showing:
   - Temperature: [████████░░] 55.2°C
   - Vibration: [██████░░░░] 0.42 mm/s
   - Wear: [███░░░░░░] 18%

### Step 3: Watch Real-time Updates
1. Colors change based on temperature:
   - **Blue** (45–50°C): Normal operating
   - **Yellow** (50–70°C): Elevated, monitor closely
   - **Red** (70°C+): Critical, reduce load
2. Vibration causes subtle scale animation
3. Wear percentage increases slowly over time

### Step 4: Interpret the Data
1. **Temperature 62°C**: Bearing running warm but safe
2. **Vibration 0.58 mm/s**: Slightly high, check balance
3. **Wear 23%**: No immediate service needed, schedule preventive maintenance in 3 months

### Step 5: Simulate Degradation
1. The system simulates sensor data every 100ms
2. Watch wear increase over "time"
3. When wear hits 80%, status shows: "⚠ CRITICAL"
4. When temperature hits 75°C, status shows: "🔴 OVERHEAT"

### Step 6: Predictive Maintenance
1. Track the trends over time
2. Extract historical data to CSV
3. Use to predict failure:
   - Linear extrapolation: "Wear will reach 100% in 47 days"
   - Exponential model: "Failure likely in 2 weeks"
4. Schedule maintenance before failure

### Sensor Data Format

```javascript
{
  "timestamp": "2026-03-31T12:34:56.000Z",
  "temperature": 62.3,        // Celsius
  "vibration": 0.58,          // mm/s
  "wear": 23.5                // Percentage (0–100%)
}
```

### Real-World Connection

To connect real sensors:

1. **IoT Device**: Sends WebSocket messages to your cycleCAD instance
2. **Format**: JSON with temp, vibration, wear
3. **Frequency**: 100–1000ms updates
4. **Protocol**: WebSocket wss:// for secure

### Tips

- **Simulation mode**: Test with simulated data (default)
- **Real sensors**: Connect via WebSocket
- **Color feedback**: Instant visual status
- **Export data**: Download CSV for analysis
- **Predictive**: Use wear trends to schedule maintenance

### Advanced: Multi-Sensor Array

Monitor multiple bearings:
1. Shaft has 4 bearings
2. Each bearing has its own sensor
3. Dashboard shows all 4 simultaneously
4. Identifies which bearing is failing
5. Guides technician to fix the right one

---

## Quick Reference Cheat Sheet

### Keyboard Shortcuts

```
Ctrl+K / Cmd+K       AI Copilot Chat
Ctrl+P / Cmd+P       Physics Simulation
Ctrl+G / Cmd+G       Generative Design
Ctrl+C / Cmd+C       Cost Estimator (show)
Ctrl+T / Cmd+T       Parameter Table
Ctrl+Z / Cmd+Z       Undo
Ctrl+Y / Cmd+Y       Redo
Ctrl+S / Cmd+S       Save
```

### Feature Quick Start

| Feature | Open | Action |
|---------|------|--------|
| AI Copilot | Ctrl+K | Type command → Enter |
| Physics | Ctrl+P | Watch gravity simulation |
| Generative | Ctrl+G | Set budget → Generate |
| Cost | Ctrl+C | View live cost update |
| Parameters | Ctrl+T | Edit → Geometry rebuilds |
| Drawings | Menu | Click Generate → Download |
| Digital Twin | View menu | Watch live sensor data |

---

## Next Steps

1. **Complete all tutorials** (60 minutes total)
2. **Experiment with combinations** (AI Copilot + Generative Design)
3. **Join the community** (share your designs on GitHub)
4. **Contribute features** (fork the repo, add improvements)
5. **Build something amazing** (design a mechanical part from scratch)

---

**Happy designing!** 🚀
