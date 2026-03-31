# cycleCAD Live Collaboration Tutorial

## What is Real-Time Collaboration in CAD?

Real-time collaboration enables multiple engineers to work on the same 3D model simultaneously, seeing each other's cursors, selections, and edits in live time. Instead of emailing files back and forth or merging conflicts manually, everyone is always working on the latest version.

### Key Benefits
- **Live cursor sharing** — See where each team member is looking
- **Live selection sync** — Know which parts others are editing
- **Operation replay** — All changes are logged and can be reviewed
- **Chat & comments** — Discuss designs without leaving the app
- **Offline support** — Changes queue and sync when reconnected

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│         cycleCAD Collaboration System                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      │
│  │  User A  │      │  User B  │      │  User C  │      │
│  │ Browser  │      │ Browser  │      │ Browser  │      │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘      │
│       │                  │                  │            │
│       └──────────────────┼──────────────────┘            │
│                          │                               │
│                    ┌─────▼──────┐                        │
│                    │ WebSocket  │                        │
│                    │   Bridge   │                        │
│                    └─────┬──────┘                        │
│                          │                               │
│       ┌──────────────────┼──────────────────┐            │
│       │                  │                  │            │
│  ┌────▼─────┐    ┌──────▼──────┐    ┌─────▼────┐       │
│  │ Signaling │    │    CRDT     │    │   Chat   │       │
│  │  Server   │    │   Engine    │    │  Server  │       │
│  └───────────┘    └─────────────┘    └──────────┘       │
│                          │                               │
│                   ┌──────▼──────┐                        │
│                   │ Room State  │                        │
│                   │ (Persisted) │                        │
│                   └─────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### Components

1. **Signaling Server** (`server/signaling-server.js`)
   - Manages WebSocket connections
   - Routes messages between clients
   - Maintains room state and user presence
   - Persists operations to disk

2. **Collaboration Client** (`app/js/collab-client.js`)
   - Browser-side WebSocket manager
   - Handles WebRTC peer connections
   - Implements offline queue
   - Auto-reconnect with exponential backoff

3. **CRDT Engine** (integrated in app.js)
   - Last-writer-wins (LWW) for simple properties
   - Operation log for geometry changes
   - Conflict resolution without central server

---

## Setting Up the Signaling Server

### Local Development

#### Option 1: Direct Node.js

```bash
# Install dependencies
npm install ws express

# Start the signaling server
node server/signaling-server.js
```

Server runs on `ws://localhost:8788` with HTTP health checks at `http://localhost:8788/health`.

#### Option 2: npm script

Add to `package.json`:

```json
{
  "scripts": {
    "collab:server": "node server/signaling-server.js",
    "collab:server:dev": "NODE_ENV=development node server/signaling-server.js"
  }
}
```

Run:

```bash
npm run collab:server
```

### Docker Deployment

#### Build the image

```bash
docker build -t cyclecad-signaling -f server/Dockerfile.signaling server/
```

#### Run the container

```bash
docker run -p 8788:8788 cyclecad-signaling
```

#### With docker-compose

```bash
docker-compose up signaling
```

### Cloud Deployment

#### AWS (Lightsail)

1. Create a Node.js instance
2. Upload `server/signaling-server.js` and `package.json`
3. Install dependencies: `npm install`
4. Use PM2 for process management: `npm install -g pm2 && pm2 start server/signaling-server.js`
5. Configure security group to allow port 8788
6. Use Route 53 to point `collab.cyclecad.com` to the instance

#### Google Cloud (Cloud Run)

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package.json .
RUN npm install
COPY server/ .
EXPOSE 8788
CMD ["node", "signaling-server.js"]
```

Deploy:

```bash
gcloud run deploy cyclecad-signaling \
  --source . \
  --platform managed \
  --allow-unauthenticated
```

#### Heroku

```bash
git push heroku main
```

---

## Client-Side Integration

### 1. Initialize the Collaboration Client

In your `app/js/app.js`:

```javascript
// Initialize collaboration client
const collabClient = new CollaborationClient('ws://localhost:8788');

// Or connect to cloud server:
// const collabClient = new CollaborationClient('wss://collab.cyclecad.com');

// Set up event callbacks
collabClient.on('connected', () => {
  console.log('Connected to collaboration server');
  updateUI('collaborationStatus', 'Connected');
});

collabClient.on('disconnected', () => {
  console.log('Disconnected from collaboration server');
  updateUI('collaborationStatus', 'Disconnected');
});

collabClient.on('userJoined', ({ userId, name, color }) => {
  console.log(`${name} joined the session`);
  renderUserInList(userId, name, color);
});

