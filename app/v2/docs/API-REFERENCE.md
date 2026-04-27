# API Reference

> Complete reference for the meter REST API + the kernel JS APIs widgets
> and apps consume.

## 1. Meter REST API

Base URL — depends on deploy:

| Mode | Base |
|---|---|
| Static `make serve` | none — meter not running, falls back to localStorage |
| Full Docker | `http://localhost:8080/api` (proxied by nginx to meter) |
| Direct | `http://localhost:8787/api` (meter container) |

Auth headers:

```
x-admin-key: rk_dev_local       # admin HMAC — bypasses cost, gates privileged endpoints
x-api-key:   cyclecad_xxxxx     # per-tenant API key (Phase 3)
x-tenant:    default            # tenant id; ?t= URL param overrides
content-type: application/json
```

### `GET /api/health`

```json
{ "ok": true, "db": "up", "redis": "up", "s3": "up", "version": "1.0.0-stage1" }
```

### `POST /api/meter/charge` *(public — every widget call)*

Request:

```json
{
  "widget":    "extrude",
  "method":    "init",
  "params":    { "distance": 25 },
  "tokensIn":  4,
  "tokensOut": 18,
  "modelTier": "sonnet",
  "batchSize": 1,
  "actor":     "sachin",
  "tenant":    "default",
  "adminKey":  "rk_dev_local"
}
```

Response:

```json
{
  "ok": true,
  "tx": {
    "id": "tx_a1b2c3d4e5f6",
    "ts": "2026-04-26T12:34:56.789Z",
    "actor": "sachin",
    "widget": "extrude",
    "method": "init",
    "tokens_in": 4, "tokens_out": 18,
    "model_tier": "sonnet",
    "rate_in": 1.0, "rate_out": 5.0,
    "cache_hit": false,
    "batch_size": 1,
    "cost": 94,
    "creator": null,
    "creator_payout": 0,
    "prev_hash": "...",
    "hash": "..."
  },
  "balance": 99906
}
```

Cost formula:

```
raw  = tokensIn × rate_in[modelTier] + tokensOut × rate_out[modelTier]
mult = (cache_hit ? 0.9 : 1) × (batchSize ≥ 10 ? 0.5 : batchSize ≥ 2 ? 0.75 : 1)
cost = max(0, round(raw × mult))
```

Admin keys force `cost = 0` and `bypass = true`.

### `POST /api/meter/refund` *(public)*

```json
{ "id": "tx_a1b2c3d4e5f6", "reason": "duplicate" }
```

Stamps `refunded_at` + `refund_reason` on the row. Does not undo the
balance — credit is the inverse path.

### `POST /api/meter/recharge` *(admin)*

```json
{ "actor": "sachin", "credit": 5000, "source": "stripe", "reference": "ch_xxx" }
```

Returns `{ ok, actor, credit, source, balance: <new> }`.

### `POST /api/meter/widget-owner` *(admin)*

```json
{ "widget": "ai-render", "creator": "sachin", "royaltyPct": 70 }
```

Inserts/updates `widget_owners`. Subsequent charges record
`creator_payout` per row.

### `GET /api/meter/balance?actor=NAME` *(public)*

```json
{ "ok": true, "balance": 99906 }
```

### `GET /api/meter/usage?actor=NAME&days=30` *(public)*

```json
{ "ok": true, "actor": "sachin", "tenant": "default", "days": 30,
  "usage": [
    { "day": "2026-04-26", "calls": 12, "spent": 1410, "billable_calls": 12 },
    { "day": "2026-04-25", "calls":  4, "spent":  210, "billable_calls":  4 }
  ] }
```

### `GET /api/meter/plans` *(public)*

```json
{ "ok": true, "currency": "CYCLE",
  "plans": [
    { "id":"free",       "label":"Free",       "priceEurMonthly": 0,
      "includedCycles": 1000,    "rateLimitPerMin": 30 },
    { "id":"pro",        "label":"Pro",        "priceEurMonthly": 49,
      "includedCycles": 100000,  "rateLimitPerMin": 600 },
    { "id":"enterprise", "label":"Enterprise", "priceEurMonthly": 299,
      "includedCycles": 1000000, "rateLimitPerMin": 6000 },
    { "id":"admin-bypass","label":"Admin (bypass)", "priceEurMonthly": 0,
      "includedCycles": 9007199254740991, "rateLimitPerMin": Infinity }
  ] }
```

### `GET /api/meter/rates` *(public)*

```json
{ "ok": true, "source": "db",
  "rates": {
    "haiku":  { "in": 0.25, "out": 1.25, "notes": "free tier · cheap fast widgets" },
    "sonnet": { "in": 1.0,  "out": 5.0,  "notes": "pro tier · standard" },
    "opus":   { "in": 5.0,  "out": 25.0, "notes": "enterprise tier · heavy compute" }
  } }
```

