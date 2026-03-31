# cycleCAD Progressive Web App (PWA) Tutorial

## Table of Contents
1. [What is a PWA?](#what-is-a-pwa)
2. [Why PWA for CAD?](#why-pwa-for-cad)
3. [Installation Guide](#installation-guide)
4. [Offline Mode](#offline-mode)
5. [Cache Management](#cache-management)
6. [File Handling](#file-handling)
7. [Background Sync](#background-sync)
8. [Storage & Quota](#storage--quota)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Features](#advanced-features)

---

## What is a PWA?

A **Progressive Web App (PWA)** is a web application that uses modern web technologies to provide an app-like experience directly in your browser. PWAs combine the best of web and native apps:

### Key Characteristics
- **Installable** — Add to home screen like a native app
- **Works Offline** — Full functionality without internet
- **Fast** — Instant loads with service worker caching
- **Responsive** — Works on desktop, tablet, and mobile
- **No Installation Required** — No App Store needed

### cycleCAD as a PWA
cycleCAD is a fully-featured PWA that includes:
- Complete 3D CAD modeling offline
- Service worker for intelligent caching
- File handling integration with your OS
- Background sync for offline changes
- Installable as a standalone app

---

## Why PWA for CAD?

### Problem: Traditional CAD Requires Installation
- Large download sizes (Fusion 360: 2+ GB, SolidWorks: 5+ GB)
- System requirements and compatibility issues
- Updates take hours
- No cross-platform compatibility
- Licensing tied to specific machines

### Solution: cycleCAD PWA
- **Instant Start** — Click and start designing (no install)
- **Works Everywhere** — Windows, Mac, Linux, iPad, Android
- **Offline-First** — No internet needed for core modeling
- **Always Updated** — Automatic updates in background
- **Zero Installation** — Just open in browser or add to home screen

---

## Installation Guide

### Desktop (Windows, macOS, Linux)

#### Chrome / Edge / Brave
1. Go to [cyclecad.com/app](https://cyclecad.com/app)
2. Look for the install prompt (usually top-right):
   ```
   [+] Install
   ```
3. Click "Install" or press `Ctrl+Shift+I`
4. Choose a location (desktop or app menu)
5. cycleCAD appears in your app drawer

**After Installation:**
- Opens in standalone window (no address bar)
- Pinned to taskbar/dock
- Keyboard shortcut available
- Full offline support

#### Manual Installation (All Browsers)
If no install prompt appears:
1. Open cycleCAD: [cyclecad.com/app](https://cyclecad.com/app)
2. Browser menu → "Install" or "Add to home screen"
3. Choose app name and location

### Mobile (iOS, Android)

#### Android
1. Open [cyclecad.com/app](https://cyclecad.com/app) in Chrome
2. Browser menu (⋮) → "Install app" or "Add to Home Screen"
3. Confirm name and icon
4. App appears on home screen
5. Tap to open in standalone mode

**On first install, you'll see:**
```
Storage: 500 MB available
Offline: Full modeling support
Auto-save: Every operation
```

#### iOS (Safari)
1. Open [cyclecad.com/app](https://cyclecad.com/app) in Safari
2. Share button (↑) → "Add to Home Screen"
3. Choose name (default: "cycleCAD")
4. Tap "Add"
5. App appears on home screen

**Note:** iOS PWA support requires:
- iOS 11.3+ (most devices)
- Full offline modeling support
- Can't access iCloud Drive directly (use file picker)

### Installation Permissions
On first visit, cycleCAD requests permissions for:
- **Service Worker** — Offline functionality and caching
- **Storage** — Save projects and cache models
- **Notifications** — Update alerts and sync status (optional)

All requests are **optional**. The app works without them, but offline mode requires service worker and storage permissions.

---

## Offline Mode

### What Works Offline
cycleCAD has **full offline support** for:

✓ **Modeling**
- Create sketches and 3D features
- Extrude, revolve, fillet, chamfer
- Boolean operations
- Parameters and constraints
- Assembly mode with mates
- Part tree and history

✓ **Viewing & Navigation**
- Rotate, pan, zoom 3D view
- ViewCube navigation
- Multiple preset views
- Wireframe and shaded modes
- Section cuts and measurements

✓ **Export & File Handling**
- Export to STL (ASCII and binary)
- Export to OBJ and glTF
- Export to DXF (2D drawings)
- Sketches to PDF (drawing views)

✓ **Productivity**
- Feature tree with suppress/delete
- Undo/redo with full history
- Keyboard shortcuts (25+)
- Search and filter parts
- Parameter editing

### What Requires Internet
⚠ **Features requiring connectivity:**
- STEP file import/export (uses cloud converter)
- AI analysis and design review
- Sync with cloud projects
- Share links and collaboration
- AI chatbot and copilot features
- Model marketplace

### Offline Workflow

**Scenario 1: Design offline, sync later**
```
1. Go offline (airplane mode or disconnect)
2. Create new project or open cached one
3. Design for 2+ hours
4. Reconnect to internet
5. Changes auto-sync to cloud (if enabled)
```

**Scenario 2: Import STEP, then design offline**
```
1. Online: Import STEP file (converted on server)
2. File is automatically cached
3. Go offline
4. Open cached model in viewer
5. Make notes, measurements, markups
6. Back online: sync annotations
```

**Scenario 3: Collaborate offline, sync together**
```
1. Two team members open same project
2. Both go offline, design independently
3. Changes stored locally
4. Reconnect together
5. Merge strategy: last-write-wins or manual merge
```

### Offline Indicators
cycleCAD shows your connection status in multiple places:

- **Top banner (red)** — "You are offline" when disconnected
- **Status bar** — Connection icon in bottom-right
- **Dialog boxes** — Operations that require internet show warning
- **Notifications** — "Will sync when online" on each offline operation

### Manual Sync
To manually sync offline changes:
1. Ensure internet is connected
2. Browser detects connection automatically
3. Sync dialog appears: "Syncing X changes..."
4. Operations upload one-by-one with progress bar
5. When done: "All changes synced!"

---

## Cache Management

### What Gets Cached

| Item | Cache Size | Strategy |
|------|-----------|----------|
| HTML/JS/CSS | 5-10 MB | Cache-first, expires monthly |
| Models (GLB) | 100-500 MB | LRU eviction when full |
| STEP files | 50-100 MB | Size-limited cache |
| CDN resources | 2-5 MB | Long-lived (yearly) |
| API responses | 1-5 MB | Network-first |
| Projects | IndexedDB | Unlimited, user-managed |

### Viewing Cache Size

**In Settings:**
1. Click Settings gear (⚙️)
2. Scroll to "Offline & Cache" section
3. Shows current cache size: "Cache: 245 MB"

**Programmatically:**
```javascript
const size = await window.offlineManager.getCacheSize();
console.log('Cache:', window.offlineManager.formatBytes(size));
```

### Clearing Cache

**Option 1: Settings Panel**
1. Settings → Offline & Cache
2. Click "Clear Cache"
3. Confirm dialog: "Clear all cached files?"
4. Cache cleared immediately

**Option 2: Browser DevTools**
1. Open Chrome/Edge DevTools (`F12`)
2. Application tab
3. Cache Storage
4. Delete `cyclecad-static-v3`, `cyclecad-dynamic-v3`, `cyclecad-models-v3`
5. Reload page

**Option 3: Programmatically**
```javascript
await window.offlineManager.clearCache();
```

### Cache Limits

cycleCAD respects browser storage quotas:

| Browser | Max Storage |
|---------|------------|
| Chrome/Edge | 50% of disk (min 100 MB) |
| Firefox | 10% of available space |
| Safari (desktop) | 50 MB per domain |
| Safari (iOS) | 50 MB per app |

When cache exceeds limit:
1. Oldest cached files are deleted first (LRU)
2. User notification: "Cache size reduced to 400 MB"
3. Recent projects always kept
4. Models removed by access date

---

## File Handling

### Opening Files Directly

#### From File Explorer / Finder
1. Right-click STEP, STL, or OBJ file
2. "Open With" → cycleCAD
3. File opens in cycleCAD automatically
4. If app not installed, opens web version

**Supported file types:**
- `.step`, `.stp` — STEP assemblies and parts
- `.stl`, `.STL` — STL models
- `.obj`, `.OBJ` — OBJ meshes
- `.glb`, `.GLB` — glTF binaries
- `.gltf` — glTF with separate resources

#### From Drag & Drop
1. Drag file from File Explorer onto cycleCAD window
2. Automatically opens in import dialog
3. Shows preview and import options
4. Click "Import"

### Sharing Files to cycleCAD

#### Share from File Explorer (Windows)
1. Right-click file
2. "Share" → cycleCAD
3. Opens in cycleCAD immediately

#### Share from Finder (macOS)
1. Right-click file
2. "Share" → More...
3. Select cycleCAD
4. Opens in cycleCAD

#### Share from Android Files App
1. Long-press file
2. Share → cycleCAD
3. Opens in Android cycleCAD app

### Custom URL Schemes

cycleCAD supports custom URLs for deep linking:

```
web+cyclecad:project=abc123
web+cyclecad:file=imports/bearing.step
web+cyclecad:action=new
web+cyclecad:action=open
```

Registration (automatic):
1. First time visiting cyclecad.com/app
2. Browser asks: "Allow cycleCAD to open files?"
3. Click "Allow"
4. Protocol registered globally

---

## Background Sync

### What is Background Sync?

When offline operations are queued and you lose internet:
1. Changes saved locally in IndexedDB
2. When online returns, they **automatically upload**
3. User sees progress: "Syncing 3 changes..."
4. No manual intervention needed

### How It Works

**Offline Operation:**
```javascript
// User: Extrude a feature while offline
// Result: queued locally
offlineManager.queueOperation({
  type: 'extrude',
  sketchId: '123',
  depth: 25
});
// Shows: "Queued - will sync online"
```

**Back Online:**
```
1. Browser detects connection
2. Service Worker wakes up
3. Retrieves queued operations from IndexedDB
4. Sends each one to server: /api/operations
5. Removes from queue on success
6. Shows: "Synced 3 operations"
```

### Sync Reliability
- **Automatic retry** — Failed ops retry 3 times
- **Persistent** — Queue survives app crash/refresh
- **Ordered** — Operations sync in creation order
- **Transactional** — All-or-nothing per operation
- **Silent** — No notifications unless error or complete

### Monitoring Sync

**In Console:**
```javascript
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data.type === 'SYNC_COMPLETE') {
    console.log('Sync done:', event.data);
  }
});
```

**In Settings:**
1. Settings → Offline & Cache
2. Synced operations listed with timestamps
3. Failed operations show error details

---

## Storage & Quota

### Understanding Storage Quota

Your browser has a **limited storage budget** for all PWAs:

```
Total Available = Free Disk Space * 50% (Chrome)
                = Device Storage * 10% (Firefox)
                = 50 MB per domain (Safari)
```

**Example (Chrome on 500GB disk):**
```
Available = 500 GB * 50% = 250 GB
cycleCAD can use up to 250 GB
After: 200 MB used
Remaining: 249.8 GB
```

### Checking Quota

**In Browser Console:**
```javascript
const estimate = await navigator.storage.estimate();
console.log('Used:', estimate.usage, 'bytes');
console.log('Quota:', estimate.quota, 'bytes');
console.log('Percentage:', (estimate.usage / estimate.quota * 100).toFixed(1), '%');
```

**In Settings Panel:**
```
Storage Status
├─ Used: 245 MB
├─ Quota: 250 GB
└─ Free: 249.7 GB
```

### Persistent Storage

By default, cache can be cleared by browser without notice:
1. Browser running low on disk
2. Browser clears caches oldest first
3. Your projects might disappear

**To Prevent Deletion:**
1. Settings → Offline & Cache
2. Toggle "Keep Storage" (requests persistent permission)
3. Browser asks: "Keep data for cycleCAD?"
4. Click "Allow"
5. Storage is now persistent (won't auto-clear)

### If Storage Full

cycleCAD automatically:
1. Removes oldest cached models (LRU)
2. Keeps recent projects and exports
3. Shows notification: "Cache reduced to 400 MB"
4. User can manually delete old projects

**Manual Cleanup:**
1. Settings → Projects
2. Hover over old project
3. Click "Delete" (delete icon)
4. Confirm
5. Frees space immediately

---

## Troubleshooting

### "App won't install"

**Causes:**
- Browser doesn't support PWA (old Safari)
- HTTPS not enabled on domain
- Manifest.json has errors
- Service Worker failed to register

**Fixes:**
1. Try different browser (Chrome, Edge, Firefox)
2. Check URL starts with `https://`
3. Press `F12`, look for red errors in Console tab
4. Refresh page with `Ctrl+Shift+R` (hard refresh)
5. Clear cache and cookies for site, then refresh

### "No offline mode / Internet required"

**Causes:**
- Service Worker not registered
- Service Worker failed to load
- Browser private/incognito mode

**Fixes:**
1. Check Settings → Offline & Cache
2. Look for "Service Worker: Ready" indicator
3. Try non-private window
4. In Console, check for SW errors: `[SW]` logs
5. Refresh page: `F5` or `Ctrl+R`

### "Cache stuck / won't clear"

**Causes:**
- Service Worker holding lock
- Browser caching issue
- IndexedDB transaction in progress

**Fixes:**
1. Close all cycleCAD tabs and windows
2. Clear browser cache: `Ctrl+Shift+Delete`
3. Check DevTools → Application → Clear Storage
4. Restart browser completely
5. Refresh cycleCAD

### "Offline changes didn't sync"

**Causes:**
- Network unstable during sync
- Operation failed validation
- Cloud project locked by another user

**Fixes:**
1. Go back online and check connection
2. Settings → Offline & Cache → Sync Now
3. Check notification for errors
4. Refresh page: `F5`
5. Manually re-do operation if needed

### "Takes forever to load"

**Causes:**
- Large model cached
- Service Worker updating cache
- Network slow for first visit

**Fixes:**
1. Wait 10 seconds (cache building)
2. Hard refresh: `Ctrl+Shift+R`
3. Clear cache and reload
4. Switch to better WiFi
5. Download should finish in <30 seconds

### "App keeps asking for permissions"

**Causes:**
- Browser blocking storage
- Service Worker permissions denied
- Private browsing mode

**Fixes:**
1. Check browser settings → Privacy
2. Whitelist cyclecad.com:
   - Chrome: Settings → Privacy → Site Settings → Storage
   - Firefox: Privacy → Permissions → Storage
3. Exit private browsing mode
4. Disable VPN/proxy temporarily

---

## Advanced Features

### Custom Service Worker Events

Listen for service worker messages in your app:

```javascript
navigator.serviceWorker.addEventListener('message', (event) => {
  const { type, message } = event.data;

  if (type === 'UPDATE_AVAILABLE') {
    // New version available
    console.log(message); // "A new version..."
    // Show update prompt to user
  }

  if (type === 'SYNC_COMPLETE') {
    // Background sync finished
    console.log(message); // "All changes synced!"
    // Refresh UI from server
  }

  if (type === 'CACHE_CLEARED') {
    // Cache was cleared
    console.log(message);
  }
});
```

### Caching Strategies

cycleCAD uses 4 different caching strategies:

1. **Cache-First** (Static Assets)
   - Check cache first
   - If missing, fetch from network
   - Update cache in background
   - Best for: HTML, JS, CSS, fonts

2. **Network-First** (API Calls)
   - Try network first
   - If fails, fallback to cache
   - Keep cache fresh always
   - Best for: API responses, data

3. **Stale-While-Revalidate** (CDN)
   - Return cache immediately
   - Update cache in background
   - User sees instant + refreshes
   - Best for: Third-party libraries

4. **Cache-Only** (Offline Files)
   - Use cache or fail
   - No network requests
   - Best for: Emergency fallbacks

### Programmatic Access

Control PWA features from JavaScript:

```javascript
// Get offline manager instance
const om = window.offlineManager;

// Check online status
if (om.isOnline) {
  console.log('Connected!');
} else {
  console.log('Offline mode');
}

// Queue operation
await om.queueOperation({
  type: 'extrude',
  depth: 25
});

// Manual sync
await om.syncOperations();

// Cache size
const bytes = await om.getCacheSize();
const mb = om.formatBytes(bytes);
console.log('Cache:', mb);

// Clear cache
await om.clearCache();
```

### Performance Monitoring

Monitor PWA performance:

```javascript
// Check service worker status
navigator.serviceWorker.getRegistration('/app/').then((reg) => {
  console.log('SW Active:', reg.active ? 'Yes' : 'No');
  console.log('SW Updates:', reg.installing ? 'Pending' : 'None');
});

// Check storage quota
navigator.storage.estimate().then((est) => {
  console.log('Using:', (est.usage / 1024 / 1024).toFixed(1), 'MB');
  console.log('Quota:', (est.quota / 1024 / 1024).toFixed(1), 'MB');
});

// Check cache size
navigator.storage.getDirectory().then((root) => {
  // Iterate through cache storage
});
```

---

## Best Practices

### For Optimal Offline Experience

1. **Install the App**
   - Use standalone mode for best experience
   - Pinned to dock/taskbar for quick access

2. **Manage Cache**
   - Regularly check cache size in Settings
   - Delete old projects you don't need
   - Keep cache under 1 GB for best performance

3. **Network-Aware Design**
   - Plan offline work before going offline
   - Test with offline mode enabled
   - Understand which features need internet

4. **Update Regularly**
   - Accept update prompts when offered
   - Automatic in background, doesn't interrupt
   - Keeps security and features current

5. **Backup Important Work**
   - Export projects to files regularly
   - Cloud save for critical designs
   - Multiple local copies

### For Teams

1. **Collaboration**
   - Work offline, sync later together
   - Merge changes with conflict resolution
   - Track who made which changes

2. **File Sharing**
   - Use share target to open files directly
   - Team folder in cloud auto-syncs
   - Version history for tracking

3. **Large Assemblies**
   - Cache key models before offline
   - Use viewer mode for lightweight viewing
   - Split large designs into sub-assemblies

---

## Getting Help

### Documentation
- Full API: [docs.cyclecad.com](https://docs.cyclecad.com)
- User manual: [cyclecad.com/docs/manual.html](https://cyclecad.com/docs/manual.html)

### Support
- GitHub Issues: [github.com/vvlars-cmd/cyclecad/issues](https://github.com/vvlars-cmd/cyclecad/issues)
- Email: hello@cyclecad.com
- Discord: [discord.gg/cyclecad](https://discord.gg/cyclecad)

### Reporting Bugs
When reporting PWA issues, include:
- Browser and version
- Device (desktop/mobile)
- Online/offline status
- Steps to reproduce
- Console errors (`F12` → Console tab)

---

## Appendix: Browser Compatibility

| Browser | Desktop | Mobile | PWA Support |
|---------|---------|--------|------------|
| Chrome | ✓ | ✓ | Full |
| Edge | ✓ | ✓ | Full |
| Firefox | ✓ | ✓ | Partial* |
| Safari | ✓ | ✓ | Partial* |
| Opera | ✓ | ✓ | Full |

\* = Limited offline or file handling support

### Minimum Requirements
- HTTPS enabled
- Service Worker support
- IndexedDB (5MB+ quota)
- 100MB+ available disk space

---

**Last Updated:** 2026-03-31
**Version:** 3.0.0
**License:** MIT
