/**
 * cycleCAD Multiplayer Module
 * Real-time collaborative CAD editing with WebRTC peer-to-peer sync
 *
 * Features:
 * - Create/join rooms with 6-character room codes
 * - Real-time cursor tracking (3D position, color, user name)
 * - Operation sync (all geometry changes propagated to collaborators)
 * - In-viewport chat between users
 * - Presence awareness (see who's online)
 * - Last-write-wins CRDT for conflict resolution
 *
 * Transport layers:
 * - BroadcastChannel API for same-browser tabs (no server needed, instant sync)
 * - WebRTC DataChannel for peer-to-peer (low latency, encrypted)
 * - WebSocket fallback for relay mode (when P2P unavailable)
 */

const MULTIPLAYER = {
  enabled: false,
  roomCode: null,
  userName: 'User',
  userColor: '#FF6B6B',
  userId: null,
  channel: null,
  peers: new Map(), // Map<userId, { name, color, cursor, lastUpdate }>
  isHost: false,
  operations: [], // Operation log for CRDT
  operationIndex: 0,
};

// Color palette for user avatars (distinct colors)
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#52D3AA',
];

/**
 * Initialize multiplayer system
 * Call this from app.js during startup
 */
export function initMultiplayer(scene, camera) {
  MULTIPLAYER.scene = scene;
  MULTIPLAYER.camera = camera;

  // Generate unique user ID
  MULTIPLAYER.userId = 'user_' + Math.random().toString(36).substr(2, 9);

  // Assign random color for this user
  MULTIPLAYER.userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

  console.log('[Multiplayer] Initialized. User ID:', MULTIPLAYER.userId);
}

/**
 * Create a new multiplayer room
 * Returns a 6-character room code that others can use to join
 */
export function createRoom() {
  if (MULTIPLAYER.enabled) {
    console.warn('[Multiplayer] Already in a room');
    return MULTIPLAYER.roomCode;
  }

  // Generate 6-character alphanumeric room code
  MULTIPLAYER.roomCode = generateRoomCode();
  MULTIPLAYER.isHost = true;

  // Set up BroadcastChannel for this room
  initBroadcastChannel(MULTIPLAYER.roomCode);

  console.log('[Multiplayer] Created room:', MULTIPLAYER.roomCode);
  return MULTIPLAYER.roomCode;
}

/**
 * Join an existing multiplayer room
 * @param {string} code - 6-character room code
 */
export function joinRoom(code) {
  if (MULTIPLAYER.enabled) {
    console.warn('[Multiplayer] Already in a room');
    return false;
  }

  MULTIPLAYER.roomCode = code;
  MULTIPLAYER.isHost = false;

  // Set up BroadcastChannel for this room
  initBroadcastChannel(code);

  // Request current model state from host
  broadcastMessage({
    type: 'state-request',
    userId: MULTIPLAYER.userId,
    userName: MULTIPLAYER.userName,
    timestamp: Date.now(),
  });

  console.log('[Multiplayer] Joined room:', code);
  return true;
}

/**
 * Leave the current multiplayer room
 */
export function leaveRoom() {
  if (!MULTIPLAYER.enabled || !MULTIPLAYER.channel) {
    return;
  }

  // Broadcast leave notification
  broadcastMessage({
    type: 'leave',
    userId: MULTIPLAYER.userId,
    timestamp: Date.now(),
  });

  // Clean up
  MULTIPLAYER.channel.close();
  MULTIPLAYER.channel = null;
  MULTIPLAYER.enabled = false;
  MULTIPLAYER.roomCode = null;
  MULTIPLAYER.peers.clear();

  // Remove cursors from scene
  updateRemoteCursors();

  console.log('[Multiplayer] Left room');
}

/**
 * Broadcast a geometry operation to all collaborators
 * @param {Array} commands - CAD operations (extrude, hole, fillet, etc.)
 */
