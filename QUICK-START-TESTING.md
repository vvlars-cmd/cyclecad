# Quick Start: Visual Test Agents

## cycleCAD Test Agent v3

### Run Tests Now
1. Open in Chrome: `app/tests/test-agent-v3.html`
2. Wait for app to load (3 seconds)
3. Click **"Run All Tests"**
4. Watch 200+ tests execute in real-time
5. Click **"Export Results"** to download JSON

### What Gets Tested
- All 6 workspaces (Design, Sketch, Assembly, Drawing, Simulation, Manufacture)
- All 50+ toolbar buttons
- All keyboard shortcuts (S, E, F, Ctrl+Z, etc.)
- All panels and dialogs
- Part selection and highlighting
- 3D operations and geometry
- Agent API
- Error handling and edge cases

### Add Your Own Tests

Edit `app/tests/test-agent-v3.html` and add to `defineTests()`:

```javascript
this.addCategory('My New Feature', [
  {
    name: 'My button is visible',
    fn: () => this.checkElementExists('#my-button')
  },
  {
    name: 'My button works',
    fn: () => this.clickInApp('#my-button')
  }
]);
```

## ExplodeView Test Agent v2

### Run Tests Now
1. Open in Chrome: `docs/demo/test-agent-v2.html`
2. Wait for app to load (2 seconds)
3. Click **"Run All Tests"**
4. Watch 150+ tests execute
5. Click **"Export Results"** to download JSON

### What Gets Tested
- All toolbar tabs (View, Analyze, Create, Export, AI, Settings)
- All 40+ feature buttons
- Keyboard shortcuts (T, E, R, G, W, S, etc.)
- Panel open/close and dragging
- Part selection and tree clicking
- Context menus
- Language switching (EN, DE, FR, ES, IT, NL)
- Error handling and recovery

## Test Results

### JSON Export
Click "Export Results" to download a JSON file with:
- Timestamp
- Summary (total, passed, failed)
- Per-test results with timing

Use for:
- CI/CD integration
- Trend analysis
- Automated reporting

### HTML Report
Convert results to HTML:
```bash
node test-reporter.js test-results.json --output report.html
```

## Continuous Integration

Add to `.github/workflows/test.yml`:

```yaml
- run: node test-runner.js app/tests/test-agent-v3.html --output results.json
- uses: actions/upload-artifact@v2
  with:
    name: test-results
    path: results.json
```

Tests run headless on every push and PR.

## Documentation

- **TESTING-GUIDE.md** — Full reference (25+ sections, 528 lines)
- **TESTING-HELP.json** — 20 quick help entries (in-app accessible)

## Common Tasks

### Find a Failing Test
1. Look at test log (red = failed)
2. Click test name to see error
3. Open DevTools (F12) and check app console
4. Manually reproduce the steps

### Add a New Test Category
Edit test-agent HTML, add `this.addCategory('Name', [...])`

### Run Tests Without GUI
```bash
node test-runner.js app/tests/test-agent-v3.html --output results.json
```

### Generate Coverage Report
```bash
node test-coverage.js results.json
# Shows: 203/205 tests passed (99% coverage)
```

## Next Steps

1. Open test agent in Chrome (app/tests/test-agent-v3.html)
2. Run full test suite
3. Check console for any failures
4. Add tests for new features
5. Integrate into CI/CD pipeline

See **TESTING-GUIDE.md** for detailed documentation.
