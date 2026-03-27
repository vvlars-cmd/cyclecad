# cycleCAD MCP Tools Reference

Complete list of 55+ tools exposed by the MCP server. Each tool maps to a command in the Agent API.

## SKETCH (8 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `sketch_start` | `sketch.start` | Start sketch mode on XY/XZ/YZ plane | - |
| `sketch_end` | `sketch.end` | End sketch, return all entities | - |
| `sketch_line` | `sketch.line` | Draw a line segment | x1, y1, x2, y2 |
| `sketch_rect` | `sketch.rect` | Draw a rectangle | width, height |
| `sketch_circle` | `sketch.circle` | Draw a circle | radius |
| `sketch_arc` | `sketch.arc` | Draw an arc | radius |
| `sketch_clear` | `sketch.clear` | Clear all sketch entities | - |
| `sketch_entities` | `sketch.entities` | List current sketch entities | - |

## OPS (20 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `ops_extrude` | `ops.extrude` | Extrude sketch into 3D solid | height |
| `ops_revolve` | `ops.revolve` | Revolve sketch around axis | - |
| `ops_primitive` | `ops.primitive` | Create primitive shape | shape |
| `ops_fillet` | `ops.fillet` | Fillet edges | target |
| `ops_chamfer` | `ops.chamfer` | Chamfer edges | target |
| `ops_boolean` | `ops.boolean` | Boolean operation (union/cut/intersect) | operation, targetA, targetB |
| `ops_shell` | `ops.shell` | Create hollow shell | target |
| `ops_pattern` | `ops.pattern` | Create array pattern | target |
| `ops_material` | `ops.material` | Change material | target, material |
| `ops_sweep` | `ops.sweep` | Sweep profile along path | profile, path |
| `ops_loft` | `ops.loft` | Loft between profiles | profiles |
| `ops_spring` | `ops.spring` | Generate helical spring | - |
| `ops_thread` | `ops.thread` | Generate screw thread | - |
| `ops_bend` | `ops.bend` | Sheet metal bend | target |

## TRANSFORM (3 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `transform_move` | `transform.move` | Translate feature by X/Y/Z offset | target |
| `transform_rotate` | `transform.rotate` | Rotate feature around axes | target |
| `transform_scale` | `transform.scale` | Scale feature along axes | target |

## VIEW (4 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `view_set` | `view.set` | Set camera view (front/back/left/right/top/bottom/isometric) | - |
| `view_fit` | `view.fit` | Fit view to feature(s) | - |
| `view_wireframe` | `view.wireframe` | Toggle wireframe rendering | - |
| `view_grid` | `view.grid` | Toggle grid visibility | - |

## EXPORT (4 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `export_stl` | `export.stl` | Export as STL (binary or ASCII) | - |
| `export_obj` | `export.obj` | Export as OBJ | - |
| `export_gltf` | `export.gltf` | Export as glTF 2.0 | - |
| `export_json` | `export.json` | Export as cycleCAD JSON | - |

## VALIDATE (8 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `validate_dimensions` | `validate.dimensions` | Get bounding box dimensions | target |
| `validate_wallThickness` | `validate.wallThickness` | Check minimum wall thickness | target |
| `validate_printability` | `validate.printability` | Check FDM/SLA/CNC printability | target |
| `validate_cost` | `validate.cost` | Estimate manufacturing cost | target |
| `validate_mass` | `validate.mass` | Estimate part mass/weight | target |
| `validate_surfaceArea` | `validate.surfaceArea` | Calculate surface area | target |
| `validate_centerOfMass` | `validate.centerOfMass` | Get geometric centroid | target |
| `validate_designReview` | `validate.designReview` | Auto-analyze (A/B/C/F score) | target |

## RENDER (5 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `render_snapshot` | `render.snapshot` | Render viewport as PNG | - |
| `render_multiview` | `render.multiview` | Render 6 standard views as PNGs | - |
| `render_highlight` | `render.highlight` | Highlight component with color | target |
| `render_hide` | `render.hide` | Hide/show component | target |
| `render_section` | `render.section` | Enable section cutting (cross-section) | - |

## QUERY (5 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `query_features` | `query.features` | List all features | - |
| `query_bbox` | `query.bbox` | Get bounding box of feature | target |
| `query_materials` | `query.materials` | List available materials | - |
| `query_session` | `query.session` | Get session info | - |
| `query_log` | `query.log` | Get recent command log | - |

## ASSEMBLY (4 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `assembly_addComponent` | `assembly.addComponent` | Add component to assembly | name |
| `assembly_removeComponent` | `assembly.removeComponent` | Remove component | target |
| `assembly_mate` | `assembly.mate` | Define mate constraint | target1, target2 |
| `assembly_explode` | `assembly.explode` | Explode component/assembly | target |

