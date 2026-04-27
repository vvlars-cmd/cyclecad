# Widget testbed

Every widget in the Suite ships with two pages so it can be tested + used standalone:

```
tests/
├── index.html                     ← dashboard listing every widget
└── widgets/
    ├── <name>.html                ← bare-page DEMO (visible, interactive)
    └── <name>.spec.html           ← AUTOMATED spec runner (asserts → reports)
```

## Run it

```bash
# from the suite root
python3 -m http.server 8000
# open http://localhost:8000/tests/
```

Click **Run all tests** — each spec runs in a hidden iframe, posts a
`spec-result` message back, and the dashboard updates pass/fail dots.

## Status of each widget

| Widget          | Demo | Spec | Status |
|-----------------|------|------|--------|
| cam-nav         | ✓    | ✓    | live  |
| ui-primitives   | stub | stub | impl. exists, spec pending |
| meter           | stub | stub | impl. exists, spec pending |
| loader          | stub | stub | impl. exists, spec pending |
| dro             | stub | stub | not yet built |
| gcode-editor    | stub | stub | not yet built |
| playback        | stub | stub | not yet built |
| explode-slider  | stub | stub | not yet built |
| ai-render       | stub | stub | not yet built |

## Adding a new widget

1. Drop `widgets/<name>.js` exporting `init(opts)`.
2. Copy any existing `tests/widgets/cam-nav.html` → `<name>.html` and adapt the host scene.
3. Copy `cam-nav.spec.html` → `<name>.spec.html`, replace the test cases.
4. Add an entry to the `widgets` array in `tests/index.html` with status `live`.

## Spec contract

Each spec posts back to its parent (the dashboard) when it finishes:

```js
window.parent.postMessage({
  type:    'spec-result',
  widget:  '<name>',
  pass:    true | false,
  passed:  <number>,
  total:   <number>,
  error?:  '<message if total < 1>',
}, '*');
```

A 10-second timeout in the dashboard catches hung specs.
