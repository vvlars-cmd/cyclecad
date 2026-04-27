# shared/CONTRACT.md — the Widget Contract

> Canonical spec for every widget in the cycleCAD Suite. If a widget breaks
> this contract, it cannot ship. The contract is enforced by:
> 1. The dashboard refuses to flip the row to `'live'` until the spec passes
> 2. The kernel `loader.js` validates the returned handle shape
> 3. The MCP server reads the registry — widgets must declare their API there

---

## 1. The shape

Every widget is a single ESM file at `widgets/<name>.js` exporting one async
function:

```js
export async function init(opts) {
  /* …mount DOM, attach Three.js, register listeners… */
  return {
    api:     { /* widget-specific operations */ },
    on(event, fn) { /* subscribe to events */ },
    destroy() { /* tear down everything */ },
  };
}
```

That's it. No default exports. No side-effecting top-level code. No globals.

---

## 2. The opts contract — what the kernel passes in

```ts
type WidgetOpts = {
  // REQUIRED for every widget
  mount:   string | HTMLElement;   // CSS selector or Element to mount into
  app:     'cyclecad'              // which app loaded this widget — passed
         | 'explodeview'           //   to meter so usage is tagged correctly
         | 'pentacad'
         | 'admin';
  meter:   MeterClient;            // shared/meter.js — already pre-flighted

  // OPTIONAL — passed when relevant
  scene?:    THREE.Scene;          // 3D widgets receive these from the
  camera?:   THREE.Camera;         //   viewport widget the app already
  controls?: TrackballControls;    //   mounted (or directly from the shell)
  renderer?: THREE.WebGLRenderer;
  root?:     THREE.Group;          // main scene-graph root the widget
                                   //   should attach its meshes under
  theme?:    Partial<ThemeTokens>; // overrides theme.css for this instance
  params?:   Record<string, unknown>;  // widget-specific config
};
```

The kernel guarantees `mount`, `app`, and `meter` are always defined. 3D widgets
receive `scene/camera/controls/renderer/root` from the host. UI-only widgets
ignore them.

---

## 3. The handle contract — what init() must return

```ts
type WidgetHandle = {
  api: Record<string, (...args: any[]) => any>;
    // Public methods. Every method MUST be declared in the registry.
    // Every call SHOULD route through `meter.charge()` if it's metered.

  on(event: 'change' | string, fn: (payload: unknown) => void): void;
    // Universal: 'change' fires when state mutates.
    // Widgets MAY add domain-specific events ('snap', 'units', 'pick', …).

  destroy(): void;
    // Synchronous cleanup. Removes DOM, frees Three.js objects, cancels
    // timers, removes window listeners. After destroy() the handle is
    // invalid — calling api.* throws.
};
```

---

## 4. Five mandatory test cases

Every `tests/widgets/<name>.spec.html` must pass these. See
[`tests/CONTRACT.md`](../tests/CONTRACT.md) for the runner spec.

```text
1. init() returns a valid handle (api object · on function · destroy function)
2. mounts expected DOM into the host
3. every public api method is callable + emits expected events
4. destroy() cleans up DOM, Three.js objects, listeners, timers
5. 5 init/destroy cycles do not leak DOM or memory
```

If any of the five fails, the dashboard row stays `'stub'`. No exceptions.

---

## 5. Registry entry — declarative metadata

Every widget MUST have an entry in `shared/widget-registry.js`:

```js
'cam-nav': {
  tier:       1,                    // 1 universal · 6 production
  minRole:    'viewer',             // viewer · designer · engineer · admin · owner
  freeQuota:  { calls: Infinity },  // per-day per-account
  cost:       { snap: 0, screenshot: 5, setProjection: 0 },
  deps:       ['three', 'three/addons/controls/TrackballControls.js'],
  status:     'live',               // stub · draft · live · deprecated
  source:     'all 3 apps (deduped)',
  description:'ViewCube + projection + parenting + locate + screenshot',
}
```

The MCP server reads this file directly to expose every widget's API as an
MCP tool. The meter reads `cost` and `minRole` to enforce ACL.

---

## 6. Idiomatic patterns

### Mounting

```js
const root = typeof opts.mount === 'string'
  ? document.querySelector(opts.mount)
  : opts.mount;
if (!root) throw new Error('widget: mount not found');
```

### Metered API methods

```js
const handle = {
  api: {
    async snap(face) {
      await opts.meter.charge('cam-nav', 'snap', { face });
      // …do the work…
      emit('change', { kind: 'snap', face });
    },
  },
  // …
};
```

### Event emission

```js
const listeners = { change: [] };
const emit = (ev, payload) => {
  (listeners[ev] || []).forEach(fn => {
    try { fn(payload); } catch (e) { /* swallow */ }
  });
};
const on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
```

### Teardown

```js
const dom = buildDom(root, opts);
const raf = requestAnimationFrame(loop);
const onResize = () => fitToHost();
window.addEventListener('resize', onResize);

return {
  api,
  on,
  destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    dom.wrap.remove();
    // dispose Three.js geometries/materials if owned by this widget
  },
};
```

---

## 7. What widgets MUST NOT do

- ❌ Modify `window.*` globals (other than documented namespaces like `window._dro` for tests)
- ❌ Listen on `document` without scoping to their own DOM subtree
- ❌ Register themselves as side-effects on import — only on `init()`
- ❌ Write to `localStorage` outside their own prefix (`<widget-name>.*`)
- ❌ Block the main thread — heavy compute belongs in a worker or a server widget
- ❌ Hard-code colors — use CSS variables from `theme.css`
- ❌ Fetch from URLs that aren't declared in `deps` (so the loader can preload)
- ❌ Import other widgets directly — go through `loader.loadWidget()` if needed

---

## 8. Worked examples

Two widgets currently meet the contract end-to-end:

- **`cam-nav`** — `widgets/cam-nav.js` 512 lines · `tests/widgets/cam-nav.spec.html` 7/7 passing
- **`dro`** — `widgets/dro.js` 194 lines · `tests/widgets/dro.spec.html` 10/10 passing

Copy either as the starting template for any new widget. See
[`/CONTRIBUTING.md`](../CONTRIBUTING.md) for the step-by-step.
