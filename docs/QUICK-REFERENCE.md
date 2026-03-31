# cycleCAD v3.2 Quick Reference Card

## Workspaces (Click top-left to switch)

| Workspace | Purpose | Primary Tools |
|-----------|---------|---------------|
| **Design** | 3D part creation | Sketch, Extrude, Revolve, Fillet, Boolean |
| **Assembly** | Combine parts | Add Component, Mate, Joint, BOM |
| **Render** | Photorealistic images | Materials, Lights, Ray Tracing |
| **Simulation** | FEA & analysis | Mesh, Loads, Constraints, Solve |
| **CAM** | Manufacturing paths | Tools, Operations, G-code, Slicing |
| **Drawing** | 2D engineering drawings | Views, Dimensions, GD&T, Notes |
| **Animation** | Motion sequences | Timeline, Keyframes, Record |
| **Collaborate** | Real-time team editing | Invite, Presence, Chat (Pro) |

---

## Keyboard Shortcuts

### Essential (Beginner)
| Key | Action | Context |
|-----|--------|---------|
| **L** | Line tool | Sketch |
| **C** | Circle tool | Sketch |
| **R** | Rectangle | Sketch (Design: Revolve) |
| **A** | Arc tool | Sketch |
| **E** | Extrude | Design |
| **F** | Fillet | Design |
| **S** | Save | Always |
| **G** | Grid toggle | Viewport |
| **W** | Wireframe toggle | Viewport |
| **?** | Show help | Always |

### Navigation (Intermediate)
| Key | Action |
|-----|--------|
| **0** | Front view |
| **1** | Right view |
| **2** | Top view |
| **3** | Isometric view |
| **.** | Fit to selection |
| **M-click** | Fit all (middle mouse button) |
| **Esc** | Deselect / exit mode |
| **H** | Horizontal constraint |
| **V** | Vertical constraint |
| **D** | Distance constraint |

### Power User (Advanced)
| Key | Action |
|-----|--------|
| **Ctrl+Z** | Undo |
| **Ctrl+Y** | Redo |
| **Ctrl+S** | Save |
| **Ctrl+E** | Export |
| **Shift+Drag** | Slow rotation |
| **Right-Drag** | Pan |
| **Scroll** | Zoom |
| **Alt+Click** | Add to selection |
| **Shift+Click** | Remove from selection |

---

## Mouse Controls

| Action | Mouse | Result |
|--------|-------|--------|
| **Rotate** | Left drag | Orbit around object |
| **Pan** | Right drag | Move view up/down/left/right |
| **Zoom** | Scroll wheel | In/out |
| **Fit all** | Middle-click | Frame entire model |
| **Select** | Left click | Pick part/feature |
| **Multi-select** | Ctrl+click | Add to selection |
| **Deselect** | Esc | Clear selection |

---

## Common Workflows

### Create & Export Part (5 min)
1. **Design** workspace
2. Sketch → Draw rectangle
3. Extrude (depth: 50mm)
4. Fillet (radius: 5mm)
5. File → Export → STL

### Assemble Two Parts (10 min)
1. Switch to **Assembly** workspace
2. Add Component (load part 1)
3. Add Component (load part 2)
4. Mate (align surfaces)
5. Generate BOM

### Make Engineering Drawing (15 min)
1. Switch to **Drawing** workspace
2. New Sheet (A4)
3. Add View (Front, Top, Iso)
4. Add Dimensions
5. Add Notes & Title Block
6. Export PDF

### Run FEA Simulation (20 min)
1. Switch to **Simulation** workspace
2. Set Material (Steel, Aluminum, etc.)
3. Apply Loads (forces, pressures)
4. Define Constraints (fixed faces)
5. Mesh and Solve
6. View stress map (red = danger)

### Generate Toolpath (25 min)
1. Switch to **CAM** workspace
2. Set Workpiece (stock material)
3. Select Tool (end mill, drill)
4. Add Operation (face mill, pocket)
5. Preview path
6. Generate G-code

---

## File Formats Support

### Import
- **STEP** (.step, .stp) — CAD standard format
- **IGES** (.iges, .igs) — Legacy CAD format
- **OBJ** (.obj) — 3D mesh format
- **STL** (.stl) — 3D printing format
- **IPT/IAM** (.ipt, .iam) — Autodesk Inventor (read-only)

### Export
- **STL** (.stl) — 3D printing
- **STEP** (.step) — CAD exchange
- **GLTF** (.gltf, .glb) — Web 3D, animation
- **OBJ** (.obj) — 3D mesh
- **PDF** (.pdf) — Drawings, documentation
- **PNG/JPEG** (.png, .jpg) — Images (render)
- **MP4** (.mp4) — Video animation
- **JSON** (.json) — cycleCAD project format

---

