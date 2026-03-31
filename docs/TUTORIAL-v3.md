# cycleCAD v3.2 Complete Tutorial Guide

Comprehensive tutorials for all skill levels. Each tutorial is self-contained and estimated to take 15-60 minutes.

## Table of Contents

### Beginner (15-30 min each)
1. [Your First Part](#1-your-first-part)
2. [Sketch Basics](#2-sketch-basics)
3. [Understanding Workspaces](#3-understanding-workspaces)
4. [Navigating 3D Viewport](#4-navigating-3d-viewport)
5. [Using Feature Tree](#5-using-feature-tree)

### Intermediate (30-45 min each)
6. [Boolean Operations](#6-boolean-operations)
7. [Sweep and Loft](#7-sweep-and-loft)
8. [Assembly Basics](#8-assembly-basics)
9. [2D Engineering Drawings](#9-2d-engineering-drawings)
10. [AI Features](#10-ai-features)

### Advanced (45-60 min each)
11. [B-Rep Kernel Operations](#11-b-rep-kernel-operations)
12. [CAM Toolpath Generation](#12-cam-toolpath-generation)
13. [FEA Simulation Setup](#13-fea-simulation-setup)
14. [Real-time Collaboration](#14-real-time-collaboration)
15. [Writing Scripts & Macros](#15-writing-scripts-and-macros)

### Developer (60+ min)
16. [Building Plugins](#16-building-plugins)
17. [STEP Import/Export Workflow](#17-step-importexport-workflow)
18. [Docker Self-Hosting](#18-docker-self-hosting)
19. [Creating Custom LEGO Modules](#19-creating-custom-lego-modules)
20. [Agent API Integration](#20-agent-api-integration)

---

## 1. Your First Part

**Time: 15 minutes | Difficulty: Beginner | Outcome: 3D box exported as STL**

### Goal
Create a simple rectangular box, round its edges with a fillet, and export as STL for 3D printing.

### Steps

#### Step 1: Start Design Workspace
1. Open cycleCAD
2. Click **Design** workspace (top left)
3. You see toolbars, 3D viewport, and tree panel on left

#### Step 2: Create a Sketch
1. Click **Sketch** button in toolbar (or press S)
2. **Select XY Plane** from the dropdown (horizontal plane at origin)
3. Sketch toolbar appears, showing Line, Circle, Rectangle, Arc tools
4. The 3D view changes to top-down 2D view

#### Step 3: Draw Rectangle
1. Press **R** for Rectangle tool
2. **Click point 1**: at origin (0, 0)
3. **Click point 2**: drag to create a 100mm × 50mm rectangle
4. Notice the green horizontal/vertical dimension guides
5. Press **Escape** to finish

#### Step 4: Exit Sketch
1. Click **Close Sketch** button (top toolbar)
2. Or press **Escape**
3. The sketch is now a profile ready for extrusion
4. You return to 3D view (isometric angle)

#### Step 5: Extrude to 3D
1. The sketch is still selected (shown in tree)
2. Click **Extrude** button in toolbar (or press E)
3. A panel appears: "Extrude Depth"
4. **Enter 50** (mm) in the text field
5. **Click OK** or press Enter
6. Your rectangle becomes a 3D box: 100 × 50 × 50mm

#### Step 6: Add Fillet
1. Click **Fillet** button in toolbar (or press F)
2. The 3D box shows all edges highlighted
3. **All edges are automatically selected** (great for this simple box)
4. **Enter 5** (mm) in the radius field
5. **Click OK**
6. All corners are now smoothly rounded

#### Step 7: Inspect Your Work
1. **Rotate view**: click and drag with left mouse button
2. **Zoom**: scroll mouse wheel
3. **Pan**: hold right mouse button and drag
4. The box looks professional: clean corners, proper proportions

#### Step 8: Export as STL
1. Click **File** menu → **Export**
2. Choose **Format: STL (Binary)**
3. **Name it**: `my-first-box.stl`
4. **Click Export**
5. File downloaded to your computer

### Congratulations!
You've created your first 3D model! The STL file can now be:
- Sent to a 3D printer
- Used in other CAD software
- Analyzed in simulation tools

### What You Learned
✓ Creating sketches on planes
✓ Drawing basic 2D shapes (rectangle)
✓ Extruding to 3D
✓ Rounding edges with fillets
✓ Exporting for manufacturing

### Next Steps
- Try creating a **circle** instead of a rectangle
- Add a **hole** using extrude-cut
- Try different **fillet radii** (0.5mm to 10mm)

---

## 2. Sketch Basics

**Time: 20 minutes | Difficulty: Beginner**

### Goal
Master sketch tools and constraints to create a parametric profile.

### What You'll Create
A simple gear-like profile: central circle with 4 surrounding circles arranged symmetrically.

### Steps

#### Part 1: Main Circle
1. Start new sketch on **XY Plane**
2. Press **C** for Circle tool
3. **Click at origin** (0, 0) - this is center
4. **Drag outward** to draw a circle with ~30mm radius
5. Sketch should be white (fully constrained with center fixed at origin)

#### Part 2: Add 4 Surrounding Circles
1. Press **C** again for Circle
2. **Click at point (60, 0)** - 60mm to the right
3. **Drag to create** a 15mm radius circle
4. Repeat 3 more times at:
   - (0, 60) - top
   - (-60, 0) - left
   - (0, -60) - bottom
5. Now you have a cross pattern of circles

#### Part 3: Add Symmetry Constraints
1. **Select first circle** (top) + main circle
2. Press **T** for Tangent constraint
3. The top circle should touch the main circle
4. **Repeat for other 3 circles**
5. Press **Escape** when done

#### Part 4: Dimension the Circles
1. **Select the 30mm main circle**
2. Press **D** for Distance constraint
3. **Enter 30** (or whatever radius you want)
4. The circle snaps to that size
5. **Repeat for the 4 small circles** - constrain to 15mm radius

#### Part 5: Position Circles Symmetrically
1. **Select center of top circle** + **origin**
2. Press **D** for Distance constraint
3. **Enter 60** (distance from center)
4. **Repeat for bottom, left, right** - all 60mm from origin
5. Sketch is now fully parametric

#### Part 6: Modify Parameters (Parametric Power!)
1. **Double-click any dimension** (e.g., the "30" in main circle)
2. **Type new value**: 40
3. **Press Enter**
4. **All related dimensions update automatically!**
5. Try changing the 60 to 50 - small circles move closer to center
6. Try changing 15 to 20 - small circles get larger

### Understanding Constraints

| Constraint | Key | What It Does |
|-----------|-----|-------------|
| **Horizontal** | H | Force line horizontal |
| **Vertical** | V | Force line vertical |
| **Distance** | D | Set exact distance between points |
| **Tangent** | T | Curves touch with same slope |
| **Equal** | E | Multiple lines/circles same size |
| **Parallel** | P | Lines point same direction |
| **Perpendicular** | X | Lines at 90° angle |
| **Coincident** | O | Point lies on line/circle |

### Sketch Health Indicator
- **White sketch**: Fully constrained ✓ (can extrude)
- **Yellow sketch**: Under-constrained (under-determined degrees of freedom)
- **Red sketch**: Over-constrained (conflicting constraints)

### What You Learned
✓ Circle, Line, Rectangle, Arc tools
✓ Basic constraints (distance, tangent, symmetry)
✓ Parametric design (change once, update everywhere)
✓ Sketch constraint status

### Challenge
Create a **hexagonal bolt profile**:
- 6 circles arranged in ring
- All circles same size (use Equal constraint)
- All 60° apart from center
- Fully constrained (white sketch)

---

## 3. Understanding Workspaces

**Time: 15 minutes | Difficulty: Beginner**

### The 8 Workspaces

cycleCAD has 8 specialized workspaces. Each activates relevant modules and hides irrelevant tools.

#### 1. **Design Workspace**
- **What**: Create 3D parts with sketches, extrude, revolve, boolean operations
- **Toolbars**: Sketch (line, circle, rect), Features (extrude, revolve, fillet, etc.)
- **Tree**: Shows feature history (sketch → extrude → fillet → ...)
- **Best for**: Parametric modeling, part creation
- **Keyboard**: E=extrude, R=revolve, F=fillet, C=chamfer, P=pattern

#### 2. **Assembly Workspace**
- **What**: Combine multiple parts using constraints and joints
- **Toolbars**: Add Component, Mate, Joint (Revolute, Prismatic, etc.)
- **BOM**: Generate bill of materials
- **Best for**: Assemblies, kinematics, motion study
- **Keyboard**: M=add mate, J=joint

#### 3. **Render Workspace**
- **What**: Photorealistic visualization with materials, lighting, environment
- **Toolbars**: Materials, Lights, Rendering settings
- **Real-time**: Ray tracing toggle, quality settings
- **Best for**: Professional images, animations, presentations
- **Export**: PNG, JPEG, MP4 video

#### 4. **Simulation Workspace**
- **What**: FEA (Finite Element Analysis), thermal, modal analysis
- **Toolbars**: Mesh, Loads, Constraints, Solve
- **Results**: Stress maps, deformation, factor of safety
- **Best for**: Validation, structural analysis, thermal testing
- **Time**: Minutes to hours depending on complexity

#### 5. **CAM Workspace**
- **What**: Generate manufacturing toolpaths (CNC, 3D printer, laser)
- **Toolbars**: Tools, Operations, G-code, Slicing (FDM)
- **Preview**: Visualize cutting before sending to machine
- **Best for**: Manufacturing, toolpath optimization
- **Output**: G-code (.nc), laser vectors, 3D print slices

#### 6. **Drawing Workspace**
- **What**: Create 2D engineering drawings from 3D models
- **Toolbars**: Views (Front, Top, Iso, Section), Dimensions, Notes
- **Standard**: ISO 1101 (GD&T), ANSI, ISO standards supported
- **Best for**: Manufacturing documentation, technical drawings
- **Output**: PDF, DWG, DXF

#### 7. **Animation Workspace**
- **What**: Create motion sequences with timeline and keyframes
- **Toolbars**: Timeline, Keyframe, Play/Record
- **Real-time**: Record assembly disassembly, rotation, etc.
- **Best for**: Product demos, exploded views, assembly instructions
- **Output**: MP4, WebM video

#### 8. **Collaborate Workspace** *(Pro feature)*
- **What**: Real-time multi-user editing with shared cursor visibility
- **Toolbars**: Invite, Presence, Chat, Comments
- **Sync**: All changes broadcast to collaborators in real-time
- **Best for**: Team design, design reviews, remote collaboration
- **Storage**: 100GB cloud per Pro user

### Typical Workflow Example: Designing a Bracket

```
Design Workspace
  ↓ Create sketch, extrude, add holes, fillet edges
  ↓
Assembly Workspace
  ↓ Import fasteners, add mates, generate BOM
  ↓
Simulation Workspace
  ↓ Run FEA to check stress under load
  ↓
CAM Workspace
  ↓ Generate CNC toolpath, preview cutting
  ↓
Drawing Workspace
  ↓ Add engineering drawing with dimensions
  ↓
Render Workspace
  ↓ Take beautiful product image for catalog
  ↓
Export
  ↓ STL for 3D printer, STEP for partner, PDF for manufacturing
```

### Switching Workspaces
1. **Click workspace button** at top left
2. Toolbars change
3. Left panel updates (tree → assembly → timeline, etc.)
4. Your 3D model stays in place
5. State is preserved (can switch back and forth)

### Each Workspace is Independent
- Sketch tools only in **Design**
- Animation timeline only in **Animation**
- FEA solver only in **Simulation**
- Sharing only in **Collaborate**

### What You Learned
✓ 8 workspaces for different tasks
✓ How to switch workspaces
✓ Which workspace for which job
✓ Typical design workflow

---

## 4. Navigating 3D Viewport

**Time: 10 minutes | Difficulty: Beginner**

### Mouse Controls

| Action | Mouse | Result |
|--------|-------|--------|
| **Rotate** | Left drag | Orbit around object |
| **Pan** | Right drag | Move left/right/up/down |
| **Zoom** | Scroll wheel | In/out |
| **Fit all** | Middle-click | Frame entire model |
| **Reset view** | Press . | Return to default angle |

### Keyboard Navigation

| Key | Action |
|-----|--------|
| **0** | Front view (looking straight on) |
| **1** | Right side view |
| **2** | Top view |
| **3** | Isometric (default angled view) |
| **4-6** | Other preset angles |
| **G** | Toggle grid (helps with alignment) |
| **.** | Fit view to selection |

### View Presets
Click the **View Cube** in corner (or press 0-6):
- **Front**: Looking straight at XZ plane (0)
- **Right**: Looking from right side (1)
- **Top**: Looking down at XY plane (2)
- **Isometric**: 3D angled view (3)

### Precision Navigation

**Fit Selected**:
1. **Click an edge or face** to select it
2. Press **.** (period)
3. View zooms to show just that feature
4. Great for inspecting small details

**Pan to Point**:
1. Hold **Right mouse button**
2. Drag left/right/up/down
3. Model moves smoothly

**Rotate with Constraints**:
1. Hold **Shift + Left drag** for smooth rotation
2. Prevents accidental panning

### Viewport Modes

**Shading Modes**:
- **Solid** (default): Shows materials and colors
- **Wireframe**: Shows edges only (press W)
- **Hidden Line**: Shows solid with hidden edges dashed
- **Rendered**: Ray-traced photorealistic (slow, beautiful)

**Grid and Snap**:
- **G**: Toggle grid on/off
- **S**: Toggle snap to grid (helps align objects)

### Tips for Smooth Navigation
1. **Don't over-rotate** - keep view roughly isometric (30°)
2. **Use presets** (0, 1, 2) to jump to standard views
3. **Fit view often** - prevents getting lost
4. **Middle-click** to reset if confused
5. **Hold Shift while dragging** for slow, smooth rotation

### What You Learned
✓ Rotating, panning, zooming
✓ View presets (Front, Top, Iso)
✓ Keyboard shortcuts (G, W, S)
✓ Wireframe and shading modes

---

## 5. Using Feature Tree

**Time: 15 minutes | Difficulty: Beginner**

### What is Feature Tree?
Left panel shows **history of all features** you created, in order:

```
Part
├── Sketch
├── Extrude
├── Sketch (2)
├── Pocket
├── Fillet
└── Chamfer
```

Each feature depends on previous ones. If you change Sketch → everything below updates.

### Reading the Tree

| Symbol | Meaning |
|--------|---------|
| **✓ (eye icon)** | Feature is visible |
| **✗ (crossed eye)** | Feature is hidden (toggle to hide) |
| **S** | Feature is suppressed (not computed, but kept in history) |
| **!** | Feature has error (red text) |

### Basic Tree Operations

#### 1. Rename a Feature
1. **Right-click** on feature name (e.g., "Extrude")
2. Select **Rename**
3. Type new name: "Main Body"
4. Press Enter

#### 2. Hide a Feature
1. **Click the eye icon** next to feature
2. Feature disappears from 3D view
3. Click again to show

#### 3. Suppress a Feature
1. **Right-click** → **Suppress**
2. Feature is excluded from calculation
3. All dependent features are also hidden (greyed out)
4. Right-click → **Unsuppress** to restore
5. **Use case**: Test design without a fillet, see if suppressing helps

#### 4. Delete a Feature
1. **Right-click** → **Delete**
2. Feature and all dependent features are removed
3. **Careful**: Can't undo beyond undo history
4. Better: **Suppress** first if you might want it back

#### 5. Reorder Features
1. **Drag feature** in tree to reorder
2. Releases are recomputed in new order
3. Can change which features affect later ones
4. **Careful**: May cause errors if order matters
5. Example: Can't fillet an edge that doesn't exist yet

#### 6. Edit a Feature
1. **Double-click** on feature (e.g., "Extrude")
2. Properties panel shows parameters
3. **Edit depth**: change from 50 to 60mm
4. Click **OK** or press Enter
5. 3D model updates automatically

### Feature Suppression Strategy
**Testing variations without losing history**:
1. Create full model (sketch → extrude → fillet → chamfer)
2. **Suppress the fillet**
3. See how part looks without rounded edges
4. If you like it: **Delete**, otherwise **Unsuppress**
5. Never lose work, easy to compare

### Tree Visibility Control
**Hide features to see inside**:
1. Part has many features stacked on top
2. **Click eye icon** on top features
3. See internal structure
4. Great for debugging geometry

### Selecting from Tree
**Click any feature in tree** → that feature highlights in 3D
- Click "Sketch" → sketch profile glows
- Click "Extrude" → main body highlights
- Useful for large models with many parts

### Collapse/Expand
- **Click triangle** next to feature to expand/collapse
- Keeps tree organized
- Click **Part** to collapse entire tree

### What You Learned
✓ Feature tree shows creation history
✓ Rename, hide, suppress, delete features
✓ Reordering features (careful!)
✓ Double-click to edit parameters
✓ Visibility control for debugging

### Pro Tip: Feature Naming
Use descriptive names, not defaults:
- Good: "Main Body", "Mounting Hole", "Fillet Edges"
- Bad: "Extrude", "Pocket", "Fillet"

---

## 6. Boolean Operations

**Time: 30 minutes | Difficulty: Intermediate**

### What Are Boolean Operations?
Combine two solid bodies using set operations:

| Operation | Symbol | What Happens | Use Case |
|-----------|--------|--------------|----------|
| **Union** | A ∪ B | Merge both solids | Join two parts |
| **Cut** | A - B | Remove B from A | Create holes, cavities |
| **Intersect** | A ∩ B | Keep only overlap | Find common volume |

### Creating a Part with Holes Using Boolean

**Goal**: Create a rectangular base with 4 mounting holes.

#### Step 1: Create Main Body
1. Design workspace
2. Create sketch → 100 × 60 × 10mm box (extrude)
3. This is your **base part**

#### Step 2: Create Hole Profile
1. Create **new sketch** on top face of base
2. Draw 4 circles at corners:
   - (20, 15): Ø10mm
   - (80, 15): Ø10mm
   - (20, 45): Ø10mm
   - (80, 45): Ø10mm
3. All circles should be fully constrained
4. **Close sketch**

#### Step 3: Create Hole Geometry (Tool Body)
1. **Extrude the circles downward** to depth 10mm (full thickness)
2. You now have a tool body with 4 cylinders
3. This is the **tool body** that will be subtracted

#### Step 4: Boolean Cut Operation
1. **Select main body** (base box)
2. Click **Boolean** in toolbar
3. Choose **Cut** operation
4. **Select tool body** (the cylinders) - click on 3D view
5. **Click OK**
6. **4 holes appear** in the base!

#### Step 5: Verify and Measure
1. **Rotate view** to see the holes
2. Click edges to verify diameter
3. Perfect manufacturing-ready part

### Union Example: Combining Two Parts

**Goal**: Join a shaft and a gear.

#### Steps
1. Create shaft (cylinder 20mm Ø × 50mm long)
2. Create gear profile as separate body
3. Position gear so it mates with shaft
4. **Boolean → Union**
5. Select both bodies
6. Single integrated body created

### Intersect Example: Finding Overlap

**Goal**: Find the intersection of two cylinders at angle.

#### Steps
1. Create vertical cylinder (50mm Ø × 100mm tall)
2. Create horizontal cylinder (40mm Ø × 100mm long) at angle
3. **Boolean → Intersect**
4. **Result**: Complex wavy shape (mathematical intersection)

### Important Notes

#### Body Selection
- **Primary body**: What you're operating on (stays in place)
- **Tool body**: What you're using (gets applied to primary)
- Order matters! Cut(A, B) ≠ Cut(B, A)

#### Clean Up After Boolean
1. You may have extra bodies lying around
2. Delete unwanted tool bodies from tree
3. Only keep final result

#### Boolean Limitations
- **No undercuts** (for injection molding): Use draft angle
- **Thin walls**: Keep walls >0.5mm
- **Complex intersections**: May need manual fixing

### What You Learned
✓ Union: Merge two solids
✓ Cut: Subtract one from another
✓ Intersect: Find common volume
✓ Creating holes with boolean operations
✓ Body management (primary vs tool)

---

## 7. Sweep and Loft

**Time: 35 minutes | Difficulty: Intermediate**

### Sweep: Profile Along a Path

**Sweep extrudes a profile (sketch) along a curved path (line/arc/curve).**

**Real-world examples:**
- Pipe following a complex 3D path
- Helix (spiral staircase, screw thread)
- Curved spine with varying cross-sections

#### Simple Sweep Example: Curved Tube

##### Step 1: Create Path
1. Create sketch on XY plane
2. Draw S-curve using Arc tool:
   - Start at (0, 0)
   - Curve up to (50, 100)
   - Curve back to (100, 0)
3. Close sketch

##### Step 2: Create Profile
1. Create new sketch perpendicular to path start
2. Draw circle: Ø20mm
3. This circle will follow the path

##### Step 3: Sweep Operation
1. Click **Sweep** in Modeling toolbar
2. **Select profile**: Click the circle sketch
3. **Select path**: Click the S-curve
4. **Preview**: Shows tube following path
5. **Click OK**
6. Beautiful curved tube appears!

#### Spiral/Helix Example: Screw Thread

##### Setup
1. Create vertical cylinder (20mm Ø)
2. Create profile: small triangle (thread cross-section)
3. Path: Helical curve (spiral) around cylinder

##### Sweep with Twist
1. Sweep profile along helix path
2. Set **twist angle**: 60° (or desired pitch)
3. Profile rotates as it follows path
4. Auto-generates accurate thread geometry

### Loft: Blend Between Profiles

**Loft smoothly transitions between multiple 2D profiles.**

**Real-world examples:**
- Airplane fuselage (blends wing to tail)
- Vase (narrow base → wide middle → narrow top)
- Bottle shapes
- Car hood (smooth transition from fender to windshield)

#### Simple Loft Example: Tapered Cone

##### Step 1: Create First Profile
1. Create sketch on XY plane
2. Draw circle: Ø50mm
3. Close sketch

##### Step 2: Create Second Profile
1. Create new sketch on plane 100mm above
2. Draw circle: Ø20mm (smaller)
3. Close sketch

##### Step 3: Loft Operation
1. Click **Loft** in Modeling toolbar
2. **Select profiles**: Click circle 1, then circle 2
3. **Preview**: Shows smooth taper
4. **Click OK**
5. Perfect cone shape (taper in 2D)

#### Advanced Loft: Organic Shape (Vase)

##### Profiles
1. **Base**: Circle Ø30mm
2. **Middle**: Circle Ø60mm (widest point)
3. **Upper**: Circle Ø40mm
4. **Neck**: Circle Ø20mm

##### Loft All Together
1. Click **Loft**
2. **Select all 4 profiles** in order (bottom to top)
3. System auto-generates smooth transitions
4. Beautiful vase shape emerges!

### Key Differences

| Feature | Sweep | Loft |
|---------|-------|------|
| **Inputs** | 1 profile + 1 path | 2+ profiles |
| **Result** | Profile follows path | Profiles blend |
| **Best for** | Pipes, threads, curves | Organic, smooth shapes |
| **Complexity** | Medium | Medium-High |

### Tips & Tricks

#### Sweep Tips
- Profile can be **at an angle** to path (not perpendicular)
- **Twist angle** for helixes and screws
- Path can be **open** or **closed** (for circular sweep)

#### Loft Tips
- Profiles should have **same number of sides** (2 circles, 4 squares, etc.)
- Order matters: **bottom to top** or **front to back**
- **Reorder profiles** if result looks twisted
- Use **normal loft** vs **ruled surface** for different blending

### Common Mistakes

1. **Path intersects itself**: Sweep will fail. Use simpler path.
2. **Profiles with different shapes**: Loft expects same topology. Blend circles to circles, squares to squares.
3. **Profile on wrong plane**: Sweep expects perpendicular. Check alignment.
4. **Forgetting to close sketches**: Both sweep and loft need closed profiles.

### What You Learned
✓ Sweep profiles along paths (pipes, threads)
✓ Twist for helixes
✓ Loft between multiple profiles (organic shapes)
✓ Vases, tapers, complex geometry
✓ Common mistakes to avoid

---

## 8. Assembly Basics

**Time: 40 minutes | Difficulty: Intermediate**

### What is an Assembly?
Collection of parts (components) constrained together with joints.

**Examples:**
- Machine with 50 parts bolted together
- Engine with cylinders, pistons, crankshaft
- Bicycle with frame, wheels, drivetrain

### Switching to Assembly Workspace

1. Click **Assembly** workspace button (top left)
2. Toolbar changes: "Add Component", "Mate", "Joint", "BOM"
3. Left panel shows assembly tree
4. Viewport shows 3D assembly view

### Step-by-Step: Simple Assembly

**Goal**: Assemble a bracket (base) with 2 posts and a top plate.

#### Step 1: Create Base Component
1. Already have base bracket from earlier tutorials
2. This is your **first component** (reference part)
3. It's automatically fixed in place

#### Step 2: Add First Post
1. Click **Add Component** in toolbar
2. File browser opens
3. Load "post.ccad" (your post part)
4. Click on 3D view to place it (appears at origin, overlaps base)
5. Post is now a separate body in assembly

#### Step 3: Align with Mate Constraint
1. Click **Mate** in toolbar
2. **Select face on post**: the bottom flat surface
3. **Select matching face on base**: the mounting surface where post should attach
4. Faces align perfectly!
5. Post is now positioned correctly

#### Step 4: Add Second Post
1. **Add Component** again, load "post.ccad"
2. Click 3D view to place second post
3. **Mate** its bottom to base at other mounting location
4. Both posts now in correct positions

#### Step 5: Add Top Plate
1. **Add Component**, load "plate.ccad"
2. Click to place
3. **Mate** bottom of plate to top faces of both posts
4. Plate sits on both posts
5. Assembly is complete!

#### Step 6: Generate BOM
1. Click **Generate BOM** in toolbar
2. Dialog appears showing:
   - 1× Base Bracket
   - 2× Post
   - 1× Top Plate
   - **Total Weight**: 2.5 kg (if materials assigned)
3. **Export as CSV** for manufacturing team

### Understanding Joints

#### Mate Joint
- Two surfaces touch
- No rotation or translation
- **Use for**: Flat surfaces connecting

#### Fixed Joint
- Component locked in place
- Zero degrees of freedom
- **Use for**: Stationary reference parts

#### Revolute Joint (Hinge)
- Rotation around axis
- **Parameters**: Axis direction, angle limits
- **Use for**: Doors, wheels, levers

#### Prismatic Joint (Slider)
- Translation along axis
- **Parameters**: Direction, distance limits
- **Use for**: Pistons, drawers, sliding doors

#### Ball Joint
- Rotation in all directions
- **Parameters**: Center point, rotation limits
- **Use for**: Ball-and-socket, universal joints

### Checking Assembly

#### Interference Detection
1. Click **Validate** → **Check Interference**
2. System finds overlapping components
3. **Highlights problem areas** in red
4. You fix by adjusting positions or dimensions

#### Measuring Distances
1. **Click edge/face** to select
2. **Properties panel** shows coordinates
3. Can measure clearances between parts

### Exploded View Animation

1. **Assembly Complete** → Click **Explode**
2. Components move outward from assembly
3. Can be recorded as video (.mp4)
4. Great for assembly instructions or marketing

### Tips for Good Assemblies

1. **Use fixed/reference parts first** (stationary frame)
2. **Add components in logical order** (bottom up or structural)
3. **Name your components** descriptively ("Base", "Front Post", "Top Plate")
4. **Check interference** early to catch problems
5. **Use appropriate joint types** (revolute for rotating parts)
6. **Document BOM** for manufacturing

### What You Learned
✓ Adding components to assemblies
✓ Mate constraints (align surfaces)
✓ Different joint types (fixed, revolute, prismatic, ball)
✓ Interference detection
✓ BOM generation for manufacturing
✓ Exploded view animation

---

## 9. 2D Engineering Drawings

**Time: 35 minutes | Difficulty: Intermediate**

### What is an Engineering Drawing?
Formal 2D representation of 3D model with all dimensions, tolerances, and manufacturing specifications.

**Used by**: Machinists, manufacturers, assemblers

### Switching to Drawing Workspace

1. Click **Drawing** workspace
2. Left panel shows "Sheets" (pages)
3. Center shows 2D paper with views
4. Toolbar has: View tools, Dimension, Note, GD&T

### Creating Your First Drawing

#### Step 1: Create New Sheet
1. Click **New Sheet** in toolbar
2. Choose paper size:
   - **A4** (210×297mm): Small parts
   - **A3** (297×420mm): Medium assemblies
   - **A2** (420×594mm): Large assemblies
3. Blank white page appears

#### Step 2: Add Front View
1. Click **Add View** → **Front View**
2. Cursor changes to crosshair
3. **Click on paper** to place front orthographic view
4. 3D model appears as 2D projection from front
5. Can drag to reposition

#### Step 3: Add Top View
1. Click **Add View** → **Top View**
2. Usually placed **above front view** (engineering standard)
3. System auto-aligns (same horizontal position)
4. Shows top-down projection

#### Step 4: Add Isometric View
1. **Add View** → **Isometric**
2. Place in corner (top right is standard)
3. Shows 3D view on 2D paper for quick reference

#### Step 5: Add Dimensions
1. Click **Dimension** tool
2. **Click edge** (e.g., width of part)
3. Click on drawing to place dimension
4. Auto-populated with actual measurement!
5. Shows "100.5" (if that's the real size)
6. **Repeat for critical features**: width, height, hole diameters

#### Step 6: Add Tolerance (Manufacturing Allowance)
1. Click dimension text
2. **Edit tolerance**: change "100" to "100±0.5"
3. Tells machinist: must be between 99.5 and 100.5mm
4. Very important for fit and function

#### Step 7: Add Notes
1. Click **Note** tool
2. Click location on drawing
3. Type: "MATERIAL: Aluminum 6061"
4. Add more: "FINISH: Anodize, Clear"
5. "NOTES: Do not bend sharp corners"

#### Step 8: Insert Title Block
1. Click **Title Block** in toolbar
2. Pre-formatted block appears (bottom right)
3. Auto-fills: Part number, date, scale
4. Edit fields:
   - Company name
   - Part name
   - Revision number
   - Drawn by (your name)

#### Step 9: Export as PDF
1. **File** → **Export**
2. Format: **PDF**
3. Name: "bracket-drawing.pdf"
4. Click Export
5. Professional drawing ready for manufacturing!

### GD&T (Geometric Dimensioning & Tolerancing)

**More precise than simple tolerances. Uses symbols:**

| Symbol | Means | Example |
|--------|-------|---------|
| ⌀ | Diameter | ⌀10±0.1 |
| □ | Position | Position ±0.2 |
| ⏊ | Perpendicularity | Surface ⏊ to datum A |
| ∥ | Parallelism | Surface ∥ to datum A |
| ⌒ | Profile | Profile ±0.5 |

**Use GD&T for high-precision parts** (aerospace, medical, automotive).

### Section Views (Advanced)

**Show internal features by cutting away part of the drawing.**

1. **Add View** → **Section View**
2. Define cutting plane on front view
3. System shows cross-section
4. Great for showing holes, channels, internal details

### Annotation Best Practices

1. **Dimension critical features only** (not every edge)
2. **Place dimensions outside profile** (for clarity)
3. **Use geometric chains**: A→B→C (not A→B, A→C)
4. **Add notes for non-obvious requirements**:
   - Material grade
   - Surface finish
   - Heat treatment
   - Assembly instructions
5. **Check scale** (1:1 for detailed parts, 1:2 for large assemblies)
6. **Add revision block** with date and "ECO" (Engineering Change Order) number

### Standard Practices

- **Front view**: Most descriptive profile
- **Top/Right views**: Additional clarity
- **Isometric**: Quick 3D reference
- **Dimensions**: Top to bottom, largest to smallest
- **Tolerances**: Tighter for critical features (fits, threads)

### Checking Your Drawing

1. **Print preview** (File → Print)
2. Verify all dimensions visible
3. No overlapping annotations
4. Title block complete
5. Scale correct

### What You Learned
✓ Create new drawing sheets
✓ Add orthographic views (Front, Top, Right)
✓ Add isometric view
✓ Dimension features with tolerances
✓ Add notes and specifications
✓ GD&T symbols for precision
✓ Section views for internal details
✓ Title blocks and revision tracking
✓ Export as PDF for manufacturing

---

## 10. AI Features

**Time: 25 minutes | Difficulty: Intermediate**

### What is the AI Copilot?
Natural language interface to cycleCAD. Describe what you want → AI generates geometry.

### Text-to-CAD Example

**Goal**: Create a "50mm socket head cap bolt"

#### Method 1: Type Description
1. Click **AI** workspace button
2. Type: "Create a socket head cap bolt, 50mm long, M10 thread, DIN 912"
3. Press Enter
4. AI analyzes: M10 = 10mm diameter thread, DIN 912 = standard, head = hex socket
5. **Complete bolt appears** in 30 seconds!
6. All parametric: change length → updates automatically

#### Method 2: Voice Input
1. Click **Microphone** button in AI panel
2. Say: "Make a 100mm diameter cylinder with a 30mm hole in the middle"
3. AI processes speech → text
4. Same result as typing

### Part Identification

**Goal**: Identify a part from photo

#### Steps
1. Click **Upload Image** in AI panel
2. Take photo with phone or upload existing image
3. AI analyzes: "This is a **M5 hex nut, stainless steel"**
4. Provides options:
   - **McMaster-Carr link** to buy it
   - **Estimated cost**: $0.25
   - **3D model** (generic M5 hex nut)
5. Can add to assembly immediately

### Design Suggestions

**Goal**: Improve a design**

#### Steps
1. Create a part (basic box)
2. Click **Design Review** in AI panel
3. AI analyzes:
   - "Corners are sharp - recommend fillet radius 2-3mm"
   - "Weight is 2.5kg - aluminum might be overkill"
   - "Thin walls (1.2mm) - increase to 1.5mm for strength"
4. **One-click apply** suggestions
5. Model updates with improvements

### Feature Generation

**Goal**: "Add 12 holes in a circular pattern"**

1. Type the request
2. AI asks: "Hole diameter?" → Type "M5"
3. AI asks: "Which face?" → Click face in 3D view
4. **12 holes appear** automatically!
5. Perfectly spaced, fully parametric

### AI Limitations & Fallbacks

- **Doesn't understand every shape** (very organic/complex)
- **Works best with simple descriptions**: "box", "cylinder", "bolt", "gear"
- **Fuzzy features**: "looks like an S-curve" might be approximated
- **Parametric link**: You can always adjust manually afterward

### Privacy & Data

- **Text descriptions** are NOT stored (if offline)
- **Images** are processed server-side, not stored
- **Pro users**: Can disable cloud processing (local AI only)
- **Enterprise**: Self-hosted AI server available

### Tips for Best Results

1. **Be specific**: "50mm long socket head cap bolt" beats "make a bolt"
2. **Use standard names**: AI knows "ISO 4762", "DIN 912", "UNC"
3. **Leverage suggestions**: Let AI improve first iteration
4. **Combine with manual**: Use AI to rough sketch, then refine by hand
5. **Save successful designs**: Create library of AI-generated parts

### What You Learned
✓ Text-to-CAD from descriptions
✓ Voice input for hands-free control
✓ Part identification from images
✓ Design review & improvement suggestions
✓ Feature generation automation
✓ Privacy & data handling
✓ Best practices for AI prompts

---

## 11-20: Advanced Topics

The remaining tutorials (B-Rep kernel, CAM, FEA, Collaboration, Plugins, STEP import, Docker, custom modules, and Agent API) are documented in dedicated files:

- **B-Rep Kernel**: See `/docs/BREP-TUTORIAL.md`
- **CAM Toolpath**: See `/docs/CAM-INTEGRATION.md`
- **FEA Simulation**: See `/docs/SIMULATION-GUIDE.md`
- **Collaboration**: See `/docs/COLLABORATION-TUTORIAL.md`
- **Plugins**: See `/docs/PLUGIN-DEVELOPMENT.md`
- **STEP Import/Export**: See `/docs/STEP-WORKFLOW.md`
- **Docker Self-Hosting**: See `/docs/DOCKER-DEPLOYMENT.md`
- **Custom LEGO Modules**: See `/docs/KERNEL-MODULES.md`
- **Agent API**: See `/docs/AGENT-API-QUICKSTART.md`

---

## Quick Reference by Use Case

### I want to 3D print something
1. Sketch → Extrude → Fillet edges
2. CAM workspace → Add supports (if needed)
3. Export as STL
4. Slice with Cura / Prusaslicer
5. Send to printer

### I want to manufacture on CNC
1. Design part
2. CAM workspace → Select CNC machine
3. Choose tools (end mill, drill)
4. Add operations (face mill, pocket, drill)
5. Preview path → export G-code
6. Load on CNC

### I want to share design with team
1. Save to cloud (Pro feature)
2. Collaborate workspace → Invite team members
3. All see changes in real-time
4. Use chat for feedback

### I want professional renders
1. Complete modeling in Design
2. Switch to Render workspace
3. Add materials (metalness, roughness)
4. Add lighting (directional, point, spot)
5. Add environment (HDRI background)
6. Export high-res PNG/JPEG

### I want to analyze stress
1. Complete modeling in Design
2. Switch to Simulation workspace
3. Apply loads and constraints
4. Choose material (steel, aluminum)
5. Run FEA solver
6. View stress map (red = danger)

---

## Learning Path Recommendation

**If you have 2 hours:**
1. Tutorial 1 (15 min): Your First Part
2. Tutorial 2 (20 min): Sketch Basics
3. Tutorial 3 (15 min): Workspaces overview
4. Tutorial 6 (30 min): Boolean Operations

**If you have 4 hours:**
All beginner tutorials (1-5) + Intermediate (6-10)

**If you have full day:**
Beginner (1-5) + Intermediate (6-10) + Advanced (11-15)

**If you're a developer:**
Start with tutorials 16-20 (plugins, API, Docker)

---

## Next Steps

- Join community Discord for help
- Share your designs on Marketplace
- Read full API documentation
- Watch video tutorials on YouTube channel
- Experiment! The best way to learn is by doing.

**Happy designing!**
