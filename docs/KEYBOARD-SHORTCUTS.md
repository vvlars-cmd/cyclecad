# cycleCAD Keyboard Shortcuts Reference

Complete keyboard shortcut guide for all cycleCAD features across all workspaces.

---

## SKETCH WORKSPACE

### Drawing Tools

| Shortcut | Action | Alternative |
|----------|--------|-------------|
| `L` | Line tool | Click toolbar icon |
| `R` | Rectangle tool | Click toolbar icon |
| `C` | Circle tool | Click toolbar icon |
| `A` | Arc tool | Cycle through arc modes with repeated presses |
| `P` | Polyline tool | Multiple connected lines/arcs |
| `S` | Spline tool | Smooth curve through points |
| `T` | Text tool | Add annotations to sketch |

### Sketch Constraints

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Co` | Coincident constraint | Point to point, or point to line |
| `H` | Horizontal constraint | Apply to line segments |
| `V` | Vertical constraint | Apply to line segments |
| `Pe` | Perpendicular constraint | Two lines at 90° angle |
| `Pa` | Parallel constraint | Two lines never intersect |
| `Ta` | Tangent constraint | Line to circle, or two curves |
| `Eq` | Equal constraint | Lines same length, or circles same radius |
| `F` | Fixed constraint | Lock point or line in place |
| `Cc` | Concentric constraint | Circles share same center |
| `Sy` | Symmetric constraint | Points mirror across line |
| `D` | Distance constraint | Between two points or point to line |
| `An` | Angle constraint | Between two lines (in degrees) |

### Sketch Operations

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Esc` | Exit sketch / Deselect | Return to 3D view |
| `Del` | Delete selected | Delete points, lines, or constraints |
| `Ctrl+Z` | Undo | Revert last action |
| `Ctrl+Y` | Redo | Revert undo |
| `V` | Fit/Zoom all | Show entire sketch in view |
| `Shift+V` | Fit selected | Zoom to selected geometry |
| `Spacebar` | Pan (hold + drag) | Move view around |
| `Right-click + drag` | Rotate view | Only in 3D (not available in sketch mode) |

### Construction Geometry

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Shift+C` | Toggle construction | Make line/circle dashed (reference only) |
| `Shift+G` | Toggle geometry | Convert between construction and regular |

---

## SOLID WORKSPACE

### Base Operations

| Shortcut | Action | Alternative |
|----------|--------|-------------|
| `E` | Extrude | Pull 2D sketch into 3D |
| `R` | Revolve | Rotate profile around axis |
| `Sw` | Sweep | Move profile along path |
| `Lo` | Loft | Interpolate between profiles |

### Modification Operations

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Fi` | Fillet | Round edges smoothly |
| `Ch` | Chamfer | Bevel edges at angle |
| `Sh` | Shell | Make hollow with wall thickness |
| `Dr` | Draft | Apply taper angle for molding |

### Pattern Operations

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Pr` | Rectangular Pattern | Array in X and Y directions |
| `Pc` | Circular Pattern | Array around central axis |
| `Mi` | Mirror | Reflect across plane |

### Boolean Operations

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Bu` | Boolean Union | Combine two bodies |
| `Bc` | Boolean Cut | Subtract one body from another |
| `Bi` | Boolean Intersect | Keep only overlapping volume |

### Advanced Operations

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Bo` | Boundary Surface | Create surface bounded by edges |
| `Rb` | Rib/Web | Add reinforcing wall |
| `Th` | Thicken | Convert surface to solid |

### Solid Workspace Navigation

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Esc` | Cancel operation | Exit current tool |
| `Del` | Delete feature | Remove from feature tree |
| `V` | Fit/Zoom all | Show entire model |
| `Shift+V` | Fit selected | Zoom to selected feature |
| `Right-click + drag` | Rotate view | Rotate 3D model |
| `Spacebar + drag` | Pan | Move view left/right/up/down |
| `Scroll wheel` | Zoom in/out | Scroll to magnify |
| `Middle-click + drag` | Pan | Alternative pan method |

