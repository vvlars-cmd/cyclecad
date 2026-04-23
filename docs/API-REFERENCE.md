# cycleCAD Agent API Reference

Complete documentation of the cycleCAD API for AI agents, external tools, and programmatic access.

---

## TABLE OF CONTENTS

1. [Overview](#overview)
2. [Authentication and Setup](#authentication-and-setup)
3. [Shape Namespace](#shape-namespace)
4. [Feature Namespace](#feature-namespace)
5. [Assembly Namespace](#assembly-namespace)
6. [Render Namespace](#render-namespace)
7. [Validate Namespace](#validate-namespace)
8. [Simulate Namespace](#simulate-namespace)
9. [CAM Namespace](#cam-namespace)
10. [Drawing Namespace](#drawing-namespace)
11. [Data Namespace](#data-namespace)
12. [Error Handling](#error-handling)
13. [Code Examples](#code-examples)

---

## OVERVIEW

### API Style
- **Protocol**: JSON-RPC 2.0 over HTTP/WebSocket
- **Base URL**: `https://cyclecad.com/api/v1/` or `ws://cyclecad-local:8787`
- **Authentication**: API key in header or token in body
- **Content-Type**: `application/json`

### Request Format
```json
{
  "jsonrpc": "2.0",
  "method": "shape.cylinder",
  "params": {
    "diameter": 50,
    "height": 80,
    "sketch_plane": "XY"
  },
  "id": 1
}
```

### Response Format
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "success",
    "body_id": "body_001",
    "geometry": {
      "volume": 157079.6,
      "mass": 423.92,
      "bbox": { "min": [-25, -25, 0], "max": [25, 25, 80] }
    }
  },
  "id": 1
}
```

### Error Response
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid parameters",
    "data": {
      "field": "diameter",
      "reason": "must be > 0"
    }
  },
  "id": 1
}
```

---

## AUTHENTICATION AND SETUP

### Initialize Session
```
POST /auth/init
```

**Request:**
```json
{
  "api_key": "sk_live_abc123xyz"
}
```

**Response:**
```json
{
  "status": "success",
  "session_id": "sess_123xyz",
  "token": "bearer_token_xyz",
  "expires_in": 3600
}
```

### Get API Schema
```
GET /schema
```

Returns complete schema for all methods, parameters, and return values.

**Response:**
```json
{
  "version": "1.0",
  "namespaces": [
    {
      "name": "shape",
      "methods": [
        {
          "name": "cylinder",
          "description": "Create 3D cylinder",
          "params": {...},
          "returns": {...}
        }
      ]
    }
  ]
}
```

---

## SHAPE NAMESPACE

Geometric primitives and basic shape creation.

### shape.cylinder
**Create 3D cylinder**

**Parameters:**
- `diameter` (number, required): Cylinder diameter in mm
- `height` (number, required): Cylinder height in mm
- `center` (object, optional): Center point {x, y, z}, default [0,0,0]
- `name` (string, optional): Feature name, default "Cylinder"

**Returns:**
```json
{
  "body_id": "body_001",
  "feature_id": "cylinder_001",
  "geometry": {
    "volume": 157079.6,
    "surface_area": 7853.98,
    "mass": 423.92,
    "bbox": { "min": [-25, -25, 0], "max": [25, 25, 80] }
  }
}
```

**Example:**
```javascript
const result = await cyclecad.execute({
  method: "shape.cylinder",
  params: {
    diameter: 50,
    height: 80,
    center: [0, 0, 0],
    name: "Main Shaft"
  }
});
// Result: body_id = "body_001"
```

---

### shape.box
**Create rectangular box**

**Parameters:**
- `width` (number, required): Width (X) in mm
- `height` (number, required): Height (Z) in mm
- `depth` (number, required): Depth (Y) in mm
- `center` (object, optional): Center point {x, y, z}
- `name` (string, optional): Feature name

**Returns:** Same as cylinder (body_id, geometry, etc.)

**Example:**
```javascript
const box = await cyclecad.execute({
  method: "shape.box",
  params: {
    width: 100,
    height: 50,
    depth: 75
  }
});
```

---

### shape.sphere
**Create sphere**

**Parameters:**
- `diameter` (number, required): Sphere diameter in mm
- `center` (object, optional): Center point {x, y, z}
- `name` (string, optional): Feature name

**Returns:** Body geometry with volume, surface area, etc.

---

### shape.cone
**Create cone**

**Parameters:**
- `base_diameter` (number, required): Base diameter in mm
- `height` (number, required): Cone height in mm
- `apex_offset` (number, optional): Offset from center (creates truncated cone)
- `center` (object, optional): Base center point
- `name` (string, optional): Feature name

**Returns:** Body geometry

---

### shape.torus
**Create torus (donut)**

**Parameters:**
- `outer_diameter` (number, required): Outer diameter in mm
- `tube_diameter` (number, required): Tube diameter in mm
- `center` (object, optional): Center point {x, y, z}
- `name` (string, optional): Feature name

**Returns:** Body geometry

---

### shape.wedge
**Create wedge/triangular prism**

**Parameters:**
- `width` (number, required): Width in mm
- `height` (number, required): Height in mm
- `depth` (number, required): Depth in mm
- `angle` (number, required): Taper angle in degrees
- `center` (object, optional): Center point
- `name` (string, optional): Feature name

**Returns:** Body geometry

---

## FEATURE NAMESPACE

Operations that modify or add to existing bodies.

### feature.extrude
**Extrude a sketch profile**

**Parameters:**
- `sketch_id` (string, required): ID of 2D sketch to extrude
- `distance` (number, required): Extrusion distance in mm
- `direction` (string, optional): "up", "down", "symmetric", default "up"
- `angle` (number, optional): Draft angle in degrees
- `name` (string, optional): Feature name

**Returns:**
```json
{
  "feature_id": "extrude_001",
  "body_id": "body_001",
  "geometry": { "volume": 50000, "mass": 135 }
}
```

**Example:**
```javascript
const sketch = await cyclecad.execute({
  method: "sketch.rectangle",
  params: { width: 50, height: 75 }
});

const extrude = await cyclecad.execute({
  method: "feature.extrude",
  params: {
    sketch_id: sketch.sketch_id,
    distance: 50,
    direction: "up"
  }
});
```

---

### feature.revolve
**Revolve a profile around an axis**

**Parameters:**
- `sketch_id` (string, required): Sketch profile ID
- `axis_id` (string, required): Axis edge/line ID
- `angle` (number, optional): Rotation angle, default 360
- `name` (string, optional): Feature name

**Returns:** Feature with body_id and geometry

---

### feature.sweep
**Sweep a profile along a path**

**Parameters:**
- `profile_id` (string, required): Profile sketch ID
- `path_id` (string, required): Path curve/edge ID
- `twist_angle` (number, optional): Twist in degrees
- `scale_end` (number, optional): Scale at path end (1.0 = no scale)
- `name` (string, optional): Feature name

**Returns:** Feature with geometry

---

### feature.loft
**Loft between multiple profiles**

**Parameters:**
- `profiles` (array, required): Array of sketch IDs [profile1, profile2, ...]
- `continuity` (string, optional): "positional", "tangent", "curvature", default "tangent"
- `name` (string, optional): Feature name

**Returns:** Feature with geometry

---

### feature.fillet
**Round edges on a body**

**Parameters:**
- `body_id` (string, required): Body to fillet
- `edges` (array, required): Array of edge IDs to fillet
- `radius` (number, required): Fillet radius in mm
- `name` (string, optional): Feature name

**Returns:** Feature with updated geometry

**Example:**
```javascript
const fillet = await cyclecad.execute({
  method: "feature.fillet",
  params: {
    body_id: "body_001",
    edges: ["edge_001", "edge_002", "edge_003", "edge_004"],
    radius: 5,
    name: "Top Edge Fillet"
  }
});
```

---

### feature.chamfer
**Bevel edges on a body**

**Parameters:**
- `body_id` (string, required): Body to chamfer
- `edges` (array, required): Array of edge IDs
- `distance` (number, optional): Chamfer distance in mm
- `angle` (number, optional): Chamfer angle in degrees
- `name` (string, optional): Feature name

**Returns:** Feature with updated geometry

---

### feature.shell
**Make body hollow with uniform wall thickness**

**Parameters:**
- `body_id` (string, required): Body to shell
- `faces_to_remove` (array, optional): Face IDs to remove (open shell)
- `thickness` (number, required): Wall thickness in mm
- `name` (string, optional): Feature name

**Returns:** Feature with hollow geometry

---

### feature.draft
**Apply draft angle to faces**

**Parameters:**
- `body_id` (string, required): Body to draft
- `faces` (array, required): Array of face IDs
- `angle` (number, required): Draft angle in degrees
- `pull_direction` (object, optional): Direction vector {x, y, z}
- `name` (string, optional): Feature name

**Returns:** Feature with updated geometry

---

### feature.pattern_rectangular
**Create rectangular array of feature**

**Parameters:**
- `feature_id` (string, required): Feature to pattern (extrude, hole, etc.)
- `x_count` (number, required): Number of columns
- `y_count` (number, required): Number of rows
- `x_spacing` (number, required): Distance between features (X)
- `y_spacing` (number, required): Distance between features (Y)
- `name` (string, optional): Feature name

**Returns:** Pattern feature with all instances

**Example:**
```javascript
const pattern = await cyclecad.execute({
  method: "feature.pattern_rectangular",
  params: {
    feature_id: "hole_001",
    x_count: 3,
    y_count: 2,
    x_spacing: 30,
    y_spacing: 25,
    name: "Bolt Hole Pattern"
  }
});
// Result: 6 holes total (3 × 2 grid)
```

---

### feature.pattern_circular
**Create circular array of feature**

**Parameters:**
- `feature_id` (string, required): Feature to pattern
- `axis_id` (string, optional): Rotation axis (default Z)
- `count` (number, required): Total number of instances
- `angle` (number, optional): Total rotation angle, default 360
- `name` (string, optional): Feature name

**Returns:** Pattern feature with instances

---

### feature.mirror
**Mirror a feature across a plane**

**Parameters:**
- `feature_id` (string, required): Feature to mirror
- `plane` (string, required): Mirror plane ("XY", "YZ", "XZ", or plane_id)
- `name` (string, optional): Feature name

**Returns:** Mirrored feature

---

### feature.boolean_union
**Combine two bodies**

**Parameters:**
- `body1_id` (string, required): First body
- `body2_id` (string, required): Second body
- `name` (string, optional): Feature name

**Returns:** New body with merged geometry

---

### feature.boolean_cut
**Subtract one body from another**

**Parameters:**
- `target_id` (string, required): Body to keep
- `tool_id` (string, required): Body to subtract
- `name` (string, optional): Feature name

**Returns:** New body with subtracted geometry

---

### feature.boolean_intersect
**Keep only overlapping volume**

**Parameters:**
- `body1_id` (string, required): First body
- `body2_id` (string, required): Second body
- `name` (string, optional): Feature name

**Returns:** New body with intersection only

---

## ASSEMBLY NAMESPACE

Multi-part assembly operations and constraints.

### assembly.insert_component
**Add part to assembly**

**Parameters:**
- `part_id` (string, required): Part to insert
- `position` (object, optional): Position {x, y, z}
- `rotation` (object, optional): Rotation {x, y, z} in degrees
- `name` (string, optional): Component name

**Returns:**
```json
{
  "component_id": "comp_001",
  "assembly_id": "assembly_001",
  "position": [0, 0, 0],
  "rotation": [0, 0, 0]
}
```

---

### assembly.joint_rigid
**Lock two components in fixed position**

**Parameters:**
- `component1_id` (string, required): First component
- `component2_id` (string, required): Second component
- `face1_id` (string, optional): Face on first component
- `face2_id` (string, optional): Face on second component

**Returns:**
```json
{
  "joint_id": "joint_rigid_001",
  "type": "rigid",
  "components": ["comp_001", "comp_002"]
}
```

---

### assembly.joint_revolute
**Allow rotation around axis (hinge)**

**Parameters:**
- `component1_id` (string, required): First component
- `component2_id` (string, required): Second component
- `axis_id` (string, required): Rotation axis (edge or line)
- `angle_min` (number, optional): Minimum angle in degrees
- `angle_max` (number, optional): Maximum angle in degrees

**Returns:** Joint with type "revolute" and angle limits

---

### assembly.joint_slider
**Allow translation along axis**

**Parameters:**
- `component1_id` (string, required): First component
- `component2_id` (string, required): Second component
- `axis_id` (string, required): Sliding axis
- `distance_min` (number, optional): Minimum distance
- `distance_max` (number, optional): Maximum distance

**Returns:** Joint with type "slider"

---

### assembly.joint_ball
**Allow rotation in all directions (ball-and-socket)**

**Parameters:**
- `component1_id` (string, required): First component
- `component2_id` (string, required): Second component
- `point_id` (string, required): Ball center point
- `cone_angle` (number, optional): Rotation limit cone angle

**Returns:** Joint with type "ball"

---

### assembly.joint_planar
**Lock planes together (allow translation in plane)**

**Parameters:**
- `component1_id` (string, required): First component
- `component2_id` (string, required): Second component
- `plane1_id` (string, required): Plane on first component
- `plane2_id` (string, required): Plane on second component

**Returns:** Joint with type "planar"

---

### assembly.joint_cylinder
**Allow rotation and translation around same axis**

**Parameters:**
- `component1_id` (string, required): First component
- `component2_id` (string, required): Second component
- `axis_id` (string, required): Cylinder axis

**Returns:** Joint with type "cylinder"

---

### assembly.check_collision
**Detect interference between components**

**Parameters:**
- `assembly_id` (string, required): Assembly to check
- `component1_id` (string, optional): First component (null = all)
- `component2_id` (string, optional): Second component (null = all)

**Returns:**
```json
{
  "collisions": [
    {
      "component1": "comp_001",
      "component2": "comp_002",
      "volume": 125.4,
      "overlap_points": [...]
    }
  ],
  "collision_count": 1
}
```

---

## RENDER NAMESPACE

Visualization, materials, lighting, and animation.

### render.apply_material
**Assign material to surface**

**Parameters:**
- `body_id` (string, required): Body to apply material
- `material` (string, required): Material name ("steel", "aluminum", "plastic", etc.)
- `color` (string, optional): Hex color code "#FF0000"
- `metalness` (number, optional): 0-1, default 0.5
- `roughness` (number, optional): 0-1, default 0.5

**Returns:**
```json
{
  "body_id": "body_001",
  "material": "steel",
  "properties": {
    "color": "#555555",
    "metalness": 0.8,
    "roughness": 0.3
  }
}
```

---

### render.studio_lighting
**Set up professional 3-point lighting**

**Parameters:**
- `key_light` (object): {intensity, position: {x, y, z}, color}
- `fill_light` (object): {intensity, position, color}
- `back_light` (object): {intensity, position, color}

**Returns:** Lighting configuration

---

### render.environment
**Set background HDRI and reflections**

**Parameters:**
- `hdri_name` (string, required): HDRI map name ("studio", "outdoor", "industrial")
- `rotation` (number, optional): Rotation in degrees
- `intensity` (number, optional): 0-2, default 1.0

**Returns:** Environment configuration

---

### render.turntable
**Create auto-rotating animation**

**Parameters:**
- `body_id` (string, required): Body to rotate
- `speed_rpm` (number, optional): Rotation speed, default 30
- `duration_seconds` (number, optional): Total duration, default 10
- `camera_height` (number, optional): Camera height (0-1), default 0.5

**Returns:**
```json
{
  "animation_id": "anim_turntable_001",
  "duration": 10,
  "format": "mp4",
  "file_url": "https://..."
}
```

---

### render.storyboard
**Create keyframe-based animation**

**Parameters:**
- `keyframes` (array, required): Array of {time: seconds, position: {x, y, z}, rotation: {x, y, z}, visibility: bool}
- `duration_seconds` (number, optional): Total duration
- `camera_path` (array, optional): Array of camera positions

**Returns:** Animation with rendering progress and URL

---

### render.snapshot
**Capture 3D view as image**

**Parameters:**
- `body_id` (string, required): Body to capture
- `resolution` (string, optional): "1080p", "4K", custom WIDTHxHEIGHT
- `format` (string, optional): "png", "jpg", default "png"
- `background` (string, optional): "transparent", "white", "black", hex color

**Returns:**
```json
{
  "image_url": "https://...",
  "resolution": "1920x1080",
  "format": "png"
}
```

---

## VALIDATE NAMESPACE

Design review and manufacturability analysis.

### validate.design_review
**Analyze design for quality**

**Parameters:**
- `body_id` (string, required): Body to analyze
- `checks` (array, optional): ["sharp_edges", "thin_walls", "undercuts", "stress", "cost"]

**Returns:**
```json
{
  "score": "A",
  "analysis": {
    "sharp_edges": { "count": 3, "severity": "low" },
    "thin_walls": { "min_thickness": 1.2, "severity": "medium" },
    "undercuts": { "count": 1, "severity": "high" },
    "estimated_cost": 45.50,
    "estimated_weight": 0.65
  },
  "recommendations": ["Add 0.5mm fillet to top edges", "Increase wall thickness to 2mm"]
}
```

---

### validate.manufacturability
**Check for injection molding or machining**

**Parameters:**
- `body_id` (string, required): Body to check
- `process` (string, required): "injection_molding", "machining", "3d_printing"

**Returns:**
```json
{
  "process": "injection_molding",
  "feasibility": "excellent",
  "issues": [],
  "recommendations": ["Add 2-5° draft angle to side faces"],
  "estimated_cost": 45.50,
  "estimated_time": "45 minutes"
}
```

---

### validate.stress_estimate
**Quick stress analysis**

**Parameters:**
- `body_id` (string, required): Body to analyze
- `material` (string, required): Material name ("steel", "aluminum", etc.)
- `load_force` (number, required): Applied force in Newtons
- `load_point` (object, optional): Point of force application {x, y, z}

**Returns:**
```json
{
  "max_stress_mpa": 245.3,
  "safety_factor": 2.1,
  "result": "PASS",
  "note": "Safe for static load"
}
```

---

### validate.weight_estimate
**Calculate approximate mass**

**Parameters:**
- `body_id` (string, required): Body to weigh
- `material` (string, required): Material ("steel" = 7850 kg/m³, "aluminum" = 2700 kg/m³, etc.)

**Returns:**
```json
{
  "volume": 0.0001234,
  "material": "steel",
  "density": 7850,
  "weight_kg": 0.969,
  "weight_lbs": 2.14
}
```

---

## SIMULATE NAMESPACE

Structural, thermal, and modal analysis.

### simulate.stress
**Static stress analysis**

**Parameters:**
- `body_id` (string, required): Body to simulate
- `material` (string, required): Material ("steel", "aluminum", etc.)
- `loads` (array, required): [{face_id, force_vector: {x, y, z}}, ...]
- `constraints` (array, required): [{face_id, type: "fixed"}, ...]
- `mesh_quality` (string, optional): "coarse", "medium", "fine", default "medium"

**Returns:**
```json
{
  "simulation_id": "sim_stress_001",
  "max_stress_mpa": 245.3,
  "max_deflection_mm": 0.45,
  "safety_factor": 2.1,
  "status": "complete",
  "results_url": "https://..."
}
```

---

### simulate.thermal
**Heat transfer analysis**

**Parameters:**
- `body_id` (string, required): Body to simulate
- `material` (string, required): Material with thermal properties
- `heat_sources` (array, required): [{face_id, heat_flux_w_per_m2}, ...]
- `boundary_conditions` (array, required): [{face_id, temperature_c}, ...]
- `duration_seconds` (number, optional): For transient analysis

**Returns:**
```json
{
  "simulation_id": "sim_thermal_001",
  "max_temperature_c": 125.4,
  "min_temperature_c": 25.0,
  "steady_state": true,
  "status": "complete"
}
```

---

### simulate.modal
**Natural frequency and vibration analysis**

**Parameters:**
- `body_id` (string, required): Body to analyze
- `material` (string, required): Material with density
- `constraints` (array, required): [{face_id, type: "fixed"}, ...]
- `modes_count` (number, optional): Number of modes to find, default 5

**Returns:**
```json
{
  "simulation_id": "sim_modal_001",
  "modes": [
    { "mode": 1, "frequency_hz": 123.4, "shape": "bending_x" },
    { "mode": 2, "frequency_hz": 156.7, "shape": "bending_y" },
    { "mode": 3, "frequency_hz": 234.5, "shape": "torsion" }
  ],
  "status": "complete"
}
```

---

## CAM NAMESPACE

Manufacturing tool paths and CNC code generation.

### cam.setup
**Define machining parameters**

**Parameters:**
- `body_id` (string, required): Body to machine
- `stock_type` (string, required): "box", "cylinder", custom
- `stock_dimensions` (object, required): {length, width, height} in mm
- `machine_type` (string, required): "mill_3axis", "mill_4axis", "lathe", "laser", "waterjet"

**Returns:**
```json
{
  "setup_id": "cam_setup_001",
  "machine": "mill_3axis",
  "stock_volume": 50000,
  "available_tools": ["endmill_10", "ballmill_8", "drill_5"]
}
```

---

### cam.contour_2d
**Mill outer profile of 2D sketch**

**Parameters:**
- `sketch_id` (string, required): 2D sketch outline
- `tool_id` (string, required): Tool from library
- `depth_per_pass` (number, required): Cut depth per pass in mm
- `climb_or_conventional` (string, optional): "climb", "conventional", default "climb"

**Returns:**
```json
{
  "toolpath_id": "tp_contour_001",
  "passes": 3,
  "estimated_time_minutes": 12.5,
  "total_distance_mm": 2450
}
```

---

### cam.pocket_2d
**Mill enclosed area to depth**

**Parameters:**
- `sketch_id` (string, required): Closed profile to pocket
- `tool_id` (string, required): Cutting tool
- `depth` (number, required): Pocket depth in mm
- `depth_per_pass` (number, required): Cut depth per pass

**Returns:** Toolpath with passes and time estimate

---

### cam.roughing_3d
**Remove bulk material quickly**

**Parameters:**
- `body_id` (string, required): Body to rough
- `tool_id` (string, required): Roughing tool (large diameter)
- `step_down` (number, required): Vertical step in mm
- `step_over` (number, optional): Horizontal spacing in mm

**Returns:** 3D toolpath with path points and time estimate

---

### cam.finishing_3d
**Fine cuts for surface quality**

**Parameters:**
- `body_id` (string, required): Body to finish
- `tool_id` (string, required): Finishing tool (ball mill or fine endmill)
- `step_down` (number, required): Vertical step in mm
- `step_over` (number, optional): Small horizontal spacing

**Returns:** 3D toolpath optimized for surface finish

---

### cam.export_gcode
**Generate CNC machine code**

**Parameters:**
- `toolpath_id` (string, required): Toolpath to export
- `post_processor` (string, required): "fanuc", "haas", "siemens", "mach3"
- `safe_z_height` (number, optional): Rapid traverse height in mm

**Returns:**
```json
{
  "gcode_url": "https://...",
  "file_size_bytes": 125400,
  "lines": 8523,
  "estimated_time_minutes": 45.5
}
```

---

## DRAWING NAMESPACE

Engineering drawing creation and annotation.

### drawing.new_sheet
**Create 2D drawing sheet**

**Parameters:**
- `body_id` (string, required): Body to draw
- `sheet_size` (string, optional): "A4", "A3", "Letter", "Ledger", default "A4"
- `scale` (string, optional): "1:1", "1:2", "1:10", default "1:1"

**Returns:**
```json
{
  "drawing_id": "dwg_001",
  "sheet_id": "sheet_001",
  "sheet_size": "A4",
  "scale": "1:1"
}
```

---

### drawing.orthographic_view
**Add orthographic projection to drawing**

**Parameters:**
- `drawing_id` (string, required): Drawing to add to
- `view_type` (string, required): "front", "top", "right", "left", "back", "bottom", "isometric"
- `position` (object, required): {x, y} on sheet in mm

**Returns:**
```json
{
  "view_id": "view_front_001",
  "type": "orthographic",
  "projection": "front",
  "position": [50, 100]
}
```

---

### drawing.section_view
**Add cross-section to drawing**

**Parameters:**
- `drawing_id` (string, required): Drawing to add to
- `cutting_plane` (object, required): {point: {x, y, z}, normal: {x, y, z}}
- `position` (object, required): {x, y} on sheet

**Returns:** Section view with cross-section geometry

---

### drawing.dimension_auto
**Automatically add dimensions from 3D constraints**

**Parameters:**
- `view_id` (string, required): View to dimension
- `placement` (string, optional): "inside", "outside", default "outside"

**Returns:**
```json
{
  "dimensions_added": 15,
  "redundant_dimensions": 2,
  "notes": ["Consider removing redundant width dimensions"]
}
```

---

### drawing.dimension_manual
**Add custom dimension to view**

**Parameters:**
- `view_id` (string, required): View to dimension
- `element1_id` (string, required): First element (edge or point)
- `element2_id` (string, optional): Second element (for distance)
- `value` (string, optional): Dimension text (e.g., "50.00", "Ø25", "R10")
- `position` (object, required): {x, y} on sheet

**Returns:** Dimension object with ID and properties

---

### drawing.gdt_add
**Add geometric tolerance frame**

**Parameters:**
- `view_id` (string, required): View to add GD&T to
- `control_type` (string, required): "position", "flatness", "perpendicular", "runout", "profile", "angularity"
- `tolerance_value` (number, required): Tolerance in mm
- `primary_datum` (string, optional): Primary datum reference
- `secondary_datum` (string, optional): Secondary datum
- `tertiary_datum` (string, optional): Tertiary datum
- `position` (object, required): {x, y} on sheet

**Returns:** GD&T control frame object

---

### drawing.export_pdf
**Export drawing as PDF**

**Parameters:**
- `drawing_id` (string, required): Drawing to export
- `include_sheets` (array, optional): Sheet IDs (null = all)

**Returns:**
```json
{
  "pdf_url": "https://...",
  "file_size_bytes": 250000,
  "pages": 1
}
```

---

## DATA NAMESPACE

Version control, import/export, and collaboration.

### data.save_version
**Create design checkpoint**

**Parameters:**
- `project_id` (string, required): Project to version
- `version_name` (string, required): Version label ("v1.0", "prototype", "final")
- `description` (string, optional): Change notes

**Returns:**
```json
{
  "version_id": "v_001",
  "timestamp": "2024-03-26T10:30:00Z",
  "version_name": "v1.0",
  "size_mb": 2.5
}
```

---

### data.restore_version
**Revert to previous version**

**Parameters:**
- `version_id` (string, required): Version to restore to

**Returns:**
```json
{
  "status": "success",
  "timestamp": "2024-03-26T10:30:00Z",
  "note": "Design restored to v1.0"
}
```

---

### data.import_step
**Load STEP file**

**Parameters:**
- `file_path` (string, required): Path to .STEP or .STP file
- `action` (string, optional): "new_part", "add_to_assembly", default "new_part"

**Returns:**
```json
{
  "part_id": "part_imported_001",
  "body_count": 3,
  "geometry": { "volume": 50000, "mass": 135 }
}
```

---

### data.export_step
**Save as STEP file**

**Parameters:**
- `body_id` (string, required): Body to export
- `file_path` (string, required): Output path

**Returns:**
```json
{
  "file_url": "https://...",
  "file_size_bytes": 125000,
  "format": "STEP"
}
```

---

### data.export_stl
**Save as STL for 3D printing**

**Parameters:**
- `body_id` (string, required): Body to export
- `resolution` (string, optional): "coarse", "normal", "fine", default "normal"
- `format` (string, optional): "ascii", "binary", default "binary"

**Returns:**
```json
{
  "file_url": "https://...",
  "file_size_bytes": 250000,
  "triangles": 45000
}
```

---

### data.export_dxf
**Save 2D sketch as DXF**

**Parameters:**
- `sketch_id` (string, required): Sketch to export
- `scale` (string, optional): "1:1", "1:2", etc.

**Returns:**
```json
{
  "file_url": "https://...",
  "format": "DXF",
  "layers": ["geometry", "dimensions", "text"]
}
```

---

## ERROR HANDLING

### Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| -32600 | 400 | Invalid Request |
| -32601 | 404 | Method not found |
| -32602 | 400 | Invalid parameters |
| -32603 | 500 | Internal error |
| -32000 | 400 | Server error (custom) |
| -32001 | 409 | Conflict (e.g., body doesn't exist) |
| -32002 | 422 | Validation failed |

### Error Response Example
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid parameter: diameter",
    "data": {
      "field": "diameter",
      "value": -10,
      "reason": "must be > 0"
    }
  },
  "id": 1
}
```

### Common Errors

**Invalid Body ID:**
```
Error: Body 'body_999' not found
Code: -32001
```

**Invalid Geometry:**
```
Error: Self-intersecting geometry detected
Code: -32002
```

**Operation Failed:**
```
Error: Fillet failed - radius too large for geometry
Code: -32000
```

---

## CODE EXAMPLES

### Example 1: Create a Simple Box with Fillets

```javascript
const cyclecad = require('cyclecad-api');

async function createBox() {
  // Create sketch
  const sketch = await cyclecad.execute({
    method: "sketch.rectangle",
    params: { width: 100, height: 75 }
  });

  // Extrude to 3D
  const extrude = await cyclecad.execute({
    method: "feature.extrude",
    params: {
      sketch_id: sketch.sketch_id,
      distance: 50
    }
  });

  // Get edges for filleting
  const edges = extrude.geometry.edges.filter(e => e.position === "top");

  // Add fillet
  const fillet = await cyclecad.execute({
    method: "feature.fillet",
    params: {
      body_id: extrude.body_id,
      edges: edges.map(e => e.id),
      radius: 5
    }
  });

  return fillet;
}

createBox().then(result => console.log(result));
```

---

### Example 2: Create Assembly with Moving Joint

```javascript
async function createMechanism() {
  // Insert base
  const base = await cyclecad.execute({
    method: "assembly.insert_component",
    params: {
      part_id: "base_plate",
      position: [0, 0, 0]
    }
  });

  // Insert lever
  const lever = await cyclecad.execute({
    method: "assembly.insert_component",
    params: {
      part_id: "lever_arm",
      position: [50, 0, 20]
    }
  });

  // Create hinge joint
  const joint = await cyclecad.execute({
    method: "assembly.joint_revolute",
    params: {
      component1_id: base.component_id,
      component2_id: lever.component_id,
      axis_id: "edge_hinge",
      angle_min: -90,
      angle_max: 90
    }
  });

  return { base, lever, joint };
}
```

---

### Example 3: Design Review and Export

```javascript
async function reviewAndExport() {
  const body_id = "body_001";

  // Run design review
  const review = await cyclecad.execute({
    method: "validate.design_review",
    params: {
      body_id: body_id,
      checks: ["sharp_edges", "thin_walls", "undercuts", "stress", "cost"]
    }
  });

  console.log(`Design Score: ${review.score}`);
  console.log(`Issues: ${review.analysis.sharp_edges.count} sharp edges`);

  // If issues found, show recommendations
  if (review.recommendations.length > 0) {
    console.log("Recommendations:");
    review.recommendations.forEach(r => console.log("- " + r));
  }

  // Export to STEP for manufacturing
  const step = await cyclecad.execute({
    method: "data.export_step",
    params: {
      body_id: body_id,
      file_path: "/exports/final_design.stp"
    }
  });

  return { review, step };
}
```

---

End of API Reference

## AI Copilot (v3.10.0+)

Multi-step CAD generation from natural language. See `docs/AI-COPILOT.md` for full docs.

```js
window.CycleCAD.AICopilot.execute('generate', {
  prompt: 'create a Raspberry Pi 4B case with port cutouts'
});
// Observe state
window.CycleCAD.AICopilot.getState();
// → { running: true, stepIndex: 3, results: 4, errors: 0 }
// Stop mid-run
window.CycleCAD.AICopilot.abort();
```

The copilot uses the Agent API (`window.cycleCAD.execute`) as its execution substrate, so every Agent API command above is reachable from a prompt.