### `GET /api/meter/earnings?creator=NAME` *(admin)*

```json
{ "ok": true, "creator": "sachin", "earned": 12340, "calls": 87, "since": null }
```

### `GET /api/meter/ledger?actor=&tenant=&limit=N` *(admin)*

```json
{ "ok": true, "ledger": [ { /* full ledger rows */ } ] }
```

### `GET /api/meter/audit/verify` *(admin)*

```json
{ "ok": true, "total": 1234, "mismatched": 0, "mismatches": [] }
```

When `mismatched > 0`, `mismatches` shows the first 5 with `expected` /
`actual` hashes for triage.

### `POST /api/auth/keys` *(admin)*

```json
{ "label": "ci-bot", "scopes": ["widgets:call", "marketplace:read"], "tenant": "default" }
```

Response (key shown ONCE):

```json
{ "ok": true, "key": "cyclecad_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "label": "ci-bot", "scopes": ["widgets:call", "marketplace:read"] }
```

### Stubs (not yet wired)

```
POST /api/auth/oauth/google   → 501
POST /api/auth/oauth/github   → 501
POST /api/auth/sso/saml       → 501
POST /api/stripe/webhook      → 501
```

## 2. JS — `shared/loader.js`

```js
import { loadWidget, prewarm } from '/shared/loader.js';

const handle = await loadWidget('extrude', {
  mount: '#dialog-body',
  app:   'cyclecad',
  meter,                     // shared/meter.js
  scene, camera, renderer,   // optional — only needed for 3D widgets
  controls, root, target,
  params: { distance: 20 },
});

handle.api.run({ distance: 25 });
handle.on('change', e => console.log(e));
handle.destroy();

// Pre-warm a widget so its module is fetched but not mounted
prewarm('ai-copilot');
```

## 3. JS — `shared/meter.js`

```js
import { meter } from '/shared/meter.js';

const result = await meter.charge({
  widget:    'fillet',
  kind:      'init',
  actor:     'sachin',
  tokensIn:  3,
  tokensOut: 12,
  modelTier: 'sonnet',
  batchSize: 1,
  params:    { radius: 2.5 },
});
// result = { ok, tx, balance }

await meter.refund({ tx: { id: result.tx.id } });
```

## 4. JS — `shared/token.js`

```js
import { token } from '/shared/token.js';

await token.balance();                      // → 99906
await token.balance({ actor: 'sachin' });   // → 99906
await token.rates();                        // → { ok, rates: { haiku, sonnet, opus } }
await token.plans();                        // → { ok, plans: [...] }
await token.usage({ days: 7 });             // → { ok, usage: [...] }
token.estimate({ tokensIn: 4, tokensOut: 18, modelTier: 'sonnet' });  // → 94
await token.recharge({ actor: 'sachin', credit: 1000, source: 'manual' });
await token.auditVerify();                  // → { ok, total, mismatched }
await token.earnings({ creator: 'sachin' }); // → { ok, earned, calls }
await token.ledger({ limit: 50 });          // → { ok, ledger: [...] }
token.actor();                              // → 'sachin' (or 'admin_root' if admin key set)
token.setActor('alice');
```

## 5. JS — `shared/auth.js`

```js
import { auth } from '/shared/auth.js';

auth.adminKey();                  // → string|null
auth.setAdminKey('rk_dev_local');
auth.clearAdminKey();

auth.tenantId();                  // → 'default' | from URL ?t= | from localStorage
auth.role();                      // → 'admin' if adminKey set, else from localStorage
auth.setRole('engineer');

auth.currentApiKey();             // → 'cyclecad_…' | null
auth.setApiKey('cyclecad_xyz');

const k = await auth.generateApiKey({ label: 'ci', scopes: ['widgets:call'] });
//   { key, hash, label, scopes }
await auth.verifyApiKey(k.key, k.hash);   // → true
```

## 6. JS — `shared/ui-primitives.js`

```js
import { Toast, Modal } from '/shared/ui-primitives.js';

Toast.show('saved', 1500);
const m = Modal.open({ title: 'Confirm', body: '<p>Sure?</p>' });
m.close();
```

## 7. JS — `shared/widget-registry.js`

```js
import { registry, get } from '/shared/widget-registry.js';

const entry = get('extrude');
// {
//   tier: 2, minRole: 'designer',
//   freeQuota: { calls: 100 },
//   cost: { run: 5 },
//   deps: ['three'],
//   status: 'live',
//   source: 'cycleCAD operations.js (1078 lines)',
//   description: 'extrude a 2D profile to a solid',
//   category: 'solid-ops',
// }

for (const [name, e] of Object.entries(registry)) {
  if (e.status === 'stub') console.log('still stub:', name);
}
```

## 8. Widget contract

Every widget exports one async function:

