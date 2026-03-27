# cycleCAD Command-Line Interface (CLI)

A powerful CLI tool for running cycleCAD Agent API commands from the terminal. Designed for automation, scripting, and headless CAD operations.

## Installation

Install globally:
```bash
npm install -g cyclecad
cyclecad --version
```

Or use locally in the cycleCAD project:
```bash
cd ~/cyclecad
./bin/cyclecad-cli.js --help
```

## Quick Start

Start the development server:
```bash
node bin/server.js
```

In another terminal, run a command:
```bash
./bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80
```

## Usage

### Single Command Execution

```bash
cyclecad <namespace>.<command> [--param value ...]
```

Examples:
```bash
# Create a cylinder
cyclecad shape.cylinder --radius 25 --height 80

# Create a box
cyclecad shape.box --width 50 --height 40 --depth 30

# Create a sphere
cyclecad shape.sphere --radius 30

# Start a sketch on XY plane
cyclecad sketch.start --plane XY

# Draw a circle
cyclecad sketch.circle --cx 0 --cy 0 --radius 15

# End the sketch
cyclecad sketch.end

# Extrude the sketch
cyclecad feature.extrude --height 10

# Apply a fillet
cyclecad feature.fillet --radius 5 --edges all

# Check dimensions
cyclecad validate.dimensions --target extrude_1

# Estimate cost
cyclecad validate.cost --target extrude_1 --process CNC --material aluminum

# Export to STL
cyclecad export.stl --filename my-part.stl --binary true
```

### Interactive REPL Mode

Start an interactive command-line interface:

```bash
cyclecad --interactive
# or
cyclecad -i
```

This opens a REPL where you can:
- Type commands directly
- Use tab completion
- Access command history (↑↓ keys)
- Type `help` to list all commands
- Type `describe <command>` for help on a specific command
- Type `exit` to quit

Example session:
```
cyclecad> shape.cylinder --radius 25 --height 80
✓ Command executed: shape.cylinder
  Entity ID: cylinder_1711234567890

cyclecad> help
Available Commands
shape/
  cylinder (radius, height)
    Create a cylinder
  box (width, height, depth)
    Create a box
  ...

cyclecad> describe sketch.circle
Command: sketch.circle
Description: Draw a circle
Parameters:
  cx: number?
  cy: number?
  radius: number

Example:
  cyclecad sketch.circle --cx value --cy value --radius value

cyclecad> exit
Goodbye!
```

### Batch Mode

Execute multiple commands from a file:

```bash
cyclecad --batch examples/batch-simple.txt
```

