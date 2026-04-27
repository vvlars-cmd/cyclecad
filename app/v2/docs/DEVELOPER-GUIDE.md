# Developer Guide — building widgets

> Read [`shared/CONTRACT.md`](../shared/CONTRACT.md) for the formal spec.
> This file is the practical companion: how to ship a widget in 30 minutes.

## Prerequisites

```bash
git clone https://github.com/vvlars-cmd/cyclecad-suite.git
cd cyclecad-suite
make serve              # http://localhost:8765/
# OR full stack:
make up                 # http://localhost:8080/
```

You need: Node ≥ 18 for any tooling, Docker for the meter, a browser.

## The 30-minute widget

We'll build `widgets/example-tag.js` — a tiny widget that adds a text
label sprite into a Three.js scene.

### 1. Decide the contract

```
init({ mount, scene, camera, app, meter, params: { text, color } })
api.setText(s)          set the label text
api.setColor(hex)       change the color
api.show() / .hide()    toggle visibility
on('change', fn)        fires whenever text or color changes
destroy()               removes the sprite + listeners
```

### 2. Write the widget

```js
// widgets/example-tag.js
import * as THREE from 'three';

export async function init(opts) {
  if (!opts.scene)  throw new Error('example-tag: opts.scene required');
  const root = typeof opts.mount === 'string'
    ? document.querySelector(opts.mount) : opts.mount;
  // Mount can be null for purely-3D widgets — example-tag has no DOM panel.

  const params = { text: 'tag', color: '#D4A843', ...(opts.params || {}) };
  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  // Build the sprite
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  function repaint() {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = params.color;
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.fillText(params.text, 12, 44);
    if (texture) texture.needsUpdate = true;
  }
  let texture = new THREE.CanvasTexture(canvas);
  repaint();

  const mat    = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(8, 2, 1);
  sprite.position.set(0, 0, 0);
  opts.scene.add(sprite);

  const api = {
    setText(s) {
      params.text = String(s);
      repaint();
      emit('change', { text: params.text });
    },
    setColor(c) {
      params.color = c;
      repaint();
      emit('change', { color: c });
    },
    show() { sprite.visible = true; },
    hide() { sprite.visible = false; },
    move(x, y, z) { sprite.position.set(x, y, z); },
  };

  return {
    api,
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      opts.scene.remove(sprite);
      mat.dispose();
      texture.dispose();
    },
  };
}
```

Three things to internalise:

- **Throw early on missing opts** — better error than silent failure.
- **Always provide `destroy()`** — Three.js leaks fast without `dispose()`.
- **Emit `change`** — host UIs (left tree, status bar, AI Copilot) listen
  to this to stay in sync.

### 3. Register it

Add a row to `shared/widget-registry.js`:

```js
'example-tag': {
  tier: 1, minRole: 'viewer',
  freeQuota: { calls: Infinity },
  cost: { setText: 0, setColor: 0 },     // free during scaffold
  deps: ['three'],
  status: 'live',
  source: 'NEW',
  description: 'sprite label in 3D scene',
  category: 'visualization',
},
```

### 4. Build the demo + spec

`tests/widgets/example-tag.html` — interactive demo:

```html
<!DOCTYPE html>
<html><head>
<title>example-tag · demo</title>
<script type="importmap">{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"
}}</script>
</head><body style="margin:0">
<div id="viewport" style="width:100vw;height:100vh"></div>
<script type="module">
import * as THREE from 'three';
import { init } from '../../widgets/example-tag.js';

const scene  = new THREE.Scene();
const cam    = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, .1, 100);
const ren    = new THREE.WebGLRenderer({ antialias: true });
ren.setSize(innerWidth, innerHeight);
document.getElementById('viewport').append(ren.domElement);
cam.position.set(10, 6, 12); cam.lookAt(0, 0, 0);

const handle = await init({
  mount: '#viewport', scene, camera: cam, app: 'demo',
  meter: { charge: () => Promise.resolve({ ok: true }), refund: () => {} },
  params: { text: 'hello', color: '#15B573' },
});

handle.on('change', e => console.log('change', e));
setTimeout(() => handle.api.setText('tag #2'),       2000);
setTimeout(() => handle.api.setColor('#E11D48'),     4000);

(function tick(){ ren.render(scene, cam); requestAnimationFrame(tick); })();
</script>
</body></html>
```

`tests/widgets/example-tag.spec.html` — runs the 5 mandatory tests:

