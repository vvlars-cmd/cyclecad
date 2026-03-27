# Collaboration Module Integration Guide

**Quick Setup:** 5 minutes to integrate into cycleCAD

## Step 1: Files Already Created ✅

Two new modules are staged in git:
- `app/js/collaboration.js` (900 lines)
- `app/js/collaboration-ui.js` (850 lines)

## Step 2: Add Imports to `app/index.html`

In the inline `<script type="module">` section, add:

```javascript
import { initCollaboration } from './js/collaboration.js';
import { initCollaborationUI } from './js/collaboration-ui.js';
```

(Add alongside existing imports like `viewport`, `sketch`, `operations`, etc.)

## Step 3: Initialize Collaboration

After viewport initialization, add:

```javascript
// Initialize collaboration module
const collabModule = initCollaboration(viewport);

// Initialize UI panel
initCollaborationUI(window.cycleCAD.collab);
```

**Location in index.html:**
- Find: `initAgentAPI({ viewport, sketch, ... })`
- Add after: the Agent API initialization block

## Step 4: Add Toolbar Button

In the toolbar section of `app/index.html`, find the tabs block:

```html
<div class="tb-tabs">
  <button class="tb-tab active" data-tab="view">View</button>
  <button class="tb-tab" data-tab="analyze">Analyze</button>
  <!-- etc -->
</div>
```

Add a collaboration button to the tab bar:

```html
<button id="collab-btn" class="tb-btn" title="Collaboration (Ctrl+Shift+C)">
  👥
</button>
```

## Step 5: Add Keyboard Shortcut

In the existing shortcuts initialization, add:

```javascript
// Collaboration toggle
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
    window.cycleCAD.collab?.toggleCollaborationPanel?.();
  }
});
```

Or search for `initKeyboardShortcuts` if it exists and add there.

## Step 6: Verify Integration

1. **Save `app/index.html`**
2. **Reload the app in browser** — should see 👥 button in toolbar
3. **Click the button** — Collaboration panel should open on right side
4. **Test basic flow:**
   - Click "Create Session"
   - Copy session ID
   - Try "Generate Link"
   - Start Agent Demo to see 3 AI agents appear

## Step 7: Commit and Push

From user's local machine:

```bash
# Remove git lock files (from previous session crashes)
rm -f ~/cyclecad/.git/index.lock ~/cyclecad/.git/HEAD.lock

# Commit the collaboration modules
cd ~/cyclecad
git add app/js/collaboration.js app/js/collaboration-ui.js
git commit -m "Add real-time collaboration: sessions, presence, chat, versioning, AI agents"

# Push to GitHub
git push origin main
```

## Verification Checklist

After integration, verify:

- [ ] Collaboration panel opens/closes with button click
- [ ] "Create Session" generates a session ID
- [ ] "Generate Link" creates shareable URL
- [ ] "Start Agent Demo" adds 3 colored participant avatars
- [ ] Chat input field is functional
- [ ] Snapshot save button works
- [ ] All tabs switch without errors
- [ ] Console has no errors

## API Quick Reference

All collaboration features accessible via `window.cycleCAD.collab`:

### Session Management
```javascript
window.cycleCAD.collab.createSession({ maxUsers: 10 })
window.cycleCAD.collab.joinSession(sessionId, { name: 'Alice' })
window.cycleCAD.collab.leaveSession()
window.cycleCAD.collab.getSession()
window.cycleCAD.collab.listParticipants()
```

### Presence
```javascript
window.cycleCAD.collab.updatePresence({ cursor3D, selectedPart, activeTool, camera })
window.cycleCAD.collab.onPresenceUpdate(callback)
```

### Chat
```javascript
window.cycleCAD.collab.sendMessage('Hello team!')
window.cycleCAD.collab.onMessage(callback)
window.cycleCAD.collab.getMessageHistory()
```

### Versioning
```javascript
window.cycleCAD.collab.saveSnapshot('Version 1.0')
window.cycleCAD.collab.listSnapshots()
window.cycleCAD.collab.loadSnapshot(snapshotId)
window.cycleCAD.collab.diffSnapshots(id1, id2)
window.cycleCAD.collab.visualDiff(id1, id2)
```

### Sharing
```javascript
window.cycleCAD.collab.generateShareLink({ expiry: '24h' })
window.cycleCAD.collab.generateEmbedCode({ width: 800, height: 600 })
```

### AI Agents
```javascript
window.cycleCAD.collab.startAgentDemo()
window.cycleCAD.collab.stopAgentDemo()
```