collabClient.on('userLeft', ({ userId }) => {
  console.log(`User ${userId} left`);
  removeUserFromList(userId);
});

collabClient.on('operationReceived', ({ userId, op, timestamp }) => {
  applyRemoteOperation(op);
});

collabClient.on('chatMessage', ({ name, color, text, timestamp }) => {
  appendChatMessage(name, text, color, timestamp);
});

collabClient.on('cursorUpdate', ({ userId, x, y }) => {
  renderRemoteCursor(userId, x, y);
});

collabClient.on('error', (error) => {
  console.error('Collaboration error:', error);
  showErrorNotification(error.message);
});
```

### 2. Create or Join a Room

```javascript
// Create a new collaboration room
function createCollaborationSession() {
  const roomId = `project-${Date.now()}`;
  const sessionName = prompt('Session name:') || `Session ${roomId}`;

  collabClient.createRoom(roomId, {
    name: sessionName,
    maxUsers: 10
  });

  setTimeout(() => {
    collabClient.joinRoom(
      roomId,
      'user-' + crypto.getRandomValues(new Uint8Array(4)).join('-'),
      prompt('Your name:') || 'Anonymous Engineer'
    );
  }, 500);
}

// Join an existing room
function joinCollaborationSession() {
  const roomId = prompt('Enter room ID:');
  const userName = prompt('Your name:') || 'Anonymous Engineer';
  const password = prompt('Room password (if private):') || null;

  collabClient.joinRoom(
    roomId,
    'user-' + crypto.getRandomValues(new Uint8Array(4)).join('-'),
    userName,
    password
  );
}
```

### 3. Share Cursor Position

Track mouse movement and send to server (throttled):

```javascript
// Listen to mouse moves in the 3D viewport
document.addEventListener('mousemove', (event) => {
  // Normalize to viewport coordinates
  const rect = viewport.domElement.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  collabClient.updateCursor(x, y);
});
```

### 4. Share Part Selection

When user selects a part:

```javascript
function onPartSelected(partId) {
  // Local selection
  selectedParts = [partId];

  // Broadcast to collaborators
  collabClient.updateSelection(selectedParts);
}

function onMultiSelect(partIds) {
  selectedParts = partIds;
  collabClient.updateSelection(partIds);
}
```

### 5. Send Operations

When user performs a geometry operation:

```javascript
function onExtrude(sketchId, depth) {
  const op = {
    type: 'extrude',
    sketchId,
    depth,
    timestamp: Date.now()
  };

  // Apply locally
  applyExtrude(sketchId, depth);

  // Send to collaborators
  collabClient.sendOperation(op);
}
```

### 6. Chat Integration

Send and receive chat messages:

```javascript
function sendChatMessage(text) {
  if (!text.trim()) return;

  collabClient.sendMessage(text);

  // Clear input
  document.querySelector('#chat-input').value = '';
}

// In collabClient.on('chatMessage', ...) callback
function appendChatMessage(name, text, color, timestamp) {
  const chatPanel = document.querySelector('#chat-panel');
  const msg = document.createElement('div');
  msg.className = 'chat-message';
  msg.style.borderLeft = `3px solid ${color}`;
  msg.innerHTML = `
    <span class="chat-name" style="color: ${color};">${escapeHtml(name)}</span>
    <span class="chat-text">${escapeHtml(text)}</span>
    <span class="chat-time">${new Date(timestamp).toLocaleTimeString()}</span>
  `;
  chatPanel.appendChild(msg);
  chatPanel.scrollTop = chatPanel.scrollHeight;
}
```

---

## How WebRTC P2P Works

Once signaling is complete, direct peer-to-peer connections are established:

### 1. Signaling Phase (via WebSocket)

```
User A (Browser)                 Signaling Server              User B (Browser)
     │                                 │                            │
     │──────── Offer ─────────────────>│                            │
     │                                 │────── Offer ──────────────>│
     │                                 │                            │
     │<────── ICE Candidates ──────────│<────────────────────────────│
     │                                 │                            │
     │<────── Answer ─────────────────│                            │
     │                                 │<────── Answer ─────────────│
     │                                 │                            │
```

### 2. Direct P2P Phase (DataChannel)

```
User A (Browser) <──────────────────── DataChannel ────────────────> User B (Browser)
  (Low latency, high bandwidth)
```

### Key WebRTC Details

- **STUN servers**: Public servers that help discover your public IP for NAT traversal
- **TURN servers**: Relay servers if direct P2P isn't possible (firewall/NAT restrictions)
- **Data channels**: Ordered, reliable messaging between peers (like a WebSocket but P2P)

---

## CRDT Basics and Conflict Resolution

Conflict-free Replicated Data Type (CRDT) allows all users to apply operations independently without central coordination.

### Approach 1: Last-Writer-Wins (LWW)

Simple properties like part name or visibility:

```javascript
// User A: renames part to "Housing"
collabClient.sendOperation({
  type: 'rename',
  partId: 'part-123',
  name: 'Housing',
  timestamp: 1711000000000
});