```html
<!DOCTYPE html><html><body>
<script type="module">
import { runSpec } from './_spec-helper.js';
import { init }    from '../../widgets/example-tag.js';
import * as THREE  from 'three';

await runSpec({
  name: 'example-tag',
  mountKind: 'sceneOnly',           // tells helper to build a hidden scene
  init: async ({ scene, camera, mount }) => init({
    scene, camera, mount, app: 'spec',
    meter: { charge: () => Promise.resolve({ ok: true }), refund: () => {} },
    params: { text: 'spec', color: '#000' },
  }),
  exercise: async (handle) => {
    handle.api.setText('after');
    handle.api.setColor('#111');
    handle.api.move(1, 2, 3);
  },
});
</script>
</body></html>
```

### 5. Run the spec

Open `http://localhost:8765/tests/widgets/example-tag.spec.html` —
the page reports pass/fail.

Or run all 115 from the dashboard: `http://localhost:8765/tests/`.

### 6. Wire into an app

Open `apps/cyclecad/index.html`, add to `ACTION_MAP`:

```js
'tools-example-tag': { widget: 'example-tag', method: 'setText',
                       params: 'demo' },
```

Then add a menu item:

```html
<button class="menu-item-link" data-action="tools-example-tag">Demo Tag</button>
```

Click it. Done.

## Style rules

- **One file = one widget.** Cross-widget logic goes in `shared/`, never
  imported by another widget.
- **No frameworks.** Plain ES modules + Three.js. Add a 3rd-party lib only
  with deliberate `deps:` declaration in the registry.
- **JSDoc for the public surface.** `init(opts)` and every `api.*` method
  gets a `@param` / `@returns` block.
- **DOM hygiene.** Prefix your CSS with `.pt-<name>-…` so widgets don't
  collide.
- **No globals.** Don't write to `window` unless you're a kernel widget.
  The `cycleCAD.host` shared object is the exception (read-only by widgets).
- **Emit `change`, never poll.** Hosts listen for it.
- **Idempotent destroy.** Calling `destroy()` twice is a no-op.

## Three.js gotchas

- Always call `mat.dispose()` and `geometry.dispose()` in `destroy()`.
- `Texture` and `RenderTarget` have their own `dispose()` — call those too.
- `OrbitControls` adds DOM event listeners — call `.dispose()` on those
  in `destroy()` too.
- Resize uses a `ResizeObserver` on `mount`, never `window` (multiple
  apps on one page would conflict).

## Token-engine integration

Most widgets don't touch the meter directly — `loader.js` handles the
init charge automatically. If your widget *runs many sub-operations*
(e.g. `pattern` creates 100 instances), call `meter.charge()` per item:

```js
for (const item of items) {
  await opts.meter.charge({
    widget: 'pattern',
    kind:   'item',
    actor:  opts.app,        // or auth.role()
    tokensIn:  1,
    tokensOut: item.triangles,
    modelTier: 'sonnet',
    batchSize: items.length,
    params: { idx: item.idx },
  });
  // build the geometry
}
```

This makes batch discounts kick in automatically.

## Filing a PR

```bash
git checkout -b widget/<name>
git add widgets/<name>.js shared/widget-registry.js \
        tests/widgets/<name>.html tests/widgets/<name>.spec.html
git commit -m "widget(<name>): description"
git push -u origin widget/<name>
```

The PR template asks for:

1. Spec passes locally (5 mandatory tests).
2. Tutorial agent runs your widget green.
3. Demo screenshot (drag into the PR description).
4. Cost values in registry are honest.
5. Three.js disposal verified (run init/destroy 5 times, no leak).

## Common widget patterns by category

| Category | Pattern |
|---|---|
| **Universal 3D** | Mount sub-elements into `scene`, expose `api.set*()` setters, no DOM panel |
| **Visualization** | Toggle existing scene state, expose `api.toggle()` / `api.set(value)` |
| **Sketch** | Interactive 2D overlay → on `finish()` returns a polyline that `extrude` consumes |
| **Solid** | Reads polyline + params → outputs a `THREE.BufferGeometry`; emits `change` with the new mesh |
| **CAM** | Reads geometry → outputs a `Move[]` array of toolpath records |
| **AI** | Builds a prompt + calls Claude/Gemini/Groq with the user's API key from localStorage |
| **Admin** | Calls `token.*` SDK + renders into a panel; gracefully degrades if no admin key |
| **Token** | Read-only: never writes to `cycleCAD.host`, only renders + emits clicks |

## What goes in `shared/` vs a widget?

| In `shared/` | In a widget |
|---|---|
| Cross-widget state (host scene/camera/renderer) | Widget-specific state |
| Token engine (meter, token) | Charge calls (per-item) |
| UI primitives (Toast, Modal) | Widget-specific UI |
| Auth (admin key, role) | Reading auth — never writing |
| Three.js import map pin | Three.js usage |

If you need to add to `shared/`, propose it in an issue first — the
kernel is deliberately small.

## Building a library widget