## Toolbar Overview

### Sketch Toolbar (When in Sketch Mode)
| Button | Name | Shortcut | What It Does |
|--------|------|----------|-------------|
| ∟ | Line | L | Draw line segments |
| ○ | Circle | C | Draw circles |
| ▭ | Rectangle | R | Draw rectangles |
| ⌒ | Arc | A | Draw arcs |
| =≡ | Constraints | — | Add parametric constraints |
| ⊥ | Perpendicular | X | Make lines perpendicular |
| ∥ | Parallel | P | Make lines parallel |

### Design Toolbar (Modeling)
| Button | Function |
|--------|----------|
| **E** | Extrude |
| **R** | Revolve |
| **Fillet** | Round edges |
| **Chamfer** | Bevel edges |
| **Pattern** | Array copies |
| **Mirror** | Reflect geometry |
| **Boolean** | Union/Cut/Intersect |

---

## Constraint Types (Sketch)

| Constraint | Key | When to Use |
|-----------|-----|------------|
| **Horizontal** | H | Make line horizontal |
| **Vertical** | V | Make line vertical |
| **Distance** | D | Set exact distance between points |
| **Coincident** | O | Point on line/circle |
| **Tangent** | T | Curves touch smoothly |
| **Equal** | E | Same length/radius |
| **Parallel** | P | Lines point same direction |
| **Perpendicular** | X | Lines at 90° |
| **Concentric** | — | Circles share center |
| **Symmetric** | — | Mirror across line |
| **Angle** | — | Set angle between lines |

---

## Panel Shortcuts

| Panel | Location | Contains |
|-------|----------|----------|
| **Tree** | Left | Feature history, parts, bodies |
| **Properties** | Right | Selected object parameters |
| **Parameters** | Right tab | Dimensions, measurements |
| **Material** | Right tab | Density, color, finish |
| **Timeline** | Bottom | Animation keyframes (Animation workspace) |
| **Status Bar** | Bottom | Coordinates, grid size, FPS, memory |

---

## Material Library

### Density (for weight estimation)
- **Steel**: 7.85 g/cm³
- **Aluminum**: 2.70 g/cm³
- **Brass**: 8.47 g/cm³
- **Titanium**: 4.51 g/cm³
- **ABS Plastic**: 1.05 g/cm³
- **Nylon**: 1.14 g/cm³

### FEA Properties
- **Young's Modulus** (stiffness): Set automatically
- **Poisson's Ratio**: Set automatically
- **Yield Strength**: Determines safety factor

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 3D view frozen | Press **M** (middle mouse) to reset camera |
| Can't select part | Make sure part is visible (eye icon in tree) |
| Feature failed | Check sketch fully constrained (white, not yellow) |
| Export very slow | Reduce mesh quality or use coarser settings |
| Can't mate parts | Ensure parts don't already intersect |
| Fillet too small | Increase radius, may be too small for geometry |

---

## Pro Features (Subscription)

- ✓ Cloud sync (100GB storage)
- ✓ Real-time collaboration (5 users)
- ✓ Priority support
- ✓ Advanced AI features
- ✓ Large file support (up to 500MB)
- ✓ Private file sharing
- ✓ API access (REST, MCP)
- ✓ Custom domains (Pro+)
- ✓ SSO/SAML (Enterprise)

---

## Useful Links

- **Help System**: Press **?**
- **Full Tutorials**: /docs/TUTORIAL-v3.md
- **Developer Docs**: /docs/DEVELOPER-GUIDE-v3.md
- **Architecture**: /docs/architecture-v3.html
- **API Reference**: /docs/API-REFERENCE.md
- **Discord Community**: cyclecad.com/discord
- **GitHub Issues**: github.com/vvlars-cmd/cyclecad/issues

---

## Tips & Tricks

1. **Name your features** — Use descriptive names (not "Sketch", "Extrude")
2. **Suppress features** — Test variations without deleting
3. **Use parametric links** — Change sketch → updates everywhere
4. **View multiple angles** — Use viewport presets (0, 1, 2)
5. **Group related operations** — Sketch → Extrude → Fillet (logical flow)
6. **Save frequently** — Ctrl+S (or auto-saves every 2 min)
7. **Use undo extensively** — 50-state history available
8. **Check BOMs** — Verify part counts before manufacturing
9. **Export multiple formats** — STL for 3D print, STEP for CAD, PDF for docs
10. **Ask the AI** — Type natural language descriptions for help

---

## Version Info

**cycleCAD v3.2.0**
- 21 core modules
- 55 Agent API commands
- 8 specialized workspaces
- 90,000+ lines of code
- 664 automated tests
- MIT License (open source)

**Last Updated**: 2026-03-31

---

**Need help?** Press **?** to open the help panel or join our Discord community!