// User B: renames same part to "Enclosure"
collabClient.sendOperation({
  type: 'rename',
  partId: 'part-123',
  name: 'Enclosure',
  timestamp: 1711000001000  // User B's change came 1 second later
});

// Result: Part is renamed to "Enclosure" (timestamp wins)
```

### Approach 2: Operation Log

Geometry operations are cumulative — order matters:

```javascript
// User A performs operation at index 42
collabClient.sendOperation({
  type: 'fillet',
  edgeId: 'edge-456',
  radius: 5,
  operationIndex: 42
});

// User B sees User A's op and applies it locally
// Then User B performs operation at index 43
collabClient.sendOperation({
  type: 'chamfer',
  edgeId: 'edge-789',
  distance: 2,
  operationIndex: 43
});

// Both users end up with [op0, op1, ..., op42, op43] in same order
```

### Approach 3: Vector Clocks

For partial ordering (if needed):

```javascript
// Each client maintains a vector clock
const vectorClock = {
  'user-a': 5,
  'user-b': 3,
  'user-c': 2
};

// User A's next operation is: [6, 3, 2]
// User C's next operation is: [5, 3, 3]

// If clocks differ, we can determine causality
// and apply operations in the right order
```

---

## Offline Mode and Reconnection

When the client loses connection:

```
┌─────────────────────────────────────────┐
│        Offline Operation Queue           │
├─────────────────────────────────────────┤
│ Op 1: Extrude sketch-1, depth=10        │
│ Op 2: Fillet edge-5, radius=2           │
│ Op 3: Rename part-3 → "Housing"         │
│ Op 4: Hide part-1                       │
└─────────────────────────────────────────┘
```

When reconnected:

```javascript
// CollaborationClient automatically:
// 1. Detects connection restored
// 2. Replays all queued operations
// 3. Syncs server state

collabClient.on('connected', () => {
  // Queue will be synced automatically
  console.log('Offline operations synced');
});
```

---

## Security Considerations

### 1. Room Passwords

Protect rooms with optional passwords:

```javascript
collabClient.createRoom('secret-project', {
  password: 'my-secure-password-123',
  maxUsers: 5
});

// Others must provide password to join
collabClient.joinRoom(
  'secret-project',
  userId,
  userName,
  'my-secure-password-123'  // Must match
);
```

### 2. JWT Authentication (Optional)

For production, add JWT tokens to handshake:

```javascript
const token = await fetch('/api/auth/token').then(r => r.json());

collabClient.ws.send(JSON.stringify({
  type: 'authenticate',
  token: token.jwt,
  userId: token.userId
}));
```

### 3. TLS/SSL

Always use `wss://` (secure WebSocket) in production:

```javascript
const isProduction = window.location.protocol === 'https:';
const signalServerUrl = isProduction
  ? 'wss://collab.cyclecad.com'
  : 'ws://localhost:8788';
```

---

## Troubleshooting

### WebSocket Connection Fails

**Symptom**: "Cannot connect to signaling server"

