# cycleCAD Killer Features Tutorial — 30 Comprehensive Lessons

Master cycleCAD's 6 revolutionary killer features that set it apart from Fusion 360, OnShape, and SolidWorks.
These 30 tutorials take you from beginner to expert, with realistic mechanical engineering workflows.

**What you'll learn:**
- AI Design Copilot (Text-to-CAD + Photo-to-CAD)
- Smart Parts Library (50,000+ standard parts + suppliers)
- Instant Manufacturability Feedback (DFM for all processes)
- Real-Time Cost Estimation (CNC, FDM, SLS, Injection, Forging)
- Real-Time FEA (Stress, Thermal, Modal, Impact)
- Generative Design (Topology Optimization)

**Tutorial breakdown:**
- **Beginner (1-10)**: Core workflows, first 5-15 minutes each
- **Intermediate (11-20)**: Advanced design, 15-25 minutes each
- **Advanced (21-30)**: Professional production workflows, 25-60 minutes each

---

---

## BEGINNER TUTORIALS (1-10)

## Tutorial 1: Your First Text-to-CAD Part

**Level:** Beginner | **Time:** 8 min | **Module:** AI Design Copilot
**Objective:** Create a 3D part by typing natural language, see it materialize in real-time, commit it to model

**Time: 8 minutes**

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

---

# EXTENDED 30-TUTORIAL SERIES (2026 Edition)

This section provides comprehensive step-by-step lessons for all 6 killer feature modules, organized from beginner to advanced.

---

## TUTORIAL 2: Exploring the Smart Parts Library

**Level:** Beginner | **Time:** 10 min | **Module:** Smart Parts Library
**What you'll learn:** Browse 50,000+ standard parts, search for fasteners, and insert them into your assembly.

### Steps

**Step 1: Open the Smart Parts Panel**
1. In the left panel, find the **"Smart Parts"** tab (wrench icon)
2. Click it — you see a category browser with:
   - Fasteners (ISO 4762, DIN 912, bolts, nuts, screws)
   - Bearings (deep groove ball, angular contact, pillow blocks)
   - Motors (DC, stepper, servo)
   - Springs (compression, extension, torsion)
   - Linear Components (rails, carriages, ball screws)
   - Hydraulics (cylinders, valves, pumps)