---

## ASSEMBLY WORKSPACE

### Assembly Operations

| Shortcut | Action | Notes |
|----------|--------|-------|
| `I` | Insert Component | Add part to assembly |

### Joint Types

| Shortcut | Action | Type |
|----------|--------|------|
| `Jr` | Rigid Joint | Fixed (no movement) |
| `Jh` | Revolute Joint | Rotation around axis (hinge) |
| `Js` | Slider Joint | Translation along axis |
| `Jb` | Ball Joint | Rotation in all directions |
| `Jp` | Planar Joint | Translation in plane, rotation around normal |
| `Jc` | Cylinder Joint | Rotation and translation around same axis |

### Assembly Tools

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Ex` | Explode View | Create animated explosion |
| `Cc` | Collision Detection | Find interference between parts |

---

## CAM WORKSPACE

### CAM Setup and Tools

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Su` | CAM Setup | Define workpiece and machine |
| `Tl` | Tool Library | Manage cutting tools |

### 2D Toolpaths

| Shortcut | Action | Purpose |
|----------|--------|---------|
| `Cn` | Contour | Mill outer profile |
| `Pk` | Pocket | Mill enclosed area |
| `Dr` | Drill | Plunge and tap operation |

### 3D Toolpaths

| Shortcut | Action | Purpose |
|----------|--------|---------|
| `Rg` | Roughing | Remove bulk material |
| `Fn` | Finishing | Fine cuts for surface quality |

### CAM Output

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Gc` | Export G-Code | Generate .NC/.GCode file |
| `Pv` | Preview Tool Path | Simulate cutting operation |

---

## DRAWING WORKSPACE

### Drawing Views

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Ns` | New Sheet | Create new drawing page |
| `Or` | Orthographic View | Front/Top/Right projections |
| `Se` | Section View | Cross-section/sectional view |
| `De` | Detail View | Enlarged view of area |

### Dimensions and Annotations

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Ad` | Automatic Dimensions | Extract from 3D constraints |
| `D` | Manual Dimension | Add custom dimensions |
| `Gt` | GD&T | Add geometric tolerance frame |
| `T` | Text | Add notes and annotations |

### Title and Layout

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Tb` | Title Block | Add drawing title/info block |

---

## RENDER WORKSPACE

### Materials

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Ma` | Apply Material | Assign color/finish to surface |

### Lighting and Environment

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Sl` | Studio Lighting | Professional 3-point light setup |
| `En` | Environment Map | HDRI background/reflections |

### Animation

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Tu` | Turntable | Auto-rotating animation |
| `Sb` | Storyboard | Keyframe-based animation |
| `Rs` | Render Settings | Quality/resolution config |

---

## SIMULATION WORKSPACE

### Analysis Types

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Ss` | Stress Simulation | Von Mises stress analysis |
| `Df` | Deformation | Displacement under load |
| `Th` | Thermal | Heat transfer analysis |
| `Mo` | Modal | Natural frequency/vibration |

---

## INSPECTION WORKSPACE

### Analysis Tools

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Me` | Measurement | Distance/angle/radius measurement |
| `Sc` | Section Analysis | Cross-section viewing |
| `Cv` | Curvature Analysis | Surface curvature visualization |
| `Dr` | Draft Analysis | Mold undercut detection |
| `Zb` | Zebra Stripe | Surface smoothness reflection check |

---

## DATA MANAGEMENT

### Version Control

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Sv` | Save Version | Create design checkpoint |
| `Rs` | Restore Version | Revert to previous version |

### Import/Export

| Shortcut | Action | Format |
|----------|--------|--------|
| `Im` | Import | Load external file |
| `Ex` | Export | Save as another format |
| `St` | Export STL | 3D printing format |
| `Dx` | Export DXF | 2D CAD format |
| `Pd` | Export PDF | Document format |

