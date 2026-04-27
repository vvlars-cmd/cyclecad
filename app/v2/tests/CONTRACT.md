# tests/CONTRACT.md — the Test Contract

> Canonical spec for every widget's test suite. Companion to
> [`shared/CONTRACT.md`](../shared/CONTRACT.md) (the widget contract).
> Every widget MUST have a `<name>.spec.html` that meets this contract
> before its dashboard row can flip to `'live'`.

---

## 1. Per-widget files

Every widget gets exactly two test files:

```
tests/widgets/<name>.html        — interactive standalone demo
tests/widgets/<name>.spec.html   — automated test runner
```

The `<name>.html` page is a hand-driveable demo. Open it, click around,
verify it works visually. No assertions — just a real host scene.

The `<name>.spec.html` page runs automated assertions. It posts a
`{ type: 'spec-result', widget, pass, passed, total }` message to its
parent so `tests/index.html` and `tests/runner.html` can aggregate.

---

## 2. The five mandatory test cases

Every spec MUST cover at minimum these five cases:

```js
// 1. SHAPE — init() returns a valid handle
expect('init() returns a handle with destroy/on/api', async () => {
  handle = await initWidget({ mount: stage, /* …opts */ });
  if (!handle)                              throw new Error('no handle');
  if (typeof handle.destroy !== 'function') throw new Error('no destroy()');
  if (typeof handle.on !== 'function')      throw new Error('no on()');
  if (!handle.api)                          throw new Error('no api');
});

// 2. MOUNT — DOM appears in the host
expect('mounts expected DOM into the host', async () => {
  const el = stage.querySelector('.<widget-class>');
  if (!el) throw new Error('widget DOM not found');
});

// 3. API — every public method is callable
expect('every api method is callable + emits expected events', async () => {
  for (const method of declaredApiMethods) {
    if (typeof handle.api[method] !== 'function') {
      throw new Error(`api.${method} is not a function`);
    }
  }
  // exercise at least one method, capture its event
  let captured = null;
  handle.on('change', e => { captured = e; });
  await handle.api.firstMethod(/* ... */);
  if (!captured) throw new Error('change event never fired');
});

// 4. DESTROY — cleanup is total
expect('destroy() removes DOM, listeners, timers', async () => {
  handle.destroy();
  if (stage.querySelector('.<widget-class>')) {
    throw new Error('DOM leaked after destroy');
  }
});

// 5. NO-LEAK — 5 init/destroy cycles
expect('5 init/destroy cycles do not leak DOM or memory', async () => {
  for (let i = 0; i < 5; i++) {
    const h = await initWidget({ mount: stage });
    h.destroy();
  }
  const left = stage.querySelectorAll('.<widget-class>').length;
  if (left !== 0) throw new Error(`leaked ${left} elements`);
});
```

A widget MAY add more cases. It MUST NOT skip any of these five.

---

## 3. The spec runner shape

```html
<!doctype html>
<html><head>...<style>
  /* off-screen host so widgets that mount absolute-positioned
     overlays have somewhere to anchor */
  #stage { position: fixed; left: -2000px; width: 800px; height: 600px; }
</style></head>
<body>
  <h1>widget-name · spec</h1>
  <div class="summary" id="summary">running…</div>
  <table>
    <thead><tr><th>#</th><th>case</th><th>result</th><th>detail</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="stage"></div>

  <script type="module">
  import { init } from '../../widgets/<name>.js';
  const tests = [];
  function expect(name, fn) { tests.push({ name, fn }); }

  /* …declare every test… */

  // run + aggregate
  const rows = document.getElementById('rows');
  let passed = 0;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const tr = document.createElement('tr');
    let cell = `<td>${i+1}</td><td>${escape(t.name)}</td>`;
    try {
      await t.fn();
      cell += `<td class="r pass">PASS</td><td></td>`;
      passed++;
    } catch (e) {
      cell += `<td class="r fail">FAIL</td><td>${escape(String(e.message||e))}</td>`;
    }
    tr.innerHTML = cell;
    rows.appendChild(tr);
  }
  const ok = passed === tests.length;
  document.getElementById('summary').className = `summary ${ok ? 'pass' : 'fail'}`;
  document.getElementById('summary').textContent =
    `${ok ? '✓' : '✗'} ${passed} / ${tests.length} passed`;

  // post to parent for aggregation
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'spec-result',
      widget: '<name>',
      pass: ok,
      passed,
      total: tests.length,
    }, '*');
  }

  function escape(s) {
    return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  }
  </script>
</body></html>
```

Working examples: `tests/widgets/cam-nav.spec.html` (7 cases) and
`tests/widgets/dro.spec.html` (10 cases).

---

## 4. Aggregation protocol

The dashboard at `tests/index.html` and the runner at `tests/runner.html`
both load specs in hidden iframes and listen for:

```js
window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'spec-result') return;
  // e.data.widget : string  — widget name
  // e.data.pass   : boolean — overall result
  // e.data.passed : number  — passing case count
  // e.data.total  : number  — total cases
  // e.data.error  : string? — optional summary error
});
```

Each spec must post EXACTLY ONE message. The aggregator times out after
10 seconds.

---

## 5. Test-data conventions

- 3D widgets that need a host scene: tests render a minimal Three.js
  scene with one `THREE.PerspectiveCamera`, one `TrackballControls`, and a
  single `BoxGeometry` mesh named `part`. See `cam-nav.spec.html` for the
  reference setup.
- UI-only widgets mount onto a `<div id="stage">` positioned off-screen at
  `left: -2000px` so absolute-positioned overlays don't bleed visible.
- Network-dependent widgets (ai-render, ai-chatbot, …) MUST NOT make
  real LLM calls in tests. Mock the meter. The test stub is enough to
  exercise the widget's plumbing.

---

## 6. CI hook (Phase 8+)

When CI lands, every PR runs:

```
node scripts/run-all-specs.js   # headless Chromium walks tests/runner.html
                                # writes JUnit XML to test-results.xml
                                # fails if any widget marked 'live' has
                                # a failing spec
```

Until then: open `tests/index.html` in a browser, click "Run all", read
the dots.
