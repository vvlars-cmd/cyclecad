# cycleCAD Help System - Quick Start

## Files

| File | Size | Purpose |
|------|------|---------|
| `help-viewer.html` | 25 KB | Standalone help interface |
| `js/killer-features-help.json` | 16 KB | Help database (24 entries) |
| `HELP-SYSTEM-README.md` | 8.8 KB | Complete documentation |

## Open Help Viewer

### Direct URL
```
http://localhost:port/app/help-viewer.html
```

### From Button
```html
<button onclick="window.open('./help-viewer.html', 'help')">Help ?</button>
```

### With Search Parameter
```html
<a href="./help-viewer.html?search=cylinder" target="_blank">Learn about cylinders</a>
```

## Search Examples

| Search | Result |
|--------|--------|
| `cylinder` | Create a Cylinder (Text-to-CAD) |
| `hole` | All hole types (Through, Blind, etc.) |
| `fillet` | Add a Fillet (Text-to-CAD) |
| `photo` | Photo-to-CAD section |
| `cnc` | CNC processes (Manufacturability) |
| `stress` | Static Stress Analysis (Multi-Physics) |
| `fastener` | Smart Parts fasteners |
| `iso 4762` | ISO standard search |

## Features

- Real-time fuzzy search (handles typos)
- Module filtering sidebar
- Recently viewed (last 10 entries)
- Copy-to-clipboard examples
- Dark theme (VS Code style)
- Keyboard shortcuts (Escape to clear)
- Mobile responsive
- Print friendly

## Add to App

### Toolbar Button
```html
<button id="helpBtn" class="toolbar-button" title="Help (F1)">
  <span>?</span>
</button>

<script>
document.getElementById('helpBtn').addEventListener('click', () => {
  window.open('./help-viewer.html', 'cycleCAD Help', 'width=1200,height=800');
});
</script>
```

### Feature Panel Help
```html
<div class="feature-panel">
  <h3>Create a Cylinder</h3>
  <a href="./help-viewer.html?search=cylinder" class="help-link">Learn more →</a>
  <!-- content -->
</div>
```

### Contextual Help
```javascript
// Show help for current tool
function showHelp(topic) {
  const url = `./help-viewer.html?search=${encodeURIComponent(topic)}`;
  window.open(url, 'help', 'width=1000,height=700');
}

// Usage:
showHelp('cylinder');
showHelp('fillet');
showHelp('FDM 3D Printing');
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Escape | Clear search & filters |
| Ctrl+F | Browser find |
| Click module | Toggle filter |
| Click badge | Jump to related topic |

## Database Schema

```json
{
  "id": "ttc-001",              // Unique identifier
  "module": "Text-to-CAD",      // Module name
  "category": "shapes",          // Sub-category
  "title": "Create a Cylinder",  // Help topic
  "keywords": [                  // Search tags
    "cylinder", "round", "tube"
  ],
  "description": "...",          // Brief overview
  "examples": [                  // Usage examples
    "cylinder 50mm diameter 80mm tall"
  ],
  "syntax": "cylinder [diameter] [height]",
  "parameters": {                // Parameter docs
    "diameter": "mm (outer)"
  },
  "tips": "...",                 // Pro tips
  "related": ["ttc-010"]         // Related topic IDs
}
```

## Module Coverage

| Module | Entries | Topics |
|--------|---------|--------|
| Text-to-CAD | 8 | shapes, features, operations, tips |
| Photo-to-CAD | 3 | upload, camera, scaling |
| Manufacturability | 4 | 3-axis, 5-axis, FDM, issues |
| Generative Design | 2 | basics, workflow |
| Multi-Physics | 3 | stress, thermal, modal |
| Smart Parts | 4 | search, insert, config, BOM |

## Performance

- Load time: < 100ms
- Search speed: < 10ms
- Memory: ~1 MB
- Bundle: 41 KB (HTML + JSON)
- Dependencies: 0 (vanilla JavaScript)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Extending the Help System

### Add Entry
1. Open `js/killer-features-help.json`
2. Add new entry object
3. Use ID pattern: `{module-code}-{number}`
   - `ttc-*` = Text-to-CAD
   - `p2c-*` = Photo-to-CAD
   - `mfg-*` = Manufacturability
   - `gnv-*` = Generative Design
   - `sim-*` = Multi-Physics
   - `smt-*` = Smart Parts
4. Test in help-viewer.html
5. Commit: `Add help entry {ID}: {title}`

### Update Entry
1. Find entry by ID in JSON
2. Update fields (description, examples, tips)
3. Verify related links
4. Test search
5. Commit: `Update help entry {ID}: {change}`

### Customize Theme
Edit CSS variables at top of `help-viewer.html`:
```css
:root {
  --bg-primary: #1e1e1e;      /* Dark background */
  --accent-blue: #0284C7;      /* Link color */
  --text-primary: #e0e0e0;     /* Text color */
}
```

## Troubleshooting

**Q: Help viewer shows empty?**
A: Check browser console (F12) for JSON load errors. Ensure `js/killer-features-help.json` exists.

**Q: Search not working?**
A: Clear browser cache (Ctrl+Shift+Delete). Check that JSON is valid.

**Q: How to print help?**
A: Expand entries, press Ctrl+P, print with background graphics enabled.

**Q: Mobile not responding?**
A: Ensure viewport meta tag is present. Test in Safari iOS 14+.

## Links

- **Main App:** `/app/index.html`
- **Help Viewer:** `/app/help-viewer.html`
- **Help Database:** `/app/js/killer-features-help.json`
- **Documentation:** `/app/HELP-SYSTEM-README.md`
- **GitHub:** https://github.com/vvlars-cmd/cyclecad

---

**Version:** 1.0.0  
**Last Updated:** 2026-03-31  
**Status:** Production Ready
