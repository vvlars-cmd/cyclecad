# cycleCAD Suite — Architecture

> The complete system reference. Pairs with the slide deck at
> `docs/cycleCAD-Suite-Architecture.pptx` — the deck is for stakeholders,
> this file is for engineers shipping widgets.

## 1. The mental model — Lego

```
Kernel    = the studs            (shared/*.js — never grows past ~6 files)
Widgets   = the blocks           (widgets/*.js — 115 of them, more weekly)
Apps      = the baseplates       (apps/*/index.html — 4 of them)
Workflows = the snap-together kits (workflows/*.json — emittable by AI agents)
MCP       = the same blocks for AI agents (server/mcp/ — Phase 5)
```

The contract `init(opts) → { api, on, destroy }` is the single stud
shape. Every widget plugs into every app — no widget knows or cares
which app it's running inside.

## 2. Layered diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USERS / AGENTS                             │
│  human · AI Copilot · MCP client · CI runner · marketplace caller       │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────────┐
│                            APPS (baseplates)                            │
│   /apps/cyclecad/       /apps/explodeview/    /apps/pentacad/           │
│   /apps/admin/          /tests/  /tests/tutorial.html                   │
│   each = thin HTML shell + manifest.json + boot script                  │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            KERNEL (shared/)                             │
│   loader.js          dynamic ES-module widget importer + cache          │
│   meter.js           charge() / refund() — Claude-style token billing   │
│   token.js           balance · rates · usage · plans · estimate         │
│   auth.js            adminKey · role · tenant · API-key gen + verify    │
│   widget-registry.js single source of truth — 115 widget entries        │
│   theme.css          design tokens (gold #D4A843, green #15B573, …)     │
│   ui-primitives.js   Toast / Modal / Popover                            │
│   lib/three-imports.js   pinned three@0.170.0 ESM importmap target      │
│   lib/three-bvh-csg.js   vendored CSG kernel                            │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         WIDGETS (115 blocks)                            │
│  Universal 3D (6)  · Visualization (9) · I/O (10) · Sketch (7)          │
│  Solid ops (15)    · Assembly (6)      · Surface (5) · CAM (14)         │
│  Analysis (10)     · AI (7)            · Documentation (8)              │
│  Admin (18)        · Token (2)         · Kernel-helpers (3)             │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (server/)                              │
│   meter/      Fastify + Postgres + hash-chained ledger                  │
│   bridge/     Python aiohttp · Rockhopper / LinuxCNC mock-mode WS       │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │ Postgres  tenants · users · api_keys · widgets · ledger    │       │
│   │           credits · widget_owners · cache_hits · model_rates│       │
│   │           workflows · workflow_runs                         │       │
│   ├─────────────────────────────────────────────────────────────┤       │
│   │ Redis      session + rate limiter (Phase 3)                 │       │
│   │ MinIO/S3   uploaded models, screenshots, render outputs     │       │
│   └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Request lifecycle

When a user clicks any toolbar / menu action in `apps/cyclecad/`:

```
1. UI handler reads data-action="solid-extrude"
2. dispatch('solid-extrude') looks up the action map
        → { widget: 'extrude' }
3. loader.loadWidget('extrude', { mount, scene, camera, app, meter })
        a. cache miss → import('/widgets/extrude.js')   (lazy ES module)
        b. meter.charge({ widget: 'extrude', kind: 'init', tokensIn, tokensOut, modelTier })
              → POST /api/meter/charge
                  → cost = (tokensIn × rate_in) + (tokensOut × rate_out)
                          × cache_hit_mult × batch_mult
                  → INSERT ledger row + cache_hits row
                  → return { ok, tx, balance }
        c. await widget.init(opts)  → handle = { api, on, destroy }
4. Handle is cached. handle.api.run(params) — first action runs.
5. handle.on('change', fn) propagates state into the model tree / right panel.
```

If `/api/meter` is unreachable, `meter.js` writes to
`localStorage.cyclecad.ledger` so dev still works. Local rows are not part
of the chain.

## 4. The widget contract

```js
/**
 * Every widget exports exactly one async function.
 *
 * @param {WidgetOpts} opts
 *   mount       — '#selector' or HTMLElement
 *   app         — name of the host app (cyclecad / explodeview / pentacad / admin)
 *   meter       — the kernel meter SDK
 *   scene?, camera?, renderer?, controls?, root?
 *               — viewport-attached widgets receive the host's Three.js context
 *   params?     — widget-specific config
 *
 * @returns {WidgetHandle}
 *   api      — public methods callable from outside
 *   on(ev, fn)  — subscribe to lifecycle events ('change', 'render', …)
 *   destroy()   — tear down DOM, dispose Three.js, unsubscribe
 */
export async function init(opts) { … }
```

Five mandatory tests every widget passes:

1. `init` returns a valid handle with `api · on · destroy`.
2. `init` mounts expected DOM into the host element.
3. Every `api` method is callable and emits the documented event.
4. `destroy()` removes DOM, disposes Three.js, releases timers.
5. 5 init/destroy cycles don't leak memory or DOM.

These are encoded in `tests/widgets/_spec-helper.js` and run by every
`tests/widgets/<name>.spec.html`. The tutorial agent at
`tests/tutorial.html` runs all 115 specs in ~3 minutes.

## 5. App layouts

### 5.1 cycleCAD (parametric modeller)

```
suite-bar             (top — siblings + admin + tests)
menu-bar              (File · Edit · Sketch · Solid · Surface · Assembly ·
                       Manufacture · Drawing · Render · Animation · Inspect ·
                       ExplodeView · Tools · Help)
workspace-bar         (workspace tabs + tool icons + view tools)
container
├── left-panel        (model tree / assembly tree / search)
├── viewport          (Three.js — viewport + cam-nav + grid + axes + lights + picking
│                      mounted as kernel widgets at boot)
└── right-panel       (Properties · Parameters · Material)
timeline-bar          (feature history)
status-bar            (units · grid · snap · selection · FPS · widget count ·
                       $CYCLE balance pill · build version)
```

The shell is in `apps/cyclecad/index.html`. Every menu/toolbar
`data-action` routes through `dispatch(action)` which calls
`loadWidget(name, opts)`.

### 5.2 admin (operator dashboard)

```
suite-bar             (with $CYCLE balance pill on the right)
admin-shell           (sidebar + workbench)
├── sidebar
│   ├── Operations    (Overview · Realtime · Health · Ops)
│   ├── $CYCLE Token  (Balances · Audit · Payments)
│   ├── Identity      (Users · API keys · Tenants · Compliance)
│   ├── Widgets       (Registry · Stats · Workflows · Agents · Marketplace)
│   └── Storage       (Files · Repo)
└── workbench         (mounts the active admin widget into a single slot)
footer-strip          (meter · db · chain · actor)
```

Each sidebar entry maps to one of the 18 admin widgets. The footer's
`chain` indicator goes red the moment `audit/verify` reports
`mismatched > 0`.

### 5.3 ExplodeView (viewer / AR / AI render)

Stage 1 shell — widgets land in Stage 2 alongside cycleCAD widgets they
share with (section-cut, transparency, screenshot, ai-render, …).

### 5.4 Pentacad (CAM + simulator + bridge)

Stage 1 shell with `pentacad-cam.js`, `pentacad-sim.js`, `pentacad-bridge.js`
already extracted. The Suite version of these is the next focus.

## 6. $CYCLE token engine

Mirrors Claude's billing model. Full reference in
[`docs/TOKEN-ENGINE.md`](TOKEN-ENGINE.md). One-line summary:

```
cost = (tokensIn × rate_in[tier]) + (tokensOut × rate_out[tier])
     × cache_hit_mult × batch_mult
creator_payout = cost × royalty_pct   // default 70%
```

Three tiers: `haiku` · `sonnet` · `opus` (mirrors Claude's lineup).
Hash-chained ledger.

## 7. Test architecture

```
tests/
├── index.html                  dashboard reads registry, renders 115 cards
├── runner.html                 aggregates every spec
├── tutorial.html               14 → ALL 115 walkthrough · agent button
├── CONTRACT.md                 test contract spec
├── README.md                   per-test-file conventions
└── widgets/
    ├── _spec-helper.js         shared assertions (5 mandatory tests)
    ├── <name>.html             interactive demo
    └── <name>.spec.html        runs the 5 mandatory tests + widget-specific
```

The autonomous agent at `tests/tutorial.html` posts a `spec-result`
message when it finishes each widget's spec. Every widget gets ~1 second.

## 8. Docker stack

```
postgres   (16-alpine)        — ledger + identity
redis      (7-alpine)         — sessions + rate limit
minio                         — S3-compatible blob store
meter      (server/meter)     — Fastify + Postgres + hash-chained ledger
bridge     (server/bridge)    — Python aiohttp WS for LinuxCNC mock
apps       (nginx-static)     — serves /apps and /tests
```

`docker-compose.yml` wires them with health checks. `make up` brings the
whole thing online in <90 seconds.

## 9. Security & ACL

Three rings of trust:

1. **Public** — `GET /api/meter/plans`, `GET /api/health`, all widget
   reads. No auth.
2. **API key** — `widgets:call` scope is the default. Phase 3 Argon2.
3. **Admin HMAC** — `localStorage.cyclecad.adminKey` →
   `x-admin-key` header. Bypasses charging, gates `/api/meter/ledger`,
   `/api/meter/audit/verify`, `/api/meter/recharge`,
   `/api/meter/widget-owner`.

OAuth (Google / GitHub) is stubbed in Stage 1 and lands in Phase 3. SSO
(SAML / OIDC) lands in Phase 9.

## 10. Performance budgets

| Layer | Budget | Measured (Stage 2 head start) |
|---|---|---|
| Widget cold load | < 100 ms | ~40-80 ms (network-bound) |
| Widget warm reuse | < 5 ms | < 1 ms (loader cache hit) |
| Viewport tick | 16 ms | ~5-10 ms with 5k tris |
| Meter charge round-trip | < 30 ms | ~12 ms (Postgres on same host) |
| Test spec | < 1 s | ~200-400 ms |

## 11. The 115-widget taxonomy

| Category | Count | Examples |
|---|---:|---|
| Kernel | 3 | loader · meter · ui-primitives |
| Universal 3D | 6 | viewport · cam-nav · grid · axes · lights · picking |
| Visualization | 9 | section-cut · wireframe · fit-to-selection · transparency · isolate · screenshot · blueprint · hero-shot · dro |
| I/O | 10 | step-import · glb-loader · stl-export · obj-export · gltf-export · dxf-export · pdf-export · bom-csv · occt-wasm · dwg |
| Sketch | 7 | line · circle · rect · arc · polyline · point · constraint-solver |
| Solid ops | 15 | extrude · revolve · sweep · loft · hole · thread · fillet · chamfer · shell · draft · scale · combine · split · mirror · pattern |
| Assembly | 6 | mate · joint · motion-study · explode-slider · interference · contact-set |
| Surface / sheet | 5 | t-spline · nurbs · sheet-bend · flange · unfold |
| CAM | 14 | cam-contour · pocket · drill · adaptive · face · cam-chamfer · bore · post-processor · gcode-editor · sim-executor · rockhopper-bridge · jog-pad · machine-picker · playback |
| Analysis | 10 | measure · weight-estimator · part-comparison · fea · thermal · modal · buckling · design-review · dfm-check · ai-engineering-analyst |
| AI | 7 | ai-copilot · ai-render · ai-narrator · ai-vision-id · ai-chatbot · ai-search-nl · ai-batch-scan |
| Documentation | 8 | annotations · qr-code · manual-builder · tech-report · kb-article · standards-id · mcmaster-search · kiri-moto-export |
| **Token** | **2** | **token-balance · token-recharge** |
| Admin | 18 | overview · users · api-keys · tokens · audit · widget-registry · widget-stats · health · realtime · tenants · payments · files · repo · ops · compliance · workflows · agents · marketplace |
| **TOTAL** | **120** | (includes 3 kernel helpers + 2 token + 115 standard) |

## 12. Repo layout

See [`README.md`](../README.md) §"Repository layout".

## 13. Roadmap

- **Now (Stage 2):** all 115 widgets at scaffold-or-better, dashboard
  + token engine wired.
- **Next (Stage 3):** per-widget full impl pass — sketch / solid /
  assembly / CAM widgets get real geometry not Three.js primitives.
- **Phase 3:** Argon2 + OAuth + real rate limiting.
- **Phase 5:** MCP server exposing every widget as an MCP tool.
- **Phase 8:** Cloudflare Pages + Fly.io deploy pipeline.
- **Phase 9:** SSO (SAML / OIDC) for enterprise.
- **Phase 10:** Stripe + USDC ramps · plan enforcement · payouts to creators.

## 14. Library Layer (Use Case 1)

Stage 2.6 added a full **library layer** for reverse-engineering Autodesk
Inventor projects. The layer is additive — every existing widget and
endpoint still works — and is implemented as 16 new widgets, 8 new shared
modules, 26 new server endpoints, and 10 new schema tables. The flow goes
from a folder of `.ipj` / `.iam` / `.ipt` files to a downloadable
`work-package.zip` containing per-component drawings, tutorials, BOM, and
a manifest.

### Component diagram

```
inventor-project-loader  ->  POST /import or /import-from-path  ->  projects + components + import_jobs
                                                                            |
                                                                            v
library-browser  <-  GET /projects/:id/components  <-  components table
      |  (right-click)
+------------------------------------------------------------------------+
| reverse-engineer  ->  rebuild-guide                                     |
| tutorial-author   ->  tutorials  ->  tutorial-player                    |
| drawing-generator ->  drawings + drawing_views                          |
| export-bundle     ->  STORE-only ZIP (manifest + parts + drawings)      |
+------------------------------------------------------------------------+
      ^                              all orchestrated by
work-package-builder                  <-  work-package-builder
```

### Schema additions

| Table | Purpose |
|---|---|
| `projects` | one row per imported Inventor project (tenant-scoped) |
| `components` | parts / sub-assemblies / assemblies inside a project |
| `component_versions` | semver-tagged revision history per component |
| `constraints` | mate / joint records between components |
| `drawings` | sheet-level metadata (size, template, status) |
| `drawing_views` | base / iso / section / detail views inside a drawing |
| `attachments` | PDFs, photos, notes attached to a project |
| `import_jobs` | status row for each import (queued / running / done) |
| `tutorials` | DSL documents authored from reverse-engineer output |
| `tutorial_runs` | per-user playback progress |

```
ENUMs:  library_component_kind     ('part'|'assembly'|'sub-assembly'|'sheet-metal'|'flat-pattern')
        library_source_format      ('ipt'|'iam'|'idw'|'ipn'|'step'|'glb'|'unknown')
        library_component_category ('custom'|'standard'|'vendor'|'unknown')
        library_component_status   ('parsed'|'derived'|'reviewed'|'released'|'archived')
```

All migrations are guarded with `CREATE TABLE IF NOT EXISTS` and a
`pg_type` check around each `CREATE TYPE`, so re-running `init.sql` on a
populated database is a no-op.

### Work-package pipeline (sequence)

```
operator                work-package-builder            sub-widgets / server
   |                            |                              |
   |  click "Build"             |                              |
   |--------------------------->|                              |
   |                            |  Phase 1: import             |
   |                            |----------------------------->|  inventor-project-loader
   |                            |                              |  -> POST /api/library/projects/import
   |                            |  projectId                   |
   |                            |<-----------------------------|
   |                            |  Phase 2: reverse-engineer   |
   |                            |  iterate components          |
   |                            |----------------------------->|  reverse-engineer.synthesize(meta)
   |                            |  build plans                 |
   |                            |<-----------------------------|
   |                            |  Phase 3: tutorials          |
   |                            |----------------------------->|  tutorial-author.synthesizeFromComponent
   |                            |                              |  -> POST /api/library/tutorials
   |                            |<-----------------------------|
   |                            |  Phase 4: drawings           |
   |                            |----------------------------->|  drawing-batch.start
   |                            |   per (component x sheet x view) |
   |                            |                              |  -> POST /api/library/drawings + /:id/views
   |                            |<-----------------------------|
   |                            |  Phase 5: bundle             |
   |                            |----------------------------->|  export-bundle.bundle()
   |                            |  blob + url                  |
   |                            |<-----------------------------|
   |  download link             |                              |
   |<---------------------------|                              |
```

Each phase emits `phase` / `progress` / `error` events on the
work-package-builder handle; failure of one component does not abort the
pipeline. The summary tile at the end is rendered by
`work-package-summary` and shows component / drawing / tutorial /
attachment / bundle / revision counts.

### Where the new code lives

```
widgets/
  inventor-project-loader.js    library-browser.js     project-tree.js
  attachment-manager.js          version-history.js
  drawing-generator.js           drawing-template.js   drawing-link.js
  drawing-batch.js
  reverse-engineer.js            rebuild-guide.js
  tutorial-author.js             tutorial-player.js
  export-bundle.js               work-package-summary.js
  work-package-builder.js        (orchestrator)

shared/
  inventor/
    index.js                     ole-cfb-reader.js
    ipj-parser.js                iam-parser.js         ipt-parser.js
  tutorial-schema.js             build-step-templates.js

server/meter/
  schema.sql                     (10 new tables, 4 ENUMs, 4 indexes)
  index.js                       (26 new endpoints under /api/library/...)
```

See [`docs/API-REFERENCE.md`](API-REFERENCE.md) for the full endpoint
reference, [`docs/USER-GUIDE.md`](USER-GUIDE.md) for the import flow, and
[`docs/DEVELOPER-GUIDE.md`](DEVELOPER-GUIDE.md) for the pattern used by
the new widgets.
