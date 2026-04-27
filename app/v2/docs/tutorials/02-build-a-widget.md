# Tutorial 2 — Build a widget from scratch (30 minutes)

> Continues from [`01-quickstart.md`](01-quickstart.md). We'll ship a new
> widget that snaps a 3D ruler between two clicked points and prints the
> distance in the status bar.

## Goal

```
init({ mount, scene, camera, controls, app, meter })
  → handle.api.start()    enters click-mode
  → handle.api.cancel()   exits without measuring
  → handle.api.last()     returns { from, to, distance } or null
  → handle.on('measure', fn)
```

We're going to call this `example-ruler`. It belongs in the
`visualization` category.

## Step 1 · Create the widget file

```bash
touch widgets/example-ruler.js
```

```js
// widgets/example-ruler.js
import * as THREE from 'three';

export async function init(opts) {
  if (!opts.scene)  throw new Error('example-ruler: opts.scene required');
  if (!opts.camera) throw new Error('example-ruler: opts.camera required');
  if (!opts.target) opts.target = opts.renderer?.domElement;
  if (!opts.target) throw new Error('example-ruler: opts.target required');

  const listeners = { measure: [], change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const points = [];
  let line = null;
  let lastResult = null;
  let active = false;

  function pick(e) {
    const r = opts.target.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width)  *  2 - 1;
    ndc.y = ((e.clientY - r.top)  / r.height) * -2 + 1;
    ray.setFromCamera(ndc, opts.camera);
    const hits = ray.intersectObjects(opts.scene.children, true);
    return hits.length ? hits[0].point : null;
  }

  function onClick(e) {
    if (!active) return;
    const p = pick(e);
    if (!p) return;
    points.push(p);
    if (points.length === 2) {
      drawLine();
      const dist = points[0].distanceTo(points[1]);
      lastResult = { from: points[0], to: points[1], distance: dist };
      emit('measure', lastResult);
      emit('change', { kind: 'measure', distance: dist });
      active = false;
    }
  }

  function drawLine() {
    if (line) opts.scene.remove(line);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color: 0xD4A843, dashSize: 0.4, gapSize: 0.2, linewidth: 2,
    });
    line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    opts.scene.add(line);
  }

  function clearLine() {
    if (line) { opts.scene.remove(line); line.geometry.dispose(); line.material.dispose(); line = null; }
    points.length = 0;
  }

  opts.target.addEventListener('click', onClick);

  return {
    api: {
      start() { active = true; clearLine(); },
      cancel(){ active = false; clearLine(); },
      last()  { return lastResult; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      opts.target.removeEventListener('click', onClick);
      clearLine();
    },
  };
}
```

## Step 2 · Register

In `shared/widget-registry.js` add a row right after `measure`:

```js
'example-ruler': {
  tier: 1, minRole: 'viewer',
  freeQuota: { calls: Infinity },
  cost: { measure: 1 },
  deps: ['three'],
  status: 'live',
  source: 'NEW (tutorial)',
  description: 'click-to-click 3D ruler',
  category: 'visualization',
},
```

## Step 3 · Wire into the cycleCAD app

In `apps/cyclecad/index.html` `ACTION_MAP`:

```js
'inspect-ruler': { widget: 'example-ruler', method: 'start' },
```

And in the *Inspect* menu:

```html
<button class="menu-item-link" data-action="inspect-ruler">Quick Ruler</button>
```

Reload the cycleCAD app. *Inspect → Quick Ruler*. Click two points in
the viewport. The ruler draws a dashed gold line between them and emits
the distance.

## Step 4 · Ship the demo + spec

`tests/widgets/example-ruler.html` — a tiny Three.js page that mounts the
widget and triggers `start()`. Use any existing `<widget>.html` as a
template.

`tests/widgets/example-ruler.spec.html`:

```html
<!DOCTYPE html><html><body>
<script type="module">
import { runSpec } from './_spec-helper.js';
import { init }    from '../../widgets/example-ruler.js';

await runSpec({
  name: 'example-ruler',
  mountKind: 'sceneOnly',
  init: ({ scene, camera, mount, renderer }) => init({
    mount, scene, camera, target: renderer.domElement,
    app: 'spec',
    meter: { charge: () => Promise.resolve({ ok: true }), refund: () => {} },
  }),
  exercise: async (handle) => {
    handle.api.start();
    handle.api.cancel();
    return handle.api.last();   // null is fine
  },
});
</script>
</body></html>
```

## Step 5 · Run + commit

```bash
make serve
# open http://localhost:8765/tests/widgets/example-ruler.spec.html — should pass
# open http://localhost:8765/tests/ — find example-ruler card, run all
git add widgets/example-ruler.js shared/widget-registry.js \
        tests/widgets/example-ruler.html tests/widgets/example-ruler.spec.html
git commit -m "widget(example-ruler): click-to-click 3D ruler"
```

## What you learned

1. The widget contract — `init` returns `{ api, on, destroy }`.
2. Mounting into Three.js — the host gives you `scene`, `camera`,
   `target`. You reach into the scene without owning it.
3. Listeners + event emission — emit `change` and a domain-specific
   event (`measure`) so hosts can react.
4. Disposal hygiene — `destroy()` removes the line, disposes geometry +
   material, removes event listeners.
5. The 5 mandatory tests fall out for free if your widget is honest about
   `init / api / destroy`.

## Going further

- Add a CSS panel (with `pt-example-ruler-` prefix) so the widget shows
  the measurement in a small card.
- Add a `units` setting (`mm` / `inch`) read from `cycleCAD.host`.
- Add token-engine hooks — call `meter.charge()` per measurement so the
  ledger has a row.
- Move the ruler into the marketplace by adding a creator + royalty in
  `widget_owners`.
