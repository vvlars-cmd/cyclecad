<div align="center">

<img src="https://raw.githubusercontent.com/vvlars-cmd/cyclecad/main/screenshot.png" alt="cycleCAD" width="720">

<h1>cycleCAD</h1>

<p><strong>Open-source browser CAD with a B-Rep kernel.</strong><br>
Real solid modeling. Real fillets. Real booleans. No install. No login. Free forever.</p>

<a href="https://www.npmjs.com/package/cyclecad"><img src="https://img.shields.io/npm/v/cyclecad?style=flat-square&logo=npm&color=CB3837" alt="npm"></a>
<a href="https://www.npmjs.com/package/cyclecad"><img src="https://img.shields.io/npm/dw/cyclecad?style=flat-square&color=CB3837" alt="downloads"></a>
<a href="https://github.com/vvlars-cmd/cyclecad/stargazers"><img src="https://img.shields.io/github/stars/vvlars-cmd/cyclecad?style=flat-square&logo=github" alt="stars"></a>
<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>

<br><br>

<a href="https://cyclecad.com/app/"><strong>Open App</strong></a> · <a href="https://github.com/vvlars-cmd/cyclecad">Source</a> · <a href="https://cyclecad.com/docs">Docs</a> · <a href="https://www.npmjs.com/package/cyclecad">npm</a>

</div>

---

## What is this

cycleCAD is a parametric 3D CAD modeler that runs entirely in the browser. It uses OpenCascade.js (WASM) as a real B-Rep solid modeling kernel — the same geometry engine behind FreeCAD and KiCad. You get actual solid geometry, not mesh approximations.

Type `motor mount plate with 4 bolt holes` into the AI copilot and get a real 3D solid in seconds.

```
> create a motor mount plate 100mm wide, 80mm tall
  ✓ solid rectangular prism

> add 4 bolt holes in corners, 10mm diameter
  ✓ holes cut through plate

> fillet all edges 2mm
  ✓ edges rounded — ready to manufacture
```

---

## How it compares

| | cycleCAD | OnShape | Fusion 360 | FreeCAD |
|:--|:--|:--|:--|:--|
| Runs in browser | Yes | Cloud | Desktop | Desktop |
| Cost | Free | $1,500/yr | $545/yr | Free |
| Text-to-CAD | Yes | No | No | No |
| B-Rep kernel | OpenCascade.js | Parasolid | Parasolid | OpenCascade |
| Multiplayer | WebRTC P2P | Paid | No | No |
| Inventor files | .ipt/.iam native | No | Yes | No |
| Open source | MIT | No | No | LGPL |
| Mobile viewer | Yes | No | No | No |

---

## Get started

