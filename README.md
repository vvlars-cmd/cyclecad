# ⚙ cycleCAD

**Open-source browser CAD with a B-Rep kernel.**
Real solid modeling. Real fillets. Real booleans. No install. No login. Free forever.

[Open App](https://cyclecad.com/app) · [Source](https://github.com/vvlars-cmd/cyclecad) · [Docs](https://cyclecad.com/app/docs/) · [npm](https://www.npmjs.com/package/cyclecad)

---

## What is this

cycleCAD is a parametric 3D CAD modeler that runs entirely in the browser. It uses OpenCascade.js (WASM) as a real B-Rep solid modeling kernel — the same geometry engine behind FreeCAD and KiCad.

Type `motor mount plate with 4 bolt holes` into the AI copilot and get a real 3D solid in seconds.

## How it compares

| | cycleCAD | OnShape | Fusion 360 | FreeCAD |
|---|---|---|---|---|
| Runs in browser | ✅ Yes | Cloud | Desktop | Desktop |
| Cost | **Free** | $1,500/yr | $545/yr | Free |
| Text-to-CAD | ✅ Yes | No | No | No |
| B-Rep kernel | OpenCascade.js | Parasolid | Parasolid | OpenCascade |
| Multiplayer | WebRTC P2P | Paid | No | No |
| Inventor files | .ipt/.iam native | No | Yes | No |
| Open source | MIT | No | No | LGPL |
| Mobile viewer | ✅ Yes | No | No | No |

## Get started

**Browser** — open [cyclecad.com/app](https://cyclecad.com/app) and start designing.

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

## 12 Killer Features

- ⚡ **Text-to-CAD** — Natural language to 3D geometry with live preview
- 📷 **Photo-to-CAD** — Phone photo to parametric model via edge detection + AI
- 🏭 **Manufacturability (DFM)** — Instant feedback for 9 processes, 20+ materials
- 🧬 **Generative Design** — SIMP topology optimization with live voxel visualization
- 🔬 **Multi-Physics Simulation** — FEA, thermal, modal, drop test — all in-browser
- 🔩 **Smart Parts Library** — 200+ standard parts with AI-powered fuzzy search
- 🧲 **Smart Assembly Mating** — Auto-detect 8 constraint types, motion study
- 🤖 **Auto-Assemble Parts** — AI geometry fingerprinting, one-click assembly
- 📊 **Parametric from Example** — Upload variants, AI infers parameters
- 📡 **Digital Twin Live Data** — IoT sensors (MQTT/REST/WebSocket) on 3D model
- 🖨️ **Machine Control** — G-code generator for FDM, CNC, laser. OctoPrint/Klipper
- 📓 **Engineering Notebook** — Auto-logs every design action, AI summaries

## Agent API

cycleCAD is built for AI agents. 55 commands across 10 namespaces via JSON-RPC.

```javascript
// In browser
await kernel.exec('ops.box', { width: 100, height: 50, depth: 30 });
await kernel.exec('ops.fillet', { edges: [0, 1, 2], radius: 5 });
await kernel.exec('step.export', { filename: 'part.step' });
```

```bash
# Via MCP server
npx cyclecad-mcp

# Via CLI
cyclecad ops.box --width 100 --height 50 --depth 30
```

```bash
# Via REST API
curl -X POST http://localhost:3001/api/exec \
  -d '{"command": "ops.box", "params": {"width": 100}}'
```

## Docker

```bash
docker compose up  # starts cycleCAD + STEP converter + ExplodeView
```

## Features

**Modeling** — Parametric sketcher with 17 tools, 12 constraint types. Extrude, revolve, sweep, loft, shell, fillet, chamfer, boolean, pattern, mirror, draft, hole, thread, rib.

**B-Rep Kernel** — Real solid geometry via OpenCascade.js WASM. True edge fillets and chamfers. Real boolean operations. STEP import/export.

**Drawing** — 2D engineering drawing workspace with orthographic views, section views, detail views, GD&T, title blocks, BOM tables. Export to PDF, DXF, SVG.

**Simulation** — Static stress (FEA), thermal, modal frequency, buckling. Material library. Color-coded results with safety factor plots.

**Assembly** — 7 joint types, joint limits, animation, interference detection, exploded views, motion study, auto-generated BOM.

**AI** — Text-to-CAD, part identification, manufacturing cost estimation, auto-generated assembly instructions, maintenance scheduling.

**Export** — STL (ASCII + binary), OBJ, glTF 2.0, STEP, DXF, PDF. G-code preview. 3D print slicer integration.

**Platform** — Chrome, Safari, Firefox, Edge. Offline via IndexedDB. Mobile touch viewer. 50+ keyboard shortcuts. Multi-language (EN/DE/FR/ES/IT/NL).

## Pricing

| Free | Pro €49/mo | Enterprise €299/mo |
|---|---|---|
| All 12 killer features | Everything in Free | Everything in Pro |
| Text-to-CAD + Photo-to-CAD | STEP import/export | Self-hosted deployment |
| DFM + simulation | Real-time collaboration | SSO / SAML |
| 200+ standard parts | Cloud storage | SLA guarantee |
| STL/OBJ/glTF export | Machine control | MCP server + REST API |

## Contributing

```bash
git clone https://github.com/vvlars-cmd/cyclecad.git
cd cyclecad && npm run dev
```

Pick a `good-first-issue`, make changes, open a PR.

## License

MIT © Sachin Kumar

---

**Built for [cycleWASH](https://cyclewash.de)** — designing real production machines with 400+ parts.
