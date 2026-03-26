# cycleCAD CLI Quick Start

Get started with the cycleCAD command-line interface in 5 minutes.

## Installation

```bash
# Install globally
npm install -g cyclecad

# Or use locally in the project
cd ~/cyclecad
```

## Start the Server

In one terminal:
```bash
# Start mock server (for development)
node bin/server.js

# Output:
#   cyclecad Agent API mock server running on http://localhost:3000
```

## Basic Commands

In another terminal, try these commands:

### 1. Create a Shape
```bash
node bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80
```

Output:
```
[10:37:35] ✓ Command executed: shape.cylinder
  Entity ID: cylinder_1774521455193
```

### 2. Create a Box
```bash
node bin/cyclecad-cli.js shape.box --width 50 --height 40 --depth 30
```

### 3. Sketch Operations
```bash
# Start sketch
node bin/cyclecad-cli.js sketch.start --plane XY

# Draw a circle
node bin/cyclecad-cli.js sketch.circle --cx 0 --cy 0 --radius 15

# End sketch
node bin/cyclecad-cli.js sketch.end
```

### 4. Features
```bash
# Extrude
node bin/cyclecad-cli.js feature.extrude --height 10

# Add fillet
node bin/cyclecad-cli.js feature.fillet --radius 5 --edges all
```

### 5. Validation
```bash
# Check dimensions
node bin/cyclecad-cli.js validate.dimensions --target extrude_1

# Estimate cost
node bin/cyclecad-cli.js validate.cost --target extrude_1 --process CNC --material aluminum

# Estimate weight
node bin/cyclecad-cli.js validate.mass --target extrude_1 --material aluminum
```

### 6. Export
```bash
# Export to STL
node bin/cyclecad-cli.js export.stl --filename my-part.stl --binary true
```

## Get Help

### List all commands
```bash
node bin/cyclecad-cli.js --list
```

### Get help for a specific command
```bash
node bin/cyclecad-cli.js --describe shape.cylinder
```

### Show version
```bash
node bin/cyclecad-cli.js --version
```

## Output Modes

### Pretty-printed (default)
```bash
node bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80
```

### JSON output (for scripts)
```bash
node bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80 --json
```

### Quiet mode (suppress status messages)
```bash
node bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80 --quiet
```

## Interactive REPL

Start an interactive session:
```bash
node bin/cyclecad-cli.js --interactive
```

Then type commands directly:
```
cyclecad> shape.cylinder --radius 25 --height 80
✓ Command executed: shape.cylinder

cyclecad> validate.cost --target cylinder_1 --process FDM
[10:37:35] ✓ Command executed: validate.cost

cyclecad> help
Available Commands
...

cyclecad> exit
Goodbye!
```

## Batch Mode

Create a script file `my-commands.txt`:
```
shape.cylinder --radius 25 --height 80
feature.fillet --radius 3 --edges all
validate.dimensions --target cylinder_1
export.stl --filename output.stl
```

Execute it:
```bash
node bin/cyclecad-cli.js --batch my-commands.txt
```

## Use from Shell Scripts

```bash
#!/bin/bash

# Create and export a part
ENTITY=$(node bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80 --json | jq -r '.entityId')
echo "Created entity: $ENTITY"

node bin/cyclecad-cli.js feature.fillet --radius 5 --edges all --quiet
node bin/cyclecad-cli.js export.stl --filename bracket.stl
```

## Next Steps

- Read the full [CLI documentation](docs/CLI.md)
- Check out example batch files in `examples/`
- Integrate with your CAD workflow
- Build automation scripts

## Troubleshooting

### "Connection failed"
Make sure the server is running in another terminal:
```bash
node bin/server.js
```

### "Unknown command"
List available commands:
```bash
node bin/cyclecad-cli.js --list
node bin/cyclecad-cli.js --describe <command>
```

### JSON parsing errors
Make sure you're in the right directory and have Node.js 14+ installed:
```bash
node --version
```

## Key Features

✅ **Zero dependencies** — Pure Node.js built-ins
✅ **Colored output** — Easy to read terminal UI
✅ **JSON support** — Perfect for scripting
✅ **Interactive mode** — Great for exploration
✅ **Batch processing** — Automate workflows
✅ **Tab completion** — Type less, do more
✅ **Command history** — Replay previous commands
✅ **Extensible** — Easy to add new commands

---

For the full API reference, see [docs/CLI.md](docs/CLI.md)