**Browser** — open [cyclecad.com/app](https://cyclecad.com/app/) and start designing.

**npm:**

```bash
npm install -g cyclecad
cyclecad
```

**Clone:**

```bash
git clone https://github.com/vvlars-cmd/cyclecad.git
cd cyclecad && npm run dev
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  cycleCAD — Browser Runtime                          │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  UI Layer — Toolbar · Tree · Properties · Chat  │ │
│  └─────────────────────┬───────────────────────────┘ │
│                        │                             │
│  ┌─────────────────────▼───────────────────────────┐ │
│  │  LEGO Microkernel                               │ │
│  │  Module Registry · Event Bus · Command System   │ │
│  │  Memory Manager · Shared State · Hot-Swap       │ │
│  └──┬──────────┬──────────┬──────────┬─────────────┘ │
│     │          │          │          │               │
│  ┌──▼───┐  ┌──▼───┐  ┌──▼───┐  ┌──▼────────────┐  │
│  │Sketch│  │ Ops  │  │B-Rep │  │   Services    │  │
│  │Engine│  │extr. │  │Kernel│  │ AI · Multi ·  │  │
│  │2D    │→ │rev.  │→ │OCCT  │  │ Marketplace   │  │
│  │const.│  │bool. │  │WASM  │  │ Simulation    │  │
│  └──────┘  └──────┘  └──────┘  └───────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │  I/O — STEP · Inventor · STL · OBJ · glTF · DXF ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

The kernel is ~300 lines. Everything else is a LEGO module that loads on demand. The B-Rep kernel (50MB WASM) only downloads when you need solid geometry. Modules can be hot-swapped at runtime.

---

## Features

**Modeling** — Parametric sketcher with 17 tools (line, rect, circle, arc, ellipse, spline, polygon, slot, trim, extend, offset, mirror, fillet, chamfer, construction, dimension, pattern). 12 constraint types. Extrude, revolve, sweep, loft, shell, fillet, chamfer, boolean, pattern, mirror, draft, hole, thread, rib.

**B-Rep Kernel** — Real solid geometry via OpenCascade.js WASM. True edge fillets and chamfers (not mesh approximations). Real boolean operations. STEP import/export. Mass properties with center of gravity. Edge and face selection.

**Drawing** — 2D engineering drawing workspace with orthographic views, section views, detail views. Linear, angular, radial, diameter dimensions. GD&T symbols, surface finish, weld symbols, balloons, title blocks, BOM tables. Export to PDF, DXF, SVG.

**Simulation** — Static stress analysis (FEA), thermal analysis, modal frequency analysis, buckling. Material library (steel, aluminum, ABS, brass, titanium, nylon). Color-coded results visualization with safety factor plots.

**Assembly** — 7 joint types (rigid, revolute, slider, cylindrical, pin-slot, planar, ball). Joint limits and animation. Interference detection. Exploded views. Motion study. Auto-generated BOM.

**AI** — Text-to-CAD with natural language. Part identification from geometry. Manufacturing cost estimation. Auto-generated assembly instructions. Maintenance scheduling. Smart BOM with McMaster-Carr links. Works offline.

**Export** — STL (ASCII + binary), OBJ, glTF 2.0, STEP, DXF, PDF. 3D print slicer integration. G-code preview.

**Platform** — Chrome, Safari, Firefox, Edge. Offline via IndexedDB. Mobile touch viewer. 50+ keyboard shortcuts. Multi-language (EN/DE/FR/ES/IT/NL).

---

## Agent API

cycleCAD is built for AI agents, not just humans. 55 commands across 10 namespaces via JSON-RPC.

```javascript
// In browser
await kernel.exec('ops.box', { width: 100, height: 50, depth: 30 });
await kernel.exec('ops.fillet', { edges: [0, 1, 2], radius: 5 });
await kernel.exec('step.export', { filename: 'part.step' });

// Via MCP server
npx cyclecad-mcp  # exposes all 55 commands as MCP tools

// Via REST API
curl -X POST http://localhost:3001/api/exec \
  -d '{"command": "ops.box", "params": {"width": 100}}'

// Via CLI
cyclecad ops.box --width 100 --height 50 --depth 30
```

---

## Multiplayer

```javascript
const room = await cyclecad.createRoom();   // "ABC123"
await cyclecad.joinRoom("ABC123");          // teammate joins
```

Peer-to-peer via WebRTC. No server. CRDT sync.

---

## Docker

```bash
docker compose up  # starts cycleCAD + STEP converter + cycleWASH viewer
```

Three services: cycleCAD on `:8080`, STEP converter on `:8787`, ExplodeView on `:3000`.

---

## Parts Library

35+ built-in parametric parts. Community marketplace with 70-90% creator royalties.

```bash
cyclecad install bearing-6205
cyclecad install motor-nema23
```

---

## Contributing

```bash
git clone https://github.com/vvlars-cmd/cyclecad.git
cd cyclecad && npm run dev
```

Pick a `good-first-issue`, make changes, open a PR.

---

## License

MIT &copy; [Sachin Kumar](https://github.com/vvlars-cmd)

<div align="center">
<br>
<a href="https://cyclecad.com/app/"><strong>Open cycleCAD</strong></a>
<br><br>
<sub>Built for <a href="https://cyclewash.com">cycleWASH</a> — designing a real production machine with 400 parts.</sub>
</div>