```js
export async function init(opts: WidgetOpts): Promise<WidgetHandle>;

interface WidgetOpts {
  mount:     string | HTMLElement;
  app:       string;
  meter:     typeof meter;     // shared/meter.js
  scene?:    THREE.Scene;
  camera?:   THREE.Camera;
  renderer?: THREE.WebGLRenderer;
  controls?: OrbitControls | TrackballControls;
  root?:     THREE.Group;
  target?:   HTMLElement;      // for picking
  params?:   Record<string, unknown>;
}

interface WidgetHandle {
  api:     Record<string, (...args: any[]) => any>;
  on:      (event: string, fn: (payload: any) => void) => void;
  destroy: () => void;
}
```

Events every widget emits:

| Event | When |
|---|---|
| `change` | state changed (the catch-all) |
| `result` | a long-running operation finished |
| `error`  | a recoverable error happened |

## 9. Workflow JSON (Phase 5)

```json
{
  "id":   "hero-shot",
  "name": "Hero shot — load + fit + screenshot",
  "steps": [
    { "widget": "glb-loader",       "method": "loadFromUrl",
      "params": { "url": "{{input.modelUrl}}" } },
    { "widget": "fit-to-selection", "method": "run" },
    { "widget": "blueprint",        "method": "enable" },
    { "widget": "screenshot",       "method": "capture",
      "params": { "scale": 2 }, "out": "screenshotDataUrl" }
  ]
}
```

The runner at `workflows/runner.js` (stub in Stage 1) executes
sequentially, charges the meter per step, and binds `out` keys into
subsequent step `params` via `{{stepName.outKey}}` template syntax.

## 10. Library Layer endpoints (Use Case 1)

Stage 2.6 added 26 new endpoints under `/api/library/...` for the
Inventor-import / reverse-engineer / tutorial / drawing pipeline.
All endpoints honour the `x-tenant` (or `x-tenant-id`) header for
tenant scoping. The Fastify body limit is 64 MB to accommodate
streaming uploads of `.iam` / `.ipt` files.

Common error codes:

```
400  invalid body / missing required field
404  resource not found
503  database not ready (server has not connected to Postgres)
500  unhandled — message in body.error
```

### Projects

#### POST /api/library/projects
Create a new project row.

**Body:**
```
{
  tenant_id: string  // optional; defaults to header / 'default'
  name:      string  // required
  owner:     string  // optional
}
```
**Returns:** `{ ok: true, id: number }`
**Errors:** 400 invalid body, 503 db not ready

#### GET /api/library/projects
List all projects for the current tenant.

**Query:** `tenant_id` (optional)
**Returns:** `{ ok: true, projects: Array<{ id, name, owner, created_at, ... }> }`

#### GET /api/library/projects/:id
Fetch a single project plus summary counts (components / drawings /
attachments / tutorials).

**Returns:** `{ ok: true, project: {...}, counts: {...} }`
**Errors:** 404 not found

#### POST /api/library/projects/import
Bulk-create a project + every component from an importer manifest. This
is what `inventor-project-loader.importToServer()` calls.

**Body:**
```
{
  project: { name, owner?, tenant_id? },
  components: Array<{
    name, kind, category, source_path, source_format, imeta?
  }>,
  constraints?: Array<{ kind, from, to, ... }>,
  attachments?: Array<{ kind, path, mime?, size? }>
}
```
**Returns:** `{ ok: true, projectId: number, componentIds: number[], importJobId: number }`
**Errors:** 400 invalid manifest, 503 db not ready

#### POST /api/library/projects/import-from-path
Server-side scripted importer. Reads a folder by absolute path on the
server filesystem and runs the same insert flow. Used by headless build
scripts.

**Body:** `{ path: string, tenant_id?, name? }`
**Returns:** `{ ok: true, projectId: number, ... }`
**Errors:** 400 path missing or invalid, 503 db not ready

#### GET /api/library/projects/:id/manifest
Reassemble the original manifest from the database — the inverse of
`/import`. Useful for re-bundling.

**Returns:** `{ ok: true, manifest: {...} }`

#### POST /api/library/projects/:id/derive
Kick a derivation pass (placeholder — currently a no-op that records
the request for the next worker tick).

**Returns:** `{ ok: true, queued: true }`

### Components

#### POST /api/library/components
Create a single component row.

**Body:**
```
{
  project_id:     number,
  name:           string,
  kind:           'part'|'assembly'|'sub-assembly'|'sheet-metal'|'flat-pattern',
  category?:      'custom'|'standard'|'vendor'|'unknown',
  source_path?:   string,
  source_format?: 'ipt'|'iam'|'idw'|'ipn'|'step'|'glb'|'unknown',
  imeta?:         object
}
```
**Returns:** `{ ok: true, id: number }`

#### PATCH /api/library/components/:id
Update component status, glb_path, or imeta.

