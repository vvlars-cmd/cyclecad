# cycleCAD Fusion 360 Parity Features Guide

Complete reference for all cycleCAD features organized by workspace, with Fusion 360 comparison.

---

## TABLE OF CONTENTS

1. [Sketch Workspace](#sketch-workspace)
2. [Solid Workspace](#solid-workspace)
3. [Surface Workspace](#surface-workspace)
4. [Assembly Workspace](#assembly-workspace)
5. [Manufacturing/CAM Workspace](#manufacturingcam-workspace)
6. [Drawing Workspace](#drawing-workspace)
7. [Render Workspace](#render-workspace)
8. [Simulation Workspace](#simulation-workspace)
9. [Inspection Workspace](#inspection-workspace)
10. [Data Management](#data-management)

---

## SKETCH WORKSPACE

### Overview
The Sketch workspace provides 2D geometry creation with powerful constraint solving. All sketches are parametric and update dynamically when dimensions change.

### Sketch Tools

#### Line Tool
**What it does:** Creates straight line segments connecting points.

**Access:**
- Menu: Sketch > Line
- Keyboard: `L`
- Toolbar: Click line icon

**Step-by-step usage:**
1. Click "Line" in toolbar or press `L`
2. Click first point on canvas
3. Click second point to create line
4. Continue clicking to create additional lines
5. Press `Esc` to finish

**Tips:**
- Double-click to create a line from the endpoint back to the start (closed line)
- Hold `Shift` to constrain to 45° angles
- Use grid snapping for precise placement
- Lines snap to existing geometry (endpoints, midpoints, centers)

**Fusion 360 comparison:** Identical behavior. cycleCAD has the same line tool.

---

#### Rectangle Tool
**What it does:** Creates a rectangle with four corners defined by two diagonal points.

**Access:**
- Menu: Sketch > Rectangle
- Keyboard: `R`
- Toolbar: Click rectangle icon

**Step-by-step usage:**
1. Press `R` or click Rectangle
2. Click first corner point
3. Click opposite corner to complete rectangle
4. Dimensions auto-populate as default values

**Tips:**
- Hold `Shift` to create a square (equal width and height)
- Rectangle is constrained with coincident and perpendicular constraints
- Corners snap to grid for alignment
- Modify dimensions afterward in properties panel

**Fusion 360 comparison:** Same behavior. cycleCAD automatically applies constraints like Fusion 360.

---

#### Circle Tool
**What it does:** Creates a circle defined by center point and radius.

**Access:**
- Menu: Sketch > Circle
- Keyboard: `C`
- Toolbar: Click circle icon

**Step-by-step usage:**
1. Press `C` or click Circle
2. Click center point
3. Click to set radius (or type value in properties)
4. Press Esc to finish

**Tips:**
- Hold `Shift` while dragging to set radius by visual feedback
- Type the radius value directly for precision
- Multiple circles can be created in one session
- Circles snap to existing geometry

**Fusion 360 comparison:** cycleCAD circles work identically to Fusion 360.

---

#### Arc Tool
**What it does:** Creates arc segments in various ways (center-point, 3-point, tangent).

**Access:**
- Menu: Sketch > Arc
- Keyboard: `A`
- Toolbar: Click arc icon

**Step-by-step usage (3-point arc):**
1. Press `A`
2. Click start point
3. Click point on arc path
4. Click end point
5. Press Esc

**Step-by-step usage (center-point arc):**
1. Press `A` twice (or use mode selector)
2. Click center point
3. Click start point
4. Click end point to define arc sweep

**Tips:**
- 3-point arc is most intuitive for freehand arcs
- Center-point arc is better for precise angles
- Tangent arcs connect smoothly to adjacent lines
- Arc segments snap to endpoints

**Fusion 360 comparison:** Same capabilities. cycleCAD supports 3-point, center-point, and tangent arcs like Fusion 360.

---

#### Polyline Tool
**What it does:** Creates multiple connected line segments in rapid succession.

**Access:**
- Menu: Sketch > Polyline
- Keyboard: `P`
- Toolbar: Polyline icon (in line dropdown)

**Step-by-step usage:**
1. Press `P`
2. Click first point
3. Click additional points to build connected segments
4. Right-click to finish (or press `Esc`)
5. Double-click final point to close the path

**Tips:**
- Mix line and arc segments in one polyline
- Last segment auto-connects to first when double-clicking endpoint
- Shift-click to toggle between line and arc mode
- Useful for creating complex profiles rapidly

**Fusion 360 comparison:** cycleCAD polyline mirrors Fusion 360 functionality exactly.

---

#### Spline Tool
**What it does:** Creates smooth curves through multiple points (B-spline interpolation).

**Access:**
- Menu: Sketch > Spline
- Keyboard: `S`
- Toolbar: Spline icon

**Step-by-step usage:**
1. Press `S`
2. Click multiple points to define spline path
3. Right-click on final point to apply spline
4. Control points and handles appear (optional: drag to adjust curvature)

**Tips:**
- Splines are smoothly interpolated — curve passes through all points
- Hold `Ctrl` while dragging handle to adjust curvature at that point
- Splines can be constrained like lines (tangent, perpendicular, etc.)
- Edit spline by selecting it and dragging control points

**Fusion 360 comparison:** Identical. cycleCAD spline editing matches Fusion 360.

---

#### Text Tool
**What it does:** Adds text annotations to sketches (for reference only in design, used in drawings).

**Access:**
- Menu: Sketch > Text
- Keyboard: `T`
- Toolbar: Text icon

**Step-by-step usage:**
1. Press `T`
2. Click location for text anchor point
3. Type text in input box
4. Set font size and style in properties
5. Press Enter to place

**Tips:**
- Text is for annotation only (doesn't affect 3D model)
- Text size is 2D sketch units
- Can be rotated and moved like other sketch elements
- Useful for labeling features in drawings

**Fusion 360 comparison:** Same behavior. Text is primarily for drawing sheets.

---

### Sketch Constraints

#### Coincident Constraint
**What it does:** Forces two points to occupy the same location, or forces a point onto a line/curve.

**Access:**
- Menu: Sketch > Coincident
- Keyboard: `Co`
- Auto-applied when selecting overlapping geometry

**Usage:**
1. Select two points or a point and a line
2. Press `Co` or click Coincident
3. Constraint applied immediately

**Tips:**
- Most frequently used constraint
- Auto-applied when points overlap (can be disabled)
- Reduces degrees of freedom by 1
- Use to connect geometry pieces

**Fusion 360 comparison:** Identical to Fusion 360.

---

#### Horizontal Constraint
**What it does:** Forces a line segment to be perfectly horizontal.

**Access:**
- Menu: Sketch > Horizontal
- Keyboard: `H`

**Usage:**
1. Select a line segment
2. Press `H`
3. Line becomes horizontal

**Tips:**
- Only applies to line segments
- Over-constraining makes the line horizontal AND violates other constraints
- Check constraint count in status bar

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Vertical Constraint
**What it does:** Forces a line segment to be perfectly vertical.

**Access:**
- Menu: Sketch > Vertical
- Keyboard: `V`

**Usage:**
1. Select a line segment
2. Press `V`
3. Line becomes vertical

**Tips:**
- Only applies to lines
- Complementary to Horizontal constraint
- Check for over-constraint warnings

**Fusion 360 comparison:** Identical.

---

#### Perpendicular Constraint
**What it does:** Forces two line segments to meet at a 90° angle.

**Access:**
- Menu: Sketch > Perpendicular
- Keyboard: `Pe`

**Usage:**
1. Select two line segments
2. Press `Pe`
3. Segments become perpendicular

**Tips:**
- Only works on line segments
- Lines must share an endpoint
- Can be applied to lines at a distance (will move them to create 90° angle)

**Fusion 360 comparison:** Same behavior.

---

#### Parallel Constraint
**What it does:** Forces two line segments to be parallel (never intersect).

**Access:**
- Menu: Sketch > Parallel
- Keyboard: `Pa`

**Usage:**
1. Select two line segments
2. Press `Pa`
3. Segments become parallel

**Tips:**
- Works on any pair of lines
- Lines don't need to be connected
- Maintains relative angle
- Useful for creating symmetric geometry

**Fusion 360 comparison:** Identical.

---

#### Tangent Constraint
**What it does:** Forces a line to be tangent to a circle/arc, or two curves to touch at a single point.

**Access:**
- Menu: Sketch > Tangent
- Keyboard: `Ta`

**Usage:**
1. Select a line and a circle/arc
2. Press `Ta`
3. Line becomes tangent to circle

**Tips:**
- Creates smooth transitions in profiles
- Essential for sweep and loft operations
- Works with splines too
- Two arcs can be tangent to each other

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Equal Constraint
**What it does:** Forces two line segments to have equal length, or two circles to have equal radius.

**Access:**
- Menu: Sketch > Equal
- Keyboard: `Eq`

**Usage:**
1. Select two lines or two circles
2. Press `Eq`
3. Geometry becomes equal

**Tips:**
- For lines: both become the average length
- For circles: both become average radius
- Useful for symmetry
- Can be applied to multiple objects at once

**Fusion 360 comparison:** Identical.

---

#### Fixed Constraint
**What it does:** Locks a point or line in place (prevents all movement).

**Access:**
- Menu: Sketch > Fixed
- Keyboard: `F`

**Usage:**
1. Select a point or line segment
2. Press `F`
3. Element becomes fixed

**Tips:**
- Eliminates degrees of freedom
- Use sparingly (over-constraints sketch)
- Lock only essential geometry
- Can lock individual coordinates (X or Y only)

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Concentric Constraint
**What it does:** Forces two circles/arcs to share the same center point.

**Access:**
- Menu: Sketch > Concentric
- Keyboard: `Cc`

**Usage:**
1. Select two circles or arcs
2. Press `Cc`
3. Circles become concentric

**Tips:**
- Commonly used for holes inside parts
- Creates accurate bore patterns
- Works with circles, arcs, and ellipses
- Reduces degrees of freedom by 2

**Fusion 360 comparison:** Identical.

---

#### Symmetric Constraint
**What it does:** Forces two points or lines to be mirror-images across a line (symmetry line).

**Access:**
- Menu: Sketch > Symmetric
- Keyboard: `Sy`

**Usage:**
1. Select two points and a line
2. Press `Sy`
3. Points become symmetric about the line

**Tips:**
- Third selection is the symmetry axis (usually a line or construction line)
- Can apply to multiple point pairs
- Essential for building symmetric parts
- Automatically maintains reflection

**Fusion 360 comparison:** Same behavior.

---

#### Distance Constraint
**What it does:** Sets the distance between two points, or a point and a line.

**Access:**
- Menu: Sketch > Distance
- Keyboard: `D`
- Double-click dimension value to edit

**Usage:**
1. Select two points or a point and a line
2. Press `D`
3. Dimension appears; type value in dialog
4. Press Enter to apply

**Tips:**
- Most important constraint for controlling size
- Can be parameterized (reference to parameter)
- Negative distance is allowed (inverts direction)
- Can constrain distance from origin (0,0)

**Fusion 360 comparison:** Identical.

---

#### Angle Constraint
**What it does:** Sets the angle between two line segments.

**Access:**
- Menu: Sketch > Angle
- Keyboard: `An`

**Usage:**
1. Select two line segments
2. Press `An`
3. Angle dimension appears; type value (in degrees)
4. Press Enter

**Tips:**
- Angle is measured counter-clockwise from first line to second
- Valid range: 0° to 360°
- Use for precise angular relationships
- Useful for creating gear teeth, draft angles, etc.

**Fusion 360 comparison:** Same as Fusion 360.

---

### Sketch Workflows

#### Creating a Constrained Sketch
**Objective:** Build a fully-constrained sketch that is parametric and updates correctly.

**Step-by-step:**
1. Start with base geometry (e.g., rectangle)
2. Add dimensions to control width and height
3. Check "Degrees of Freedom" indicator (should be 0)
4. Apply additional constraints as needed (parallel, perpendicular, symmetric, etc.)
5. When DOF = 0, sketch is fully constrained

**Tips:**
- Constraint solver shows red geometry if over-constrained
- Yellow geometry = under-constrained
- Green geometry = fully constrained
- Undo constraint if over-constrained and re-approach problem

---

#### Converting to Construction Geometry
**What it does:** Marks sketch geometry as reference-only (doesn't extrude or revolved).

**Usage:**
1. Select line, circle, or arc
2. Right-click > "Construction"
3. Geometry becomes dashed/lighter

**Tips:**
- Used for symmetry lines, center lines, reference lines
- Essential for creating accurate profiles
- Construction geometry helps constrain other geometry
- Toggle on/off without deleting

---

#### Mirroring Sketch Geometry
**What it does:** Creates mirror copy of selected geometry across a line.

**Usage:**
1. Select geometry to mirror
2. Menu: Sketch > Mirror
3. Select mirror line
4. Mirrored geometry appears automatically constrained

**Tips:**
- Mirrored geometry stays linked to original
- Edit original, mirror updates automatically
- Use symmetry constraint instead for more control
- Useful for building symmetric parts quickly

---

---

## SOLID WORKSPACE

### Overview
The Solid workspace transforms 2D sketches into 3D geometry using parametric operations. All features are history-based and remain editable.

### Base Operations

#### Extrude
**What it does:** Pulls a 2D sketch profile into 3D space by a specified distance, creating a solid.

**Access:**
- Menu: Solid > Extrude
- Keyboard: `E`
- Toolbar: Extrude icon

**Step-by-step usage:**
1. Create and constrain a sketch
2. Exit sketch (Esc)
3. Press `E` or click Extrude
4. Select the sketch profile (or it auto-selects if only one sketch exists)
5. Set extrude distance (direction up/down or symmetric)
6. Click "OK" to create feature

**Tips:**
- Symmetric extrude spreads distance equally above and below sketch plane
- Hold `Shift` while dragging to preview extrude direction
- Extrude can be tapered (angle for draft)
- Extrude length can reference parameters
- Negative distance extrudes opposite direction

**Fusion 360 comparison:** Identical to Fusion 360 Extrude.

---

#### Revolve
**What it does:** Rotates a 2D profile around an axis to create a solid of revolution (like a spinning lathe).

**Access:**
- Menu: Solid > Revolve
- Keyboard: `R`
- Toolbar: Revolve icon

**Step-by-step usage:**
1. Create a profile sketch (must include a center line for axis)
2. Exit sketch
3. Press `R` or click Revolve
4. Select sketch profile
5. Select the axis line (or it auto-detects if centerline exists)
6. Set rotation angle (default 360° for full revolution)
7. Click "OK"

**Tips:**
- Axis MUST be a separate line in the sketch (not part of profile)
- Profile must not cross the axis (it will create self-intersecting geometry)
- Profile should be on one side of axis only
- Full 360° creates complete rotationally symmetric part (e.g., cylinder, cone)
- Partial revolution angle creates sectors (e.g., pie-shaped features)

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Sweep
**What it does:** Moves a 2D profile along a 3D path, creating a swept surface or solid.

**Access:**
- Menu: Solid > Sweep
- Keyboard: `Sw`
- Toolbar: Sweep icon

**Step-by-step usage:**
1. Create profile sketch (2D closed or open shape)
2. Create path sketch or edge (3D curve defining movement)
3. Exit sketches
4. Press `Sw` or click Sweep
5. Select profile sketch
6. Select path (line, arc, 3D spline, or edge)
7. Set options (twist angle, scale along path)
8. Click "OK"

**Tips:**
- Profile should be perpendicular to path start point
- Path can twist: set twist angle for helical sweeps (springs, threads)
- Scale along path: profile grows/shrinks following path (e.g., cone from sweep)
- Multiple profiles can sweep along one path (advanced)
- Path must be continuous (no branches)

**Fusion 360 comparison:** Identical to Fusion 360 Sweep.

---

#### Loft
**What it does:** Interpolates between multiple 2D profiles to create a smooth solid (like morphing between shapes).

**Access:**
- Menu: Solid > Loft
- Keyboard: `Lo`
- Toolbar: Loft icon

**Step-by-step usage:**
1. Create multiple sketch profiles at different heights or planes
2. Exit sketches
3. Press `Lo` or click Loft
4. Select first profile
5. Select second profile
6. Repeat if more profiles exist
7. Set continuity (Positional, Tangent, Curvature)
8. Click "OK"

**Tips:**
- Profiles should have same number of points and similar topology
- Tangent continuity creates smooth surfaces (Catmull-Rom style)
- Can loft from point to circle (cone), circle to rectangle, etc.
- Loft order matters (first to last)
- Circular sections interpolate smoothly

**Fusion 360 comparison:** Same as Fusion 360 Loft.

---

### Modification Operations

#### Fillet
**What it does:** Rounds sharp edges on a solid, creating smooth transitions.

**Access:**
- Menu: Solid > Fillet
- Keyboard: `Fi`
- Toolbar: Fillet icon

**Step-by-step usage:**
1. Create a solid body
2. Press `Fi` or click Fillet
3. Select edges to fillet (click multiple edges)
4. Set radius value (default 5mm)
5. Click "OK"

**Tips:**
- Select edge by clicking on it (not the face)
- Can fillet multiple edges in one operation
- Radius must be smaller than adjacent geometry
- Variable radius: set different radii for different edges
- Fillet on both sides: positive radius filleted smoothly, negative creates sharp bevel
- Chain selection: Shift-click adjacent edges to select continuous edge loops

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Chamfer
**What it does:** Cuts away sharp edges with a flat or angled surface.

**Access:**
- Menu: Solid > Chamfer
- Keyboard: `Ch`
- Toolbar: Chamfer icon

**Step-by-step usage:**
1. Create a solid body
2. Press `Ch` or click Chamfer
3. Select edges to chamfer
4. Set chamfer distance (or angle and distance for angled chamfer)
5. Click "OK"

**Tips:**
- Select edges like with Fillet
- Distance is typically smaller than fillet
- Angle + distance: angle from surface, distance along surface
- Useful for deburring and functional design
- Chain selection works same as Fillet

**Fusion 360 comparison:** Identical to Fusion 360.

---

#### Shell
**What it does:** Removes material from a solid, creating a hollow shell with uniform wall thickness.

**Access:**
- Menu: Solid > Shell
- Keyboard: `Sh`
- Toolbar: Shell icon

**Step-by-step usage:**
1. Create a solid body
2. Press `Sh` or click Shell
3. Select faces to remove (click faces, or leave empty to remove none)
4. Set wall thickness (uniform throughout)
5. Click "OK"

**Tips:**
- Remove top face for open container
- Remove multiple faces for complex shapes
- Wall thickness applies to all remaining faces
- Interior surfaces appear with thickness
- Useful for creating containers, enclosures, thin-wall parts

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Draft
**What it does:** Applies a draft angle to faces (taper for molding, casting, or functional reasons).

**Access:**
- Menu: Solid > Draft
- Keyboard: `Dr`
- Toolbar: Draft icon

**Step-by-step usage:**
1. Create a solid body
2. Press `Dr` or click Draft
3. Select faces to draft
4. Set draft plane (reference plane)
5. Set draft angle (typically 5-10°)
6. Click "OK"

**Tips:**
- Draft plane determines direction of taper
- Positive angle tapers one direction, negative tapers opposite
- Essential for injection molding and casting
- Multiple faces can have different angles in one operation
- Pull direction must be consistent for functional draft

**Fusion 360 comparison:** Identical.

---

### Pattern Operations

#### Rectangular Pattern
**What it does:** Creates an array of features in a rectangular grid (X and Y directions).

**Access:**
- Menu: Solid > Rectangular Pattern
- Keyboard: `Pr`
- Toolbar: Pattern icon

**Step-by-step usage:**
1. Create a feature (extrude, hole, etc.)
2. Press `Pr` or click Rectangular Pattern
3. Select feature to pattern
4. Set X count (number of columns)
5. Set Y count (number of rows)
6. Set X spacing and Y spacing
7. Click "OK"

**Tips:**
- Feature is duplicated (count-1) times in each direction
- Spacing is measured from feature center to feature center
- Can pattern holes, bosses, slots, etc.
- All instances are synchronized (edit original, all instances update)
- Spacing can be negative (reverses direction)

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Circular Pattern
**What it does:** Creates an array of features arranged in a circle around a central axis.

**Access:**
- Menu: Solid > Circular Pattern
- Keyboard: `Pc`
- Toolbar: Circular Pattern icon

**Step-by-step usage:**
1. Create a feature
2. Press `Pc` or click Circular Pattern
3. Select feature to pattern
4. Select axis (or default to Z-axis)
5. Set count (total number of instances including original)
6. Set angle (360° for full circle, or less for partial)
7. Click "OK"

**Tips:**
- Count includes original feature
- Equal spacing around the circle
- Angle less than 360° creates partial arrays (e.g., 4 holes in a quarter circle)
- All instances update when original changes
- Useful for bolt holes, impellers, gear teeth, etc.

**Fusion 360 comparison:** Identical.

---

#### Mirror
**What it does:** Creates a mirror-image of a feature across a plane.

**Access:**
- Menu: Solid > Mirror
- Keyboard: `Mi`
- Toolbar: Mirror icon

**Step-by-step usage:**
1. Create a feature (extrude, hole, etc.)
2. Press `Mi` or click Mirror
3. Select feature to mirror
4. Select mirror plane (XY, YZ, XZ, or custom plane)
5. Click "OK"

**Tips:**
- Mirror plane must be perpendicular to the feature
- Useful for symmetric parts
- Mirrored feature stays linked to original
- Edit original, mirror updates automatically
- Can mirror multiple features in one operation

**Fusion 360 comparison:** Same as Fusion 360.

---

### Boolean Operations

#### Boolean Union
**What it does:** Combines two bodies into one, merging their volumes.

**Access:**
- Menu: Solid > Boolean > Union
- Keyboard: `Bu`

**Step-by-step usage:**
1. Create two separate bodies
2. Press `Bu` or click Union
3. Select first body
4. Select second body (or multiple bodies)
5. Click "OK"

**Tips:**
- Overlapping volumes merge smoothly
- Single resulting body
- Order of selection doesn't matter
- Can union 3+ bodies in one operation
- Result inherits properties of first body

**Fusion 360 comparison:** Identical.

---

#### Boolean Cut
**What it does:** Subtracts one body from another (like using a cutting tool).

**Access:**
- Menu: Solid > Boolean > Cut
- Keyboard: `Bc`

**Step-by-step usage:**
1. Create two bodies (one to keep, one to remove)
2. Press `Bc` or click Cut
3. Select target body (the one to keep)
4. Select tool body (the one to subtract)
5. Click "OK"

**Tips:**
- Keep material from first body, subtract second body
- Tool body is deleted after cut
- Order of selection matters (first = target, second = tool)
- Can use complex shapes as cutting tools
- Creates clean boolean geometry

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Boolean Intersect
**What it does:** Keeps only the overlapping volume between two bodies.

**Access:**
- Menu: Solid > Boolean > Intersect
- Keyboard: `Bi`

**Step-by-step usage:**
1. Create two overlapping bodies
2. Press `Bi` or click Intersect
3. Select first body
4. Select second body
5. Click "OK"

**Tips:**
- Result is the overlap region only
- Both input bodies are consumed
- Useful for finding common geometry
- Less commonly used than Union and Cut
- Result may be empty if bodies don't overlap

**Fusion 360 comparison:** Identical.

---

### Advanced Operations

#### Boundary Surface
**What it does:** Creates a surface bounded by multiple curves or edges (like stretching a membrane).

**Access:**
- Menu: Solid > Boundary Surface
- Keyboard: `Bo`

**Step-by-step usage:**
1. Select multiple edges or curves forming a closed loop
2. Press `Bo` or click Boundary Surface
3. Set continuity (Positional, Tangent, Curvature)
4. Click "OK"

**Tips:**
- Edges must form a closed loop
- Can use sketch curves or model edges
- Tangent continuity creates smooth surfaces
- Useful for complex freeform surfaces
- Can fill holes or create sculptural shapes

**Fusion 360 comparison:** Same as Fusion 360 Boundary Surface.

---

#### Rib/Web
**What it does:** Creates a thin reinforcing wall between faces (like adding structural support).

**Access:**
- Menu: Solid > Rib
- Keyboard: `Rb`

**Step-by-step usage:**
1. Create a profile sketch on a face (perpendicular to face)
2. Exit sketch
3. Press `Rb` or click Rib
4. Select profile sketch
5. Set thickness and direction
6. Click "OK"

**Tips:**
- Ribs typically protrude from surface
- Thickness is uniform throughout
- Can create multiple ribs in one operation
- Useful for adding strength without mass
- Profile should be open (not closed)

**Fusion 360 comparison:** Identical.

---

#### Thicken
**What it does:** Converts a surface into a solid with uniform thickness.

**Access:**
- Menu: Solid > Thicken
- Keyboard: `Th`

**Step-by-step usage:**
1. Create a surface (boundary, loft, etc.)
2. Press `Th` or click Thicken
3. Select surface
4. Set thickness value
5. Click "OK"

**Tips:**
- Surface becomes a thin solid
- Thickness applies symmetrically (half each side)
- Can add inside or outside
- Useful for thin-wall parts from surfacing
- Result is a closed solid body

**Fusion 360 comparison:** Same as Fusion 360.

---

---

## SURFACE WORKSPACE

### Overview
The Surface workspace creates freeform surfaces using advanced operations. Surfaces can be combined with solids for complex designs.

### Surface Tools

#### Fitted Surface
**What it does:** Creates a smooth surface through scattered points or curves (interpolation).

**Access:**
- Menu: Surface > Fitted Surface
- Keyboard: `Fs`

**Step-by-step usage:**
1. Select multiple curves, edges, or points
2. Press `Fs` or click Fitted Surface
3. Set continuity (Positional, Tangent, Curvature)
4. Click "OK"

**Tips:**
- Surface passes through or near input geometry
- More control points = more undulation
- Curvature continuity = most smooth
- Useful for organic shapes (car bodies, helmets, etc.)
- Can adjust UV direction and topology

---

#### Fill Surface
**What it does:** Creates a surface patch that fills a boundary loop.

**Access:**
- Menu: Surface > Fill
- Keyboard: `Fl`

**Step-by-step usage:**
1. Select edges forming a closed loop
2. Press `Fl` or click Fill
3. Set continuity options
4. Click "OK"

**Tips:**
- Result is a single surface spanning the boundary
- Continuity determines smoothness at edges
- Can fill complex boundaries
- Useful for closing holes or creating panels

---

#### Offset Surface
**What it does:** Creates a parallel surface at a distance from an existing surface.

**Access:**
- Menu: Surface > Offset
- Keyboard: `Of`

**Step-by-step usage:**
1. Select a surface
2. Press `Of` or click Offset
3. Set distance (positive = outward, negative = inward)
4. Click "OK"

**Tips:**
- Useful for creating shelling operations
- Handles complex surface topologies
- Large offsets may fail if geometry pinches
- Can create 3D printing molds

---

#### Trim Surface
**What it does:** Cuts away part of a surface using planes, faces, or curves.

**Access:**
- Menu: Surface > Trim
- Keyboard: `Tr`

**Step-by-step usage:**
1. Select surface to trim
2. Press `Tr` or click Trim
3. Select trimming tool (plane, face, or curve)
4. Click "OK"

**Tips:**
- Removes portion of surface on one side of trimming tool
- Can trim multiple surfaces with one tool
- Result is a trimmed surface (edge may need cleaning)

---

---

## ASSEMBLY WORKSPACE

### Overview
The Assembly workspace combines multiple part bodies and constrains their relationships using joints and mates.

### Assembly Basics

#### Insert Component
**What it does:** Adds a new part (body) to the assembly.

**Access:**
- Menu: Assembly > Insert
- Keyboard: `I` (in assembly)
- Toolbar: Insert Component icon

**Step-by-step usage:**
1. Press `I` or click Insert Component
2. Select part file or create new part
3. Click in 3D view to place component
4. Press Esc to finish placement
5. Add joint constraints to position it

**Tips:**
- Components can be cycleCAD parts or imported STEP files
- First component placement is freeform (move/rotate anywhere)
- Subsequent components should be constrained with joints
- Components remain editable in assembly context

**Fusion 360 comparison:** Similar to Fusion 360 Insert Component.

---

### Joint Types

#### Rigid Joint
**What it does:** Locks two components together in fixed position and rotation (like welding).

**Access:**
- Menu: Assembly > Joint > Rigid
- Keyboard: `Jr`

**Step-by-step usage:**
1. Select two components
2. Press `Jr` or click Rigid Joint
3. Align faces/edges as needed
4. Click "OK"

**Tips:**
- Creates immovable connection
- Both components move together
- Often used for sub-assemblies
- Simplest joint type

**Fusion 360 comparison:** Identical.

---

#### Revolute Joint (Hinge)
**What it does:** Allows rotation around one axis (like a door hinge or knob).

**Access:**
- Menu: Assembly > Joint > Revolute
- Keyboard: `Jh`

**Step-by-step usage:**
1. Select two components
2. Press `Jh` or click Revolute Joint
3. Select axis line or edge (rotation axis)
4. Set angle limits (optional)
5. Click "OK"

**Tips:**
- Components rotate relative to each other
- Can specify angle limits (e.g., 0-90°)
- Can set friction/damping for motion study
- Useful for doors, levers, wheels, etc.

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Slider Joint
**What it does:** Allows one component to slide along an axis relative to another.

**Access:**
- Menu: Assembly > Joint > Slider
- Keyboard: `Js`

**Step-by-step usage:**
1. Select two components
2. Press `Js` or click Slider Joint
3. Select axis direction
4. Set travel limits (optional)
5. Click "OK"

**Tips:**
- Components can translate along axis
- Can specify distance limits
- Useful for pistons, drawer slides, etc.
- Axis must be defined by edge or constructed line

**Fusion 360 comparison:** Identical.

---

#### Ball Joint
**What it does:** Allows rotation in all directions around a point (like a ball-and-socket).

**Access:**
- Menu: Assembly > Joint > Ball
- Keyboard: `Jb`

**Step-by-step usage:**
1. Select two components
2. Press `Jb` or click Ball Joint
3. Select center point
4. Set rotation limits (optional cone angle)
5. Click "OK"

**Tips:**
- Maximally flexible rotation
- Can restrict cone angle for limited motion
- Useful for robotic joints, universal joints
- Reduces degrees of freedom by 3

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Planar Joint
**What it does:** Locks one plane to another plane (allows translation in plane, rotation around normal).

**Access:**
- Menu: Assembly > Joint > Planar
- Keyboard: `Jp`

**Step-by-step usage:**
1. Select two components
2. Press `Jp` or click Planar Joint
3. Select mating planes
4. Click "OK"

**Tips:**
- Useful for parts sliding on flat surface
- Reduces degrees of freedom by 3
- Can add additional constraints for more restriction
- Like placing a book on a table

**Fusion 360 comparison:** Identical.

---

#### Cylinder Joint
**What it does:** Locks axes together (rotation around axis + translation along axis).

**Access:**
- Menu: Assembly > Joint > Cylinder
- Keyboard: `Jc`

**Step-by-step usage:**
1. Select two components
2. Press `Jc` or click Cylinder Joint
3. Select axis (edge or constructed line)
4. Click "OK"

**Tips:**
- Like a piston in a cylinder
- Can translate and rotate along same axis
- Reduces degrees of freedom by 4
- Useful for rotating + moving parts

**Fusion 360 comparison:** Same as Fusion 360.

---

### Assembly Tools

#### Explode View
**What it does:** Creates an animated explosion showing how parts fit together.

**Access:**
- Menu: Assembly > Explode
- Keyboard: `Ex`
- Toolbar: Explode icon

**Step-by-step usage:**
1. Select components to explode (or all if none selected)
2. Press `Ex` or click Explode
3. Drag components outward in 3D view
4. Set animation timing
5. Click "OK" to save exploded state

**Tips:**
- Useful for assembly instructions and documentation
- Can be animated for presentations
- Multiple explosion states can be saved
- Explosion paths are recorded
- Reset to assembled state anytime

**Fusion 360 comparison:** Fusion 360 has Timeline for explosions; cycleCAD has direct explode tool.

---

#### Collision Detection
**What it does:** Finds interference between components (overlapping geometry).

**Access:**
- Menu: Assembly > Check Collisions
- Keyboard: `Cc`
- Toolbar: Collision icon

**Step-by-step usage:**
1. Complete assembly (all components positioned)
2. Press `Cc` or click Check Collisions
3. Colliding parts are highlighted in red
4. Violation details shown in panel
5. Adjust components to resolve

**Tips:**
- Essential quality check before manufacturing
- Shows exact volume of overlap
- Can create clearance report
- Run before exporting design

**Fusion 360 comparison:** Similar to Fusion 360 Interference Check.

---

---

## MANUFACTURING/CAM WORKSPACE

### Overview
The CAM workspace creates tool paths for CNC machining, 3D printing, and laser cutting from 2D and 3D geometry.

### CAM Basics

#### Setup
**What it does:** Defines the workpiece, stock, and machine type for CAM operations.

**Access:**
- Menu: CAM > Setup
- Keyboard: `Su`

**Step-by-step usage:**
1. Click Setup in CAM panel
2. Select Stock type (Box, Cylinder, or from geometry)
3. Set dimensions (length, width, height)
4. Select Machine type (3-axis mill, 4-axis, laser, etc.)
5. Click "OK"

**Tips:**
- Stock should be larger than final part
- Machine type determines available tool paths
- Multiple setups can be created for different operations
- Setup defines the anchor point and orientation

**Fusion 360 comparison:** Same as Fusion 360 CAM Setup.

---

#### Tool Library
**What it does:** Manages cutting tools (endmills, ball mills, etc.) with feeds/speeds.

**Access:**
- Menu: CAM > Tool Library
- Keyboard: `Tl`

**Step-by-step usage:**
1. Click Tool Library
2. Browse or create tool
3. Set dimensions: diameter, flute length, etc.
4. Set material compatibility (aluminum, steel, plastic)
5. Feeds and speeds auto-populate based on material
6. Click "Add to Library"

**Tips:**
- Library is persistent (saved with project)
- Can import standard tool libraries
- Feeds/speeds can be customized
- Tool material affects recommendations

---

### 2D Toolpaths

#### Contour (Profile)
**What it does:** Mills the outline/perimeter of a 2D sketch (cutting the edge).

**Access:**
- Menu: CAM > 2D > Contour
- Keyboard: `Cn`

**Step-by-step usage:**
1. Select a 2D sketch or face edge
2. Click Contour
3. Select tool from library
4. Set passes (depth per pass)
5. Set climb/conventional milling
6. Click "OK"

**Tips:**
- Used for cutting outer profiles
- Can cut inside or outside contour
- Climb milling = faster but more vibration
- Conventional = safer but slower
- Tool diameter affects final dimension

**Fusion 360 comparison:** Same as Fusion 360 Contour.

---

#### Pocket (Cavity)
**What it does:** Mills out an enclosed area to a specified depth (like creating a recess).

**Access:**
- Menu: CAM > 2D > Pocket
- Keyboard: `Pk`

**Step-by-step usage:**
1. Select a closed sketch or face
2. Click Pocket
3. Select tool
4. Set depth
5. Set passes
6. Click "OK"

**Tips:**
- Area inside closed profile is machined
- Multiple passes prevent tool breakage
- Tool diameter affects sharp corners
- Can use ball mill for smooth contours

**Fusion 360 comparison:** Identical.

---

#### Drilling
**What it does:** Creates a drilling operation (plunge straight down, rapid feed).

**Access:**
- Menu: CAM > 2D > Drill
- Keyboard: `Dr`

**Step-by-step usage:**
1. Select drill points (sketch points or construction points)
2. Click Drill
3. Select drill tool
4. Set depth
5. Click "OK"

**Tips:**
- Selects drill tool automatically based on hole size
- Can specify peck drilling (multiple steps)
- Rapid traverse above part, plunge to depth
- G-code output includes M03 spindle start

**Fusion 360 comparison:** Same as Fusion 360.

---

### 3D Toolpaths

#### Roughing
**What it does:** Removes bulk material quickly using large tool (prepares for finishing pass).

**Access:**
- Menu: CAM > 3D > Roughing
- Keyboard: `Rg`

**Step-by-step usage:**
1. Select body or face to machine
2. Click Roughing
3. Select large tool (roughing endmill)
4. Set step-down (vertical depth per pass)
5. Set step-over (horizontal spacing)
6. Click "OK"

**Tips:**
- Aggressive feeds/speeds (trades tool life for speed)
- Leaves finishing allowance (stock for final pass)
- Large step-over reduces time
- Heavier machine loads than finishing

**Fusion 360 comparison:** Identical to Fusion 360 Roughing.

---

#### Finishing
**What it does:** Fine cuts to achieve final dimensions and surface finish.

**Access:**
- Menu: CAM > 3D > Finishing
- Keyboard: `Fn`

**Step-by-step usage:**
1. Select body or face to finish
2. Click Finishing
3. Select finishing tool (ball mill or fine endmill)
4. Set small step-down and step-over
5. Set tight feeds/speeds for surface quality
6. Click "OK"

**Tips:**
- Precise tool path following surface contours
- Small step-over = smooth surface
- Ball mill = better for complex organic shapes
- Endmill = better for faceted geometry

**Fusion 360 comparison:** Same as Fusion 360.

---

### G-Code Output

#### Export G-Code
**What it does:** Generates CNC machine code (.NC, .GCode file) from tool paths.

**Access:**
- Menu: CAM > Export G-Code
- Keyboard: `Gc`

**Step-by-step usage:**
1. Complete all CAM setups and tool paths
2. Click Export G-Code
3. Select output format (Fanuc, Haas, Siemens, etc.)
4. Set post-processor options
5. Click "Save" and choose location

**Tips:**
- Different machine types use different dialects
- Post-processor translates to machine-specific code
- Verify code before running on machine
- Safe Z height is critical (prevent collisions)
- Feed rate units depend on post-processor (in/min or mm/min)

**Fusion 360 comparison:** Similar to Fusion 360 CAM Export.

---

#### Preview Tool Path
**What it does:** Simulates cutting operation (visualizes material removal).

**Access:**
- Menu: CAM > Preview
- Keyboard: `Pv`

**Step-by-step usage:**
1. Complete CAM setup
2. Click Preview
3. Watch animation of tool moving and cutting
4. Check for collisions or unexpected behavior
5. Can pause and inspect at any point

**Tips:**
- Essential before running real machine
- Shows tool holder clearance
- Detects collisions with clamps/fixtures
- Can slow down animation for detail inspection
- Use to verify feeds/speeds are reasonable

---

---

## DRAWING WORKSPACE

### Overview
The Drawing workspace creates 2D engineering drawings from 3D models, including views, dimensions, notes, and GD&T annotations.

### Creating Drawings

#### New Drawing
**What it does:** Creates a 2D drawing sheet from a 3D model.

**Access:**
- Menu: Drawing > New Sheet
- Keyboard: `Ns`

**Step-by-step usage:**
1. Click New Drawing
2. Select 3D model/body to draw
3. Choose sheet size (A4, A3, Letter, Ledger, custom)
4. Click "OK"

**Tips:**
- Multiple sheets can be created for complex drawings
- Sheet size affects scale of views
- Title block can be added
- Drawing views are live-linked to 3D model

**Fusion 360 comparison:** Same as Fusion 360 Drawing.

---

### Drawing Views

#### Orthographic Projection
**What it does:** Creates standard 2D projections (front, top, right side, isometric, etc.).

**Access:**
- Menu: Drawing > Views > Orthographic
- Keyboard: `Or`

**Step-by-step usage:**
1. On drawing sheet, click Orthographic View
2. Drag to place front view
3. Drag adjacent to place related views (top, right, etc.)
4. Scale and position as needed
5. Click "OK"

**Tips:**
- Views are parametrically linked to 3D model
- Edit 3D model, views update automatically
- Standard arrangement: front center, top above, right side right, etc.
- Hidden lines can be shown/hidden per view
- Views can be aligned and spaced evenly

**Fusion 360 comparison:** Identical to Fusion 360.

---

#### Sectional View (Cross-Section)
**What it does:** Shows interior details by cutting a slice through the model (like viewing a cut).

**Access:**
- Menu: Drawing > Views > Section
- Keyboard: `Se`

**Step-by-step usage:**
1. On drawing, click Section View
2. Select section plane (or create new plane)
3. Drag view location on sheet
4. Configure cutting plane direction
5. Click "OK"

**Tips:**
- Cutting plane line shown on main view (A-A, B-B, etc.)
- Cross-hatching indicates cut material
- Can offset section plane for complex internal details
- Half-section shows interior on one side

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Detail View
**What it does:** Creates enlarged view of a specific area (for showing small features).

**Access:**
- Menu: Drawing > Views > Detail
- Keyboard: `De`

**Step-by-step usage:**
1. On drawing, click Detail View
2. Select rectangle or circle area to detail
3. Set magnification ratio (2x, 5x, 10x, etc.)
4. Drag to place enlarged view
5. Click "OK"

**Tips:**
- Detail circle/rectangle shown on source view with label (A, B, C, etc.)
- Magnified view labeled with same letter
- Shows hidden details clearly
- Typically 2-5x magnification

**Fusion 360 comparison:** Identical.

---

### Dimensions & Annotations

#### Automatic Dimensions
**What it does:** Adds dimensions to drawing automatically based on 3D model (one-click).

**Access:**
- Menu: Drawing > Automatic Dimensions
- Keyboard: `Ad`

**Step-by-step usage:**
1. Select view (or all views)
2. Click Automatic Dimensions
3. Placement options dialog appears
4. Select placement: inside/outside view boundaries
5. Click "OK"

**Tips:**
- Dimensions come from 3D parametric constraints
- Avoid over-dimensioning (creates conflicts in manufacturing)
- Manual cleanup usually needed (delete redundant dimensions)
- Critical dimensions highlighted

---

#### Manual Dimension
**What it does:** Adds custom dimensions (lengths, angles, radii) to views.

**Access:**
- Menu: Drawing > Dimension
- Keyboard: `D`

**Step-by-step usage:**
1. Click Dimension tool
2. Select edge or two points to dimension
3. Click location for dimension text
4. Edit dimension value if needed
5. Click "OK"

**Tips:**
- Dimension linked to geometry (update 3D, dimension updates)
- Can create reference dimensions (no manufacturing requirement)
- Dimension text can be edited
- Font size and style can be customized

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Geometric Dimensioning & Tolerancing (GD&T)
**What it does:** Adds geometric control frames for form, runout, position tolerance.

**Access:**
- Menu: Drawing > GD&T
- Keyboard: `Gt`

**Step-by-step usage:**
1. Click GD&T tool
2. Select feature to control (surface, hole, etc.)
3. Select control type: Flatness, Roundness, Runout, Position, Profile, etc.
4. Set tolerance value
5. Set datum references (A, B, C, etc.)
6. Click "OK"

**Tips:**
- GD&T frames appear below dimension
- Controls form, orientation, location, runout
- Datums establish reference axes/planes
- Position tolerance controls hole location (crucial for assembly)
- Complex but essential for precision manufacturing

**Fusion 360 comparison:** Identical.

---

#### Text & Notes
**What it does:** Adds freeform text annotations (general notes, instructions).

**Access:**
- Menu: Drawing > Text
- Keyboard: `T`

**Step-by-step usage:**
1. Click Text
2. Click location on drawing
3. Type text in input box
4. Press Enter to place

**Tips:**
- Text can be scaled and positioned
- Font selection available
- Can add box/border around text
- Useful for manufacturing notes, material specs, finish requirements

---

### Title Block & Border

#### Title Block
**What it does:** Adds a standard title block with company info, drawing number, revision, etc.

**Access:**
- Menu: Drawing > Title Block
- Keyboard: `Tb`

**Step-by-step usage:**
1. Click Title Block
2. Select template (or create custom)
3. Edit fields: Title, Drawing Number, Revision, Date, Company, Designer, Scale
4. Click "OK"

**Tips:**
- Title block appears at bottom-right of sheet
- Fields can be linked to project properties
- Custom templates can be saved and reused
- Professional appearance essential for production drawings

---

---

## RENDER WORKSPACE

### Overview
The Render workspace adds photorealistic visualization with materials, lighting, and animation.

### Materials & Appearance

#### Apply Material
**What it does:** Assigns physical material properties to surfaces (color, roughness, metalness).

**Access:**
- Menu: Render > Material
- Keyboard: `Ma`

**Step-by-step usage:**
1. Select face(s) or body
2. Click Apply Material
3. Select material from library (or create custom)
4. Set parameters: color, metalness (0-1), roughness (0-1)
5. Click "OK"

**Tips:**
- Metalness: 0 = matte, 1 = mirror-polished metal
- Roughness: 0 = smooth glossy, 1 = rough/brushed
- Can preview in real-time viewport
- Multiple materials on one part possible
- Library includes common materials (steel, aluminum, plastic, paint, fabric, etc.)

**Fusion 360 comparison:** Identical to Fusion 360 Materials.

---

#### Appearance Library
**What it does:** Pre-built material definitions (common metals, plastics, fabrics, etc.).

**Access:**
- Menu: Render > Materials > Library
- Toolbar: Material library icon

**Available materials:**
- Metals: Steel, Aluminum, Brass, Copper, Titanium, Chrome, Gold
- Plastics: ABS, PLA, Nylon, Acrylic
- Fabrics: Cotton, Nylon, Silk, Leather
- Finishes: Anodized, Powder Coat, Chrome Plate, Paint
- Custom: Define your own material

**Tips:**
- Materials include PBR (physically-based rendering) parameters
- Can create custom materials and save to library
- Material properties affect rendering quality
- Same material can be applied to multiple surfaces

---

### Lighting & Environment

#### Studio Lighting
**What it does:** Sets up professional 3-point lighting (key, fill, back light).

**Access:**
- Menu: Render > Lighting > Studio
- Keyboard: `Sl`

**Step-by-step usage:**
1. Click Studio Lighting
2. Drag key light (primary) to position
3. Drag fill light (soften shadows)
4. Drag back light (rim lighting)
5. Adjust intensity for each light
6. Click "OK"

**Tips:**
- Key light typically 45° above, 45° to side
- Fill light opposite key light, lower intensity
- Back light creates rim effect (edge separation)
- Scene updates in real-time

**Fusion 360 comparison:** Similar to Fusion 360 Lighting.

---

#### Environment Map
**What it does:** Sets background scene (HDRI image for realistic reflections).

**Access:**
- Menu: Render > Environment
- Keyboard: `En`

**Step-by-step usage:**
1. Click Environment
2. Select HDRI map from library or file
3. Rotate to adjust lighting direction
4. Adjust intensity
5. Click "OK"

**Tips:**
- HDRI (High Dynamic Range Image) provides realistic global illumination
- Scene appears reflected in shiny surfaces
- Rotation changes light direction
- Presets for studio, outdoor, industrial, etc.

**Fusion 360 comparison:** Identical.

---

### Animation

#### Turntable
**What it does:** Creates automatic rotating animation (like a display turntable).

**Access:**
- Menu: Render > Animation > Turntable
- Keyboard: `Tu`

**Step-by-step usage:**
1. Click Turntable
2. Set rotation speed (10-60 RPM)
3. Set duration (seconds)
4. Set camera height (0 = center, 1 = top)
5. Click "Render" to create video

**Tips:**
- Useful for product presentations
- Includes all materials and lights from scene
- Can loop video continuously
- Output is MP4 or image sequence

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Storyboard
**What it does:** Creates animated sequence with camera movements and object animations.

**Access:**
- Menu: Render > Animation > Storyboard
- Keyboard: `Sb`

**Step-by-step usage:**
1. Click Storyboard
2. Create keyframes: set camera position, object position/rotation at each frame
3. Timeline shows all keyframes
4. Drag keyframes to adjust timing
5. Click "Render"

**Tips:**
- Each keyframe stores complete scene state
- Interpolation between keyframes creates smooth motion
- Can hide/show objects in timeline
- Professional presentations and marketing videos

**Fusion 360 comparison:** Similar to Fusion 360 Animation.

---

#### Render Settings
**What it does:** Configures quality, resolution, and output format for rendering.

**Access:**
- Menu: Render > Settings
- Keyboard: `Rs`

**Step-by-step usage:**
1. Click Settings
2. Set Resolution (1920x1080, 4K, custom)
3. Set Samples (higher = better quality, slower render)
4. Set Output Format (MP4, PNG sequence, etc.)
5. Click "OK"

**Tips:**
- Samples: 64 = quick preview, 512+ = final quality
- Higher resolution slower render
- MP4 is smaller file size, PNG sequence easier to edit

---

---

## SIMULATION WORKSPACE

### Overview
The Simulation workspace analyzes structural behavior, thermal properties, and dynamics.

### Static Analysis

#### Stress Simulation
**What it does:** Calculates stress distribution under applied loads (Von Mises stress, factor of safety).

**Access:**
- Menu: Simulation > Static Stress
- Keyboard: `Ss`

**Step-by-step usage:**
1. Click Stress Simulation
2. Set Material (auto-populated from body properties)
3. Apply Loads: click face, set force magnitude and direction
4. Apply Constraints: click face, fix it (prevent motion)
5. Set Mesh density (fine/coarse)
6. Click "Solve"
7. Results show stress colors: blue = low, red = high

**Tips:**
- Red areas are high stress (risk of failure)
- Factor of Safety shown (ratio of material yield to calculated stress)
- Mesh refinement = more accurate results but slower
- Run quick coarse mesh for iteration, fine mesh for final results
- Can probe stress at any point

**Fusion 360 comparison:** Identical to Fusion 360 Stress Analysis.

---

#### Deformation Analysis
**What it does:** Shows how much part bends under load (displacement, deflection).

**Access:**
- Menu: Simulation > Deformation
- Keyboard: `Df`

**Step-by-step usage:**
1. After Stress Simulation completes
2. Click Deformation
3. Choose visualization: total displacement, X/Y/Z displacement
4. Scale factor adjusts exaggeration (1 = actual, 10 = exaggerated)
5. View deformed shape

**Tips:**
- Shows which features bend or flex most
- Exaggeration helps visualize small deformations
- Useful for spring designs, compliant mechanisms
- Compare to allowable tolerance

---

### Thermal Analysis

#### Heat Transfer
**What it does:** Calculates temperature distribution with thermal loads and boundary conditions.

**Access:**
- Menu: Simulation > Thermal
- Keyboard: `Th`

**Step-by-step usage:**
1. Click Thermal Analysis
2. Set Material (thermal properties: conductivity, specific heat)
3. Apply Heat Sources: click face, set heat flux or temperature
4. Apply Boundary Conditions: click face, set ambient temperature or convection
5. Set Time (steady-state or transient)
6. Click "Solve"

**Tips:**
- Results show temperature distribution (blue = cold, red = hot)
- Useful for electronics cooling, heat sinks, thermal management
- Steady-state = equilibrium temperature
- Transient = temperature over time (shows heating/cooling)

**Fusion 360 comparison:** Similar to Fusion 360 Thermal Simulation.

---

### Modal Analysis

#### Frequency Analysis
**What it does:** Finds natural frequencies and mode shapes (vibration modes of part).

**Access:**
- Menu: Simulation > Modal
- Keyboard: `Mo`

**Step-by-step usage:**
1. Click Modal Analysis
2. Set Material
3. Fix constraints (typically fix mounting points)
4. Set Modes to analyze (typically 5-10 first modes)
5. Click "Solve"
6. Results show mode shapes and frequencies

**Tips:**
- Frequencies shown in Hz
- Lower frequency = easier to vibrate
- Mode shapes show which features vibrate most
- Useful for avoiding resonance (machinery, bridges, etc.)
- Each mode has different shape and frequency

**Fusion 360 comparison:** Identical.

---

---

## INSPECTION WORKSPACE

### Overview
The Inspection workspace analyzes geometry for quality control and manufacturability.

### Analysis Tools

#### Measurement
**What it does:** Measures distances, angles, and radii directly in 3D model.

**Access:**
- Menu: Inspection > Measure
- Keyboard: `Me`

**Step-by-step usage:**
1. Click Measure
2. Click two points (or edge endpoints) to measure distance
3. Distance shown with dimension line
4. Can measure angles (3 points) and radii (click edge)
5. Create report of all measurements

**Tips:**
- Measurements are temporary (don't affect model)
- Can create multiple measurements in one session
- Radius measurement clicks curved edge
- Useful for verification against drawing

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Section Analysis
**What it does:** Cuts cross-section through model to inspect interior.

**Access:**
- Menu: Inspection > Section
- Keyboard: `Sc`

**Step-by-step usage:**
1. Click Section
2. Drag plane through model
3. Cross-section view appears in panel
4. Adjust plane position interactively
5. Analyze wall thickness, hole depth, etc.

**Tips:**
- Plane can be rotated (X, Y, Z orientation)
- Shows actual geometry at cut plane
- Check for undercuts, sharp corners, minimum wall thickness
- Useful for injection molding and casting design

**Fusion 360 comparison:** Identical.

---

#### Curvature Analysis
**What it does:** Visualizes surface curvature (flat, curved, tight curves in color).

**Access:**
- Menu: Inspection > Curvature
- Keyboard: `Cv`

**Step-by-step usage:**
1. Click Curvature
2. Select surface to analyze
3. Color map shows curvature: blue = flat/gentle, red = tight radius
4. Adjust scale to highlight problem areas

**Tips:**
- Tight curves may be hard to manufacture or cause stress concentration
- Useful for mold design (undercuts, draft angles)
- Can identify areas needing fillet radius increase
- Export curvature report

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Draft Analysis
**What it does:** Shows which faces can be removed from mold without undercut (injection molding analysis).

**Access:**
- Menu: Inspection > Draft
- Keyboard: `Dr`

**Step-by-step usage:**
1. Click Draft
2. Select pull direction (mold opening direction)
3. Green faces = removable without undercut
4. Red faces = require core or undercut feature
5. Adjust direction angle (typically 2-5° draft)

**Tips:**
- Essential for designing injection-molded parts
- Pull direction usually vertical (part ejected downward)
- Red areas must be avoided or require extra mold complexity
- Can add draft angles in CAD to fix issues

**Fusion 360 comparison:** Identical.

---

#### Zebra Stripe Analysis
**What it does:** Visualizes surface smoothness using reflected stripe pattern (high-end surfacing).

**Access:**
- Menu: Inspection > Zebra
- Keyboard: `Zb`

**Step-by-step usage:**
1. Click Zebra
2. Stripes appear reflected on surfaces
3. Smooth surfaces show straight, undisturbed stripes
4. Bumpy surfaces show wavy/broken stripes
5. Adjust stripe spacing to highlight different scales of waviness

**Tips:**
- Used in automotive and consumer product design
- Identifies surface discontinuities invisible to naked eye
- Stripe pattern instantly reveals surface quality
- Essential for Class A (visible) surfaces

**Fusion 360 comparison:** Same as Fusion 360.

---

---

## DATA MANAGEMENT

### Overview
The Data Management workspace handles version control, collaboration, and file interchange.

### Version Control

#### Save Version
**What it does:** Creates a named checkpoint of design (like Git commit).

**Access:**
- Menu: Data > Version > Save
- Keyboard: `Sv`

**Step-by-step usage:**
1. Make design changes
2. Click Save Version
3. Enter version name ("v1.0", "prototype", "final", etc.)
4. Enter description (change notes)
5. Click "Save"

**Tips:**
- Version includes all parts, assemblies, drawings
- Can restore to any previous version
- Version history shows all saved states
- Useful for comparing designs over time

**Fusion 360 comparison:** Similar to Fusion 360 Version History.

---

#### Restore Version
**What it does:** Reverts design to a previous saved version.

**Access:**
- Menu: Data > Version > Restore
- Keyboard: `Rs`

**Step-by-step usage:**
1. Click Restore Version
2. Select version from list (date, name, and description shown)
3. Confirm restore (discards current unsaved changes)
4. Design reverts to that point

**Tips:**
- Non-destructive (old version remains in history)
- Compare versions before restoring (diff view)
- Can create branch (separate development line from version)

---

### Import/Export

#### Import STEP File
**What it does:** Loads 3D geometry from .STEP file (standard CAD interchange format).

**Access:**
- Menu: File > Import > STEP
- Keyboard: `Im`

**Step-by-step usage:**
1. Click Import STEP
2. Select .STEP or .STP file
3. Choose: create new part or add to current assembly
4. Click "Import"
5. File parsed and geometry displayed

**Tips:**
- STEP = Standard for Exchange of Product Model Data
- Industry standard (all CAD software supports it)
- Preserves solid body geometry, not feature history
- Useful for exchanging designs with partners using different CAD

**Fusion 360 comparison:** Same as Fusion 360.

---

#### Export STEP File
**What it does:** Saves current design as .STEP file for sharing/manufacturing.

**Access:**
- Menu: File > Export > STEP
- Keyboard: `Ex`

**Step-by-step usage:**
1. Click Export STEP
2. Select geometry to export (current body, assembly, or selection)
3. Choose file location and name
4. Click "Save"
5. STEP file created

**Tips:**
- Include all bodies and assemblies
- STEP is readable by CNC machines and laser cutters
- Most manufacturers prefer STEP format
- Preserves solid geometry accurately

---

#### Export STL File
**What it does:** Saves as .STL (Stereolithography) for 3D printing.

**Access:**
- Menu: File > Export > STL
- Keyboard: `St`

**Step-by-step usage:**
1. Click Export STL
2. Select body/part
3. Set resolution (tessellation): coarse/normal/fine
4. Choose ASCII or binary format (binary = smaller file)
5. Click "Save"

**Tips:**
- STL = mesh format (not solid bodies, but triangles)
- Finer resolution = smaller triangles = better accuracy but larger file
- Binary STL = smaller (compressed), ASCII = readable in text editor
- Essential for 3D printer preparation

---

#### Export DXF File
**What it does:** Saves 2D sketch or drawing as .DXF (for laser cutting, waterjet).

**Access:**
- Menu: File > Export > DXF
- Keyboard: `Dx`

**Step-by-step usage:**
1. Click Export DXF
2. Select sketch or drawing sheet
3. Set scale
4. Click "Save"

**Tips:**
- DXF = common 2D CAD format
- Used for laser cutting, waterjet, plasma cutting
- Preserves lines, arcs, circles, text
- Layer information can be included (different cut colors)

---

#### Export PDF
**What it does:** Saves drawing as PDF document (for sharing, printing, archiving).

**Access:**
- Menu: File > Export > PDF
- Keyboard: `Pd`

**Step-by-step usage:**
1. Click Export PDF
2. Select drawing sheet(s)
3. Set page size and orientation
4. Click "Save"

**Tips:**
- PDF is universal (all computers can open)
- Good for sharing with non-CAD users
- Preserves dimensions and annotations
- Print-ready format

---

### Collaboration

#### Share Design
**What it does:** Creates shareable link to design (view-only or edit permission).

**Access:**
- Menu: Data > Share
- Keyboard: `Sh`

**Step-by-step usage:**
1. Click Share
2. Choose permission: view-only or edit
3. Generate share link
4. Copy link and send to recipient
5. Recipient opens in browser (no CAD software needed)

**Tips:**
- View-only: recipient sees 3D model, cannot change
- Edit: recipient can modify (simultaneous collaboration)
- Link expires after set time (1 day, 1 week, permanent options)
- Useful for customer review, team feedback

**Fusion 360 comparison:** Similar to Fusion 360 Share.

---

#### Comments & Feedback
**What it does:** Adds comments to 3D geometry (like sticky notes on 3D model).

**Access:**
- Menu: Data > Comments
- Keyboard: `Co`

**Step-by-step usage:**
1. Click Comment tool
2. Click location in 3D view (or on face/edge)
3. Type comment text
4. Optionally attach image or file
5. Press Enter to place comment

**Tips:**
- Comments visible to all collaborators
- Useful for design reviews and feedback
- Can resolve/close comments when addressed
- Threaded discussion possible

**Fusion 360 comparison:** Same as Fusion 360.

---

---

## KEYBOARD SHORTCUTS QUICK REFERENCE

### Navigation
- `Esc` — Exit current tool, deselect
- `V` — Fit all (zoom to show all geometry)
- `Shift+V` — Fit selected
- `Spacebar` — Pan (hold and drag)
- `Right-click + drag` — Rotate view
- `Scroll wheel` — Zoom in/out

### Sketching
- `L` — Line
- `R` — Rectangle
- `C` — Circle
- `A` — Arc
- `P` — Polyline
- `S` — Spline
- `T` — Text
- `H` — Horizontal constraint
- `V` — Vertical constraint
- `D` — Dimension
- `Co` — Coincident constraint

### Solid Operations
- `E` — Extrude
- `R` — Revolve
- `Sw` — Sweep
- `Lo` — Loft
- `Fi` — Fillet
- `Ch` — Chamfer
- `Sh` — Shell
- `Dr` — Draft
- `Pr` — Rectangular Pattern
- `Pc` — Circular Pattern
- `Mi` — Mirror

### Assembly
- `I` — Insert Component
- `Jr` — Rigid Joint
- `Jh` — Revolute Joint
- `Js` — Slider Joint
- `Jb` — Ball Joint
- `Jp` — Planar Joint
- `Jc` — Cylinder Joint

### CAM
- `Su` — CAM Setup
- `Cn` — Contour
- `Pk` — Pocket
- `Dr` — Drill
- `Rg` — Roughing
- `Fn` — Finishing

### Drawing
- `Ns` — New Sheet
- `Or` — Orthographic View
- `Se` — Section View
- `De` — Detail View
- `Gt` — GD&T

### General
- `Ctrl+Z` — Undo
- `Ctrl+Y` — Redo
- `Ctrl+S` — Save
- `Ctrl+Shift+S` — Save As
- `Ctrl+P` — Print

---

## TIPS & BEST PRACTICES

### Design Workflow
1. **Start with sketch** — 2D profile defines 3D part
2. **Fully constrain** — All dimensions and degrees of freedom resolved
3. **Add features** — Extrude, revolve, fillet, pattern
4. **Check quality** — Stress, section, curvature analysis
5. **Create assembly** — Combine multiple parts with joints
6. **Manufacture** — CAM toolpaths for machining or 3D printing
7. **Document** — Engineering drawing with dimensions, GD&T, notes

### Common Mistakes
- **Under-constraining sketches** — Geometry changes unexpectedly when dimensions change
- **Over-constraining sketches** — Red geometry indicates conflicting constraints
- **Sharp corners on injection molded parts** — Add fillets (sharp corners are stress concentrations)
- **No draft angle on mold faces** — Parts won't eject from mold (add 2-5° draft)
- **Thin walls** — Difficult to inject mold or machine (maintain minimum 1-1.5mm thickness)
- **Dimensioning everything** — Avoid over-dimensioning (creates manufacturing conflicts)
- **Not checking for collisions** — Assembly interference problems discovered later cost time

### Performance Optimization
- **Use construction geometry** — Reference lines/circles don't extrude
- **Simplify patterns** — Instead of 100 holes, use pattern (faster, smaller file)
- **Delete unused sketches** — Keep design clean and lightweight
- **Use bodies for alternatives** — Compare different designs without branching
- **Suppress features** — Hide complex features while working on others
- **Coarse mesh for preview** — Fine mesh only for final analysis

---

End of Guide