The library layer (Use Case 1 — Inventor reverse-engineer) ships 16
widgets that each follow the same pattern. The canonical example is
`widgets/attachment-manager.js` — it is small, has a real DOM panel, no
3D dependency, talks to the server, and degrades gracefully when the
server is unreachable. Use it as the template when adding any new
widget that surfaces server-backed library data.

### 1. ESM with `init(opts) -> { api, on, destroy }`

Same contract as every other widget — but library widgets generally
have NO `scene` / `camera` / `renderer` / `root`. They are UI-only
(panels) plus optional server calls.

```js
// widgets/my-library-widget.js
export async function init(opts) {
  const root = typeof opts.mount === 'string'
    ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('my-library-widget: mount not found');

  const params  = opts.params || {};
  const meter   = opts.meter;
  const wrap    = document.createElement('div');
  // build DOM, wire events ...
  root.appendChild(wrap);

  const listeners = { change: [], add: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  return {
    api: {
      load(projectId)        { /* ... */ },
      add(payload)           { /* ... */ },
      remove(id)             { /* ... */ },
      list()                 { /* ... */ },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { wrap.remove(); Object.keys(listeners).forEach(k => listeners[k] = []); },
  };
}
```

### 2. `meter.charge` call signature

Library widgets bill at the `haiku` tier for read-mostly operations
(list / refresh) and `sonnet` for write or compute operations
(reverse-engineer, drawing-batch, tutorial synthesis). The full call:

```js
await meter.charge({
  widget:    'attachment-manager',
  kind:      'add',
  actor:     opts.app,
  modelTier: 'haiku',
  tokensIn:  100,
  tokensOut: 100,
  batchSize: 1,
});
```

Failures should be swallowed — the meter is optional and a missing
server must never break the widget. Wrap every `meter.charge` in
`try { ... } catch (e) { /* swallow */ }`.

### 3. Routing to `/api/library/...` endpoints

The full endpoint reference is in
[`docs/API-REFERENCE.md`](API-REFERENCE.md). Two conventions:

- All endpoints are tenant-scoped via the `x-tenant` header. If you
  rely on `auth.tenantId()` for the value, the admin override / URL
  param works automatically.
- Every endpoint returns `{ ok: boolean, ...payload }`. Always check
  `r.ok` before using the body, both at the HTTP level and at the
  response-body level.

```js
async function loadAttachments(projectId) {
  try {
    const r = await fetch(`/api/library/projects/${projectId}/attachments`, {
      headers: { 'x-tenant': auth.tenantId() },
    });
    if (!r.ok) return [];
    const body = await r.json();
    return body.ok ? body.attachments : [];
  } catch {
    return [];
  }
}
```

### 4. Mounting under tenants

Library widgets MUST honour the `x-tenant` header so two tenants can
co-exist on the same meter without seeing each other's data.

```js
import { auth } from '../shared/auth.js';

const tenant = auth.tenantId();   // 'default' | from URL ?t= | from localStorage
fetch(url, { headers: { 'x-tenant': tenant } });
```

The tenant id is also read by the work-package-builder when it walks
the pipeline — every sub-widget receives the same tenant via `params`.

### 5. UI-only vs 3D library widgets

Most library widgets are pure DOM panels:

- `library-browser`, `project-tree`, `attachment-manager`,
  `version-history`, `drawing-template`, `drawing-link`,
  `drawing-batch`, `tutorial-author`, `export-bundle`,
  `work-package-summary`, `work-package-builder`,
  `inventor-project-loader`

A handful need `scene` / `camera` / `renderer` / `root` because they
overlay or modify the 3D viewport:

- `drawing-generator` — projects 3D edges to 2D SVG
- `rebuild-guide` — dims un-touched meshes per step, draws sketch
  overlays
- `tutorial-player` — lerps the camera between captured viewports

For 3D widgets, take `opts.scene` / `opts.camera` / `opts.renderer` /
`opts.root` and ALWAYS guard for absence — the widget should still
render its DOM strip if the host has no viewport.

```js
if (opts.scene) {
  state.overlayGroup = new THREE.Group();
  (opts.root || opts.scene).add(state.overlayGroup);
}
```

### 6. Right-click integration

If your widget is reachable from the library-browser context menu, add
its action name to the `library-browser` right-click table and to the
`apps/cyclecad/index.html` ACTION_MAP. Keep the action name kebab-case
and prefixed with the workflow it belongs to (`reverse-`, `drawing-`,
`tutorial-`, `bundle-`, etc.).

### 7. Tests

Same five mandatory tests as every other widget — drop a demo and a
spec into `tests/widgets/` and the dashboard picks it up automatically.
The `_spec-helper.js` `mountKind: 'panel'` mode is the one to use for
DOM-only widgets.
