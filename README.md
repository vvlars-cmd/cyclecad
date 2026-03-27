# cycleCAD

**Browser-based parametric 3D CAD modeler with AI-powered tools, native Inventor file parsing, and smart assembly management.**

No install required — runs entirely in your browser.

[![npm version](https://img.shields.io/npm/v/cyclecad.svg)](https://www.npmjs.com/package/cyclecad)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

![cycleCAD Screenshot](https://raw.githubusercontent.com/vvlars-cmd/cyclecad/main/screenshot.png)

## Features

- **Full parametric modeling** — Sketch, extrude, revolve, fillet, chamfer, boolean operations with constraint-driven design
- **Native Inventor parsing** — Open Autodesk Inventor `.ipt` and `.iam` files directly in the browser
- **AI-powered tools** — Part identification, smart natural language search, automated assembly instructions, integrated AI chatbot
- **Maintenance intelligence** — Heatmaps, wear timelines, service mode, smart BOM generation with estimated pricing
- **40+ built-in tools** — Measurement, section cuts, annotations, hero shots, QR codes, 3D print slicer, and more
- **Export everything** — STL, OBJ, GLTF, PLY per part. CSV/HTML reports. Technical report generation
- **6 languages** — English, German, French, Spanish, Italian, Dutch
- **McMaster-Carr integration** — Direct part sourcing links for identified components
- **Zero dependencies** — Three.js r170 via CDN, no build step required

## Quick Start

```bash
npx cyclecad
```

Or install globally:

```bash
npm i -g cyclecad
cyclecad
```

Or just open [cyclecad.com/app/](https://cyclecad.com/app/) in your browser.

## Built For

cycleCAD was built to manage the **cycleWASH DUO** — a fully automatic bicycle washing system with 473 parts across 6 assemblies. It handles real production-scale assemblies out of the box.

## Tech Stack

- **Three.js r170** — WebGL-powered 3D viewport
- **ES Modules** — Modern JavaScript, no bundler needed
- **Gemini Flash + Groq** — AI part identification and chatbot
- **Browser-native** — Works on any modern browser, any OS

## Links

- **Website:** [cyclecad.com](https://cyclecad.com)
- **App:** [cyclecad.com/app/](https://cyclecad.com/app/)
- **GitHub:** [github.com/vvlars-cmd/cyclecad](https://github.com/vvlars-cmd/cyclecad)

## License

MIT © [vvlars](https://github.com/vvlars-cmd)