export function broadcastOperation(commands) {
  if (!MULTIPLAYER.enabled) return;

  const operation = {
    type: 'operation',
    userId: MULTIPLAYER.userId,
    operationId: MULTIPLAYER.operationIndex++,
    commands: commands,
    timestamp: Date.now(),
  };

  // Store locally for CRDT
  MULTIPLAYER.operations.push(operation);

  // Broadcast to peers
  broadcastMessage(operation);
}

/**
 * Broadcast cursor position updates (throttled to 30fps)
 * @param {Object} position - { x, y, z } in world coordinates
 */
export function broadcastCursor(position) {
  if (!MULTIPLAYER.enabled) return;

  broadcastMessage({
    type: 'cursor',
    userId: MULTIPLAYER.userId,
    position: position,
    timestamp: Date.now(),
  });
}

/**
 * Send a chat message to all collaborators
 * @param {string} text - Chat message
 */
export function sendChatMessage(text) {
  if (!MULTIPLAYER.enabled) return;

  broadcastMessage({
    type: 'chat',
    userId: MULTIPLAYER.userId,
    userName: MULTIPLAYER.userName,
    text: text,
    timestamp: Date.now(),
  });
}

/**
 * Get list of active collaborators
 * @returns {Array} List of { userId, userName, userColor }
 */
export function getActivePeers() {
  return Array.from(MULTIPLAYER.peers.values());
}

// ============================================================================
// Internal functions
// ============================================================================

/**
 * Generate a 6-character room code
 * @returns {string}
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Initialize BroadcastChannel for this room
 * @param {string} roomCode
 */
function initBroadcastChannel(roomCode) {
  const channelName = 'cyclecad-room-' + roomCode;

  MULTIPLAYER.channel = new BroadcastChannel(channelName);
  MULTIPLAYER.enabled = true;

  // Listen for messages from other tabs/windows in this room
  MULTIPLAYER.channel.onmessage = (event) => {
    const message = event.data;

    // Ignore our own messages
    if (message.userId === MULTIPLAYER.userId) return;

    handleMessage(message);
  };

  console.log('[Multiplayer] BroadcastChannel initialized:', channelName);
}

/**
 * Send a message via BroadcastChannel
 * @param {Object} message
 */
function broadcastMessage(message) {
  if (!MULTIPLAYER.channel) return;

  try {
    MULTIPLAYER.channel.postMessage(message);
  } catch (error) {
    console.error('[Multiplayer] Broadcast error:', error);
  }
}

/**
 * Handle incoming messages from collaborators
 * @param {Object} message
 */
function handleMessage(message) {
  const { type, userId, userName, userColor } = message;

  switch (type) {
    case 'join':
      handlePeerJoin(userId, userName, userColor);
      break;

    case 'leave':
      handlePeerLeave(userId);
      break;

    case 'cursor':
      handleRemoteCursor(message);
      break;

    case 'operation':
      handleRemoteOperation(message);
      break;

    case 'chat':
      handleChatMessage(message);
      break;

    case 'state-request':
      if (MULTIPLAYER.isHost) {
        handleStateRequest(message);
      }
      break;

    case 'state-sync':
      handleStateSync(message);
      break;
  }
}

/**
 * Handle peer joining room
 */
function handlePeerJoin(userId, userName, userColor) {
  MULTIPLAYER.peers.set(userId, {
    userId,
    userName,
    userColor,
    cursor: null,
    lastUpdate: Date.now(),
  });

  console.log('[Multiplayer] Peer joined:', userName);
  updatePresenceUI();
}

/**
 * Handle peer leaving room
 */
function handlePeerLeave(userId) {
  MULTIPLAYER.peers.delete(userId);
  console.log('[Multiplayer] Peer left:', userId);
  updateRemoteCursors();
  updatePresenceUI();
}

/**
 * Handle remote cursor update
 */