Batch file format (commands one per line, # for comments):
```
# Create shapes
shape.cylinder --radius 25 --height 80
shape.box --width 50 --height 40 --depth 30

# Sketch operations
sketch.start --plane XY
sketch.circle --cx 0 --cy 0 --radius 15
sketch.end

# Features
feature.extrude --height 10
feature.fillet --radius 2 --edges all

# Validation
validate.dimensions --target extrude_1
validate.cost --target extrude_1 --process CNC

# Export
export.stl --filename output.stl
```

### Global Flags

```bash
--help, -h                Show help message
--version, -v             Show CLI version
--server <url>            Server URL (default: http://localhost:3000)
--json                    Output raw JSON (useful for parsing in scripts)
--quiet, -q               Suppress status messages
--list                    List all available commands
--describe <command>      Show help for a specific command
--interactive, -i         Start interactive REPL
--batch <file>            Execute commands from file
```

## Command Reference

### shape.* — Geometry Creation

#### shape.cylinder
Create a cylinder.
```bash
cyclecad shape.cylinder --radius 25 --height 80
```
**Parameters:**
- `radius` (number): Cylinder radius in mm
- `height` (number): Cylinder height in mm

#### shape.box
Create a rectangular box.
```bash
cyclecad shape.box --width 50 --height 40 --depth 30
```
**Parameters:**
- `width` (number): Box width in mm
- `height` (number): Box height in mm
- `depth` (number): Box depth in mm

#### shape.sphere
Create a sphere.
```bash
cyclecad shape.sphere --radius 30
```
**Parameters:**
- `radius` (number): Sphere radius in mm

#### shape.cone
Create a cone.
```bash
cyclecad shape.cone --radius 20 --height 50
```
**Parameters:**
- `radius` (number): Base radius in mm
- `height` (number): Cone height in mm

### sketch.* — 2D Sketch Operations

#### sketch.start
Start sketch mode on a plane.
```bash
cyclecad sketch.start --plane XY
```
**Parameters:**
- `plane` (string, optional): Plane to sketch on (XY, XZ, YZ). Default: XY

#### sketch.end
End sketch and return entities.
```bash
cyclecad sketch.end
```

#### sketch.line
Draw a line in sketch.
```bash
cyclecad sketch.line --x1 0 --y1 0 --x2 100 --y2 0
```
**Parameters:**
- `x1, y1, x2, y2` (numbers): Line start and end points

#### sketch.rect
Draw a rectangle.
```bash
cyclecad sketch.rect --x 0 --y 0 --width 80 --height 40
```
**Parameters:**
- `x, y` (numbers, optional): Top-left corner. Default: 0, 0
- `width, height` (numbers): Rectangle dimensions in mm

#### sketch.circle
Draw a circle.
```bash
cyclecad sketch.circle --cx 0 --cy 0 --radius 15
```
**Parameters:**
- `cx, cy` (numbers, optional): Center point. Default: 0, 0
- `radius` (number): Radius in mm

#### sketch.arc
Draw an arc.
```bash
cyclecad sketch.arc --cx 0 --cy 0 --radius 25 --startAngle 0 --endAngle 3.14159
```
**Parameters:**
- `cx, cy` (numbers, optional): Center point
- `radius` (number): Arc radius in mm
- `startAngle, endAngle` (numbers, optional): Arc angles in radians

#### sketch.clear
Clear all sketch entities.
```bash
cyclecad sketch.clear
```

#### sketch.entities
List current sketch entities.
```bash
cyclecad sketch.entities
```

### feature.* — 3D Feature Operations

#### feature.extrude
Extrude sketch into 3D.
```bash
cyclecad feature.extrude --height 10
```
**Parameters:**
- `height` (number): Extrusion height in mm
- `taper` (number, optional): Taper angle in degrees

#### feature.revolve
Revolve sketch around an axis.
```bash
cyclecad feature.revolve --angle 360 --axis Z
```
**Parameters:**
- `angle` (number): Revolution angle in degrees
- `axis` (string, optional): Rotation axis (X, Y, Z). Default: Z

#### feature.fillet
Apply fillet to edges.
```bash
cyclecad feature.fillet --radius 5 --edges all
```
**Parameters:**
- `radius` (number): Fillet radius in mm
- `edges` (string, optional): Which edges (all, or specific edge IDs)

#### feature.chamfer
Apply chamfer to edges.
```bash
cyclecad feature.chamfer --size 2 --edges all
```
**Parameters:**
- `size` (number): Chamfer size in mm
- `edges` (string, optional): Which edges to chamfer

#### feature.pattern
Create a rectangular or circular pattern.
```bash
cyclecad feature.pattern --type rectangular --count 3 --spacing 25
```
**Parameters:**
- `type` (string): Pattern type (rectangular or circular)
- `count` (number): Number of instances
- `spacing` (number): Spacing between instances in mm

### assembly.* — Assembly Management

#### assembly.addComponent
Add a component to the assembly.
```bash
cyclecad assembly.addComponent --name "bolt" --meshOrFile cylinder_1 --position "[0, 0, 10]"
```
**Parameters:**
- `name` (string): Component name
- `meshOrFile` (string or object): Mesh entity ID or file path
- `position` (array, optional): [x, y, z] position in mm

#### assembly.removeComponent
Remove a component from assembly.
```bash
cyclecad assembly.removeComponent --target bolt
```
**Parameters:**
- `target` (string): Component ID or name

#### assembly.mate
Define a mate constraint between components.
```bash
cyclecad assembly.mate --target1 bracket --target2 bolt --type coincident
```
**Parameters:**
- `target1, target2` (strings): Component IDs
- `type` (string, optional): Mate type (coincident, concentric, parallel, tangent)

#### assembly.explode
Explode assembly components for visualization.
```bash
cyclecad assembly.explode --target "*" --distance 100
```
**Parameters:**
- `target` (string): Component ID or "*" for all
- `distance` (number, optional): Explode distance in mm

#### assembly.bom
Generate a bill of materials.
```bash
cyclecad assembly.bom --target assembly_1
```
**Parameters:**
- `target` (string, optional): Assembly ID. Default: root assembly

### validate.* — Design Validation & Analysis

#### validate.dimensions
Get part dimensions (bounding box).
```bash
cyclecad validate.dimensions --target extrude_1
```
**Parameters:**
- `target` (string): Feature or part ID

**Output:**
```json
{
  "dimensions": {
    "width": 80,
    "height": 40,
    "depth": 30
  }
}
```

#### validate.wallThickness
Check minimum wall thickness for manufacturing.
```bash
cyclecad validate.wallThickness --target bracket --minWall 0.8
```
**Parameters:**
- `target` (string): Feature ID
- `minWall` (number, optional): Minimum wall thickness in mm. Default: 0.8

#### validate.printability
Check if part is printable via FDM/SLA/CNC.
```bash
cyclecad validate.printability --target bracket --process FDM
```
**Parameters:**
- `target` (string): Feature ID
- `process` (string, optional): Manufacturing process (FDM, SLA, CNC). Default: FDM

#### validate.cost
Estimate manufacturing cost.
```bash
cyclecad validate.cost --target bracket --process CNC --material aluminum --quantity 100
```
**Parameters:**
- `target` (string): Feature ID
- `process` (string, optional): Process (FDM, SLA, CNC, injection)
- `material` (string, optional): Material name
- `quantity` (number, optional): Number of units

**Output:**
```json
{
  "cost": 45.50,
  "process": "CNC",
  "material": "aluminum",
  "quantity": 100,
  "costPerUnit": 0.4550
}
```

#### validate.mass
Estimate part mass (weight).
```bash
cyclecad validate.mass --target bracket --material steel
```
**Parameters:**
- `target` (string): Feature ID
- `material` (string, optional): Material name. Default: steel

#### validate.surfaceArea
Calculate surface area.
```bash
cyclecad validate.surfaceArea --target bracket
```
**Parameters:**
- `target` (string): Feature ID

#### validate.centerOfMass
Get geometric center of mass.
```bash
cyclecad validate.centerOfMass --target bracket
```
**Parameters:**
- `target` (string): Feature ID

#### validate.designReview
Automated design review with manufacturing analysis.
```bash
cyclecad validate.designReview --target bracket
```
**Parameters:**
- `target` (string): Feature ID

**Output:**
```json
{
  "score": "B",
  "warnings": [
    "Wall thickness approaching minimum",
    "Consider adding fillets for stress reduction"
  ],
  "suggestions": [
    "Increase wall thickness by 0.5mm",
    "Add 2mm fillets to corners"
  ]
}
```

### render.* — Viewport Rendering

#### render.snapshot
Render current view as PNG.
```bash
cyclecad render.snapshot --width 1200 --height 800
```
**Parameters:**
- `width` (number, optional): Image width in pixels. Default: 800
- `height` (number, optional): Image height in pixels. Default: 600

#### render.multiview
Render 6 standard orthographic views.
```bash
cyclecad render.multiview --width 400 --height 400
```
**Parameters:**
- `width` (number, optional): View width in pixels. Default: 400
- `height` (number, optional): View height in pixels. Default: 300

#### render.highlight
Highlight a component in the viewport.
```bash
cyclecad render.highlight --target bracket --color 0xffff00 --duration 2000
```
**Parameters:**
- `target` (string): Component ID
- `color` (string, optional): Hex color (0xrrggbb). Default: 0xffff00 (yellow)
- `duration` (number, optional): Duration in ms (0 = persistent)

#### render.hide
Hide or show a component.
```bash
cyclecad render.hide --target bolt --hidden true
```
**Parameters:**
- `target` (string): Component ID
- `hidden` (boolean, optional): Hide (true) or show (false). Default: true

#### render.section
Enable section cutting (cross-section view).
```bash
cyclecad render.section --enabled true --axis Z --position 50
```
**Parameters:**
- `enabled` (boolean, optional): Enable/disable section cut
- `axis` (string, optional): Cut axis (X, Y, Z). Default: Z
- `position` (number, optional): Cut position along axis

### export.* — File Export

#### export.stl
Export to STL format.
```bash
cyclecad export.stl --filename bracket.stl --binary true
```
**Parameters:**
- `filename` (string, optional): Output filename. Default: output.stl
- `binary` (boolean, optional): Binary STL (true) or ASCII (false). Default: true

#### export.obj
Export to OBJ format.
```bash
cyclecad export.obj --filename bracket.obj
```
**Parameters:**
- `filename` (string, optional): Output filename. Default: output.obj

#### export.gltf
Export to glTF 2.0 format.
```bash
cyclecad export.gltf --filename bracket.gltf
```
**Parameters:**
- `filename` (string, optional): Output filename. Default: output.gltf

#### export.json
Export to cycleCAD JSON format.
```bash
cyclecad export.json --filename bracket.cyclecad.json
```
**Parameters:**
- `filename` (string, optional): Output filename. Default: output.cyclecad.json

#### export.step
Export to STEP format.
```bash
cyclecad export.step --filename bracket.step
```
**Parameters:**
- `filename` (string, optional): Output filename. Default: output.step

### marketplace.* — Marketplace & Libraries

#### marketplace.list
List marketplace components.
```bash
cyclecad marketplace.list --category fasteners
```
**Parameters:**
- `category` (string, optional): Filter by category

#### marketplace.search
Search the marketplace.
```bash
cyclecad marketplace.search --query "M5 bolt" --category fasteners
```
**Parameters:**
- `query` (string): Search query
- `category` (string, optional): Filter by category

#### marketplace.publish
Publish a design to the marketplace.
```bash
cyclecad marketplace.publish --name "Bracket v2" --price 50 --category hardware
```
**Parameters:**
- `name` (string): Design name
- `price` (number, optional): Price (free if not specified)
- `category` (string, optional): Category

### cam.* — Computer-Aided Manufacturing

#### cam.slice
Slice a model for 3D printing.
```bash
cyclecad cam.slice --printer ender3 --layer 0.2
```
**Parameters:**
- `printer` (string, optional): Printer profile (ender3, prusa, etc.)
- `layer` (number, optional): Layer height in mm. Default: 0.2

#### cam.toolpath
Generate CNC toolpath.
```bash
cyclecad cam.toolpath --tool endmill --depth 5
```
**Parameters:**
- `tool` (string): Tool type (endmill, ballnose, etc.)
- `depth` (number, optional): Cut depth in mm

### meta.* — API Metadata

#### meta.version
Get API version.
```bash
cyclecad meta.version
```

**Output:**
```json
{
  "version": "0.1.0",
  "apiVersion": "1.0.0",
  "agent": "cyclecad-cli"
}
```

#### meta.getSchema
Get full API schema.
```bash
cyclecad meta.getSchema
```

#### meta.getState
Get current session state.
```bash
cyclecad meta.getState
```

#### meta.history
Get command history.
```bash
cyclecad meta.history
```

## Examples

### Example 1: Simple Part

Create a basic cylindrical part:

```bash
cyclecad shape.cylinder --radius 25 --height 80
cyclecad feature.fillet --radius 3 --edges all
cyclecad validate.dimensions --target cylinder_1
cyclecad export.stl --filename cylinder.stl
```

### Example 2: Batch Manufacturing Workflow

```bash
cyclecad --batch examples/batch-manufacturing.txt
```

This executes:
- Create a bracket with a rectangular sketch
- Extrude to 15mm height
- Add manufacturing-friendly fillets (2mm radius)
- Check CNC printability
- Estimate aluminum cost
- Estimate weight
- Run design review
- Export to STL

### Example 3: Assembly

```bash
# Create base bracket
cyclecad sketch.start --plane XY
cyclecad sketch.rect --width 100 --height 50
cyclecad sketch.end
cyclecad feature.extrude --height 20

# Create bolt hole
cyclecad sketch.start --plane XY
cyclecad sketch.circle --cx 50 --cy 25 --radius 2.5
cyclecad sketch.end
cyclecad feature.extrude --height 20

# Add components to assembly
cyclecad assembly.addComponent --name "bolt" --meshOrFile cylinder_1 --position "[50, 25, 0]"
cyclecad assembly.mate --target1 bracket --target2 bolt --type concentric

# Generate BOM
cyclecad assembly.bom --target assembly_1

# Export assembly
cyclecad export.stl --filename assembly.stl
```

### Example 4: Validation and Cost Estimation

```bash
# Create a part
cyclecad shape.box --width 80 --height 40 --depth 30

# Validate
cyclecad validate.dimensions --target box_1
cyclecad validate.wallThickness --target box_1 --minWall 1.0
cyclecad validate.printability --target box_1 --process CNC
cyclecad validate.designReview --target box_1

# Cost analysis
cyclecad validate.cost --target box_1 --process CNC --material aluminum --quantity 100
cyclecad validate.mass --target box_1 --material aluminum

# Get surface area
cyclecad validate.surfaceArea --target box_1
```

### Example 5: Interactive Session

```bash
cyclecad --interactive
```

Then interactively:
```
cyclecad> shape.cylinder --radius 25 --height 80
✓ Command executed: shape.cylinder

cyclecad> validate.dimensions --target cylinder_1
  Dimensions:
    Width:  50 mm
    Height: 80 mm
    Depth:  50 mm

cyclecad> export.stl --filename my-cylinder.stl
✓ Command executed: export.stl

cyclecad> exit
Goodbye!
```

## JSON Output for Scripting

Use `--json` flag to get parseable JSON output:

```bash
$ cyclecad shape.cylinder --radius 25 --height 80 --json
{
  "entityId": "cylinder_1711234567890",
  "type": "shape",
  "radius": 25,
  "height": 80,
  "volume": 157079.63,
  "message": "Created cylinder with radius 25mm and height 80mm"
}
```

Parse with tools like `jq`:

```bash
cyclecad shape.cylinder --radius 25 --height 80 --json | jq '.entityId'
# Output: "cylinder_1711234567890"
```

## Bash Script Example

```bash
#!/bin/bash

# Create multiple parts and export them
for i in {1..5}; do
  RADIUS=$((20 + i * 5))
  HEIGHT=$((80 + i * 10))

  echo "Creating cylinder $i (r=$RADIUS, h=$HEIGHT)..."

  OUTPUT=$(cyclecad shape.cylinder --radius $RADIUS --height $HEIGHT --json)
  ENTITY_ID=$(echo "$OUTPUT" | jq -r '.entityId')

  cyclecad validate.cost --target "$ENTITY_ID" --process CNC --material aluminum
  cyclecad export.stl --filename "cylinder-$i.stl"
done
```

## Server Configuration

By default, the CLI connects to `http://localhost:3000`. Change this:

```bash
# Use different server
cyclecad --server http://production.cyclecad.com shape.cylinder --radius 25 --height 80

# Or set environment variable
export CYCLECAD_SERVER=http://production.cyclecad.com
cyclecad shape.cylinder --radius 25 --height 80
```

## Troubleshooting

### "Connection failed"
Make sure the cycleCAD server is running:
```bash
node bin/server.js
```

### "Unknown command"
List available commands:
```bash
cyclecad --list
cyclecad --describe shape.cylinder
```

### Output hard to read
Use JSON mode for scripting:
```bash
cyclecad validate.cost --target bracket --json --quiet
```

### Need to see what's happening
Remove `--quiet` flag to see status messages and spinner.

## API Server Development

To integrate the CLI with the actual cycleCAD application:

1. **Setup API Endpoint**: Implement `/api/execute` endpoint in your server that accepts:
   ```json
   {
     "method": "shape.cylinder",
     "params": { "radius": 25, "height": 80 }
   }
   ```

2. **Return Format**: Respond with:
   ```json
   {
     "ok": true,
     "result": { "entityId": "cylinder_1", ... }
   }
   ```

3. **Start Server**: Run your server on port 3000 (or configure with `--server`)

4. **Test Commands**: Use the CLI to test your API

See `bin/server.js` for a mock implementation that handles all 30+ commands.

## Environment Variables

```bash
CYCLECAD_SERVER     # Default server URL (overrides --server flag)
CYCLECAD_FORMAT     # Default output format (json, text)
CYCLECAD_QUIET      # Default quiet mode (true/false)
```

## License

MIT

## Support

For issues, feature requests, or contributions:
- GitHub: https://github.com/vvlars-cmd/cyclecad
- Issues: https://github.com/vvlars-cmd/cyclecad/issues