**Body:** any subset of `{ status, glb_path, imeta }`
**Returns:** `{ ok: true, id: number }`
**Errors:** 404 not found, 400 no patchable fields

#### POST /api/library/components/:id/upload
Stream file bytes for a component. Accepts either `application/octet-
stream` (raw) or `multipart/form-data`. Body limit is 64 MB.

**Returns:** `{ ok: true, bytes: number, path: string }`

#### GET /api/library/projects/:id/components
List all components in a project, with optional filters.

**Query:** `kind=part|assembly|...`, `category=custom|standard|vendor`
**Returns:** `{ ok: true, components: Array<{...}> }`

#### GET /api/library/components/:id/features
Return the feature-tree imeta blob used by `reverse-engineer.js`.

**Returns:** `{ ok: true, features: Array<{...}>, raw: object }`

#### POST /api/library/components/:id/versions
Append a new revision row.

**Body:** `{ semver?, parent_id?, file_path?, hash? }`
**Returns:** `{ ok: true, versionId: number }`

#### GET /api/library/components/:id/versions
List the version history.

**Returns:** `{ ok: true, versions: Array<{...}> }`

### Constraints

#### POST /api/library/constraints
Bulk-insert mate / joint records. Body may be either an array directly
or `{ constraints: [...] }`.

**Body item:**
```
{ assembly_id, kind, from_component_id, to_component_id, params? }
```
**Returns:** `{ ok: true, inserted: number }`

#### GET /api/library/assemblies/:id/constraints
List all constraints for an assembly.

**Returns:** `{ ok: true, constraints: Array<{...}> }`

### Drawings

#### POST /api/library/drawings
Create a drawing row.

**Body:**
```
{
  project_id:    number,
  component_id?: number,
  sheet_size?:   'A4'|'A3'|'A2'|'A1'|'A0'|'letter'|'tabloid',
  template?:     string,
  status?:       'draft'|'review'|'released'
}
```
**Returns:** `{ ok: true, id: number }`

#### GET /api/library/projects/:id/drawings
List all drawings for a project.

**Returns:** `{ ok: true, drawings: Array<{...}> }`

#### POST /api/library/drawings/:id/views
Append a view (base / iso / section / detail) to a drawing.

**Body:** `{ kind: 'base'|'iso'|'section'|'detail', json: object }`
**Returns:** `{ ok: true, viewId: number }`

#### GET /api/library/drawings/:id/views
List the views attached to a drawing.

**Returns:** `{ ok: true, views: Array<{...}> }`

### Attachments

#### POST /api/library/attachments
Register an attachment for a project.

**Body:** `{ project_id, kind?, path, mime?, size? }`
**Returns:** `{ ok: true, id: number }`

#### GET /api/library/projects/:id/attachments
List attachments.

**Returns:** `{ ok: true, attachments: Array<{...}> }`

### Tutorials

#### POST /api/library/tutorials
Create a tutorial DSL document.

**Body:**
```
{
  project_id?:   number,
  component_id?: number,
  scope:         'part'|'assembly'|'subassembly'|'component'|'project',
  title:         string,
  description?:  string,
  author?:       string,
  body:          object   // the tutorial DSL — see shared/tutorial-schema.js
}
```
**Returns:** `{ ok: true, id: number }`

#### GET /api/library/tutorials/:id
Fetch a single tutorial by id.

**Returns:** `{ ok: true, tutorial: {...} }`
**Errors:** 404 not found

#### PATCH /api/library/tutorials/:id
Update title / description / body / scope.

**Body:** any subset of `{ title, description, body, scope }`
**Returns:** `{ ok: true, id: number }`

#### DELETE /api/library/tutorials/:id
Delete a tutorial. Cascades to `tutorial_runs`.

**Returns:** `{ ok: true, deleted: true }`

#### GET /api/library/projects/:id/tutorials
List tutorials in a project.

**Returns:** `{ ok: true, tutorials: Array<{...}> }`

#### GET /api/library/components/:id/tutorials
List tutorials for a single component.

**Returns:** `{ ok: true, tutorials: Array<{...}> }`

#### POST /api/library/tutorials/:id/runs
Start a playback run for a user.

**Body:** `{ user_id: string }`
**Returns:** `{ ok: true, runId: number, current_step: 0, status: 'started' }`

#### PATCH /api/library/tutorial-runs/:id
Update a run's progress or status.

**Body:** `{ current_step?: number, status?: 'started'|'completed'|'abandoned' }`
**Returns:** `{ ok: true, id: number }`
**Errors:** 400 invalid status, 404 run not found

### Headers

```
x-tenant: default          // (or x-tenant-id) - tenant scoping
x-admin-key: rk_dev_local  // admin bypass for write endpoints (optional)
content-type: application/json   // except /upload
```