**Causes**:
- Signaling server not running
- Wrong URL (check http://localhost:8788/health)
- Firewall blocking port 8788
- CORS issues

**Fix**:
```bash
# Check server health
curl http://localhost:8788/health

# Verify port is open
lsof -i :8788

# Check firewall rules
sudo ufw status
```

### Cursor Updates Lag

**Symptom**: Remote cursors update slowly or jerkily

**Causes**:
- Network latency
- Throttle interval too long (default 100ms)
- Browser performance issues

**Fix**:
```javascript
// Reduce throttle interval
collabClient.cursorUpdateInterval = 50; // 50ms instead of 100ms

// Or increase if bandwidth is constrained
collabClient.cursorUpdateInterval = 200; // 200ms
```

### WebRTC Data Channel Never Opens

**Symptom**: P2P messages not being sent

**Causes**:
- STUN/TURN server unreachable
- Strict firewall/NAT
- Browser doesn't support WebRTC DataChannels

**Fix**:
```javascript
// Add TURN servers for fallback
collabClient.iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:turnserver.example.com',
    username: 'user',
    credential: 'pass'
  }
];
```

### Operations Not Syncing

**Symptom**: User A's edits not visible to User B

**Causes**:
- Operation not sent before closing connection
- Server not relaying operations
- Client ignoring remote operations

**Fix**:
```javascript
// Ensure operation is sent
collabClient.on('operation', (message) => {
  console.log('Received operation:', message);
  // Debug: Are we getting the message?
});

// Check server logs
tail -f ~/.cyclecad/rooms-state.json
```

### Room Persistence Not Working

**Symptom**: Room state lost after server restart

**Cause**: State file not being saved

**Fix**:
```bash
# Check state file exists
ls -la /path/to/rooms-state.json

# Check permissions
chmod 644 rooms-state.json

# Verify server can write
sudo -u nobody touch /path/to/test-write.txt
```

---

## API Reference

### CollaborationClient

```javascript
// Constructor
const client = new CollaborationClient(signalServerUrl);

// Events
client.on('connected', callback);
client.on('disconnected', callback);
client.on('userJoined', callback);
client.on('userLeft', callback);
client.on('operationReceived', callback);
client.on('chatMessage', callback);
client.on('cursorUpdate', callback);
client.on('selectionUpdate', callback);
client.on('error', callback);

// Room management
client.createRoom(roomId, options);
client.joinRoom(roomId, userId, userName, password);
client.leaveRoom();

// Sharing
client.updateCursor(x, y);
client.updateSelection(partIds);
client.sendOperation(op);
client.sendMessage(text);

// Info
client.getUsers();
client.getUser(userId);
client.getRoomInfo();

// Connection
client.connect();
client.disconnect();
```

### Signaling Server REST API

```bash
# Health check
GET /health
→ { status: 'healthy', clients: 5, rooms: 2 }

# Server stats
GET /stats
→ { clients: 5, rooms: 2, uptime: 3600, memory: {...} }

# List all rooms
GET /rooms
→ { count: 2, rooms: [{id, name, users, ...}, ...] }

# Get specific room
GET /rooms/:roomId
→ { room: {...} }

# Reset room (clear operations)
POST /rooms/:roomId/reset

# Close room
POST /rooms/:roomId/close
```

---

## Example: Full Collaboration Session

```javascript
// 1. Initialize client
const collab = new CollaborationClient('wss://collab.cyclecad.com');

// 2. Handle events
collab.on('connected', () => {
  document.getElementById('status').textContent = '🟢 Connected';
});

collab.on('userJoined', ({ name }) => {
  showNotification(`${name} joined the session`);
});

collab.on('operationReceived', ({ op }) => {
  // Apply operation from remote user
  const result = applyOperation(op);
  updateViewport(result);
});

// 3. Create session
function newSession() {
  const roomId = `session-${Date.now()}`;
  collab.createRoom(roomId, { maxUsers: 10 });

  setTimeout(() => {
    collab.joinRoom(
      roomId,
      'user-' + generateId(),
      'John Doe'
    );

    // Show share link
    showShareLink(`cyclecad.com?room=${roomId}`);
  }, 500);
}

// 4. Perform operation
function performExtrude(depth) {
  const op = { type: 'extrude', depth, timestamp: Date.now() };

  // Local
  applyOperation(op);

  // Remote
  collab.sendOperation(op);
}

// 5. Chat
document.querySelector('#send-btn').onclick = () => {
  const text = document.querySelector('#chat-input').value;
  collab.sendMessage(text);
};
```

---

## Performance Tuning

### Reduce Message Rate

```javascript
// Default cursor throttle is 100ms = 10 updates/sec
// For faster networks:
collabClient.cursorUpdateInterval = 50;  // 20 updates/sec

// For slower networks:
collabClient.cursorUpdateInterval = 200; // 5 updates/sec
```

### Operation Batching

```javascript
// Batch multiple operations before sending
const batch = [];

batch.push({ type: 'extrude', depth: 10 });
batch.push({ type: 'fillet', radius: 2 });

collabClient.send({
  type: 'batch-operation',
  operations: batch
});
```

### Memory Management

```javascript
// Limit operation history
if (collabClient.operations.length > 10000) {
  collabClient.operations = collabClient.operations.slice(-5000);
}

// Limit chat history
if (collabClient.chatMessages.length > 500) {
  collabClient.chatMessages = collabClient.chatMessages.slice(-250);
}
```

---

## Next Steps

1. **Deploy server**: Choose hosting (Docker, AWS, GCP, Heroku)
2. **Integrate client**: Wire `collab-client.js` into your app
3. **Test locally**: Run signaling server and open 2 browser windows
4. **Add UI**: Create collaboration panel with user list, chat, cursor display
5. **Monitor**: Set up logging and alerting for server health

For more details, see:
- `server/signaling-server.js` — Full server source
- `app/js/collab-client.js` — Full client source
- `docs/COLLABORATION-HELP.json` — User-facing help