### Events
```javascript
window.cycleCAD.collab.on('session-created', (session) => {})
window.cycleCAD.collab.on('message-sent', (msg) => {})
window.cycleCAD.collab.on('snapshot-saved', (snap) => {})
window.cycleCAD.collab.on('user-joined', (user) => {})
```

## Troubleshooting

### Panel doesn't open
- Check browser console for errors
- Verify viewport is initialized before collab init
- Check that `id="collab-btn"` exists in toolbar

### 3D cursors not showing
- Viewport scene must be passed to `initCollaboration(viewport)`
- Three.js scene must be available via `viewport.scene`

### Messages not persisting
- Check `localStorage` is enabled
- Check browser isn't in private mode
- localStorage key is `ev_collabState`

### Agent demo not starting
- Click "Start Agent Demo" in Participants tab
- Three colored agent avatars should appear
- Messages appear every 3-5 seconds from agents

## File Locations

```
/sessions/sharp-modest-allen/mnt/cyclecad/
├── app/
│   ├── index.html                    (UPDATE: add imports & init)
│   ├── js/
│   │   ├── collaboration.js          (NEW: 900 lines)
│   │   ├── collaboration-ui.js       (NEW: 850 lines)
│   │   ├── viewport.js               (referenced)
│   │   ├── app.js                    (referenced)
│   │   └── ...
│   ├── test-agent.html               (reference test harness)
│   └── ...
├── CLAUDE.md                         (memory: updated)
└── COLLABORATION-INTEGRATION-GUIDE.md (this file)
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│ collaboration-ui.js                              │
│ ┌───────┬──────────┬──────┬──────────────────┐  │
│ │Session│Participants│Chat │   Versions      │  │
│ └───────┴──────────┴──────┴──────────────────┘  │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────v────────────────────────────────┐
│ collaboration.js                                 │
│ ├─ Session Management                           │
│ ├─ Presence System (3D cursors)                 │
│ ├─ Operation Broadcasting                        │
│ ├─ Chat System                                  │
│ ├─ Git-Style Versioning (snapshots)             │
│ ├─ Permissions (host/editor/viewer)             │
│ ├─ Share Links & Embed                          │
│ ├─ AI Agent Participants (demo)                 │
│ └─ Event System (pub/sub)                       │
└────────────────┬────────────────────────────────┘
                 │
         ┌───────┴────────┐
         v                v
    Three.js Scene    localStorage
    (3D cursors)      (persistence)
```

## Local Development

### Test in Browser Console

```javascript
// Create session
const sess = window.cycleCAD.collab.createSession()
console.log('Session:', sess)

// List participants
console.log('Participants:', window.cycleCAD.collab.listParticipants())

// Send message
window.cycleCAD.collab.sendMessage('Hello!')

// Save snapshot
window.cycleCAD.collab.saveSnapshot('Test V1')

// List snapshots
console.log('Snapshots:', window.cycleCAD.collab.listSnapshots())

// Start agents
window.cycleCAD.collab.startAgentDemo()
```

### Listen to Events

```javascript
// Log all events
['session-created', 'user-joined', 'message-sent', 'snapshot-saved'].forEach(evt => {
  window.cycleCAD.collab.on(evt, (data) => {
    console.log(`[${evt}]`, data)
  })
})
```

### Inspect State

```javascript
// View full collaboration state
console.log(window.cycleCAD.collab._debug.STATE)

// View messages
console.log(window.cycleCAD.collab.getMessageHistory())

// View snapshots
console.log(window.cycleCAD.collab.listSnapshots())

// View participants
console.log(window.cycleCAD.collab.listParticipants())
```

## Performance Notes

- Presence updates broadcast every 50ms (throttled)
- Cursor animation 150ms per position update
- Agent activity simulation every 3 seconds
- localStorage writes are batched
- Event listeners use memory efficiently (no memory leaks)
- 3D cursor objects cleaned up on session leave

## Browser Support

- Chrome/Edge: Full support (all features)
- Firefox: Full support (all features)
- Safari: Full support (all features)
- IE11: Not supported (uses ES6 modules)

## Production Deployment Notes

For a production deployment with real server:

1. Replace localStorage-based broadcast with WebSocket
2. Implement server-side session management
3. Add authentication/authorization
4. Implement real operation journaling
5. Add backup/recovery for snapshots
6. Implement rate limiting on operations
7. Add audit logging for compliance

See `server/mcp-server.js` and `server/api-server.js` in repo for examples.

## Questions?

Check the main summary: `COLLABORATION-MODULE-SUMMARY.md`

For detailed API docs, see JSDoc comments in the source files:
- `app/js/collaboration.js` — all functions documented
- `app/js/collaboration-ui.js` — UI integration documented