**Step 2: Browse Fasteners**
1. Click **"Fasteners"** → See subcategories
2. Click **"Bolts (ISO 4762, DIN 912)"**
3. A list shows 100+ bolt options with:
   - Supplier (McMaster, MISUMI, RS Components)
   - Part number (ISO standard or vendor part #)
   - Size (M6, M8, M10, etc.)
   - Price ($0.25–$0.85)
   - Stock status (✓ In Stock, ✗ 4 weeks)

**Step 3: Search for Specific Hardware**
1. In the search box, type: `M8 socket head cap screw`
2. Press Enter — results show 5–10 matching parts
3. Click the first: **ISO 4762 M8x20 Socket Head Cap Screw**
4. A 3D preview appears on the right showing the bolt with:
   - Hexagonal head (ISO standard)
   - Threads (M8 = 8mm diameter, 1.25mm pitch)
   - Length markings (20mm total length)

**Step 4: Insert the Screw**
1. Click **"Insert"** button
2. Dialog: "Insert at origin? Yes / No"
3. Click **"Yes"**
4. The screw appears in your 3D viewport at (0,0,0)
5. In the feature tree: "McMaster M8x20 SHCS" is added
6. Status bar: "1 library part, supplier: McMaster, price: $0.48"

**Expected Result:**
- A realistic 3D socket head cap screw inserted into your model
- Parametrically linked to McMaster supplier data
- Part number, price, and stock info visible in properties

**What to Try Next:**
- Insert an M8 nut (ISO 4035)
- Insert a 10mm shaft (search "10mm steel round shaft")
- Insert a sealed bearing (search "6203 2RS bearing")
- Search by description: "something to hold a 10mm shaft" (returns bearing options)

---

## TUTORIAL 3: Check if Your Part Can Be 3D Printed

**Level:** Beginner | **Time:** 12 min | **Module:** DFM Analysis (FDM 3D Printing)
**What you'll learn:** Run Design for Manufacturability analysis and understand what changes make parts printable.

### Steps

**Step 1: Create a Simple Test Part**
1. Use AI Copilot: `box length 60mm width 40mm height 50mm`
2. Commit it — you have a rectangular box

**Step 2: Open DFM Analysis**
1. Right panel, find **"Analyze"** tab (chart icon)
2. Click **"DFM - Design for Manufacturing"**
3. A dialog: "Select Manufacturing Process"
4. Check only **FDM** (Fused Deposition Modeling — most common 3D printing)
5. Click **"Analyze"**

**Step 3: Review Results**
1. Analysis runs (2-3 seconds)
2. Report shows:
   ```
   ✓ PASSED:
   - Wall thickness: 5-10mm (optimal for FDM)
   - No undercuts (no overhangs)
   - Size: 60x40x50mm (fits standard bed)

   ⚠ WARNINGS:
   - Sharp corners: 8 instances (need fillets for strength)
   - Unsupported spans: None

   ✗ CRITICAL ISSUES:
   - None
   ```

**Step 4: Fix Issues**
1. Press `F` to activate Fillet tool
2. Select all 4 top edges
3. Set radius to 3mm
4. Apply fillet
5. The corners are now rounded

**Step 5: Re-analyze**
1. Open DFM again for FDM
2. New report shows: **All checks PASSED ✓**
3. Estimates: Print time 45 min, Material 120g ABS, Cost $3.50

**Expected Result:**
- Colored report showing FDM-friendly features
- Red highlights on problematic geometry
- Printability score increased from 75% → 100%
- Specific recommendations (add fillets, increase thickness)

---

## TUTORIAL 4: Search for Parts by Description

**Level:** Beginner | **Time:** 10 min | **Module:** Smart Parts AI Search
**What you'll learn:** Use natural language to find exactly the part you need.

### Steps

**Step 1: Open Smart Parts Search**
1. Click **"Smart Parts"** tab, look for search box at top
2. It says "Search 50,000+ parts..."

**Step 2: Search Using English**
1. Type: `something to hold a 10mm shaft`
2. Press Enter
3. Results show bearing options:
   - Deep groove ball bearing 6200 (10mm bore)
   - Angular contact bearing 7200 (10mm bore)
   - Pillow block bearing UCFB200

**Step 3: Review Results**
1. Each result shows:
   - **Part Name:** Deep groove ball bearing 6200
   - **Specs:** ID 10mm, OD 30mm, Width 9mm
   - **Suppliers:** McMaster ($4.20), MISUMI ($3.85), RS ($5.10)
   - **Stock:** Availability for each supplier
   - **Rating:** ⭐⭐⭐⭐⭐ (user reviews)

**Step 4: Compare Suppliers**
1. Click the 6200 bearing
2. A supplier comparison panel shows prices
3. **MISUMI is cheapest** ($3.85) — select it
4. Click **"Insert"**

**Step 5: Try Different Searches**
1. `motor 50mm shaft 24V` (returns DC motors)
2. `linear rail with bearing` (returns THK, MISUMI rails)
3. `ball screw` (returns various ball screw options)

**Expected Result:**
- Natural language searches return intelligent results
- Multiple suppliers compared by price and stock
- Real product names with ISO/DIN standards
- Ready to insert into your assembly

---

## TUTORIAL 5: Build a Bracket Step by Step

**Level:** Beginner | **Time:** 15 min | **Module:** AI Copilot Multi-Step
**What you'll learn:** Create complex parts using iterative text-to-CAD commands.

### Steps

**Step 1: Create L-Bracket Base**
1. AI Copilot: `L-bracket 80mm long 50mm tall 4mm thick aluminum`
2. Press Enter
3. Gray L-shaped profile appears
4. AI asks: "Extrude depth?" → Press Enter for 40mm
5. 3D L-bracket appears
6. Click **"Commit"**

**Step 2: Add Two Mounting Holes**
1. Type: `add 2 mounting holes diameter 6mm on the vertical face`
2. Press Enter
3. Dialog: "Position: [Top and bottom] [Custom]"
4. Choose **"Top and bottom"**
5. Two holes appear in preview on vertical face
6. Click **"Commit"**

**Step 3: Fillet Outer Edges**
1. Type: `fillet all outer edges radius 3mm`
2. Press Enter
3. All 8 outer edges round smoothly
4. Feature tree shows 3 operations so far
5. Click **"Commit"**

**Step 4: Add Reinforcement Boss**
1. Type: `add boss inside corner radius 8mm height 6mm`
2. Press Enter
3. Small cylindrical boss appears in corner
4. This reinforces against stress
5. Click **"Commit"**

**Expected Result:**
- Realistic mechanical bracket with holes, fillets, boss
- 4 committed features in feature tree
- Fully parametric (edit any dimension anytime)
- Ready for manufacturing or stress analysis

---

## TUTORIAL 6: Compare Manufacturing Costs

**Level:** Beginner | **Time:** 12 min | **Module:** Cost Estimator
**What you'll learn:** Analyze costs across 5 processes and choose the best.

### Steps

**Step 1: Create a Test Part**
1. AI Copilot: `cylindrical housing bore 25mm outer 50mm height 30mm aluminum`
2. Commit it

**Step 2: Open Cost Estimator**
1. Right panel, **"Analyze"** tab
2. Click **"Cost Estimator"**
3. Options appear:
   - Quantity: [1] [10] [100] [1000] [10000]
   - Processes: [CNC] [FDM] [SLS] [Injection] [Forging]

**Step 3: Run Estimation**
1. Select quantity: **1 (prototype)**
2. Check all 5 processes
3. Click **"Estimate"**
4. Wait 3-4 seconds

**Step 4: Review Cost Table**
```
Process         Setup   Material  Labor   Tooling  Unit Cost  Time
─────────────────────────────────────────────────────────────────
CNC             $0      $2.40     $25     $0       $27.40     45min
FDM             $0      $0.85     $2.50   $0       $3.35      90min
SLS             $0      $4.20     $3.80   $0       $8.00      120min
Injection       $2,500  $0.15     $0.50   $3,500   $0.65      2wks
Forging         $1,200  $0.80     $5.00   $2,000   $7.80      3wks
```

**Step 5: View Volume Curve**
1. Click **"Show Volume Curve"** (graph showing cost vs. quantity)
2. At 1 unit: FDM cheapest
3. At 100 units: CNC becomes cheaper
4. At 1000 units: Injection molding lowest per-unit cost
5. Choose method based on expected production volume

**Step 6: Export Report**
1. Click **"Export as PDF"**
2. PDF shows full cost breakdown, geometry images, recommendations
3. Download: `part_cost_analysis.pdf`

**Expected Result:**
- Detailed cost comparison across all manufacturing methods
- Graph showing optimal process for your volume
- Per-unit and total costs
- Recommendations for your quantity

---

## TUTORIAL 7: Run Your First Stress Analysis

**Level:** Beginner | **Time:** 15 min | **Module:** FEA Stress Analysis
**What you'll learn:** Apply loads, set supports, and visualize stress distribution.

### Steps

**Step 1: Create a Cantilever Beam**
1. AI Copilot: `rectangular beam length 200mm height 20mm width 10mm aluminum 6061`
2. Commit it — you have a long, thin aluminum beam

**Step 2: Open Simulation Panel**
1. Right panel, **"Analyze"** tab
2. Click **"Stress Analysis"**
3. A new panel: "Finite Element Analysis Setup"

**Step 3: Apply Fixed Support**
1. Under "Supports", click **"Add Fixed Support"**
2. In 3D view, click the **left end face** of beam
3. The face highlights cyan (fixed)
4. Status: "Fixed support at left end"

**Step 4: Apply Downward Load**
1. Under "Loads", click **"Add Concentrated Force"**
2. In 3D view, click the **right end face**
3. Dialog: "Magnitude (N)?" → type `100` (about 10 kg-force)
4. Direction: **"Downward (−Y)"**
5. An arrow appears showing load direction
6. Press Enter

**Step 5: Generate Mesh**
1. Under "Mesh", see "Element size: 2mm"
2. Click **"Generate Mesh"**
3. Wait 2-3 seconds
4. 3D beam now shows wireframe mesh
5. Status: "8,432 nodes, 21,204 elements"

**Step 6: Solve**
1. Click **"Solve"** (blue button)
2. Progress: "Assembling stiffness matrix... Solving equations..."
3. Wait 5-10 seconds

**Step 7: Review Results**
1. Color map appears on beam:
   - **Blue:** Low stress (~5 MPa, near fixed end)
   - **Green:** Medium stress (~50 MPa, middle)
   - **Red:** High stress (~150 MPa, free end)
2. Legend shows: Max stress 156 MPa
3. **Safety Factor:** 276 ÷ 156 = **1.77** (Safe! Aluminum won't break)

**Step 8: Check Deformation**
1. Click **"Deformation"** tab (top of panel)
2. Beam shows exaggerated sag: 5.2mm downward at free end
3. Color shows magnitude of movement
4. This is realistic for 100N load on aluminum

**Expected Result:**
- Color-coded stress visualization
- Maximum stress: ~156 MPa
- Maximum deformation: ~5.2mm
- Safety factor: 1.77 (very safe)
- All results quantified and easy to interpret

---

## TUTORIAL 8: Photo-to-CAD: Digitize a Simple Part

**Level:** Beginner | **Time:** 15 min | **Module:** Photo-to-CAD Reverse Engineering
**What you'll learn:** Take a photo and reconstruct a 3D parametric model from it.

### Steps

**Step 1: Prepare a Photo**
1. You need a photo of a simple object (bearing, ball, washer, bracket)
2. Requirements:
   - Good lighting (natural daylight)
   - White/neutral background
   - Clear edges (not blurry)
   - 45° angle view (not straight-on)
3. Save as `bearing.jpg` or similar

**Step 2: Open Photo-to-CAD**
1. Menu: Tools → **"Photo-to-CAD"**
2. Right panel: "Photo-to-CAD Reverse Engineering"

**Step 3: Upload Photo**
1. Click **"Select Image"** or drag-and-drop `bearing.jpg`
2. Photo preview appears
3. Options:
   - **Scale reference?** [No] [Yes, I have a ruler]
   - **Object type?** [Auto-detect] [Cylinder] [Sphere] [Box]
4. Select: Scale = **"No"**, Type = **"Cylinder"** (because bearing is round)
5. Click **"Analyze Image"**

**Step 4: AI Analysis (5-10 seconds)**
1. cycleCAD sends photo to Gemini Vision
2. Status: "Detecting edges... Analyzing geometry..."
3. A 3D wireframe model appears in viewport!

**Step 5: Review Detected Features**
1. AI reconstructed a bearing with:
   - Outer diameter: ~30mm (estimated)
   - Inner bore: ~10mm (estimated)
   - Width: ~9mm (estimated)
2. Panel shows: "Detected features"
   - **Outer race:** 95% confidence
   - **Inner race:** 87% confidence
   - **Width:** 79% confidence

**Step 6: Refine and Commit**
1. Edit dimensions if needed (or keep AI estimates — 90% accurate)
2. Click **"Commit"**
3. The photo-reconstructed bearing becomes a parametric CAD feature
4. Added to feature tree as: "Photo-to-CAD Bearing"

**Expected Result:**
- 3D CAD model generated from single photo
- Realistic bearing with bore and width
- Dimensions estimated within 5-10% accuracy
- Fully parametric and ready for assembly

---

## TUTORIAL 9: Insert Standard Hardware

**Level:** Beginner | **Time:** 12 min | **Module:** Smart Parts + Assembly
**What you'll learn:** Build a simple assembly with bolts, nuts, washers, and bearings.

### Steps

**Step 1: Create Base Plate**
1. AI Copilot: `plate length 120mm width 80mm thickness 8mm steel`
2. Commit it

**Step 2: Insert 4 Bolts**
1. Smart Parts → Search: `M8x30 socket head cap screw`
2. Insert at top-left corner
3. Repeat for top-right, bottom-left, bottom-right
4. 4 bolts now stand upright on plate corners

**Step 3: Insert 4 Washers**
1. Search: `M8 flat washer ISO 7089`
2. Insert washer 1 under bolt head #1
3. Repeat for bolts 2, 3, 4
4. Washers auto-position under bolt heads

**Step 4: Insert 4 Nuts**
1. Flip 3D view to see bottom of plate (Shift+Space)
2. Search: `M8 hex nut ISO 4035`
3. Insert nut 1 on bolt thread, under plate
4. Repeat for nuts 2, 3, 4
5. Nuts auto-thread onto bolts

**Step 5: Insert Center Bearing**
1. Flip back to top view
2. Search: `6008 deep groove ball bearing`
3. Insert at center of plate
4. Bearing sits on plate surface

**Step 6: Generate BOM**
1. Right-click assembly in feature tree
2. Select **"Generate BOM"**
3. Table appears:

| Part | Description | Qty | Supplier | Price | Total |
|------|---|---|---|---|---|
| 1 | Steel Plate | 1 | — | — | — |
| 2 | M8x30 SHCS | 4 | McMaster | $0.48 | $1.92 |
| 3 | M8 Washer | 4 | McMaster | $0.08 | $0.32 |
| 4 | M8 Nut | 4 | McMaster | $0.12 | $0.48 |
| 5 | 6008 Bearing | 1 | NSK | $6.25 | $6.25 |
| | **TOTAL** | | | | **$10.97** |

**Expected Result:**
- Complete assembly with 9 parts (1 custom + 8 standard)
- All parts correctly positioned and mated
- Professional BOM with supplier info and pricing

---

## TUTORIAL 10: Generate a Bill of Materials

**Level:** Beginner | **Time:** 10 min | **Module:** BOM Generator
**What you'll learn:** Create formal BOM from assembly, export to PDF and Excel.

### Steps

**Step 1: Use Assembly from Tutorial 9**
1. You have: plate + 4 bolts + 4 washers + 4 nuts + bearing

**Step 2: Generate BOM**
1. Right-click assembly in feature tree
2. Select **"Generate BOM"**

**Step 3: Configure Options**
1. Dialog: "BOM Generation Settings"
2. Options:
   - [✓] Include custom parts (steel plate)
   - [✓] Include library parts (fasteners)
   - [✓] Group identical parts (4 bolts → Qty 4)
   - [✓] Include supplier info
   - [✓] Calculate costs
3. Click **"Generate"**

**Step 4: Review BOM**
1. Right panel shows detailed table with:
   - Part number
   - Description
   - Quantity
   - Supplier and part #
   - Unit cost and total cost
2. At bottom: "ASSEMBLY TOTAL: $10.97"

**Step 5: Add Notes**
1. In Notes field, type:
   ```
   Initial assembly with standard hardware.
   All fasteners stainless steel A2-70.
   Bearing requires grease lubrication.
   ```
2. Click **"Update"**

**Step 6: Export to PDF**
1. Click **"Export as PDF"**
2. File: `Assembly_BOM_Rev_A.pdf`
3. Contains:
   - 3D isometric image
   - Full BOM table
   - Notes and revision history
   - Date and timestamp

**Step 7: Export to Excel**
1. Click **"Export as Excel"**
2. File: `Assembly_BOM.xlsx`
3. Sheets:
   - **BOM:** Editable parts list
   - **Summary:** Total cost, weight, part count
   - **Suppliers:** Grouped by supplier
   - **Notes:** Assembly notes and history

**Expected Result:**
- Professional BOM with all required information
- PDF for sharing with vendors
- Excel for procurement and cost tracking
- Complete assembly documentation

---

## Summary: Beginner Tutorials Complete

After completing tutorials 1-10, you should be able to:
1. Create parts using natural language (Text-to-CAD)
2. Search and insert 50,000+ standard parts
3. Verify parts are 3D-printable (DFM analysis)
4. Estimate manufacturing costs in seconds
5. Run stress analysis on parts
6. Reconstruct parts from photos
7. Build assemblies with standard hardware
8. Generate professional BOMs in PDF and Excel

**Next:** Continue to Intermediate Tutorials (11-20) for advanced workflows.

---

## INTERMEDIATE TUTORIALS (11-20)

## Tutorial 11: Complex Text-to-CAD: Flanged Bearing Housing

**Level:** Intermediate | **Time:** 20 min | **Module:** AI Copilot Multi-Step Complex
**Objective:** Create realistic bearing housing with flange, boss, mounting holes, and lubrication grooves.

### Key Commands
```javascript
"create housing bore 25mm outer 65mm height 40mm aluminum"
"add flange at bottom diameter 90mm thickness 6mm"
"add 4 mounting holes on flange diameter 10mm on 70mm circle"
"add oil groove on side width 4mm depth 2mm"
"add boss inside bore height 3mm for seal"
```

### What You'll Learn
- Chain multiple AI commands sequentially
- Reference existing geometry (e.g., "holes on existing flange")
- Create realistic mechanical features (grooves, bosses, flanges)
- Parametric relationships between features (groove width = material thickness)

### Workflow
1. Create base housing cylinder
2. Add flange for mounting
3. Add 4 hole bolt pattern on flange (automatically spaced)
4. Add oil groove for lubrication passages
5. Add seal boss inside bore
6. Run DFM analysis to verify machinable
7. Export as STEP

### Expected Result
- Realistic bearing housing that could be machined from aluminum
- All features properly parametrized
- DFM check passed (CNC-friendly)
- Ready for assembly with real bearings

---

## Tutorial 12: Optimize a Bracket with Generative Design

**Level:** Intermediate | **Time:** 25 min | **Module:** Generative Design (Topology Optimization)
**Objective:** Run AI optimization to minimize weight while maintaining strength.

### Workflow
1. **Create initial bracket** (over-designed, solid)
2. **Define fixed region** (cannot be touched by optimizer)
3. **Define free region** (can be optimized)
4. **Apply load cases:**
   - 100N downward at tip
   - Identify critical areas that will fail first
5. **Run optimization:**
   - Target: 50% weight reduction
   - Constraint: Safety factor > 2.0
6. **Review candidates:**
   - AI generates 5 design options
   - Each shows different strut patterns
7. **Select best option** and refine

### Why This Works
- Topology optimization finds optimal material distribution
- Results look "organic" but are mathematically efficient
- Perfect for aerospace, automotive, weight-critical applications
- 50% lighter parts with same strength

### Expected Result
- Lattice-structure bracket with 50% less material
- All candidates have identical safety factor (> 2.0)
- Weight reduced from 500g → 250g
- Topology looks artistic but is mechanically sound

---

## Tutorial 13: Thermal Analysis of a Heat Sink

**Level:** Intermediate | **Time:** 20 min | **Module:** Thermal FEA
**Objective:** Model a finned heat sink and simulate temperature distribution under steady-state heat generation.

### Setup
1. **Create housing** with aluminum fins
2. **Apply heat source:** 100W internal (typical CPU)
3. **Set convection boundary:** Air cooling at 25°C, h=10 W/m²K
4. **Run steady-state thermal** analysis (heat spreads through fins)

### What You'll Learn
- Heat sources (wattage input)
- Boundary conditions (convection, insulation)
- Temperature gradients (hot spots indicate poor cooling)
- Optimization (taller/more numerous fins = lower temperature)

### Results Visualization
- **Blue zones** (~35°C): Well-cooled areas, good fin contact
- **Green zones** (~45°C): Moderate temperature
- **Yellow zones** (~55°C): Warm, acceptable for most electronics
- **Red zones** (~75°C+): Too hot, risk of component failure

### Optimization Tips
- Increase fin height → temperature drops
- Increase fin spacing → more surface area
- Change material to copper → better heat conductivity
- Target: Keep hot spot < 65°C for reliability

---

## Tutorial 14: DFM for Injection Molding

**Level:** Intermediate | **Time:** 18 min | **Module:** DFM Analysis (Injection Molding)
**Objective:** Check if housing design can be injection molded. Identify undercuts, draft angles, and gating points.

### DFM Checks for Injection Molding
1. **Draft angles** (1–3° minimum for mold release)
   - Check if all side faces slope away from parting line
   - Steep surfaces lock in mold and prevent ejection
2. **Wall thickness** (uniform 1–4mm optimal)
   - Thin walls (<1mm) cause incomplete fill
   - Thick walls (>6mm) cause cooling marks, shrinkage
3. **Undercuts** (features that trap in mold)
   - Boss with overhang = undercut = needs slider in mold
   - Threads without relief = undercut = complex mold
4. **Sharp corners** (need rounding for mold tooling)
   - Minimum 0.5mm radius for tool-finish
5. **Parting line** (where mold splits)
   - Must be straight, visible geometry
   - Placement affects undercuts and part quality

### Workflow in cycleCAD
1. Create part (housing with boss, threads)
2. Run DFM for **Injection Molding**
3. Report shows:
   - ✓ Draft angles: All OK (2°+ on all side faces)
   - ⚠ Undercuts detected: 2 instances (threaded holes)
   - ⚠ Recommendation: Add relief grooves or use slides
4. Modify design to eliminate undercuts
5. Re-run DFM: All checks PASSED
6. Cost estimate shows: $2,500 tooling (simple mold)

### Cost Impact
- Simple part (no undercuts): $2,500 tooling
- Complex part (3–4 sliders): $5,000–8,000 tooling
- Very complex: $15,000+ (not recommended)

---

## Tutorial 15: Photo-to-CAD with Scale Reference

**Level:** Intermediate | **Time:** 18 min | **Module:** Photo-to-CAD with Scale Calibration
**Objective:** Take a photo with a ruler visible, reconstruct accurate 3D model with correct dimensions.

### Why Scale Reference Matters
- Without scale: AI guesses dimensions (5–10% error)
- With scale: AI measures against reference object (< 1% error)

### Preparation
1. Take photo of your object next to a **metric ruler** (or coin)
2. Ruler must be visible and flat in photo
3. Good lighting, 45° angle view
4. Save as `object_with_ruler.jpg`

### Steps in cycleCAD
1. Open Photo-to-CAD
2. Upload photo
3. Select: Scale reference? **"Yes, I have a ruler"**
4. Dialog: "Identify the scale reference in the photo"
5. Click on the ruler in the image (or coin if using that)
6. The system identifies the ruler length (15cm = 150mm)
7. All AI measurements are now calibrated to actual size
8. Click **"Analyze Image"**
9. Reconstructed model has **correct dimensions** ±1%

### Example Workflow
- Photo of custom bracket with ruler
- AI reconstructs: 85.2mm × 51.8mm × 9.6mm (measured from photo)
- Ruler calibration verifies accuracy
- Export as parametric CAD model
- Use immediately for manufacturing

---

## Tutorial 16: Modal Analysis: Find Resonance Frequencies

**Level:** Intermediate | **Time:** 20 min | **Module:** Modal FEA Analysis
**Objective:** Run vibration analysis to find natural frequencies where parts resonate.

### Why Modal Analysis Matters
- Machine operates at specific speeds (RPM)
- If machine speed matches part's natural frequency = RESONANCE
- Resonance causes vibration, noise, fatigue, failure
- Goal: Keep natural frequency far from operating speed

### Example
- Rotating shaft: 3000 RPM = 50 Hz
- If part's first natural frequency = 48 Hz
- PROBLEM: Shaft spins near resonance → huge vibration
- Solution: Increase part stiffness (thicker wall, ribs) → shift frequency to 70+ Hz

### Workflow
1. **Create cantilever beam** (typical vibration test case)
2. **Open Simulation** → **Modal Analysis**
3. **Set parameters:**
   - Number of modes: 5 (find first 5 natural frequencies)
   - Material: Aluminum 6061
4. **Solve** (calculates eigenvalues)
5. **Results show:** Frequencies [Hz] and mode shapes
   - Mode 1 (fundamental): 23.4 Hz
   - Mode 2: 62.1 Hz
   - Mode 3: 142.8 Hz
   - Mode 4: 248.5 Hz
   - Mode 5: 395.2 Hz

### Visualization
- **Mode shape** shows how part deforms at each frequency
- Mode 1 at 23.4 Hz: Beam bends like a sine wave
- Mode 2 at 62.1 Hz: Beam bends with 2 peaks
- Higher modes: More complex bending patterns

### For a Rotating Shaft at 3000 RPM (50 Hz)
- Mode 1 (23 Hz): OK, not close
- Mode 2 (62 Hz): **CAUTION**, only 2.4× the running speed
- Operating at 50 Hz might cause vibration amplification
- **Solution**: Increase stiffness to shift Mode 2 to 100+ Hz

---

## Tutorial 17: Smart Parts: Build a Linear Motion Assembly

**Level:** Intermediate | **Time:** 22 min | **Module:** Smart Parts + Kinematics
**Objective:** Assemble complete linear motion system: rail + carriage + ball screw + motor.

### Components You'll Insert
1. **Linear Rail** (THK LHHS20) — Precision track, 300mm length
2. **Carriage** (THK EBL20) — Slides smoothly on rail
3. **Ball Screw** (THK BSSD2010) — Converts rotation to linear motion
4. **Motor** (NEMA23 stepper) — Drives the screw
5. **Couplings** (flexible, to connect motor to screw)
6. **End supports** (custom, aluminum)

### Assembly Sequence
1. **Search and insert rail** (`THK linear rail LHHS20`)
   - Inserts 300mm rail at origin
2. **Insert carriage** (`THK carriage EBL20`)
   - Auto-positions on the rail
3. **Insert ball screw** (`THK ball screw BSSD2010`)
   - Auto-aligns parallel to rail
4. **Insert motor** (search `NEMA23 stepper motor`)
   - Positions next to screw end
5. **Insert couplings** (search `flexible coupling 8mm`)
   - Connects motor shaft to ball screw
6. **Create custom aluminum supports** to hold everything

### Verification in cycleCAD
1. **Motion simulation**: Rotate motor → carriage slides smoothly
2. **Collision check**: All parts clear, no interference
3. **Range check**: Carriage travels full 300mm without hitting end stops
4. **Electrical spec**: Motor rated for linear system (2 Nm torque = sufficient)

### Export
- Export assembly as STEP file
- Send to machine shop for fabrication of aluminum supports
- BOM shows exact motor, rail, screw, coupling part numbers
- Ready for procurement

---

## Tutorial 18: Cost Optimization Workflow

**Level:** Intermediate | **Time:** 25 min | **Module:** Cost Estimator + Design Iteration
**Objective:** Design a part, check costs for 5 processes, modify design, iterate until target cost is met.

### Iterative Workflow
1. **Initial design** → Cost estimate
2. **Identify cost driver** (e.g., "CNC labor is expensive")
3. **Modify design** to reduce cost
4. **Re-estimate** and compare
5. **Repeat until** target cost achieved

### Example: Optimizing a Bracket for Cost

**Iteration 1: Initial design (aluminum, 100x50x5mm)**
```
Process        Unit Cost    Total (100 qty)    Lead Time
─────────────────────────────────────────────────────
CNC            $28         $2,800             2 weeks
3D Print       $3.50       $350               3 days
Injection      $0.75       $75 + $5K tooling  4 weeks
Decision: For 100 units, Injection wins at $75/unit
```

**Iteration 2: Simplify for injection molding**
- Remove complex internal geometry
- Increase wall thickness from 2mm to 3mm (more robust)
- Add draft angles for mold release
- New cost: $0.65/unit + $4,500 tooling = $4,565 total (better!)

**Iteration 3: Further optimization**
- Reduce overall size by 10% (now 90x45x4.5mm)
- Material: Change from aluminum to PP plastic (injection-moldable)
- Mold tooling reduced to $3,500 (simpler mold, smaller)
- New cost: $0.42/unit + $3,500 tooling = $3,700 total (even better!)

**Final Decision**
- 100 units via plastic injection molding: $3,700 total, $37/unit
- Better than CNC at $2,800 total, $28/unit
- BUT: Plastic is lighter, adequate for application
- Win: 32% cost savings, material reduced by weight

### Workflow in cycleCAD
1. Create part (aluminum)
2. Cost estimate → shows CNC is $28/unit
3. Run DFM for injection molding → shows $4,500 tooling
4. Modify design (remove features, simplify)
5. Re-cost → $4,200 tooling
6. Modify material to plastic
7. Re-cost → $3,500 tooling + $0.42/unit
8. Compare all versions side-by-side
9. Choose plastic injection molding
10. Export final design for mold maker

---

## Tutorial 19: Drop Test a Phone Case

**Level:** Intermediate | **Time:** 20 min | **Module:** Impact FEA Simulation
**Objective:** Model phone case, apply 1.5m drop impact load, verify it survives.

### Real-World Scenario
- Consumer phone case
- Must survive accidental 1.5m drop onto concrete
- Internal phone must not be damaged
- Case can deform but must not crack

### cycleCAD Analysis Workflow
1. **Create phone case model**
   - Outer shell: TPU/silicone, 2mm thick
   - Internal padding: Foam, 5mm thick
   - Phone inside: Rigid, no deformation
2. **Setup impact simulation:**
   - Drop height: 1.5m (velocity at impact ≈ 5.4 m/s)
   - Impact surface: Concrete (hard, no deformation)
   - Gravity: 9.81 m/s²
3. **Calculate impact force:**
   - Energy: mgh = 0.5 kg × 9.81 × 1.5 = 7.36 Joules
   - Impact time: ~0.1 seconds (contact deformation)
   - Force: F = 2mgh/t² ≈ 1,470 N (roughly 150 kg-force)
4. **Run transient impact analysis**
   - Solve for stress over 0.5 seconds
   - Visualize deformation and stress
5. **Check results:**
   - Outer shell stress: 45 MPa (TPU yield ≈ 30 MPa)
   - **PROBLEM**: Stress exceeds TPU yield → cracking risk!
   - Foam compression: 80% (absorbs impact energy well)

**First attempt: FAILS**

### Optimization: Make Case Thicker
1. Increase outer shell to 3mm (was 2mm)
2. Increase foam to 8mm
3. Re-run impact analysis
4. New results:
   - Outer shell stress: 28 MPa (below 30 MPa yield)
   - Foam compression: 70%
   - Phone inside: Safe (no stress transferred to rigid phone)

**Second attempt: PASSES ✓**

### Expected Result
- Optimized case design that survives 1.5m drop
- Design validated via FEA
- Ready for manufacturing

---

## Tutorial 20: Multi-Step Text-to-CAD: Gear Train

**Level:** Intermediate | **Time:** 20 min | **Module:** AI Copilot (Mechanical Components)
**Objective:** Create complete gear train: driver, driven, shafts, housing with meshing verification.

### Commands
```javascript
"create driver gear 20 teeth pitch 2mm"
"add shaft through bore diameter 8mm length 50mm"
"create driven gear 40 teeth pitch 2mm mesh with driver"
"add driven shaft diameter 10mm length 60mm"
"add housing cavity bore 60mm height 40mm"
```

### What Happens
1. **Driver gear (20T, module 2)** appears
   - Pitch diameter: 40mm
   - Module 2 = pitch distance between teeth
2. **Shaft through 20T gear** (8mm bore)
   - Centered on gear, extends both sides
3. **Driven gear (40T, module 2)** created
   - Pitch diameter: 80mm
   - **AI automatically meshes it** with driver at correct distance
   - Center-to-center distance: (40+80)/2 = 60mm
4. **Driven shaft** (10mm bore)
   - Passes through 40T gear
5. **Housing**
   - Aluminum, cavity to hold both gears
   - Shaft supports (bearings go here)

### Verification
- Gear ratio: 40T/20T = 2:1 (driven shaft rotates 2x slower)
- Mesh check: Gears touch at pitch circle (proper engagement)
- Backlash: Built-in 0.1mm (typical for precision gearbox)
- Efficiency: ~98% (minimal losses in mesh)

### Expected Result
- Complete 3D gear train, ready for manufacturing
- Driven shaft output is 2:1 reduction from driver
- Ready for stress analysis or assembly in larger system

---

## Summary: Intermediate Tutorials Complete

You can now:
- Create complex multi-feature parts with AI
- Optimize bracket weight using topology
- Analyze thermal performance
- Design for injection molding
- Use photos to recreate parts accurately
- Find resonance frequencies (avoid vibration)
- Assemble precision linear motion systems
- Iterate on designs for cost
- Validate designs against impact loads
- Design complete gear trains

**Next:** Advanced Tutorials (21-30) for professional production workflows.

---

## ADVANCED TUTORIALS (21-30)

## Tutorial 21: Full Product Design Workflow

**Level:** Advanced | **Time:** 90 min | **Module:** All 6 Features Integrated
**Objective:** Design motor mount bracket using all killer features in realistic manufacturing workflow.

### Complete Workflow

**Phase 1: Design (15 min)**
- AI Copilot: `motor mount bracket 100x80x10mm aluminum`
- Add 4 mounting holes (M6) for motor
- Add 4 tie-down holes (M8) for frame

**Phase 2: Analysis (20 min)**
- Stress: Motor vibration (2N sinusoidal load) at each corner
- Verify: Safety factor > 2.0
- Modal: Check natural frequency > 100 Hz (avoid 50/60 Hz resonance)
- Result: Design passes, very stiff bracket

**Phase 3: Optimization (20 min)**
- Generative design: Minimize weight while maintaining stiffness
- Target: 30% weight reduction
- Result: Organic-looking bracket with 600g → 420g

**Phase 4: Manufacturing Analysis (15 min)**
- DFM for CNC: All checks PASSED
- DFM for Injection: 2 undercuts detected (add slides to mold = higher cost)
- Decision: CNC is better for low-volume

**Phase 5: Cost Estimation (10 min)**
- Volume 1: CNC = $45 (prototype)
- Volume 100: CNC = $32 (better tooling amortization)
- Volume 1000: Injection = $8.50 (break-even at 300 units)
- Decision: For 100 units, CNC is optimal

**Phase 6: Assembly & BOM (10 min)**
- Add M6 bolts, washers, nuts from Smart Parts
- Add rubber vibration isolators (search `vibration isolator`)
- Generate BOM with 7 items, total cost $156 for assembly

**Phase 7: Drawings & Export (5 min)**
- Auto-generate ISO 128 engineering drawing
- Export STEP for machine shop
- Export PDF drawing for approval

**Expected Deliverables**
- Fully-designed motor mount bracket
- Optimized for weight and cost
- Validated for stress, vibration, manufacturability
- Complete BOM and engineering drawings
- Ready for procurement and manufacturing

---

## Tutorial 22: Generative Design: Multi-Load Case Bracket

**Level:** Advanced | **Time:** 30 min | **Module:** Generative Design (Multi-Physics)
**Objective:** Optimize bracket for 3 different load directions simultaneously.

### Load Cases
```
Load Case 1 (80% weight): 100N downward (primary load)
Load Case 2 (15% weight): 50N horizontal (vibration)
Load Case 3 (5% weight): 30N diagonal (shock)
Total weight = 100%
```

### Why Multi-Load?
Real parts rarely see single loads. Must be robust across all scenarios.

### Workflow
1. **Create initial bracket** (solid, over-designed)
2. **Define load case 1:**
   - Load: 100N downward at bracket tip
   - Support: Fixed at base
   - Result: Max stress 150 MPa
3. **Define load case 2:**
   - Load: 50N horizontal (perpendicular to primary load)
   - Support: Fixed at base
   - Result: Max stress 80 MPa
4. **Define load case 3:**
   - Load: 30N diagonal (45° from vertical)
   - Support: Fixed at base
   - Result: Max stress 45 MPa
5. **Set weights** (importance of each case)
   - Case 1: 80% (main load)
   - Case 2: 15% (secondary)
   - Case 3: 5% (rare shock)
6. **Run multi-case optimization**
   - Target: 50% weight reduction
   - Constraint: Stresses equally balanced across all cases
   - 20 iterations
7. **Results:** 5 candidate designs
   - Candidate A: All stresses < 120 MPa, weight 250g
   - Candidate B: All stresses < 100 MPa, weight 280g (more conservative)
   - Candidate C: Uneven stresses (bad for Case 3)
8. **Select Candidate B** (most robust)
9. **Compare to original:**
   - Original: 500g, all stresses < 100 MPa (over-engineered)
   - Optimized: 280g, all stresses < 100 MPa (perfectly engineered)
   - Weight savings: 44%

---

## Tutorial 23: Thermal-Structural Coupled Analysis

**Level:** Advanced | **Time:** 35 min | **Module:** Multi-Physics Coupling
**Objective:** Solve thermal problem first, then use temperatures as input to structural analysis.

### Real-World Example: CPU Cooler Mount

**Phase 1: Thermal Analysis**
1. Create aluminum mounting bracket
2. CPU die generates 100W heat
3. Heat spreads through aluminum, radiates to 25°C air
4. Solve steady-state thermal equation:
   - Result: Temperature map
   - Hot spot (near CPU): 75°C
   - Cool spot (far end): 35°C
   - Temperature gradient: 40°C across bracket

**Phase 2: Material Property Changes**
- Aluminum @ 20°C: Young's modulus E = 69 GPa, yield = 276 MPa
- Aluminum @ 75°C: E = 67 GPa, yield = 240 MPa (reduced!)
- At hot temperature, material is weaker

**Phase 3: Structural Analysis**
- Apply mounting loads (CPU cooler clamped down with 50N force)
- Use temperature-dependent properties from Phase 1
- In cold areas (35°C): stiff, strong
- In hot areas (75°C): slightly weaker
- Run coupled stress analysis

**Phase 4: Results Comparison**
- **Without temperature coupling:**
  - Max stress: 120 MPa
  - Safety factor: 2.3 (seems OK)
- **With temperature coupling:**
  - Max stress: 145 MPa (stress increases due to weaker material at 75°C)
  - Safety factor: 1.65 (lower than predicted!)
- **Conclusion:** Must account for temperature effects; design was under-estimated

**Phase 5: Optimization**
- Increase bracket thickness: 4mm → 5mm
- Re-run coupled analysis
- New result: Max stress 125 MPa, safety factor 1.9 (acceptable)

---

## Tutorial 24: Agent API Automation

**Level:** Advanced | **Time:** 30 min | **Module:** Agent API (`window.cycleCAD.execute()`)
**Objective:** Write JavaScript to automate complete workflow: create → analyze → optimize → export.

### Example Script

```javascript
// Automated bracket design workflow
(async () => {
  try {
    // Step 1: Create bracket
    const bracket = await cycleCAD.execute({
      method: 'shape.box',
      params: { width: 100, height: 80, depth: 10, material: 'Aluminum 6061' }
    });
    console.log('Bracket created:', bracket.id);

    // Step 2: Add mounting holes
    await cycleCAD.execute({
      method: 'feature.hole',
      params: {
        position: [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 70}, {x: 10, y: 70}],
        diameter: 6,
        count: 4
      }
    });

    // Step 3: Fillet edges
    await cycleCAD.execute({
      method: 'feature.fillet',
      params: { radius: 3, target: 'all_edges' }
    });

    // Step 4: Run stress analysis
    const stressAnalysis = await cycleCAD.execute({
      method: 'analyze.stress',
      params: {
        fixedFace: 'bottom',
        load: { direction: [0, -1, 0], magnitude: 100 }
      }
    });
    console.log('Max stress:', stressAnalysis.maxStress, 'MPa');

    // Step 5: Check DFM
    const dfm = await cycleCAD.execute({
      method: 'analyze.dfm',
      params: { process: 'CNC', checkUndercuts: false }
    });
    console.log('DFM result:', dfm.passed ? 'PASS' : 'FAIL');

    // Step 6: Estimate cost
    const cost = await cycleCAD.execute({
      method: 'analyze.cost',
      params: { process: 'CNC', quantity: 100 }
    });
    console.log('Unit cost:', cost.unitCost, 'dollars');

    // Step 7: Export
    await cycleCAD.execute({
      method: 'export.step',
      params: { filename: 'bracket_final.step' }
    });

    console.log('Workflow complete!');
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

### What This Achieves
- Fully automated design pipeline
- No manual clicks
- Repeatable for 100+ variations
- Logs all analysis results
- Batch processes multiple designs

### Use Cases
- Design optimization loops (try 10 variations automatically)
- Parameter sweeps (run analysis for 5 different thicknesses)
- Quality control (verify every design before approving)
- Manufacturing integration (send approved designs directly to CAM)

---

## Tutorial 25: Photo-to-CAD + AI Enhancement

**Level:** Advanced | **Time:** 25 min | **Module:** Photo-to-CAD + Gemini Vision
**Objective:** Use AI to identify features in photo, reconstruct complex part accurately.

### Real-World Scenario
- Have a physical prototype bracket
- Need to recreate as CAD model
- Manual measurement would take 2 hours
- Photo-to-CAD + AI enhancement takes 15 minutes

### Workflow
1. **Take reference photo**
   - Good lighting, white background
   - Include ruler for scale
   - Show all sides

2. **Upload to Photo-to-CAD**
   - System sends image to Gemini Vision
   - AI analyzes:
     - Primary geometry (L-bracket shape)
     - Holes (position, size, pattern)
     - Fillets/chamfers (edges, radius)
     - Material appearance (aluminum = light gray)

3. **Review AI Analysis**
   - Confidence scores for each detected feature:
     - Outer profile: 98%
     - Holes: 87%
     - Fillets: 76%
     - Thickness estimate: 82%

4. **Generate CAD Model**
   - cycleCAD creates parametric model
   - All detected features included
   - Dimensions from photo + ruler calibration

5. **Manual Refinement (optional)**
   - If confidence < 90% on any feature, manually verify
   - Adjust dimensions if needed
   - Test-fit against original if possible

6. **Export**
   - Save as STEP for manufacturing
   - Save as cycleCAD native for further editing

---

## Tutorial 26: Smart Parts: Custom Catalog Extension

**Level:** Advanced | **Time:** 30 min | **Module:** Smart Parts (Custom Catalog)
**Objective:** Add company's proprietary parts to Smart Parts library.

### Example: Creating Custom "Bearing Housing"

**Step 1: Create Parametric Part**
```javascript
function BearingHousing(bore_diameter, outer_diameter, height) {
  // Generate housing geometry based on parameters
  const housing = {
    bore: bore_diameter,      // 10-50mm range
    outer: outer_diameter,    // 40-100mm range
    height: height,           // 20-80mm range
    mass: calculateMass(...),
    cost: 50 + (height * 2)   // $50 + $2 per mm
  };
  return housing;
}
```

**Step 2: Define Part Specifications**
```json
{
  "partName": "Precision Bearing Housing",
  "supplier": "Our Company",
  "parameters": {
    "bore_diameter": {"min": 10, "max": 50, "unit": "mm", "default": 25},
    "outer_diameter": {"min": 40, "max": 100, "unit": "mm", "default": 60},
    "height": {"min": 20, "max": 80, "unit": "mm", "default": 40}
  },
  "pricing": {
    "formula": "50 + (height * 2)",
    "leadTime": "3-5 days"
  }
}
```

**Step 3: Upload to Catalog**
1. Menu: Smart Parts → **"Manage Catalog"**
2. Click **"Add Custom Part"**
3. Fill in metadata
4. Upload geometry generator function (JavaScript)
5. Test: Try different parameters, verify geometry generates correctly

**Step 4: Make Available to Team**
1. Publish to company catalog
2. Team members see it in Smart Parts search
3. When they insert, they select bore, outer, height
4. Geometry auto-generates with correct parameters
5. Cost auto-calculates

**Step 5: Version Control**
- Update geometry generator → all instances update
- Change pricing → reflected in all BOMs
- Add new material option → available immediately to team

### Benefits
- Standardize on company designs
- Quick assembly without creating from scratch
- Consistent costing across projects
- Version control for design changes

---

## Tutorial 27: Manufacturing Report Generation

**Level:** Advanced | **Time:** 25 min | **Module:** DFM + Cost + Export
**Objective:** Create comprehensive report for vendors showing design analysis, costs, and recommendations.

### Report Contents

**1. Executive Summary**
- Part name, revision, date
- 3D images (isometric + 3 orthographic views)
- Recommended processes for different volumes

**2. Design Specifications**
- Material: Aluminum 6061-T6
- Weight: 250g
- Dimensions: 100 x 80 x 50mm
- Features: 4 holes, 6 fillets, 1 boss

**3. DFM Analysis (All Processes)**

**CNC Machining**
- ✓ All checks PASSED
- Recommended toolpath: 3-axis
- Estimated machining time: 45 minutes
- Surface finish: Ra 1.6 µm
- Lead time: 1 week
- Unit cost: $28 (100 qty)

**Injection Molding**
- ⚠ 2 undercuts detected (require mold slides)
- Recommended parting line: vertical face at center
- Mold tooling cost: $5,000 (includes 2 slides)
- Cycle time: 45 seconds per part
- Unit cost: $0.85 (100 qty, $5,000 tooling amortized)
- Lead time: 4 weeks (2 weeks for mold, 2 weeks production)

**3D Printing (FDM)**
- ✓ All checks PASSED
- Support points needed: 6
- Orientation: Z-axis for strength
- Print time: 2.5 hours
- Material: 120g ABS
- Unit cost: $3.50 (100 qty)
- Lead time: 3 days

**4. Cost Analysis**
- Table: Unit cost vs. volume (1 to 10,000 units)
- Graph: Breakeven analysis showing which process is cheapest at each volume
- Recommendation: CNC for 1-300 units, Injection Molding for 300+ units

**5. Quality Standards**
- Surface finish: Ra 1.6 µm (CNC), Ra 3.2 µm (Injection)
- Tolerances: ±0.5mm (machining), ±0.3mm (molding)
- Testing recommended: Dimensional check, visual inspection

**6. Bill of Materials**
- If assembled: List all parts, suppliers, costs

**7. Revision History**
- Version A: Initial design
- Version B: Added fillets for CNC manufacturability
- Current: Version C (production approved)

### Export in cycleCAD
1. Right-click design in feature tree
2. Select **"Generate Manufacturing Report"**
3. Select: All processes, include cost curves
4. Export as **PDF** (multi-page, print-ready)
5. Share with machine shops, mold makers, 3D print services

---

## Tutorial 28: Topology Optimization → Printable Part

**Level:** Advanced | **Time:** 35 min | **Module:** Generative Design + DFM (FDM)
**Objective:** Optimize for weight, then verify printability and optimize orientation.

### Workflow

**Phase 1: Generative Design (10 min)**
1. Create initial bracket (heavy, over-engineered)
2. Run topology optimization: "Reduce weight 50%, safety factor > 2"
3. AI generates 5 candidates with organic shapes
4. Select best candidate (weight 300g, all stresses < 100 MPa)

**Phase 2: DFM for FDM (10 min)**
1. Run DFM analysis for **FDM 3D printing**
2. Check overhang angles:
   - Parts with >45° overhangs need support material
   - Each 1% of support material increases cost ~0.5%
3. Current orientation: 35% support material (expensive!)
4. Suggested fix: Rotate the part
5. Try orientation 2: 12% support (much better!)

**Phase 3: Optimize Support Structure (10 min)**
1. Try multiple orientations automatically
2. Test 8 different rotations
3. Find optimal: 45° rotation reduces support to 8%
4. Final recommendation: Custom orientation with tree supports

**Phase 4: Prepare for 3D Printing (5 min)**
1. Add support structure (auto-generated, minimized)
2. Export STL with supports included
3. Send to Cura/Prusa slicer for final slicing
4. Estimated print time: 90 minutes
5. Material: 85g ABS

### Result
- Weight-optimized bracket: 300g (40% lighter than original)
- 3D-printable: Minimal support material (8%)
- Print time: 90 minutes on Prusa i3 MK3S+
- Cost: $4.20 material + $5.00 labor = $9.20 total
- vs. CNC: $28.00 total

---

## Tutorial 29: Multi-Physics Validation Workflow

**Level:** Advanced | **Time:** 45 min | **Module:** Sequential Multi-Physics
**Objective:** Validate design across static stress, vibration, thermal, and impact.

### Complete Validation Sequence

**Step 1: Static Stress (5 min)**
1. Apply operating loads (100N downward at 4 corners)
2. Fix base
3. Solve: Max stress 85 MPa, safety factor 3.2
4. ✓ PASS: Safety factor > 2.5

**Step 2: Modal Analysis (10 min)**
1. Find natural frequencies
2. First 5 modes: [23 Hz, 62 Hz, 145 Hz, 250 Hz, 410 Hz]
3. Operating speed: Motor at 50 Hz (3000 RPM)
4. Check: No resonance within 20% of 50 Hz
   - Mode 1 (23 Hz): Safe (23 Hz × 1.2 = 27.6 Hz < 50 Hz)
   - Mode 2 (62 Hz): **CLOSE** (62 Hz × 0.8 = 49.6 Hz ≈ 50 Hz)
5. ⚠ WARNING: Mode 2 is near operating speed
6. **Solution**: Increase stiffness with ribs to shift Mode 2 to 85+ Hz

**Step 3: Add Ribs (Modify Design)**
1. Add 3 reinforcement ribs on bottom face
2. Re-run modal analysis
3. New Mode 2: 92 Hz (now safe, > 60 Hz buffer from 50 Hz)
4. ✓ PASS: No resonance risk

**Step 4: Thermal Analysis (10 min)**
1. Motor dissipates 50W heat
2. Bracket conducts heat to 25°C ambient
3. Temperature map: Hot spot 65°C, cool spot 30°C
4. ✓ PASS: No material exceeds glass transition temp (plastic: 85°C)

**Step 5: Coupled Thermal-Structural (10 min)**
1. Apply static load (100N) at 65°C (hot operating condition)
2. Material properties degrade with temperature
3. Aluminum @ 65°C: Yield strength 240 MPa (vs. 276 MPa @ 20°C)
4. Max stress at 65°C: 95 MPa (vs. 85 MPa @ 20°C)
5. Safety factor: 240 ÷ 95 = 2.53 (still > 2.5)
6. ✓ PASS: Safe at hot temperature

**Step 6: Impact Test (Optional, 5 min)**
1. Simulate 1m drop onto concrete
2. Max stress during impact: 180 MPa
3. **FAIL**: Exceeds yield strength!
4. **Solution**: Add foam padding or thicken bracket
5. **Alternative**: Accept that bracket cracks in 1m drop (acceptable for some applications)

**Final Sign-Off**
```
Design Validation Summary
─────────────────────────
✓ Static stress:          PASS (safety factor 3.2)
✓ Vibration (modal):      PASS (no resonance @ 50 Hz)
✓ Thermal:                PASS (max 65°C, material OK)
✓ Thermal-structural:     PASS (safety factor 2.53 @ 65°C)
✗ Impact (1m drop):       FAIL (stress 180 MPa > 270 MPa yield)
                          → Acceptable if drop impact not expected
                          → Optional: Add padding for protection

OVERALL: APPROVED for production
Design validated for normal operating conditions.
Drop impact test optional based on application requirements.
```

---

## Tutorial 30: Building a Complete Assembly with BOM

**Level:** Advanced | **Time:** 60 min | **Module:** Multi-Part Assembly + Smart Parts
**Objective:** Design complete mechanical assembly (20+ parts) with full documentation.

### Assembly: Precision XY Measurement Jig

**Part List**
1. Base aluminum plate (custom, 150x100x30mm)
2. Two Z-frame supports (custom, welded steel)
3. Linear X-stage (Smart Parts: THK LHHS20 rail)
4. Linear X-carriage (Smart Parts: THK EBL20)
5. Linear X-ballscrew (Smart Parts: THK BSSD1610)
6. Linear Y-stage (Smart Parts: THK LHHS20 rail)
7. Linear Y-carriage (Smart Parts: THK EBL20)
8. Linear Y-ballscrew (Smart Parts: THK BSSD1610)
9. LVDT displacement transducer (Smart Parts: Temposonics)
10. Stepper motor X (Smart Parts: NEMA23 stepper)
11. Stepper motor Y (Smart Parts: NEMA23 stepper)
12-20. Fasteners (bolts, nuts, washers, couplings, spacers)
21-25. Electronics (stepper drivers, power supply, control board)

### Assembly Workflow in cycleCAD

**Phase 1: Create Base & Supports (10 min)**
1. AI Copilot: `base plate 150x100x30mm aluminum`
2. AI Copilot: `Z frame supports H-shaped steel 200mm tall`
3. Position supports at corners of base

**Phase 2: Insert Linear X-Stage (15 min)**
1. Search Smart Parts: `THK linear rail LHHS20`
2. Insert rail along X-axis, centered on base
3. Insert carriage on rail
4. Insert ballscrew parallel to rail
5. Insert NEMA23 stepper motor
6. Insert flexible coupling (motor to ballscrew)
7. X-stage is now complete and functional

**Phase 3: Insert Linear Y-Stage (15 min)**
1. Repeat Phase 2 but along Y-axis
2. Y-stage mounts on top of X-carriage (nested stages)
3. Now have XY motion capability (cartesian positioning)

**Phase 4: Install Measurement Head (10 min)**
1. Create custom LVDT holder (3D model)
2. Insert LVDT transducer (from Smart Parts)
3. Mount on Y-carriage
4. LVDT now moves with XY stage to measure parts

**Phase 5: Add Fasteners & Details (10 min)**
1. Insert 20 socket head cap bolts (M6 x 20, McMaster)
2. Insert washers and nuts
3. Insert spacer tubes between stages
4. Insert cable carriers to manage wiring

**Phase 6: Verify Assembly (5 min)**
1. Run collision check (all parts clear, no interference)
2. Simulate motion: X moves 100mm, Y moves 80mm, LVDT follows
3. Confirm full range without hitting end stops

**Phase 7: Generate Complete BOM (10 min)**
1. Right-click assembly → "Generate BOM"
2. Table shows 25 line items:

| Item | Part | Qty | Supplier | Price | Total |
|------|------|-----|----------|-------|-------|
| 1 | Base plate aluminum | 1 | Custom | - | - |
| 2 | Z-frame supports steel | 1 | Custom | - | - |
| 3 | THK LHHS20 linear rail | 2 | MISUMI | $65 | $130 |
| 4 | THK EBL20 carriage | 2 | MISUMI | $35 | $70 |
| 5 | THK BSSD1610 ballscrew | 2 | MISUMI | $85 | $170 |
| 6 | NEMA23 stepper motor | 2 | McMaster | $75 | $150 |
| 7 | Flexible coupling 8mm | 2 | MISUMI | $12 | $24 |
| 8 | LVDT transducer | 1 | Temposonics | $450 | $450 |
| 9 | M6x20 SHCS bolt | 20 | McMaster | $0.35 | $7 |
| ... | ... | ... | ... | ... | ... |
| **TOTAL** | | | | | **$1,247** |

**Step 8: Create Assembly Drawing (5 min)**
1. Generate ISO 128 drawing showing:
   - Exploded view (all 25 parts shown separately)
   - Assembly sequence (step 1: base, step 2: X-stage, etc.)
   - Part numbers labeled
   - BOM table
   - Assembly notes

**Step 9: Export for Manufacturing (5 min)**
1. Export assembly as STEP file (all geometry included)
2. Export assembly drawing as PDF
3. Export BOM as Excel (for procurement)
4. Send to:
   - Machine shop (custom base and Z-frame)
   - MISUMI (order rails, carriages, ballscrews)
   - McMaster-Carr (order fasteners, motors)
   - Temposonics (order LVDT transducer)

### Final Deliverables
- Complete 3D assembly with 25 parts
- Motion simulation showing XY travel (100mm × 80mm range)
- Full assembly documentation
- Bill of materials with all suppliers
- Engineering drawings
- Ready for procurement and fabrication

---

## Summary: All 30 Tutorials Complete

**What You've Learned:**
1. Text-to-CAD: Create parts with natural language
2. Smart Parts: Access 50,000+ standard components
3. DFM Analysis: Design for all manufacturing processes
4. Cost Estimation: Real-time economic analysis
5. FEA Simulation: Stress, thermal, vibration, impact
6. Generative Design: Optimize weight and cost
7. Photo-to-CAD: Digitize existing parts
8. Assembly Design: Build complex multi-part systems
9. Production Workflows: Complete real-world scenarios
10. Automation: Script repetitive tasks with Agent API

**You Can Now:**
- Design from scratch or from photos
- Analyze parts for strength, thermal, vibration
- Optimize for weight and cost simultaneously
- Source real hardware from global suppliers
- Verify manufacturability before production
- Generate professional engineering documentation
- Automate complex design workflows
- Build complete assemblies with BOMs
- Create everything from prototypes to production

**Next Steps:**
1. **Start with your own project** — use beginner tutorials as template
2. **Combine features** — Text-to-CAD + DFM + Cost gives instant feedback
3. **Iterate rapidly** — Change a dimension, all analyses update in seconds
4. **Share with team** — Export STEP, PDF, BOM for collaboration
5. **Scale to production** — Use cost curves to find optimal manufacturing process

---

**Welcome to the future of CAD! 🚀**
