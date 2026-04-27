# tests/integration

Zero-dep ES-module integration suite for cycleCAD Use Case 1
(Inventor reverse-engineer + work-package builder).

## What's in here

| File | Coverage |
|---|---|
| `_runner.mjs` | Tiny test runner — `test`, `assert`, `assertEq`, `assertDeep`, `summary` |
| `walker.test.mjs` | `walkDir` + `classifyCategory` against the real `DUO/` fixture (478 files) |
| `tutorial-schema.test.mjs` | `shared/tutorial-schema.js` — DSL validator, topo-sort, templates |
| `build-step-templates.test.mjs` | `shared/build-step-templates.js` — 15 RE templates, narration, complexity score |
| `pdf-writer.test.mjs` | Snapshot of `buildSinglePagePdf` + `imageDimFallback` from `widgets/drawing-generator.js` |
| `inventor-parsers.test.mjs` | `shared/inventor/index.js` — `detectFormat`, OLE2 reader, `parseIam` against DUO `.iam` |
| `run.mjs` | Orchestrator — imports every `*.test.mjs` |

## How to run

```bash
cd ~/cyclecad/cycleCAD-Suite
node tests/integration/run.mjs
```

Or any single file:

```bash
node tests/integration/walker.test.mjs
node tests/integration/tutorial-schema.test.mjs
node tests/integration/build-step-templates.test.mjs
node tests/integration/pdf-writer.test.mjs
node tests/integration/inventor-parsers.test.mjs
```

Exit code is 0 on success, non-zero on any failure. Each file prints
`✓ name` / `✗ name (msg)` per test plus a summary line.

## Requirements

- Node 18 or newer (uses native `Blob`, `TextEncoder`, ESM, `node:fs/promises`)
- No package install needed — zero dependencies
- The `DUO/` regression fixture at the repo root for the walker + iam tests
  (skipped gracefully with a warning when missing)

## Known limitations / skipped suites

- **Live import-from-path** — needs Postgres + the fastify meter server.
  Not exercised here; covered by `make health` + the manual smoke gate
  documented in `HANDOFF-2026-04-27-evening.md`.
- **`parseIpj`** — uses `DOMParser`, browser-only. Logs a `console.info`
  in `inventor-parsers.test.mjs` and is otherwise skipped.
- **`rasterizeSvgToJpegBytes`** — uses `URL.createObjectURL`, `Image`,
  `<canvas>`, `toDataURL`. Browser-only; not testable from Node.
- **Widget mounts** — registerWidget / DOM mounting paths are exercised by
  the per-widget HTML harnesses under `tests/widgets/<name>.html`.
- **Walker / classifier are SNAPSHOTS** of `server/meter/index.js`. The
  source file does not export them as a module yet. If you change them
  there, also update `walker.test.mjs`. Same applies to the PDF helpers
  in `pdf-writer.test.mjs` (snapshot of `widgets/drawing-generator.js`).

## Adding a new test file

1. Create `tests/integration/<name>.test.mjs`
2. Import from `./_runner.mjs`
3. End the file with `await summary();`
4. Add it to the `FILES` array in `run.mjs`

The runner auto-runs on `beforeExit` if a file forgets to `await
summary()` — but explicit is better.