## SCENE (2 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `scene_clear` | `scene.clear` | Clear all features | - |
| `scene_snapshot` | `scene.snapshot` | Capture viewport as PNG (legacy) | - |

## AI (3 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `ai_identifyPart` | `ai.identifyPart` | Identify part using Gemini Vision | target |
| `ai_suggestImprovements` | `ai.suggestImprovements` | Get design improvement suggestions | target |
| `ai_estimateCostAI` | `ai.estimateCostAI` | AI-powered cost estimation | target |

## META (5 tools)

| Tool | Method | Description | Required Args |
|------|--------|-------------|---------------|
| `meta_ping` | `meta.ping` | Health check + session uptime | - |
| `meta_version` | `meta.version` | Get version info + feature flags | - |
| `meta_schema` | `meta.schema` | Get full API schema | - |
| `meta_modules` | `meta.modules` | Check available modules | - |
| `meta_history` | `meta.history` | Get undo/redo history stack | - |

## Quick Reference by Use Case

### Design a Part
1. `sketch_start` → `sketch_rect` / `sketch_circle` / `sketch_arc`
2. `ops_extrude` / `ops_revolve`
3. `ops_fillet` / `ops_chamfer` (optional)
4. `ops_pattern` / `ops_boolean` (optional)
5. `view_fit` (see result)
6. `export_stl` / `export_obj` (save)

### Analyze a Design
1. `query_features` (list all)
2. `validate_dimensions` (get size)
3. `validate_printability` (check manufacturability)
4. `validate_cost` (estimate cost)
5. `validate_designReview` (get score A/B/C/F)

### Transform & Modify
1. `transform_move` (translate)
2. `transform_rotate` (rotate)
3. `transform_scale` (resize)
4. `ops_pattern` (duplicate)
5. `view_wireframe` (see structure)

### Create Assembly
1. `assembly_addComponent` (add part)
2. `assembly_mate` (constrain)
3. `assembly_explode` (disassemble view)
4. `render_multiview` (see from all angles)
5. `export_gltf` (save for viewing)

## Material Options

Available materials for ops:
- steel
- aluminum
- plastic
- brass
- titanium
- nylon

## Shape Options (ops_primitive)

- box
- sphere
- cylinder
- cone
- torus
- capsule

## View Options (view_set)

- front
- back
- left
- right
- top
- bottom
- isometric

## Process Options (validate_printability, validate_cost)

- FDM (3D printing, filament)
- SLA (3D printing, resin)
- CNC (subtractive manufacturing)
- injection (plastic injection molding)

## Mate Types (assembly_mate)

- coincident (same location)
- concentric (same center)
- parallel (same direction)
- tangent (touching)

## Boolean Operations (ops_boolean)

- union (combine parts)
- cut (subtract one from another)
- intersect (keep only overlapping part)

## Complete Usage Example

```json
[
  { "method": "sketch.start", "params": { "plane": "XY" } },
  { "method": "sketch.rect", "params": { "width": 80, "height": 40 } },
  { "method": "ops.extrude", "params": { "height": 5, "material": "aluminum" } },
  { "method": "sketch.start", "params": { "plane": "XY" } },
  { "method": "sketch.circle", "params": { "cx": 40, "cy": 20, "radius": 3 } },
  { "method": "ops.extrude", "params": { "height": 30, "material": "steel" } },
  { "method": "ops.fillet", "params": { "target": "extrude_1", "radius": 1 } },
  { "method": "validate.designReview", "params": { "target": "extrude_1" } },
  { "method": "validate.cost", "params": { "target": "extrude_1", "process": "CNC", "material": "aluminum", "quantity": 100 } },
  { "method": "export.stl", "params": { "filename": "bracket.stl", "binary": true } }
]
```

## Troubleshooting

**Tool not found?**
- Check spelling: tool names use underscores (sketch_rect not sketch.rect)
- Run `meta_schema` to see all available tools

**Command failed?**
- Check required arguments in the table above
- See JSON schema in `docs/MCP-SERVER.md` for detailed parameter info
- Enable debug mode for error details

**Part not visible?**
- Use `view_fit` to auto-zoom to the part
- Use `query_features` to verify part was created
- Check `query_log` for any errors

## Performance Notes

- Most operations complete in <100ms
- Large exports (glTF, OBJ) may take 1-2 seconds
- Rendering snapshots: 500ms-2s depending on complexity
- AI operations (vision, suggestions): 5-30 seconds

## See Also

- Full documentation: `docs/MCP-SERVER.md`
- Quick start: `QUICKSTART-MCP.md`
- Implementation details: `IMPLEMENTATION.md`
