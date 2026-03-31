# cycleCAD Killer Features Guide

Complete technical reference and user guide for cycleCAD's 6 next-generation features that redefine browser-based CAD.

**Version:** 3.5.0
**Last Updated:** 2026-03-31
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Text-to-CAD](#text-to-cad-ai-powered-geometry-generation)
3. [Photo-to-CAD](#photo-to-cad-image-based-reverse-engineering)
4. [Manufacturability](#manufacturability-dfm-analysis-and-costing)
5. [Generative Design](#generative-design-topology-optimization)
6. [Multi-Physics](#multi-physics-simulation)
7. [Smart Parts Library](#smart-parts-library)
8. [Integration Guide](#integration-guide)
9. [Troubleshooting](#troubleshooting-common-issues)

---

## Overview

### What Makes cycleCAD Unique

cycleCAD is the first browser-native parametric CAD platform that combines all six of these killer features in a single, cohesive ecosystem:

- **AI-Native Design** (Text-to-CAD) — Never type CAD commands again
- **Vision-to-3D** (Photo-to-CAD) — Turn photos into parametric models
- **Real-time Manufacturing Insight** (Manufacturability) — Know cost, feasibility, and lead time as you design
- **Topology Optimization** (Generative Design) — Automatically reduce weight 30-50%
- **Instant Physics Validation** (Multi-Physics) — Drop test, thermal analysis, vibration—all in real-time
- **Smart Sourcing** (Smart Parts Library) — Auto-populate BOMs from 200+ standard parts

### Competitive Landscape

#### Feature Comparison Matrix

| Feature | cycleCAD | OnShape | Fusion 360 | SolidWorks | FreeCAD | Aurorin |
|---------|----------|---------|-----------|-----------|---------|---------|
| **Text-to-CAD** | ✅ Full | ✗ | ✗ | ✗ | ✗ | Partial |
| **Photo-to-CAD** | ✅ Full | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Manufacturability** | ✅ 9 processes | Partial | Partial | ✅ | ✗ | Partial |
| **Generative Design** | ✅ Real-time | ✅ | ✅ | ✅ | ✗ | ✗ |
| **FEA/Thermal** | ✅ Multi-physics | ✗ | ✅ | ✅ | ✅ | ✗ |
| **Drop Test** | ✅ Real-time | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Smart Parts** | ✅ 200+ | Partial | ✅ | ✅ | ✗ | ✗ |
| **Browser-Native** | ✅ | ✅ | ✗ | ✗ | ✗ | ✓ |
| **Free** | ✅ | ✗ | ✗ | ✗ | ✅ | ✗ |
| **Open Source** | ✅ | ✗ | ✗ | ✗ | ✅ | ✗ |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   cycleCAD v3.5.0                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │  Text-to-CAD    │  │  Photo-to-CAD  │  │Manufacturability
│  │  (AI)           │  │  (Vision)      │  │  (DFM)      │  │
│  └────────┬────────┘  └────────┬───────┘  └──────┬──────┘  │
│           │                    │                 │           │
│           └────────────────────┼─────────────────┘           │
│                                │                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │        Unified 3D Geometry Engine (Three.js)         │  │
│  │  (All features read/write geometry via shared API)   │  │
│  └───────────────────┬─────────────────────────────────┘  │
│                      │                                      │
│  ┌────────────────┐  │  ┌──────────────┐  ┌────────────┐   │
│  │ Generative     │  │  │Multi-Physics │  │Smart Parts │   │
│  │ Design (SIMP)  │──┴──│ (FEA/Thermal)│  │Library     │   │
│  │ (Topology Opt) │     │ (GPU Accel)  │  │(200+ parts)│   │
│  └────────────────┘     └──────────────┘  └────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Shared Services Layer                              │   │
│  │  - Material Database (20+ materials)               │   │
│  │  - Dimension & Unit Conversion                     │   │
│  │  - Feature History & Undo/Redo                     │   │
│  │  - STEP/STL Import-Export                          │   │
│  │  - BOM Management                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Text-to-CAD: AI-Powered Geometry Generation

Convert natural language descriptions directly into 3D parametric geometry. Powered by GPT-4/Claude NLP with fallback local transformer model for offline use.

### How It Works

**Pipeline:** User Input → NLP Tokenization → Intent Detection → Shape Matching → Dimension Extraction → Geometry Generation → Live Preview

#### 1. NLP Processing
- **Tokenization**: Split description into semantic tokens
- **Intent Detection**: Classify as CREATE, MODIFY, ANALYZE, EXPORT
- **Entity Extraction**: Identify shape names, materials, dimensions, tolerances
- **Ambiguity Resolution**: Ask clarifying questions when needed

#### 2. Shape Recognition

The system recognizes 18+ geometric primitives and parametric forms:

| Shape | Aliases | Extracted Parameters | Example |
|-------|---------|---------------------|---------|
| **Cylinder** | "cyl", "rod", "pin", "shaft" | radius, height, axis | `create cylinder 25mm diameter 50mm tall` |
| **Sphere** | "ball", "sphere", "orb" | radius | `create sphere 30mm` |
| **Box** | "block", "cube", "rectangular prism" | width, depth, height | `create box 100 x 50 x 25mm` |
| **Cone** | "taper", "cone" | base radius, height, apex | `create cone 40mm base 30mm height` |
| **Disk** | "plate", "washer", "ring" | outer radius, inner radius (opt), thickness | `create disk 50mm outer 25mm inner 5mm thick` |
| **Tube** | "pipe", "hollow cylinder" | outer radius, inner radius, length | `create tube 30mm outer 20mm inner 80mm long` |
| **Torus** | "donut", "ring" | major radius, minor radius | `create torus 40mm major 10mm minor` |
| **Hexagon** | "hex", "bolt head" | width across flats, height | `create hex 13mm 8mm tall` |
| **Gear** | "gear", "sprocket", "cog" | num teeth, module, bore | `create gear 20 teeth 2mm module 8mm bore` |
| **Bracket** | "L-bracket", "corner" | arm width, arm depth, thickness, radius | `create bracket 50x50x10mm 5mm radius` |
| **Flange** | "flange", "hub" | hub diameter, flange outer, bolt circle | `create flange hub 20mm flange 80mm 4 bolt holes` |
| **Washer** | "washer", "shim" | outer diameter, inner diameter, thickness | `create washer 25mm outer 10mm inner 2mm thick` |
| **Ring** | "ring", "collar" | outer diameter, inner diameter, width | `create ring 40mm outer 25mm inner 10mm wide` |
| **Spring** | "spring", "coil" | diameter, pitch, turns, wire gauge | `create spring 30mm diameter 5mm pitch 10 turns` |
| **Thread** | "screw", "bolt", "thread" | diameter, pitch, length, handedness | `create thread M10 x 1.5mm 30mm long` |
| **Polygon** | "pentagon", "octagon" | num sides, circumscribed radius | `create polygon 8 sides 25mm radius` |
| **Lofted Form** | "teardrop", "boat hull" | profile count, tapering | `create lofted hull 5 profiles tapering 0.8` |
| **Polyhedron** | "pyramid", "tetrahedron" | base, num sides, height | `create pyramid square 50mm base 75mm tall` |

### Supported Features & Operations

After creating a base shape, layer parametric features:

```
Text Command                                   Generated CAD Feature
────────────────────────────────────────────────────────────────
"add hole 10mm diameter center"               Hole (diameter, depth, location)
"add 5mm fillet on all edges"                 Fillet (radius, selection mode)
"chamfer the top 2mm"                         Chamfer (distance, face selection)
"create rectangular array 3x4 spacing 15mm"   Linear Pattern (count, spacing, direction)
"add M8 thread 20mm deep"                     Thread (size, depth, direction)
"mirror across the front plane"               Mirror (plane selection)
"scale to 80% of original"                    Scale (factor, center point)
"subtract the hole from main body"            Boolean Cut (tool body, keep face)
"combine with fastener part"                  Boolean Union (multiple bodies)
```

### Unit Support & Conversion

cycleCAD automatically detects and converts units:

```javascript
// Supported unit declarations
"100mm" → 100 millimeters
"4 inches" → 101.6mm
"3.5 cm" → 35mm
"0.5m" → 500mm
"2'" → 609.6mm (feet)
"5 thou" → 0.127mm (thousandths of inch)
"2.5 in" → 63.5mm

// Default: millimeters if unspecified
"cylinder 50 tall" → 50mm height
```

### Multi-Step Workflow Examples

cycleCAD supports iterative, stateful design:

#### Example 1: Create a Simple Shaft with Shoulders

```
Step 1: "create cylinder 25mm diameter 100mm tall"
        → Main body created, preview shows

Step 2: "add shoulder 35mm diameter 10mm long at top"
        → Additional feature added, cumulatively displayed

Step 3: "add 10mm diameter hole through center"
        → Hole subtracted, history tracked

Step 4: "fillet all edges 2mm"
        → Final operation applied

Result: Complete shaft in 4 simple sentences
```

#### Example 2: Create a Bearing Flange with Bolt Holes

```
Step 1: "create disk 80mm outer 30mm inner 8mm thick"
        → Base disk created

Step 2: "add 4 holes 10mm diameter bolt circle 60mm"
        → Holes distributed in circular pattern

Step 3: "chamfer the bolt holes 2mm"
        → All holes chamfered

Step 4: "export as stl"
        → Ready for 3D printing
```

### Confidence Scoring

The NLP engine reports confidence for each extracted parameter:

```
Extracted Parameters:
─────────────────────────────────────────────────────
Shape: Cylinder         Confidence: 98%
Diameter: 25mm         Confidence: 95%
Height: 50mm           Confidence: 92%

Ambiguities Detected:
- "tall" could mean HEIGHT or TOTAL LENGTH (asked user)
- "large hole" inferred as "diameter > 50% of shaft" (70% confidence)

Recommendation: Preview before confirming
```

If confidence < 80%, the system prompts for clarification:
- "Did you mean 50mm diameter or 50mm radius?"
- "Should the hole go through the entire part or 10mm deep?"
- "Apply the 5mm fillet to all edges or just the top?"

### Live Preview System

As you type, cycleCAD renders a semi-transparent "ghost" geometry preview:

```
User Types:          Preview Updates:
────────────────────────────────────────────
"create cyl"         Cylinder outline appears (1x1x1 default)
"25mm diameter"      Diameter dimension updates in real-time
"50mm tall"          Height extends to 50mm
"add hole"           Hole preview appears
"10mm"               Hole diameter set to 10mm
(press Enter)        Live preview becomes solid geometry
```

### Keyboard Shortcuts & UI

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | Open Text-to-CAD input box |
| `Enter` | Execute current command |
| `Escape` | Cancel preview, revert to last solid |
| `Tab` | Show parameter suggestions (dropdown) |
| `Ctrl+↓` | Next command from history |
| `Ctrl+↑` | Previous command from history |
| `F1` | Show NLP help and example prompts |

### API Reference

#### Execute a Text Command

```javascript
// Basic usage
const result = await window.cycleCAD.textToCad.execute(
  "create cylinder 25mm diameter 50mm tall"
);

// Returns
{
  success: true,
  geometry: THREE.BufferGeometry,
  parameters: {
    shape: "cylinder",
    diameter: 25,
    height: 50,
    unit: "mm"
  },
  confidence: 0.95,
  timestamp: 1711900800000
}
```

#### Get Shape Suggestions (for Autocomplete)

```javascript
const suggestions = window.cycleCAD.textToCad.getSuggestions("create cyl");
// Returns: ["cylinder", "cylindrical", "cylindric form", ...]
```

#### Parse Dimensions with Unit Conversion

```javascript
const parsed = window.cycleCAD.textToCad.parseDimension("3.5 inches");
// Returns: { value: 88.9, unit: "mm", original: "3.5 inches" }
```

#### Build Multi-Step History

```javascript
const history = window.cycleCAD.textToCad.getHistory();
// Returns array of all executed commands with timestamps and geometries
```

#### Clear Preview (Manual Control)

```javascript
window.cycleCAD.textToCad.clearPreview();  // Remove ghost geometry
window.cycleCAD.textToCad.confirm();       // Confirm current preview as solid
```

### Limitations & Workarounds

| Limitation | Workaround |
|-----------|-----------|
| Complex shapes (aerodynamic curves) | Use Photo-to-CAD from reference image |
| Under-constrained dimensions | System asks clarifying questions |
| Ambiguous directions (top/bottom on sphere) | Specify with "upper hemisphere" or exact angle |
| Compound boolean ops (A-(B+C)) | Execute step-by-step: create A, subtract B, subtract C |
| Non-parametric freeform | Use Generative Design to auto-shape from constraints |

### 10 Example Prompts

**Beginner Level:**

1. `create cylinder 30mm diameter 80mm tall`
2. `create box 100 x 50 x 25mm`
3. `add hole 10mm diameter through center`

**Intermediate Level:**

4. `create gear 20 teeth 2mm module 8mm bore then add M8 thread 20mm`
5. `create disk 80mm outer 25mm inner 5mm thick then add 4 holes bolt circle 60mm`
6. `create bracket 50x50 arms 10mm thick then fillet all edges 2mm`

**Advanced Level:**

7. `create cylindrical shell 40mm outer 30mm inner 100mm long then add reinforcing ribs 5mm thick 4 spines`
8. `create lofted hull with 5 profiles tapering from 100mm top to 50mm bottom over 150mm length then add keel slot 20mm deep`
9. `create springboard shape with parabolic curve stiffness 80%, length 500mm width 100mm, then add mounting holes at ends`
10. `create hollow rotor blade with leading edge 15mm sharp trailing edge rounded 10mm, chord 80mm, span 200mm, twisted 25 degrees, then simulate for stress`

---

## Photo-to-CAD: Image-Based Reverse Engineering

Convert 2D photographs into parametric 3D models using computer vision and AI-assisted shape recognition.

### How It Works

**Pipeline:** Image Input → Preprocessing → Edge Detection → Contour Extraction → Shape Matching → 3D Reconstruction → Parameterization

#### 1. Image Input Methods

Users can provide reference images in three ways:

```
Method 1: Drag-and-Drop
───────────────────────
Drag image file into 3D viewport
→ System auto-detects and prompts for reference dimension

Method 2: Camera Capture
───────────────────────
Click camera icon, aim at physical object
→ Photo captured, auto-analyzed, scale dialog appears

Method 3: Clipboard Paste
───────────────────────
Copy image, press Ctrl+V in viewport
→ System extracts from clipboard, processes immediately
```

#### 2. Edge Detection Pipeline

Multi-stage computer vision processing:

```
Original Image
    ↓
[Grayscale Conversion]
    ↓
[Gaussian Blur (5x5 kernel)] → Noise reduction
    ↓
[Sobel Edge Detection] → Edge magnitude & direction
    ↓
[Non-Maximum Suppression] → Thin edges to 1px
    ↓
[Hysteresis Thresholding] → Strong / weak edges
    ↓
[Contour Tracing] → Extract boundary polygons
    ↓
[Simplification (Douglas-Peucker)] → Reduce point count
    ↓
Contour Points Ready for Shape Matching
```

#### 3. Shape Detection & Matching

The system recognizes these geometric forms from contours:

| Detected Shape | Matching Algorithm | Parameters Extracted |
|---|---|---|
| **Circles** | Least-squares circle fit | Center (x,y), radius, eccentricity |
| **Ellipses** | Covariance matrix diagonalization | Center, major/minor axes, angle |
| **Rectangles** | Corner detection + corner angle refinement | Width, height, corner radii |
| **Polygons** | n-gon vertex clustering | Num sides, regularity score, rotation |
| **Arcs** | Arc fitting to point sequence | Start angle, end angle, radius |
| **Lines** | Hough transform or least-squares fit | Start point, end point, angle |
| **Curves** | Spline fitting (B-spline or Bezier) | Control points, degree, tension |
| **Composite** | Recursive decomposition | Sub-shape list with connectivity |

### Reference Dimension System

cycleCAD uses a visual reference object to establish scale:

```
User Action:
─────────────────────────────────────────────
1. Image uploaded showing part + ruler
2. System asks: "Select the reference dimension"
3. User clicks & drags along ruler edge
4. User enters value: "50mm"
5. System: "Established scale: 1 pixel = 0.5mm"
6. All extracted dimensions auto-scaled

Alternative: Manual scale entry
─────────────────────────────────────────────
1. Image uploaded (no ruler visible)
2. User clicks "Reference" button
3. Enters: "This part is 100mm tall"
4. Selects the tall edge in preview
5. System scales entire contour to match
```

### AI Enhancement (Optional)

When enabled, Gemini Vision API analyzes the image semantically:

```
Gemini Analysis:
────────────────────────────────────────────
Image Description:
  "Aluminum bracket with bent flanges, two
   mounting holes, likely CNC machined"

Material Detection: Aluminum (inferred from finish)
Process Hint: CNC milling (suggests sharp corners,
             not injection molded)
Feature Suggestions:
  - Add 2mm chamfers (standard for CNC)
  - Suggest sheet metal origin (if <2mm thick)
  - Check for undercuts (not manufacturable)

Confidence: 87%
```

### Interactive Refinement Workflow

User has full control to refine the AI-generated 3D model:

```
Step 1: Image Analysis
    ↓ Shows contour preview on original image

Step 2: Contour Acceptance
    ↓ User approves or manually adjusts edge points

Step 3: Shape Matching
    ↓ User confirms shape type (cylinder, box, loft, etc.)

Step 4: Scale & Dimension
    ↓ User sets reference scale and dimension labels

Step 5: 3D Reconstruction
    ↓ System auto-generates 3D geometry

Step 6: Review & Confirm
    ↓ User checks preview, suggests revisions
    → Can iterate: adjust scale, change shape type, etc.

Step 7: Parametrization (Optional)
    ↓ User can:
        • Name parameters
        • Set relationships (width = 2x height)
        • Lock certain dimensions as "reference"
```

### Shape Detection Examples

#### Example 1: Bracket from Photo

```
Input: Smartphone photo of aluminum L-bracket on workbench

Edge Detection Output:
  ├─ Outer profile: L-shaped polygon (12 vertices)
  ├─ Hole 1: Circle, center (x=42, y=28), r=4mm
  └─ Hole 2: Circle, center (x=42, y=58), r=4mm

Shape Recognition:
  Primary Shape: Right-angle bracket
    └─ Arm 1: Rectangle 50mm x 10mm (horizontal)
    └─ Arm 2: Rectangle 10mm x 60mm (vertical)
    └─ Corner Radius: 3mm (detected from rounded corner pixels)

Features:
  └─ Hole 1: 8mm diameter countersink
  └─ Hole 2: 8mm diameter countersink

Generated CAD:
  1. Create box 50 x 10 x 10mm
  2. Create box 10 x 60 x 10mm (positioned)
  3. Boolean union
  4. Fillet corners 3mm
  5. Add counterbore holes at (42, 28) and (42, 58)
```

#### Example 2: Circular Flanged Part

```
Input: Top-down photo of circular part with 4 bolt holes

Contour Detection:
  ├─ Outer circle: diameter 80mm ✓
  ├─ Center hole: diameter 25mm ✓
  └─ 4 bolt holes: 8mm, arranged in bolt circle
      └─ Bolt circle diameter: 60mm (calculated from positions)

Shape Recognition:
  Primary: Disk/flange
    ├─ Outer diameter: 80mm
    ├─ Center bore: 25mm
    └─ Thickness: ~5mm (estimated from lighting/shadows)

Generated CAD:
  1. Create disk 80mm outer 25mm inner 5mm thick
  2. Add 4 holes 8mm diameter bolt circle 60mm
  3. Chamfer bolt holes 2mm
```

### API Reference

#### Upload & Process Image

```javascript
// File input
const file = document.querySelector('#imageUpload').files[0];
const result = await window.cycleCAD.photoToCad.processImage(file);

// Returns
{
  success: true,
  edges: ImageData,                    // Canvas ImageData of edge map
  contours: [[{x,y}, ...], ...],      // Array of contour point lists
  shapes: [
    { type: "circle", center: {x,y}, radius: 42, confidence: 0.94 },
    { type: "circle", center: {x,y}, radius: 8, confidence: 0.88 },
    // ...
  ],
  scalePixelsPerMM: 0.5,              // Requires reference dimension
  preprocessedImage: ImageData        // After blur/normalization
}
```

#### Set Reference Dimension

```javascript
// Define scale by selecting two points and entering dimension
window.cycleCAD.photoToCad.setReferenceDimension(
  {x: 100, y: 200},    // Point 1 on image
  {x: 350, y: 200},    // Point 2 on image
  250,                  // Distance in millimeters
  "mm"                  // Unit
);
// Internally calculates: 1 pixel = 250 / |p1-p2| mm
```

#### Detect Edges (Manual)

```javascript
const edges = await window.cycleCAD.photoToCad.detectEdges(
  canvasContext,    // 2D canvas context with image data
  {
    blurRadius: 5,
    sobelThreshold: 50,
    lowThreshold: 100,
    highThreshold: 200
  }
);
// Returns ImageData with edge pixels
```

#### Reconstruct 3D Geometry

```javascript
const geometry3D = await window.cycleCAD.photoToCad.reconstruct3D(
  shapes,           // Shape array from processImage()
  {
    primaryShape: "disk",     // Override auto-detection
    thickness: 5,             // Extrusion depth in mm
    smoothing: true,          // Apply Catmull-Rom smoothing
    tolerance: 0.5            // Deviation tolerance
  }
);
// Returns THREE.BufferGeometry
```

#### Apply AI Enhancement

```javascript
const enhanced = await window.cycleCAD.photoToCad.enhanceWithAI(
  {
    originalImage: File,
    detectedShapes: shapes,
    scale: { pixelsPerMM: 0.5 }
  }
);

// Returns
{
  materialGuess: "aluminum",
  processHints: ["CNC milling", "sheet metal"],
  suggestedFeatures: [
    { type: "chamfer", radius: 2 },
    { type: "check", issue: "sharp internal corner not manufacturable" }
  ],
  confidence: 0.87
}
```

### Limitations & Best Practices

| Issue | Solution |
|-------|----------|
| **Shadows obscure edges** | Use even lighting, capture perpendicular to surface |
| **Reflective surfaces** | Matte reference object nearby for scale |
| **Complex curves (NURBS)** | Use Text-to-CAD with "lofted" description instead |
| **Very small features** | Include macro photography (close-up) for accurate edge detect |
| **Multiple overlapping parts** | Photograph each part separately, assemble after import |
| **Transparent materials** | Place matte background behind part |

### Tips for Best Results

1. **Lighting:** Bright, even illumination with minimal shadows
2. **Background:** Plain, contrasting color (white for dark parts, gray for reflective)
3. **Angle:** Perpendicular to largest feature (top-down for flanges, side view for shafts)
4. **Resolution:** >= 1024x1024 pixels (smartphone photos are adequate)
5. **Reference:** Always include scale reference (ruler, coin, or known-size object)
6. **Zoom:** Frame the part to fill 60-80% of the image
7. **Orientation:** Position part so edges are mostly horizontal/vertical

---

## Manufacturability: DFM Analysis and Costing

Real-time Design for Manufacturability (DFM) analysis and instant cost estimation across 9 manufacturing processes and 20+ materials.

### How It Works

**Pipeline:** Geometry Analysis → Process-Specific Rule Checking → Cost Calculation → Visualization → Report Generation

The system continuously monitors the current design and flags manufacturability issues in real-time:

```
As User Designs:
─────────────────────────────────────
Add feature → Analyze for all 9 processes
           ↓
           Check material compatibility
           ↓
           Calculate cost delta
           ↓
           Update heatmap overlay
           ↓
           Alert if rule violations
```

### Supported Processes

#### 1. CNC Milling (3-Axis)

**Rules Checked:**

```
Rule                           Limit        Alert Level
─────────────────────────────────────────────────────────
Minimum corner radius          1mm          RED if < 1mm
Minimum feature size           2mm          YELLOW if < 3mm
Maximum depth-to-width         4:1          RED if > 5:1
Tool reach (spindle height)    150mm        RED if exceeds
Hole minimum diameter          2mm          RED if < 2mm
Hole minimum depth             1.5 x Ø      YELLOW if < 2 x Ø
Wall thickness (internal)      2mm          RED if < 2mm
```

**Cost Factors:**

```
Base: $ 5.00 per setup

Variable:
├─ Tool changes: $2.00 each
├─ Complex tool paths: $0.50 per pocket
├─ Material cost: $/gram (see Material Database)
├─ Machine time: $0.25/min
└─ Quantity discount: -10% @ 10+, -25% @ 100+
```

**Example:**
```
Part: 50x50x25mm aluminum bracket with 3 pockets, 4 holes
Setup cost: $5.00
Tool changes (3 tools): $6.00
Pocket cost: $1.50
Machine time (15 min @ $0.25): $3.75
Material (aluminum, 47g @ $0.002/g): $0.09
────────────────────────────────────────
Unit cost: $16.34
Qty 10: $14.71 each
```

#### 2. CNC Milling (5-Axis)

**Additional Rules:**

```
Rule                           Limit
─────────────────────────────────────────────────
5-axis simultaneous machining  2-axis rotary heads available
Undercut allowance             0 (no geometry interference)
Minimum feature angle          5° from vertical
Dynamic stability              max 2mm deviation
```

**Cost Adjustment:**
- Machine hourly rate: +100% vs 3-axis
- Tool changes: same
- Setup time: +50%

#### 3. 3D Printing (FDM — Fused Deposition Modeling)

**Rules Checked:**

```
Rule                           Limit        Alert Level
─────────────────────────────────────────────────────────
Wall thickness (minimum)       0.8mm        RED if < 0.8mm
Wall thickness (maximum)       50mm         YELLOW if > 80mm
Overhangs (unsupported)        45°          RED if steeper
Support generation             auto         Manual if > 20% volume
Bridging distance              10mm         RED if > 15mm
Minimum feature size           1mm          RED if < 1mm
Layer height                   0.2mm        (user config)
Infill percentage              15-100%      Affects strength
```

**Cost Factors:**

```
Base: $1.50 per print

Variable:
├─ Resin/filament: $/gram (material dependent)
├─ Print time: $0.01/hour (utility)
├─ Support material: +15% volume cost
├─ Post-processing: $2.00 (washing for SLA)
└─ Quantity: bulk print discount (multiple parts)
```

**Example:**
```
Part: Hollow bracket, 50g PLA, 4 hours print time
Material cost (PLA $15/kg): 50g × $0.015 = $0.75
Print time (4hrs @ $0.01/hr): $0.04
Base: $1.50
Support removal: $0.50
────────────────────────────────────────
Unit cost: $2.79
Qty 1: $2.79
Qty 50: $0.89 each (bulk print)
```

#### 4. 3D Printing (SLA — Stereolithography)

**Rules Checked:**

```
Rule                           Limit
─────────────────────────────────────────────────
Part tilt angle (support)      30-60°
Minimum wall thickness         0.6mm (thin walls)
Minimum feature                0.25mm (high detail)
Trapped resin in voids         Alert if detected
Build platform Z-offset        min 2mm
```

**Cost Factors:**
- Resin cost: $/gram (premium: 2-5x FDM)
- Post-cure time: +$1.00
- Cleaning: +$0.50
- Fine details charge: +$0.25/complex feature

#### 5. Injection Molding

**Rules Checked:**

```
Rule                           Limit        Alert Level
─────────────────────────────────────────────────────────
Draft angle (unmold-able)      0.5° min     RED if < 0.5°
Wall thickness uniformity      ± 0.5mm      YELLOW if > ±1mm
Rib thickness                  50% of wall  RED if > 60% wall
Rib height                     2-3x thick   YELLOW if > 4x
Minimum feature                0.5mm        RED if < 0.5mm
Undercut allowance             0mm (strict) RED if undercut
Gate location                  thick area   YELLOW if on thin wall
Cooling time                   3-20 sec     (material dependent)
```

**Cost Factors:**

```
Tooling (one-time):
├─ Simple 2-cavity mold: $5,000-15,000
├─ Complex 4-cavity mold: $15,000-40,000
└─ Ultra-complex (5+ features): $40,000+

Per-unit variable:
├─ Resin cost: $0.50-2.00/part (material)
├─ Machine time: $0.10/part
├─ Cycle time: 30-120 sec
└─ Finishing: $0.25/part (gates, flash removal)
```

**Cost Calculation:**

```
1-shot tooling:
├─ Mold cost: $12,000
├─ Unit cost (qty 1000): $12,000/1000 + $1.50 = $13.50
├─ Unit cost (qty 10000): $12,000/10000 + $1.50 = $2.70
└─ Unit cost (qty 100000): $12,000/100000 + $1.50 = $1.62
```

#### 6. Sheet Metal Forming

**Rules Checked:**

```
Rule                           Limit        Alert Level
─────────────────────────────────────────────────────────
Material thickness             0.5-3mm      RED if outside
Bend radius (minimum)          1-2x thick   RED if < 1x
Bend angle (formable)          0-180°       RED if < 0°
Hole distance from bend        3x thick     YELLOW if < 2x
Sharp corners post-bend        radius 0.5mm RED if too sharp
Flange length (minimum)        2.5x thick   RED if < 2x thick
Notch size (accurate)          user input   YELLOW if undefined
```

**Cost Factors:**

```
Base: $3.00 per bend/form

Variable:
├─ Stock material: $/kg (steel, aluminum, brass)
├─ Laser cutting: $0.50/meter of edge
├─ Bending: $2.00 per 90° bend
├─ Holes (punched): $0.15 each
├─ Assembly (rivets/welds): $1.00-5.00
└─ Finishing: $0.50-2.00 (paint, powder coat, anodize)
```

**Example:**
```
Part: Aluminum bracket, 1.5mm thick, 4 bends, 4 holes, powder coat
Material (0.2kg aluminum @ $3/kg): $0.60
Cutting: $1.00
Bending (4x @$2): $8.00
Holes (4x @ $0.15): $0.60
Powder coat: $1.50
────────────────────────────────────────
Unit cost: $11.70
Qty 50: $10.80 each
Qty 500: $8.50 each
```

#### 7. Casting (Sand Casting)

**Rules Checked:**

```
Rule                           Limit        Alert Level
─────────────────────────────────────────────────────────
Minimum thickness              4-5mm        RED if < 4mm
Draft angle (mold release)     1.0° min     RED if < 1.0°
Fillet radius (sharp corners)  3-5mm        RED if < 2mm
Undercut allowance             none         RED if undercut
Cooling allowance              +0.5-2mm     Allow for shrinkage
Internal cores                 restricted   YELLOW if complex
Gate/riser location            hot spots    Alert if suboptimal
```

**Cost Factors:**

```
Tooling (sand mold):
├─ Wood/aluminum pattern: $500-2000 (one-time)
├─ Core boxes: $200-500 each

Per-unit variable:
├─ Molding labor: $5-15 per part
├─ Casting material: $/kg (iron, aluminum, bronze)
├─ Pouring/cooling: $2-10 per part
├─ Finishing (cleanup, drilling): $3-8
└─ Machining (post-cast): $0-20 depending on precision
```

#### 8. Casting (Investment Casting)

**Rules Checked:**

```
Rule                           Limit        Alert Level
─────────────────────────────────────────────────────────
Wall thickness                 2-5mm        RED if < 2mm
Detail definition              high         ✓ for fine features
Undercut restriction           limited      Alert if complex
Surface finish (as-cast)       Ra 6.3µm     baseline
```

**Cost Factors:**
- Pattern cost: $2,000-10,000 (one-time)
- Per-part: $3-15 (material + labor)
- Finishing (polishing, HIP, shot-peen): +$2-10

#### 9. Waterjet Cutting

**Rules Checked:**

```
Rule                           Limit
─────────────────────────────────────────────────
Material thickness             2-100mm
Minimum corner radius          0.3mm
Acute corner angle             > 15°
Cutting head diameter          0.015"
Taper allowance                <1° on thickness
Piercing location              > 6mm from edge
```

**Cost Factors:**
- Setup: $10-30
- Cutting: $0.05-0.30 per inch of cut
- Material cost: as input
- Post-processing: minimal

### Material Database

cycleCAD includes 20+ materials with complete property tables:

```
Material        Density  Yield    E         Cost      Notes
                g/cm³    Strength MPa       $/kg
────────────────────────────────────────────────────────────
Steel (AISI    7.85     250      200       0.50      General purpose
 1018)

Aluminum       2.70     90       69        3.00      Lightweight,
 (6061-T6)                                          machinable

Titanium       4.51     880      103       15.00     High strength,
 (Ti-6Al-4V)                                        expensive

Brass          8.47     300      97        8.50      Corrosion resistant
 (C360)

Nylon 6        1.14     70       3.0       4.00      Low friction,
                                                      tough

ABS            1.05     40       2.3       2.50      Impact resistant,
                                                      printable

PLA            1.24     50       2.7       1.50      Biodegradable,
                                                      easy print

Copper         8.96     200      117       5.00      Electrical conductor

Magnesium      1.81     160      45        8.00      Very light
```

Each material includes:
- Tensile strength, yield strength, elongation
- Young's modulus, Poisson ratio
- Thermal conductivity, expansion coefficient
- Machinability rating, weldability
- Cost per kg (market rates)
- Recommended processes
- Environmental/hazard notes

### Cost Estimation Model

#### Formula

```
Total Cost = Setup Cost + Material Cost + Process Cost + Labor Cost + Markup

Where:
──────────────────────────────────────────────────────────────

Setup Cost = Process base fee
             (e.g., CNC: $5, 3D print: $1.50)

Material Cost = Volume (cm³) × Density (g/cm³) × $/kg ÷ 1000

Process Cost = Feature count × Feature cost
             + Machine time (minutes) × Hourly rate ÷ 60
             + Tool changes × Tool change cost

Labor Cost = Finishing time (min) × Labor rate ($/min)
             + Assembly time × Assembly rate

Markup = (Setup + Material + Process + Labor) × Margin%
         (Typical: 30-50% for job shops)

Quantity Discount = -5% @ 5 units, -15% @ 50, -30% @ 500+
```

#### Real-Time Cost Heatmap

As the user designs, cycleCAD overlays cost data on the geometry:

```
Colors:     Meaning:
─────────────────────────────────────────────
🟢 Green    < $1/unit (low cost)
🟡 Yellow   $1-5/unit (moderate)
🟠 Orange   $5-20/unit (expensive)
🔴 Red      > $20/unit (very expensive)
           or unmanufacturable
```

Features like sharp corners or thin walls turn red to warn the user.

### Report Generation

The Manufacturability panel generates a detailed report:

```markdown
# Design for Manufacturability Report
Part: Bracket Assembly
Generated: 2026-03-31 10:45 UTC

## Summary
│ Optimal for: CNC Milling, Sheet Metal
│ Acceptable: 3D Printing (FDM)
│ Not Recommended: Injection Molding (sharp corner)
│ Issues Found: 3 warnings, 1 critical

## Cost Estimation (Quantity: 100)

Process           Unit Cost    Total Cost    Lead Time
────────────────────────────────────────────────────────
CNC 3-axis        $18.50       $1,850        2-3 weeks
Sheet Metal       $12.20       $1,220        1-2 weeks
3D Print (SLS)    $8.75        $875          3-5 days
Injection Mold    $2.10*       $210*         4-6 weeks
                  (*tooling $8K)

Recommended: Sheet Metal ($1,220, 1-2 weeks)

## Manufacturability Findings

✓ Passing Rules:
  ├─ All hole sizes >= 3mm
  ├─ Wall thickness 2-4mm (optimal)
  └─ No trapped undercuts

⚠ Warnings:
  ├─ Corner radius 0.5mm (minimum is 1mm)
  │  → Suggest 1mm fillet, adds $0.10/part
  ├─ Bolt hole locations within 2mm of edge
  │  → Stress concentration possible
  └─ Sheet metal edge length 340mm (tooling: 350mm max)
     → Fits within standard tool size

✗ Critical Issues:
  └─ Sharp internal corner (0 radius) at mounting post
     → NOT machinable with CNC ER32 collet
     → FIX: Add 1mm fillet
     → Impact: Adds 30 sec machine time ($0.13)

## Material Selection Analysis

Selected: Aluminum 6061-T6

Alternatives:
├─ Steel (AISI 1020): +10% cost, +15% weight, +strength
├─ Brass (C360): +250% cost, corrosion-resistant, no coating needed
└─ Nylon 6: -20% cost, electrical insulation, creep under load

Verdict: Aluminum 6061-T6 is optimal for this application

## Manufacturing Notes

CNC Milling Sequence:
  1. Stock: 60x60x10mm aluminum plate
  2. Face mill top and bottom: 0.2mm pass
  3. Drill 4 mounting holes: 3mm dia.
  4. Counterbore mounting holes: 5mm dia. x 2mm deep
  5. Mill pockets (3 designs): 0.5mm step-down
  6. Fillet all edges: 1mm radius (2mm endmill, slow feed)
  7. Remove sharp corners with deburr tool
  8. Degreasing wash + compressed air dry

Total Setup & Machine Time: 22 minutes
Est. Cost @ 3-axis shop rate ($30/hr): $11

## DFM Recommendations

Priority 1 (Must fix):
  1. Add 1mm fillet to sharp internal corner (post #5)
  2. Increase bolt hole edge distance to 3mm minimum

Priority 2 (Should fix):
  1. Consider 1.5mm corner radius (better aesthetics, no cost)
  2. Specify anodize finish after machining (+$0.80, corrosion resist)

Priority 3 (Nice to have):
  1. Add serialization engraving ($1.50)
  2. Silk-screen logo ($2.00 setup, $0.05/part)

## Conclusion

Design is APPROVED for manufacturing with 2 minor DFM improvements.
Recommended vendor: Local CNC job shop (fast turnaround).
Estimated budget: $1,850 @ qty 100 (3-week delivery).
```

### API Reference

#### Analyze Geometry for All Processes

```javascript
const report = await window.cycleCAD.manufacturability.analyze(
  THREE.BufferGeometry,  // Current part geometry
  {
    material: "aluminum-6061",
    processes: ["cnc-3axis", "cnc-5axis", "fdm", "injection"],
    quantity: 100,
    currency: "USD"
  }
);

// Returns
{
  suitable_processes: ["cnc-3axis", "fdm"],
  unsuitable_processes: ["injection"],
  violations: [
    { severity: "warning", process: "cnc-3axis", rule: "corner_radius",
      value: "0.5mm", limit: "1mm", fix: "Add 1mm fillet" }
  ],
  costs: {
    "cnc-3axis": { unit: 18.50, total: 1850, leadtime_days: 14 },
    "fdm": { unit: 8.75, total: 875, leadtime_days: 3 }
  },
  recommended: "cnc-3axis"
}
```

#### Get Cost Estimate

```javascript
const estimate = await window.cycleCAD.manufacturability.estimateCost(
  geometry,
  "cnc-3axis",
  { material: "steel-1018", quantity: 50 }
);

// Returns
{
  setup: 5.00,
  material: 12.50,
  machining: 8.75,
  labor: 2.00,
  subtotal: 28.25,
  margin_30pct: 8.48,
  unit_cost: 36.73,
  total_qty_50: 1836.50,
  leadtime: "2-3 weeks",
  breakdown: { ... }
}
```

#### Generate Heatmap Overlay

```javascript
window.cycleCAD.manufacturability.showCostHeatmap(
  geometry,
  {
    process: "injection",
    colorScheme: "cost",  // "cost", "difficulty", "speed"
    scale: "log"          // "linear" or "log"
  }
);
// Renders color overlay on 3D geometry in viewport
```

#### Create Manufacturing Notes

```javascript
const notes = window.cycleCAD.manufacturability.generateNotes(
  geometry,
  {
    process: "cnc-3axis",
    includeToolpath: false,  // Skip CAM integration
    language: "en"
  }
);
// Returns markdown text with operation sequence
```

---

## Generative Design: Topology Optimization

Automatically optimize part geometry for minimum weight, maximum stiffness, or lowest cost using SIMP (Solid Isotropic Material with Penalization) topology optimization algorithm.

### How It Works

**Pipeline:** Design Space Definition → Load & Constraint Setup → Voxel Discretization → Density Optimization → Sensitivity Filtering → Marching Cubes → Smoothing

#### 1. Design Space Definition

User specifies:

```javascript
// Method 1: Draw keep/avoid regions
const designSpace = {
  keepRegions: [
    // Regions that must stay solid (e.g., mounting points)
    { shape: "sphere", center: {x:0, y:0, z:10}, radius: 15 }
  ],
  avoidRegions: [
    // Regions to exclude (e.g., for clearance)
    { shape: "box", min: {x:-30, y:-30, z:20}, max: {x:30, y:30, z:40} }
  ],
  optimizationZone: {
    // Overall bounding volume to optimize
    min: {x:-50, y:-50, z:0},
    max: {x:50, y:50, z:60}
  }
};

// Method 2: Use existing geometry
const designSpace = window.cycleCAD.generativeDesign.createFromGeometry(
  baseGeometry,
  { expansion: 10 }  // Expand by 10mm in all directions
);
```

#### 2. Loads & Constraints

Define physical conditions:

```javascript
const loadCase = {
  loads: [
    {
      type: "force",
      location: {x: 0, y: 0, z: 60},    // Top center
      direction: {x: 0, y: 0, z: -1},   // Downward
      magnitude: 1000                     // 1000 N
    },
    {
      type: "moment",
      location: {x: 0, y: 0, z: 0},
      axis: {x: 1, y: 0, z: 0},          // Around X-axis
      magnitude: 50                       // 50 Nm
    }
  ],
  constraints: [
    {
      type: "fixed",                     // Fixed support
      region: { shape: "sphere", center: {x:0, y:0, z:-5}, radius: 10 }
    }
  ],
  material: {
    name: "aluminum-6061",
    density: 2700,          // kg/m³
    youngs_modulus: 69,     // GPa
    yield_strength: 90      // MPa
  }
};
```

#### 3. Voxel Discretization

The optimization zone is converted to a 3D grid of voxels:

```
Example: 80x80x60 mm design space
Voxel size: 2mm per voxel
Grid dimensions: 40 x 40 x 30 voxels
Total voxels: 48,000 (solvable in <10 seconds)

Initial state:
└─ All voxels: density = 1.0 (100% solid)
```

#### 4. Density Optimization (SIMP Method)

The algorithm iteratively adjusts voxel densities to minimize compliance (C) while respecting volume constraint:

```
SIMP Formulation:
─────────────────────────────────────────────────────────
Minimize:     C = U^T K U           (compliance = deformation energy)
Subject to:   ∑ρ ≤ V_target         (volume constraint)
              0 ≤ ρ ≤ 1             (density bounds)
              K U = F               (FEA equation)

Density-to-Stiffness Relation:
─────────────────────────────────────────────────────────
E(ρ) = E0 × ρ^p

where:
  E(ρ)   = effective Young's modulus
  E0     = base material modulus
  ρ      = voxel relative density (0-1)
  p      = penalization exponent (typically 3)

Effect:
  ρ = 0.5  → E = 0.125 × E0  (very weak, encouraged to remove)
  ρ = 0.1  → E = 0.001 × E0  (nearly void)
  ρ = 1.0  → E = E0          (full material)

Sensitivity:
───────────────────────────────────────────────────────────
dC/dρ = -p × ρ^(p-1) × (stress_energy / avg_density)

Rule: Remove voxels with low sensitivity (won't affect stiffness much)
```

#### 5. Optimization Loop

```
Iteration 1:
  ├─ Solve FEA: Calculate stress in each voxel
  ├─ Compute sensitivity: dC/dρ for each voxel
  ├─ Update densities:
  │   ├─ High sensitivity (must-keep): ρ → 1.0
  │   ├─ Medium: ρ → 0.5
  │   └─ Low (can remove): ρ → 0.0
  ├─ Apply filter (see below)
  └─ Convergence check: |ΔC| < tolerance?
      ├─ YES → Done! Go to step 6
      └─ NO → Iteration 2 (repeat)

Typical convergence: 10-50 iterations
Time per iteration: 100-500ms (depending on grid size)
Total optimization time: 2-30 seconds
```

#### 6. Sensitivity Filtering

After each iteration, a spatial filter prevents checkerboard patterns:

```javascript
// Checkerboard Prevention (Helmholtz filter)
// For each voxel ρ_i, replace with weighted average of neighbors:

ρ_new[i] = (
  ∑(w[j] × ρ_old[j])  /  ∑w[j]
)

where:
  w[j] = max(0, R_filter - distance(i, j))
  R_filter = filter radius (typical: 1.5 voxel sizes)

Example:
  Before filter:    █░███░█░░  (checkerboard)
  After filter:     ███░░░█░░  (smooth transition)
```

#### 7. Marching Cubes Isosurface Extraction

Convert voxel density field to triangulated mesh:

```
Algorithm:
──────────────────────────────────────────────────────────
Input: 3D density grid (each voxel: 0 ≤ ρ ≤ 1)
Threshold: ρ_iso = 0.5  (extract surface where density = 0.5)

For each cube of 8 voxels:
  ├─ Classify: which voxels are above/below threshold?
  ├─ Determine cube type: 256 possible cases (2^8)
  │   └─ Pre-computed triangle list for each case
  ├─ Interpolate vertex positions on edges
  │   └─ Linear interpolation to find exact crossing point
  └─ Add triangles to output mesh

Output: THREE.BufferGeometry with ~50,000-200,000 triangles
        (density-dependent, further reducible)
```

#### 8. Smoothing & Mesh Post-Processing

Raw marching cubes output is faceted; apply Laplacian smoothing:

```javascript
// Laplacian Smoothing (Catmull-Clark-inspired)
for (5 iterations) {
  for (each vertex v) {
    neighbors = adjacentVertices(v);
    v_new = (v + avg(neighbors)) / 2;
  }
}

Result: Smooth, manufacturable geometry
```

### Example Optimization: Cantilever Bracket

```
Input:
  Design space: 100x50x80mm box
  Load: 500N downward at top-right corner
  Constraint: Fixed base at bottom-left corner
  Material: Steel
  Target volume: 50% of original

Iteration 1 (Initial):
  └─ All solid, stress concentrated at corners

Iteration 5:
  └─ Material migrating to main load path
  │  Side walls reducing, internal ribs forming
  │
Iteration 15:
  └─ Clear load-path visible
  │  Internal topology resembles bone structure
  │
Iteration 25 (Converged):
  ├─ Final weight: 47% of original ✓
  ├─ Compliance: 52% increase (acceptable: you saved 53% weight)
  ├─ Max stress: 180 MPa (safe, yield = 250 MPa)
  ├─ Symmetry: Natural (load path is one-sided)
  └─ Manufacturability: CNC machinable, no internal voids

Output Geometry:
  ├─ Main wall: 3mm solid (load-bearing)
  ├─ Support ribs: 2mm thickness
  ├─ Far corner: Reduced to shell with ribs
  └─ Total material removed: Main body walls thinned, side void
```

### Multi-Objective Optimization

cycleCAD supports simultaneous optimization for multiple goals:

```javascript
const result = await window.cycleCAD.generativeDesign.optimize({
  objectives: [
    {
      name: "weight",
      priority: 1.0,         // Highest priority
      target: "minimize"
    },
    {
      name: "cost",
      priority: 0.5,         // Lower priority
      target: "minimize"
    },
    {
      name: "manufacturability",
      priority: 0.3,
      target: "maximize"     // Easier to manufacture
    }
  ],
  constraints: {
    maxDeformation: 2.0,     // mm max
    maxStress: 150,          // MPa
    volumeTarget: 0.45       // 45% of original
  }
});

// Returns
{
  geometry: THREE.BufferGeometry,
  metrics: {
    weight: 0.47,            // 47% of original
    cost: 0.52,              // 52% of original cost
    manufacturability: 8.2,  // Score 1-10
    maxStress: 148,          // MPa
    deformation: 1.8,        // mm
  },
  iterations: 28,
  convergenceTime: 18500,    // ms
  recommendedProcess: "CNC milling"
}
```

### API Reference

#### Run Topology Optimization

```javascript
const result = await window.cycleCAD.generativeDesign.optimize(config);

// config:
{
  designSpace: {
    // as defined above
  },
  loadCase: {
    // as defined above
  },
  optimization: {
    volumeFraction: 0.5,         // Target 50% material
    penalizationPower: 3,        // SIMP exponent
    filterRadius: 1.5,           // Sensitivity filter radius (voxels)
    threshold: 0.5,              // Isosurface threshold
    maxIterations: 50,
    convergenceTolerance: 0.001, // Stop when Δ C < 0.001
    verbose: true                // Console progress updates
  }
}

// Returns
{
  geometry: THREE.BufferGeometry,
  densityField: Float32Array,  // 3D grid (for visualization)
  metrics: { weight, cost, stress, deformation, iterations },
  convergenceHistory: [ ... ],  // Compliance vs iteration
  metadata: {
    voxelSize: 2.0,             // mm per voxel
    gridDimensions: [40, 40, 60],
    totalVoxels: 96000,
    activeVoxels: 45000
  }
}
```

#### Visualize Density Field (Debugging)

```javascript
// Show semi-transparent density distribution during optimization
window.cycleCAD.generativeDesign.visualizeDensityField(
  densityField,
  {
    colorScheme: "density",  // density, stress, sensitivity
    opacity: 0.3,
    showIsosurface: true
  }
);
```

#### Create Manufacturing Notes

```javascript
const notes = window.cycleCAD.generativeDesign.getManufacturingNotes(
  geometry,
  {
    process: "cnc-3axis",
    tolerances: {
      general: 0.1,
      critical: 0.05
    }
  }
);

// Returns markdown with suggested approach for machining
```

---

## Multi-Physics: Simulation

Real-time physics simulation combining FEA (Finite Element Analysis), thermal analysis, modal analysis, and drop testing—all in the browser with GPU acceleration.

### How It Works

**Pipeline:** Mesh Discretization → Matrix Assembly → Solver (CG/GMRES) → Post-Processing → Visualization

#### 1. Supported Analysis Types

| Analysis Type | What It Solves | Output | Typical Use |
|---|---|---|---|
| **Static Structural** | Stress & deformation under loads | Von Mises stress, displacement, safety factor | Check part won't break |
| **Thermal** | Heat flow, temperature distribution | Temperature field, thermal stress | Check thermal stability |
| **Modal (Vibration)** | Natural frequencies & mode shapes | Freq (Hz), mode shape (deformation pattern) | Avoid resonance frequencies |
| **Harmonic (Swept Freq)** | Response to oscillating loads | Amplitude vs frequency | Vibration isolation tuning |
| **Drop Test (Transient)** | Impact dynamics, peak acceleration | Acceleration peak, energy absorption | Package protection validation |
| **Buckling** | Critical load to cause collapse | Buckling load factor, mode shapes | Column/beam stability |

#### 2. Static Structural Analysis

**FEA Formulation:**

```
Global Stiffness Equation:
─────────────────────────────────────────────────────────
[K] {u} = {F}

where:
  [K] = global stiffness matrix (size: n_DOF × n_DOF)
  {u} = displacement vector
  {F} = load vector

Assembly Process:
─────────────────────────────────────────────────────────
For each tetrahedral element:
  1. Compute local element stiffness [k_e]
     (depends on element shape, Young's modulus, Poisson ratio)
  2. Compute local load vector {f_e}
  3. Add to global system: [K] += [k_e], {F} += {f_e}

Boundary Conditions:
─────────────────────────────────────────────────────────
Fixed support: u_x = u_y = u_z = 0 at selected nodes
Roller support: u_z = 0 (constrained in one direction only)
Load: F_x, F_y, or F_z applied at node

Solution:
─────────────────────────────────────────────────────────
Solve [K] {u} = {F} using Conjugate Gradient (CG) solver
  Sparse matrix format: CSR (Compressed Sparse Row)
  Iterative solver: <100 iterations for well-conditioned problems
  Tolerance: ||r|| < 1e-6 × ||F||

Post-Process:
─────────────────────────────────────────────────────────
For each element:
  1. Recover strain: {ε} = [B] {u_e}
     where [B] = strain-displacement matrix
  2. Recover stress: {σ} = [E] {ε}
     where [E] = material stiffness matrix (Hooke's law)
  3. Von Mises stress: σ_vm = √(σ_x² + σ_y² + σ_z² - σ_x*σ_y - σ_y*σ_z - σ_z*σ_x)
  4. Safety factor: SF = σ_yield / σ_vm (for each element)
```

**Example: Load on Bracket**

```
Load case:
  ├─ 500 N downward at top-right
  ├─ Fixed support at base
  └─ Material: Aluminum (E = 69 GPa, σ_yield = 90 MPa)

Mesh:
  ├─ Tetrahedra: 5,000 elements
  ├─ Nodes: 1,200 nodes
  └─ DOF: 3,600 (3 per node)

Solution:
  ├─ Max displacement: 2.1 mm (at load point)
  ├─ Max stress: 67 MPa (at fixed end)
  ├─ Safety factor: 90 / 67 = 1.34 ✓ (safe)
  └─ Solve time: 245 ms

Visualization:
  ├─ Deformation: 10x scale for visibility
  ├─ Stress heatmap: Red (high stress) → Green (low)
  └─ Displacement vector field: Arrows show direction
```

#### 3. Thermal Analysis

**Heat Transfer Equation:**

```
Transient Heat Conduction:
─────────────────────────────────────────────────────────
ρ C_p ∂T/∂t = ∇·(k ∇T) + Q

where:
  ρ = density (kg/m³)
  C_p = specific heat (J/kg·K)
  T = temperature (K)
  k = thermal conductivity (W/m·K)
  Q = heat source (W/m³)

Boundary Conditions:
─────────────────────────────────────────────────────────
- Fixed temperature: T = T_boundary (convection chamber)
- Heat flux: -k ∇T·n = q (applied heat)
- Convection: -k ∇T·n = h (T - T_ambient)
  where h = convection coefficient (W/m²·K)

Material Properties (Temperature-Dependent):
─────────────────────────────────────────────────────────
Aluminum (example):
  k(T) = 237 - 0.05×(T - 300)  W/m·K (decreases with temperature)
  C_p ≈ 900 J/kg·K (varies slightly)

Assembly & Solution:
─────────────────────────────────────────────────────────
[C]{Ṫ} + [K]{T} = {Q}

Solve using:
  1. Spatial discretization: Galerkin FEM
  2. Time stepping: Implicit Euler or Crank-Nicolson
  3. Sparse solver: GMRES with preconditioning
```

**Example: Motor Housing Thermal Profile**

```
Load case:
  ├─ Heat source: 150 W (internal motor loss)
  ├─ Ambient temp: 25°C
  ├─ Cooling: Natural convection (h = 10 W/m²·K)
  └─ Material: Aluminum

Transient Analysis (first 600 seconds):
  ├─ t = 0: T = 25°C everywhere
  ├─ t = 60s: Peak interior 85°C (temperature rising)
  ├─ t = 300s: Steady-state approached
  │   ├─ Interior: 82°C
  │   ├─ Outer surface: 65°C
  │   └─ Edges: 55°C (better cooling)
  └─ t = 600s: Fully steady

Peak temperature: 82°C (safe, aluminum OK to ~150°C)
Thermal gradient: 82 - 25 = 57°C (may cause thermal stress)
```

#### 4. Modal Analysis (Vibration Frequencies)

**Eigenvalue Problem:**

```
Undamped Free Vibration:
─────────────────────────────────────────────────────────
[K]{φ} = ω² [M]{φ}

Rearranged (standard eigenvalue form):
([K] - ω² [M]){φ} = 0

where:
  [K] = stiffness matrix
  [M] = mass matrix
  ω = natural frequency (rad/s)
  {φ} = mode shape (eigenvector)

Solution Method:
─────────────────────────────────────────────────────────
Use Lanczos iteration or Subspace method to find:
  - Lowest N natural frequencies (typically N = 5-20)
  - Corresponding mode shapes

Conversion:
  f (Hz) = ω (rad/s) / (2π)
  Period T (ms) = 1000 / f
```

**Example: Cantilever Beam Vibration**

```
Part: Aluminum beam, 200mm long, fixed at one end
Mesh: 2,000 tetrahedral elements

First 5 Natural Frequencies:
┌─────┬──────────┬──────────┬───────────────────────────┐
│ Mode│ Freq (Hz)│ Period   │ Mode Shape Description    │
├─────┼──────────┼──────────┼───────────────────────────┤
│ 1   │ 48.2 Hz  │ 20.7 ms  │ Primary bending (1st half)│
│ 2   │ 302 Hz   │ 3.3 ms   │ Primary bending (full len)│
│ 3   │ 845 Hz   │ 1.2 ms   │ Complex 3D bending        │
│ 4   │ 1650 Hz  │ 0.61 ms  │ Torsional twist           │
│ 5   │ 2310 Hz  │ 0.43 ms  │ Higher-order torsion      │
└─────┴──────────┴──────────┴───────────────────────────┘

Design Implication:
  If operating at 50 Hz → AVOID (near mode 1 = resonance!)
  If operating at 100 Hz → OK (away from all modes)
  If operating at 1000 Hz → RISKY (approaching mode 3)
```

#### 5. Drop Test Analysis

**Transient Impact Dynamics:**

```
Simplified Model:
─────────────────────────────────────────────────────────
Part drops from height H
  v_impact = √(2 g H)  (velocity at contact)

Contact with floor (1ms contact duration):
  ├─ Deceleration impulse: F = m (v_impact / Δt)
  ├─ Acceleration: a = F / m
  └─ Peak deceleration: a_peak = v_impact / Δt

FEA During Impact:
─────────────────────────────────────────────────────────
[M]{ü} + [C]{u̇} + [K]{u} = {F(t)}

where:
  [M] = mass matrix (inertia resists acceleration)
  [C] = damping matrix (energy dissipation)
  {F(t)} = time-varying contact force

Contact Detection:
─────────────────────────────────────────────────────────
  1. Find lowest point of part
  2. When z < 0 (floor level): activate contact
  3. Contact force: F = k_contact × penetration
     (spring-like floor: very stiff, k ~ 1e8 N/m)
  4. Damping: c_contact = 0.2-0.5 × critical damping
```

**Example: Smartphone Drop Test**

```
Scenario:
  ├─ Phone mass: 200g
  ├─ Drop height: 1.5 meters (home shoulder height)
  ├─ Impact surface: Concrete (hard, high damping)
  └─ Case: TPU rubber (shock-absorbing)

Impact Analysis:
  ├─ Impact velocity: √(2 × 9.81 × 1.5) = 5.4 m/s
  ├─ Contact duration: ~3 ms (estimated from material properties)
  ├─ Peak deceleration: 5.4 / 0.003 = 1,800 g (!!)
  │   (1,800 times gravity — very harsh)
  └─ Peak deceleration (with damping): 450 g (still severe)

Stress During Impact:
  ├─ Display glass: 650 MPa (breaks at 1000 MPa) → SAFE
  ├─ PCB: 450 MPa (breaks at 800 MPa) → SAFE
  ├─ Solder joints: 280 MPa (breaks at 350 MPa) → MARGINAL ⚠
  └─ Camera corner: 920 MPa (expected point of failure) ✗

Pass/Fail:
  └─ FAIL: Camera assembly will break at concrete impact
            (but TPU case reduces effective deceleration)

Recommendations:
  ├─ Add padding around camera
  ├─ Increase TPU thickness from 2mm to 3mm
  └─ Redesign solder joint reinforcement
```

### Material Properties Database

Multi-physics module includes complete property tables for all materials:

```
Material        ρ(kg/m³)  E(GPa)  σ_y(MPa)  k(W/m·K)  α(µm/m·K)  Notes
────────────────────────────────────────────────────────────────────────
Steel (1018)    7850      200     250       52        11.0       Magnetic
Aluminum 6061   2700      69      90        167       23.6       Light
Titanium 6-4    4510      103     880       7.4       8.6        Expensive
Brass C360      8470      97      300       109       20.0       High damping
Nylon 6         1140      3.0     70        0.26      80.0       Low k
ABS plastic     1050      2.3     40        0.2       100        Low k, tough
Copper          8960      110     210       401       16.5       High k
Cast Iron       7750      150     340       46        10.5       Brittle
Glass (SiO2)    2200      70      50        1.2       0.5        Brittle
Carbon composite 1550      130     1100      5         -1.0       Anisotropic
```

Each material includes also:
- Temperature-dependent properties (k, E vary with T)
- Damping ratio (ζ) for vibration analysis
- Thermal expansion coefficient (α) for thermal stress
- Yield and ultimate tensile strength
- Shear modulus (G) and Poisson ratio (ν)

### API Reference

#### Run Static Analysis

```javascript
const result = await window.cycleCAD.multiPhysics.runAnalysis(
  geometry,
  {
    analysisType: "static",
    material: "aluminum-6061",
    loads: [
      {
        type: "force",
        location: {x: 0, y: 0, z: 100},
        direction: {x: 0, y: 0, z: -1},
        magnitude: 500  // 500 N
      }
    ],
    constraints: [
      {
        type: "fixed",
        region: { shape: "sphere", center: {x:0, y:0, z:-10}, radius: 15 }
      }
    ],
    meshDensity: "medium",  // "coarse", "medium", "fine"
    solver: "cg"            // Conjugate Gradient
  }
);

// Returns
{
  success: true,
  maxStress: 67.5,          // MPa
  maxDisplacement: 2.1,     // mm
  safetyFactor: 1.33,       // σ_yield / σ_max
  strainEnergy: 1.245,      // Joules
  deformationGeometry: THREE.BufferGeometry,
  stressField: Float32Array,  // Stress at each element
  displacementField: Float32Array,
  solveTime: 245,           // milliseconds
  iterations: 87
}
```

#### Run Thermal Analysis

```javascript
const result = await window.cycleCAD.multiPhysics.runAnalysis(
  geometry,
  {
    analysisType: "thermal",
    material: "aluminum-6061",
    heatSources: [
      { location: {x:0, y:0, z:0}, power: 150 }  // 150 W at center
    ],
    boundaryConditions: [
      {
        type: "convection",
        region: { shape: "surface" },
        ambientTemp: 25,        // °C
        convectionCoeff: 10     // W/m²·K
      }
    ],
    transientTime: 600,         // seconds to simulate
    timeStep: 5,                // seconds per step
    initialTemp: 25             // °C everywhere
  }
);

// Returns
{
  temperature: Float32Array,    // T at each node over time
  timeSteps: [0, 5, 10, ..., 600],
  peakTemperature: 82,          // °C
  temperatureGradient: 57,      // max T - min T
  steadyStateReached: true,
  convergenceTime: 320,         // seconds to steady
  heatFlux: Float32Array,       // W/m² at boundary
  thermalStress: Float32Array   // Stress from thermal expansion
}
```

#### Run Modal Analysis

```javascript
const result = await window.cycleCAD.multiPhysics.runAnalysis(
  geometry,
  {
    analysisType: "modal",
    material: "aluminum-6061",
    constraints: [
      { type: "fixed", region: { shape: "sphere", ... } }
    ],
    numModes: 10,               // Extract first 10 modes
    solver: "lanczos"
  }
);

// Returns
{
  frequencies: [48.2, 302, 845, 1650, 2310, ...],  // Hz
  periods: [20.7, 3.3, 1.2, 0.61, 0.43, ...],      // ms
  modeShapes: [
    THREE.BufferGeometry,       // Mode 1 shape
    THREE.BufferGeometry,       // Mode 2 shape
    // ...
  ],
  dampingRatios: [0.02, 0.02, 0.03, ...],          // ζ values
  modalMasses: [150, 145, 140, ...],                // kg
  participationFactors: [0.85, 0.12, 0.02, ...]    // contribution to motion
}
```

#### Run Drop Test

```javascript
const result = await window.cycleCAD.multiPhysics.runAnalysis(
  geometry,
  {
    analysisType: "drop",
    material: "aluminum-6061",
    dropHeight: 1500,           // mm
    impactSurface: "concrete",  // concrete, wood, foam
    contactStiffness: 1e8,      // N/m (very stiff surface)
    damping: 0.3,               // critical damping ratio
    simulationTime: 0.05,       // seconds
    timeStep: 0.0001            // seconds (auto-refined near impact)
  }
);

// Returns
{
  peakAcceleration: 1200,       // g (gravitational units)
  peakVelocity: 5.4,            // m/s (impact velocity)
  peakStress: 850,              // MPa
  peakDisplacement: 3.2,        // mm (max penetration)
  impactDuration: 0.003,        // seconds (contact time)
  energyAbsorbed: 2.9,          // Joules
  passFailRegions: {
    camera: "FAIL",             // Stress > ultimate
    solder: "MARGINAL",         // Stress near limit
    display: "PASS"             // Stress < safe
  },
  deformationTimeSeries: [...], // Geometry evolution during impact
  accelerationTimeSeries: [...]  // a(t) during impact
}
```

#### Visualize Results

```javascript
// Show stress heatmap on deformed geometry
window.cycleCAD.multiPhysics.visualizeResults(
  result,
  {
    field: "stress",               // stress, displacement, temp, frequency
    deformationScale: 10,           // 10x exaggeration
    colorScheme: "diverging",       // diverging, sequential, categorical
    showLegend: true,
    showDeformation: true,
    contourLines: true              // Draw iso-contours
  }
);

// Export results
const dataURL = window.cycleCAD.multiPhysics.exportResults(
  result,
  {
    format: "vtk",                  // VTK format for Paraview
    includeField: ["stress", "displacement"]
  }
);
// Download as VTK file
```

---

## Smart Parts Library

Access 200+ standard parts including fasteners, bearings, linear motion components, structural elements, and electronics. Intelligent search, auto-insertion, BOM management, and supplier cross-reference.

### Catalog Overview

| Category | Part Count | Examples |
|----------|-----------|----------|
| **Fasteners** | 85 | ISO 4762 socket head caps, DIN 912 hex bolts, M3-M20, stainless steel variants |
| **Bearings** | 32 | Deep groove ball (6000, 6200 series), angular contact, pillow block units |
| **Linear Motion** | 28 | THK rails, Hiwin blocks, ball screws ISO 4014, lead screws, bushings |
| **Structural** | 24 | Aluminum extrusions (45x45 T-slot, 40x80), angle iron, hollow tubes |
| **Electronics** | 18 | DC motors (12V, 24V), stepper motors (NEMA 17, 23), limit switches, relays |
| **Pneumatics** | 13 | Cylinders (compact, rod), solenoid valves, regulators, fittings ISO 6149 |
| **Total** | **200+** | Complete standard catalog |

### Fastener Category Details

```
ISO 4762 Socket Head Cap Screw
├─ Sizes: M3, M4, M5, M6, M8, M10, M12, M16, M20
├─ Lengths: 6-100mm (standard increments)
├─ Materials:
│  ├─ Stainless Steel A2-70 (corrosion resist)
│  ├─ Stainless Steel A4-80 (marine grade)
│  ├─ Carbon Steel 8.8 (standard, cheaper)
│  └─ Titanium Grade 5 (lightweight)
├─ Properties (example M8):
│  ├─ Head height: 8mm
│  ├─ Socket: 6mm hex
│  ├─ Proof load: 48 kN
│  ├─ Yield: 640 MPa
│  ├─ Cost: $0.08-0.50 depending on material/length
│  └─ Weight: 4.0g per piece
└─ Models: 3D CAD model (STEP/STL) for each variant

DIN 912 Hex Bolt (alternative to ISO 4762)
├─ Similar specs but with hex head instead of socket
├─ Cost: 20% cheaper
├─ Easier to install with common wrench
└─ Models available for M5-M24

...similar details for 83 other fastener types
```

### AI Search Capabilities

#### Natural Language Queries

```
User Types:                         System Interprets:
──────────────────────────────────────────────────────────
"10mm bolt stainless"              ISO 4762 M10, stainless A2
"bearing for 20mm shaft"           Deep groove ball bearing 6004
"50mm aluminum extrusion"          45x45 or 40x80 T-slot, aluminum
"motor 24 volt"                    DC motor 24VDC, ~5-50W range
"limit switch NO contact"          Electronic limit switch, N.O. type
```

#### Fuzzy Matching

```
Query typos handled:
  "ISO 4672" → "ISO 4762" ✓
  "M8x1.25 bolt" → "M8 screw" ✓
  "bearing 6002 series" → "bearing 6002" ✓
```

#### Semantic Search

```
"I need something to hold a shaft on the motor"
  → Suggests: shaft collar, key, set screw, bearing

"Low friction linear motion"
  → Suggests: linear rail (ball or roller), low-friction bushing
```

#### Supplier Integration

Each part includes cross-references:

```
Part: ISO 4762 M8 x 20 Socket Head Cap Screw (Stainless A2)

Suppliers:
├─ McMaster: 91292A162, $0.32/each
├─ Misumi: SCBS-M8-20, $0.25/each
├─ DigiKey: H765-ND, $0.28/each
├─ RS Components: 503-648, $0.30/each
└─ eBay (bulk 100/box): $0.12/each if qty >= 1000

Recommended: Misumi (lowest cost, quick ship Japan)
```

### Part Insertion Workflow

#### Step 1: Search & Select

```
User Action                  System Response
────────────────────────────────────────────────────
Type "M8 bolt"              Show 5 part suggestions
Click "ISO 4762 M8x20"      Preview 3D model in mini viewport
Select variant: stainless A2 Confirm choice, add to insert queue
```

#### Step 2: Positioning

```
Insert Mode Activated:
  └─ Part follows mouse cursor (3D preview)

User Actions:
  ├─ Move mouse → Preview moves
  ├─ Click on geometry → Part placed at click location
  │   (auto-snaps to nearest hole or surface if applicable)
  ├─ Right-click → Rotate preview 45° increments
  ├─ Scroll → Scale preview (if part is adjustable)
  └─ Enter → Confirm placement
```

#### Step 3: Auto-Assembly (Optional)

If inserting fastener into existing hole:

```
Detection:
  ├─ System finds nearest hole in geometry
  ├─ Matches M8 bolt to M8 hole
  └─ Auto-aligns bolt axis with hole axis

User Confirmation:
  "Auto-snap M8 bolt to hole at (x, y, z)?"
  └─ Yes/No dialog
```

#### Step 4: BOM Generation

```
BOM Table Auto-Updated:
┌──────────────────────────────────┬───┬──────────────┐
│ Part                             │ Qty│ Supplier     │
├──────────────────────────────────┼───┼──────────────┤
│ ISO 4762 M8x20 Stainless A2-70   │ 4 │ Misumi       │
│ Deep Groove Bearing 6004          │ 2 │ SKF/NSK      │
│ THK Linear Rail HRW15CA 300mm     │ 1 │ McMaster     │
│ NEMA 17 Stepper Motor             │ 1 │ Amazon       │
└──────────────────────────────────┴───┴──────────────┘

Total Cost: $47.50
Weight: 450g
Lead Time: 5-7 days (Misumi + Amazon)
```

### API Reference

#### Search Catalog

```javascript
const results = await window.cycleCAD.smartParts.search(
  "M8 bolt stainless",
  {
    limit: 10,
    fuzzyMatch: true,
    includeProperties: ["cost", "supplier", "weight"],
    sortBy: "relevance"  // relevance, cost, weight, lead_time
  }
);

// Returns
[
  {
    id: "iso-4762-m8-20-ss-a2",
    name: "ISO 4762 Socket Head Cap Screw M8 x 20 Stainless A2-70",
    category: "fasteners",
    properties: {
      diameter: 8,
      length: 20,
      pitch: 1.25,
      material: "stainless steel A2-70",
      headHeight: 8,
      socketSize: 6
    },
    cost: { min: 0.12, avg: 0.28, max: 0.50 },
    suppliers: [
      { name: "Misumi", partNo: "SCBS-M8-20", cost: 0.25, leadDays: 3 },
      { name: "McMaster", partNo: "91292A162", cost: 0.32, leadDays: 1 }
    ],
    weight: 0.63,  // grams
    geometryUrl: "models/iso-4762-m8-20.step",
    confidence: 0.95
  },
  // ... more results
]
```

#### Get Part Details

```javascript
const partDetail = await window.cycleCAD.smartParts.getPart("iso-4762-m8-20-ss-a2");

// Returns
{
  id, name, category, ...,
  technical: {
    proofLoad: 48000,  // N
    yieldStrength: 640,  // MPa
    tensionArea: 36.6,  // mm²
    threadPitch: 1.25,  // mm
    shearStrength: 480,  // MPa
    hardness: 300,  // HV
  },
   3dModels: {
    step: "models/iso-4762-m8-20.step",
    stl: "models/iso-4762-m8-20.stl",
    threaded: true,
    parametric: false
  },
  documentatio: {
    spec: "ISO 4762:2004 (socket head cap screw)",
    drawing: "pdf/..."
  }
}
```

#### Insert Part into Assembly

```javascript
const inserted = await window.cycleCAD.smartParts.insertPart(
  "iso-4762-m8-20-ss-a2",
  {
    position: {x: 0, y: 0, z: 50},
    rotation: {x: 0, y: 0, z: 0},
    quantity: 4,
    autoSnap: true,  // Auto-align to nearest hole
    addToBOM: true
  }
);

// Returns
{
  geometry: THREE.BufferGeometry,
  instanceCount: 4,
  positions: [[0,0,50], [20,0,50], [0,20,50], [20,20,50]],
  snappedToHoles: [hole1, hole2, hole3, hole4],
  bomEntry: { partId, quantity, supplier, cost },
  addedToScene: true
}
```

#### Generate Bill of Materials (BOM)

```javascript
const bom = window.cycleCAD.smartParts.generateBOM(
  {
    format: "csv",  // csv, json, xlsx, html
    includeSuppliers: true,
    includeCosts: true,
    groupBySupplier: true
  }
);

// Returns CSV:
// Part,Description,Qty,Unit Cost,Total Cost,Supplier,Lead Days
// iso-4762-m8-20-ss-a2,"Socket Head Cap M8x20",4,$0.25,$1.00,Misumi,3
// 6004-2z-ss,"Deep Groove Bearing",2,$5.50,$11.00,SKF,1
// ...
```

#### Export BOM to CSV/Excel

```javascript
const csvData = window.cycleCAD.smartParts.exportBOM("csv");
const file = new File([csvData], "assembly-bom.csv", {type: "text/csv"});
// User downloads file
```

---

## Integration Guide

### Wiring All 6 Modules into cycleCAD

#### Step 1: Import in index.html

Add to the module import section:

```html
<!-- In app/index.html, within <script> tags -->
<script type="module">
  // Import all 6 killer modules
  import TextToCad from './js/text-to-cad.js';
  import PhotoToCad from './js/photo-to-cad.js';
  import Manufacturability from './js/manufacturability.js';
  import GenerativeDesign from './js/generative-design.js';
  import MultiPhysics from './js/multi-physics.js';
  import SmartParts from './js/smart-parts.js';

  // Initialize on app load
  window.addEventListener('DOMContentLoaded', () => {
    const app = window.cycleCAD;

    // Register modules
    app.textToCad = new TextToCad(app);
    app.photoToCad = new PhotoToCad(app);
    app.manufacturability = new Manufacturability(app);
    app.generativeDesign = new GenerativeDesign(app);
    app.multiPhysics = new MultiPhysics(app);
    app.smartParts = new SmartParts(app);

    // Initialize each module
    app.textToCad.init();
    app.photoToCad.init();
    app.manufacturability.init();
    app.generativeDesign.init();
    app.multiPhysics.init();
    app.smartParts.init();

    console.log('✓ All 6 killer modules loaded');
  });
</script>
```

#### Step 2: Add UI Buttons to Toolbar

```html
<!-- In the toolbar section of index.html -->
<div id="toolbar">
  <!-- ... existing buttons ... -->

  <!-- Killer Features Section -->
  <div class="toolbar-group" title="AI & Optimization">
    <button id="btn-text-to-cad" title="Text-to-CAD (Ctrl+T)">
      <span class="icon">📝</span> T2C
    </button>
    <button id="btn-photo-to-cad" title="Photo-to-CAD (Ctrl+P)">
      <span class="icon">📷</span> P2C
    </button>
    <button id="btn-manufacturability" title="DFM Analysis (Ctrl+M)">
      <span class="icon">🏭</span> DFM
    </button>
    <button id="btn-generative" title="Topology Optimization (Ctrl+G)">
      <span class="icon">🧬</span> Gen
    </button>
    <button id="btn-physics" title="Multi-Physics (Ctrl+Shift+P)">
      <span class="icon">⚙️</span> FEA
    </button>
    <button id="btn-parts" title="Smart Parts Library (Ctrl+L)">
      <span class="icon">📦</span> Parts
    </button>
  </div>
</div>
```

#### Step 3: Wire Button Handlers

```javascript
// In app.js initialization section
document.getElementById('btn-text-to-cad').addEventListener('click', () => {
  window.cycleCAD.textToCad.show();
});

document.getElementById('btn-photo-to-cad').addEventListener('click', () => {
  window.cycleCAD.photoToCad.show();
});

document.getElementById('btn-manufacturability').addEventListener('click', () => {
  window.cycleCAD.manufacturability.show();
});

document.getElementById('btn-generative').addEventListener('click', () => {
  window.cycleCAD.generativeDesign.show();
});

document.getElementById('btn-physics').addEventListener('click', () => {
  window.cycleCAD.multiPhysics.show();
});

document.getElementById('btn-parts').addEventListener('click', () => {
  window.cycleCAD.smartParts.show();
});
```

### Chaining Modules for Powerful Workflows

#### Workflow 1: Design → Optimize → Check DFM → Order Parts

```javascript
// User-facing workflow (high-level)

async function designOptimizeAndProcure() {
  // Step 1: Create initial design with Text-to-CAD
  const geometry1 = await window.cycleCAD.textToCad.execute(
    "create bracket 50x50x10mm with 4 mounting holes"
  );
  addToScene(geometry1);

  // Step 2: Check manufacturability
  const dfmReport = await window.cycleCAD.manufacturability.analyze(
    geometry1,
    { material: "aluminum-6061", processes: ["cnc-3axis"] }
  );

  if (dfmReport.issues.length > 0) {
    console.log("DFM issues found, optimizing...");

    // Step 3: Use Generative Design to fix issues while reducing weight
    const geometry2 = await window.cycleCAD.generativeDesign.optimize({
      designSpace: geometry1,
      constraints: { maxStress: 100, maxDeformation: 2.0 },
      volumeFraction: 0.7
    });

    // Check DFM again
    const dfmReport2 = await window.cycleCAD.manufacturability.analyze(geometry2);
    if (dfmReport2.suitable_processes.includes("cnc-3axis")) {
      addToScene(geometry2);
      geometry = geometry2;
    }
  }

  // Step 4: Insert fasteners from Smart Parts
  await window.cycleCAD.smartParts.insertPart(
    "iso-4762-m8-20-ss-a2",
    { quantity: 4, autoSnap: true }
  );

  // Step 5: Generate BOM
  const bom = window.cycleCAD.smartParts.generateBOM({
    format: "csv",
    groupBySupplier: true
  });

  return { geometry, dfmReport: dfmReport2, bom };
}
```

#### Workflow 2: Photo Reference → 3D Model → Simulation → Validation

```javascript
async function reverseEngineerAndValidate() {
  // Step 1: Photo-to-CAD from image
  const image = await selectImageFile();
  const geometry = await window.cycleCAD.photoToCad.processImage(image);

  // Step 2: Refine scale
  window.cycleCAD.photoToCad.setReferenceDimension(
    {x: 100, y: 200},
    {x: 350, y: 200},
    250,  // 250mm dimension
    "mm"
  );

  // Step 3: Run FEA to validate under typical loads
  const fea = await window.cycleCAD.multiPhysics.runAnalysis(
    geometry,
    {
      analysisType: "static",
      material: "aluminum-6061",
      loads: [{
        type: "force",
        location: geometry.getCenter(),
        direction: {x: 0, y: 0, z: -1},
        magnitude: 500  // 500N downward
      }],
      constraints: [{ type: "fixed", region: { ... } }]
    }
  );

  // Step 4: Check if it passes
  if (fea.safetyFactor > 1.5) {
    console.log("✓ Design passes validation");
    return { geometry, fea };
  } else {
    console.log("✗ Design needs refinement");
    // Suggest Generative Design or manual editing
  }
}
```

### WebSocket Integration (for Real-Time Collaboration)

When using the REST API server, broadcast module actions to other clients:

```javascript
// In each module's execute() method, after completion:

async function broadcastAction(action) {
  return fetch('http://localhost:8080/api/design/action', {
    method: 'POST',
    body: JSON.stringify({
      module: action.module,  // 'text-to-cad', 'generative-design', etc.
      command: action.command,
      parameters: action.parameters,
      result: action.result,
      timestamp: Date.now(),
      userId: currentUserId
    })
  });
}

// Usage (inside TextToCad.execute()):
await broadcastAction({
  module: 'text-to-cad',
  command: 'create_cylinder',
  parameters: { diameter: 25, height: 50 },
  result: { geometry, confidence: 0.95 }
});
```

### MCP Server Integration

Expose all modules via Model Context Protocol for AI agents:

```javascript
// In server/mcp-server.js, add tool definitions:

const tools = [
  {
    name: "text_to_cad_execute",
    description: "Execute Text-to-CAD NLP command",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Natural language description" },
        unit: { type: "string", enum: ["mm", "cm", "in", "m"] }
      }
    }
  },
  {
    name: "photo_to_cad_process",
    description: "Process image for reverse engineering",
    inputSchema: {
      type: "object",
      properties: {
        imageUrl: { type: "string" },
        referenceScale: { type: "number" },
        referenceDimension: { type: "number" }
      }
    }
  },
  // ... similar for other 4 modules
];
```

---

## Troubleshooting: Common Issues

### Text-to-CAD Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| **"Unrecognized shape"** | Shape name not in vocabulary | Use alias (e.g., "cyl" for cylinder) or describe shape (e.g., "round rod") |
| **Dimensions not extracted** | Missing unit or ambiguous value | Always include units: "25mm" not "25" |
| **Confidence too low** | Ambiguous phrasing | Rephrase: "add 10mm hole through the center" instead of "add hole" |
| **Preview not appearing** | GPU memory exceeded | Reduce scene complexity or clear undo history (Ctrl+Shift+H) |

### Photo-to-CAD Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| **Edge detection poor** | Shadows or low contrast | Retake photo with better lighting, increase blur kernel size |
| **Wrong scale detected** | Reference object not visible | Click reference button, manually select dimension line |
| **Contour has gaps** | Edge line is broken | Increase `highThreshold` in edge detection settings or manually trace missing edges |
| **Too many/few vertices** | Contour simplification threshold off | Adjust Douglas-Peucker `epsilon` parameter (default 1px) |

### Manufacturability Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| **Cost unreasonably high** | Wrong process selected | Switch to different process or change material |
| **"Unmachinable corner"** | Sharp internal corner < 1mm radius | Add fillet: "fillet internal corners 1mm" in Text-to-CAD |
| **Injection mold cost huge** | No tooling for low quantities | Use CNC or 3D printing for qty < 500 |
| **Sheet metal can't bend** | Bend radius too tight | Increase radius to ≥ 2x material thickness |

### Generative Design Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| **Optimization slow** | Too many voxels (fine mesh) | Reduce `meshDensity` or increase `voxelSize` |
| **Result has unrealistic features** | Volume fraction too low | Increase from 0.3 to 0.5+ to keep more material |
| **Checkerboard pattern in result** | Sensitivity filter not applied | Ensure `filterRadius > 1.0` |
| **Not converging** | Constraints too tight | Relax constraints: increase `maxDeformation` or lower stress limit slightly |

### Multi-Physics Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| **FEA solver fails** | Matrix singular (unconstrained part) | Add fixed constraint at base or support points |
| **Stress unreasonably high** | Load applied to single point node | Distribute load over area using "pressure" type instead |
| **Natural frequency wrong** | Mesh too coarse | Use "fine" mesh density (`meshDensity: "fine"`) |
| **Drop test peaks unrealistic** | Contact duration too short | Increase `contactStiffness` damping ratio to 0.5 |
| **Memory exhausted mid-analysis** | Large geometry + fine mesh | Reduce geometry complexity or use coarser mesh |

### Smart Parts Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| **Part not found** | Typo or part not in catalog | Try fuzzy search or browse category |
| **Supplier lead time shows "N/A"** | Real-time supplier API down | Check supplier website manually or use last cached value |
| **3D model missing** | Vendor didn't provide geometry | Use simplified placeholder model or import from supplier CAD file |
| **BOM export corrupted** | Special characters in part names | Use UTF-8 encoding or remove special characters |

### General Browser Issues

| Problem | Solution |
|---------|----------|
| **WebGL not supported** | Use Chrome/Firefox (Safari: enable WebGL in advanced settings) |
| **Memory leak after long session** | Reload page or clear browser cache (DevTools: Cmd+Shift+Delete) |
| **Slow performance** | Close other tabs, reduce window size, disable hardware acceleration if FPS drops |
| **File upload hangs** | Reduce image size (< 10MB) or use different format |

### Performance Tips

1. **For Text-to-CAD:** Batch multiple commands (create, fillet, add hole) rather than one-at-a-time
2. **For Photo-to-CAD:** Use 1024x1024 images or smaller (smaller = faster edge detection)
3. **For Generative Design:** Start with coarse mesh, then refine if needed; typical: 10-30 voxels per dimension
4. **For FEA:** Use "medium" mesh density initially; upgrade to "fine" only if stress concentrations matter
5. **For Smart Parts:** Search with category filters first ("fasteners") before free-text search

---

## API Quick Reference

### Core Namespaces

```javascript
// All modules accessible via window.cycleCAD.*

window.cycleCAD.textToCad.execute(description)
window.cycleCAD.photoToCad.processImage(file)
window.cycleCAD.manufacturability.analyze(geometry, config)
window.cycleCAD.generativeDesign.optimize(config)
window.cycleCAD.multiPhysics.runAnalysis(geometry, config)
window.cycleCAD.smartParts.search(query)
```

### Common Parameters

```javascript
// Material selection (all modules)
{ material: "aluminum-6061" }  // Use ID from material database

// Geometry input (all modules)
geometry  // THREE.BufferGeometry object

// Load/constraint definition (FEA, generative)
loads: [{ type: "force", location: {x,y,z}, direction: {x,y,z}, magnitude: N }]
constraints: [{ type: "fixed", region: { shape, ... } }]

// Visualization options
{ colorScheme: "viridis", showDeformation: true, scale: 10 }
```

---

## Summary

These 6 killer features represent a paradigm shift in browser-based CAD:

1. **Text-to-CAD** — NL interface for non-specialists
2. **Photo-to-CAD** — Vision-based reverse engineering
3. **Manufacturability** — Real-time DFM + costing
4. **Generative Design** — Automatic topology optimization
5. **Multi-Physics** — FEA, thermal, modal, drop test
6. **Smart Parts** — 200+ standard parts + sourcing

**Together, they make cycleCAD the first platform where humans and AI agents can collaborate seamlessly on physical design.**

---

**For support or detailed feature documentation, see:**
- `docs/QUICK-REFERENCE.md` — Keyboard shortcuts & workflows
- `docs/FUSION-FEATURES-GUIDE.md` — Complete feature list
- `docs/API-REFERENCE.md` — Full API documentation
- `app/js/text-to-cad.js` — Implementation source code