### Collaboration

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Sh` | Share Design | Create shareable link |
| `Co` | Comments | Add feedback annotations |

---

## GENERAL SHORTCUTS

### Global Navigation

| Shortcut | Action | Context |
|----------|--------|---------|
| `Esc` | Exit current tool / Deselect | All workspaces |
| `Del` | Delete selected | All workspaces |
| `Ctrl+Z` | Undo | All workspaces |
| `Ctrl+Y` | Redo | All workspaces |
| `Ctrl+S` | Save | All workspaces |
| `Ctrl+Shift+S` | Save As | All workspaces |

### View Control

| Shortcut | Action | Notes |
|----------|--------|-------|
| `V` | Fit/Zoom all | Show entire geometry |
| `Shift+V` | Fit selected | Zoom to selected |
| `Spacebar + drag` | Pan | Move view |
| `Right-click + drag` | Rotate (3D) | 3D view only |
| `Scroll wheel` | Zoom in/out | Mouse wheel |
| `1-6` | Preset views | Front (1), Top (2), Right (3), Back (4), Bottom (5), Isometric (6) |

### Selection

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Click` | Select single | Click on element |
| `Shift+Click` | Multi-select | Hold shift, click additional elements |
| `Ctrl+A` | Select All | Select all geometry in current view |
| `Ctrl+Click` | Toggle selection | Click to add/remove from selection |

### Feature Tree (Left Panel)

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Double-click` | Edit feature | Double-click feature in tree |
| `Right-click` | Context menu | Delete, suppress, rename, etc. |
| `Arrow keys` | Navigate tree | Up/down in feature list |
| `Expand/Collapse` | Tree visibility | Click arrow next to feature |

---

## WORKSPACE SHORTCUTS

### Switch Workspaces

| Shortcut | Workspace | Notes |
|----------|-----------|-------|
| `Shift+1` | Sketch | Create/edit 2D sketches |
| `Shift+2` | Solid | 3D modeling operations |
| `Shift+3` | Assembly | Multi-part assemblies |
| `Shift+4` | CAM | Manufacturing tool paths |
| `Shift+5` | Drawing | 2D engineering drawings |
| `Shift+6` | Render | Visualization and animation |
| `Shift+7` | Simulation | Stress/thermal/modal analysis |
| `Shift+8` | Inspection | Measurement and analysis |
| `Shift+9` | Data | Versions, import/export, collab |

---

## ADVANCED TIPS

### Chord Selection in Sketches
- While drawing with Line/Polyline, hold `Shift` to constrain to 45° angles
- Useful for creating aligned geometry quickly

### Quick Constraint Toggle
- After placing a dimension, press `D` again to edit the value immediately
- No need to double-click (saves time)

### Multi-Edit in Tree
- Click feature in tree, then hold `Shift` and click another feature
- Both features highlighted and can be operated on together

### View Presets
- Press `1` for Front view
- Press `2` for Top view
- Press `3` for Right Side view
- Press `6` for Isometric (3D view)
- These work in all workspaces

### Fast Feature Toggle
- Click eye icon in tree to hide/show feature
- Quickly verify design without deleting features

### Undo/Redo Unlimited
- `Ctrl+Z` and `Ctrl+Y` work through entire history
- No limit to undo depth (limited only by RAM)

### Adaptive Selection
- Many tools auto-detect input type
- If sketch exists, Extrude auto-selects it
- If hole feature exists, Pattern auto-selects it
- Saves time in workflows

---

## CUSTOMIZATION

Users can customize shortcuts in:
- Settings > Keyboard Shortcuts
- Search for action name
- Assign new key combination
- Import/export keyboard layouts

Common customizations:
- Change `E` to `X` for Extrude (if you prefer)
- Add `Shift+D` for Delete (two-key confirmation)
- Add shortcuts for frequently-used operations

---

End of Shortcuts Reference