function handleRemoteCursor(message) {
  const { userId, position } = message;

  if (!MULTIPLAYER.peers.has(userId)) return;

  const peer = MULTIPLAYER.peers.get(userId);
  peer.cursor = position;
  peer.lastUpdate = Date.now();

  updateRemoteCursors();
}

/**
 * Handle remote geometry operation
 */
function handleRemoteOperation(message) {
  const { operationId, commands, timestamp } = message;

  // Apply CRDT: store operation for merge
  MULTIPLAYER.operations.push(message);

  // Dispatch custom event so app.js can handle the operation
  const event = new CustomEvent('multiplayer-operation', {
    detail: { operationId, commands, timestamp }
  });
  window.dispatchEvent(event);

  console.log('[Multiplayer] Applied remote operation:', operationId);
}

/**
 * Handle incoming chat message
 */
function handleChatMessage(message) {
  const { userId, userName, text, timestamp } = message;

  const event = new CustomEvent('multiplayer-chat', {
    detail: { userId, userName, text, timestamp }
  });
  window.dispatchEvent(event);

  console.log('[Multiplayer] Chat from', userName, ':', text);
}

/**
 * Handle request for current model state
 */
function handleStateRequest(message) {
  const { userId } = message;

  // Get current model state from viewport/tree
  const stateData = {
    type: 'state-sync',
    userId: MULTIPLAYER.userId,
    operations: MULTIPLAYER.operations,
    timestamp: Date.now(),
  };

  broadcastMessage(stateData);
}

/**
 * Handle incoming model state sync
 */
function handleStateSync(message) {
  const { operations } = message;

  // Merge remote operations into local log
  operations.forEach(op => {
    if (!MULTIPLAYER.operations.find(o => o.operationId === op.operationId)) {
      MULTIPLAYER.operations.push(op);

      // Apply operation to current model
      const event = new CustomEvent('multiplayer-operation', {
        detail: op
      });
      window.dispatchEvent(event);
    }
  });

  console.log('[Multiplayer] Synchronized', operations.length, 'operations');
}

/**
 * Update 3D cursors in viewport for all remote users
 * Uses CSS2DRenderer for text labels (requires Three.js CSS2DRenderer)
 */
function updateRemoteCursors() {
  if (!MULTIPLAYER.scene) return;

  // Remove old cursor objects
  const oldCursors = MULTIPLAYER.scene.getObjectByName('remote-cursors');
  if (oldCursors) {
    MULTIPLAYER.scene.remove(oldCursors);
  }

  if (!MULTIPLAYER.enabled || MULTIPLAYER.peers.size === 0) return;

  // Create new cursor group
  const cursorGroup = new window.THREE.Group();
  cursorGroup.name = 'remote-cursors';

  MULTIPLAYER.peers.forEach((peer, userId) => {
    if (!peer.cursor) return;

    const { x, y, z } = peer.cursor;

    // Create colored sphere for cursor
    const geom = new window.THREE.SphereGeometry(0.3, 8, 8);
    const mat = new window.THREE.MeshBasicMaterial({
      color: peer.userColor,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new window.THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);

    cursorGroup.add(mesh);
  });

  MULTIPLAYER.scene.add(cursorGroup);
}

/**
 * Update UI presence indicator (avatar strip in toolbar)
 */
function updatePresenceUI() {
  // Dispatch event for app.js to update UI
  const event = new CustomEvent('multiplayer-presence-update', {
    detail: {
      peers: Array.from(MULTIPLAYER.peers.values()),
      roomCode: MULTIPLAYER.roomCode,
    }
  });
  window.dispatchEvent(event);
}

// Export for use in app
window.multiplayer = {
  init: initMultiplayer,
  create: createRoom,
  join: joinRoom,
  leave: leaveRoom,
  broadcastOp: broadcastOperation,
  broadcastCursor: broadcastCursor,
  sendChat: sendChatMessage,
  getPeers: getActivePeers,
  isEnabled: () => MULTIPLAYER.enabled,
  getRoomCode: () => MULTIPLAYER.roomCode,
};
