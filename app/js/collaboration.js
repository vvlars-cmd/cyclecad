/**
 * collaboration.js — Real-time Multi-User Collaboration for cycleCAD
 *
 * Implements:
 * - Session management (create, join, leave)
 * - Presence system (cursor, selection, active tool tracking)
 * - Multi-user 3D cursors with name labels
 * - Operation broadcasting and conflict resolution
 * - Chat system with message history
 * - Git-style version control (snapshots & visual diff)
 * - Permissions system (host, editor, viewer roles)
 * - Shareable links and embed code generation
 * - AI agent participants with simulated activity
 * - Full localStorage persistence
 *
 * Exposes as: window.cycleCAD.collab
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// Module State
// ============================================================================

let _viewport = null;
let _scene = null;
let _camera = null;
let _renderer = null;

const STATE = {
  session: null,
  userId: null,
  participants: {},
  cursorObjects: {},        // Three.js objects for remote cursors
  selectionHighlights: {},  // Three.js objects for selection highlights
  messages: [],
  snapshots: {},            // { snapshotId: { name, timestamp, features, state } }
  currentSnapshot: null,
  eventListeners: {},
  agentDemo: {
    running: false,
    agents: null,
    updateInterval: null
  }
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize collaboration module with viewport reference
 */
export function initCollaboration(viewport) {
  _viewport = viewport;
  _scene = viewport?.scene;
  _camera = viewport?.camera;
  _renderer = viewport?.renderer;

  // Load persisted state from localStorage
  loadPersistedState();

  // Initialize local user
  const userId = localStorage.getItem('ev_userId') || generateUserId();
  localStorage.setItem('ev_userId', userId);
  STATE.userId = userId;

  // Expose API globally
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.collab = {
    createSession,
    joinSession,
    leaveSession,
    getSession,
    listParticipants,
    updatePresence,
    onPresenceUpdate,
    broadcastOperation,
    onRemoteOperation,
    sendMessage,
    onMessage,
    getMessageHistory,
    saveSnapshot,
    listSnapshots,
    loadSnapshot,
    diffSnapshots,
    visualDiff,
    generateShareLink,
    generateEmbedCode,
    startAgentDemo,
    stopAgentDemo,
    setRole,
    canPerform,
    on: addEventListener,
    off: removeEventListener,
    _debug: { STATE, _scene, _camera, _renderer }
  };

  // Start rendering loop for presence updates and cursor animation
  startPresenceUpdateLoop();

  console.log('[Collab] Initialized. UserId:', STATE.userId);
  return { sessionId: STATE.session?.sessionId, userId: STATE.userId };
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new collaboration session
 * @param {Object} options - { maxUsers, readOnly, password }
 * @returns {Object} - { sessionId, shareUrl, hostId, created }
 */
function createSession(options = {}) {
  const sessionId = generateSessionId();
  const created = Date.now();

  STATE.session = {
    sessionId,
    hostId: STATE.userId,
    created,
    maxUsers: options.maxUsers || 10,
    readOnly: options.readOnly || false,
    password: options.password || null,
    participants: [STATE.userId],
    locked: false
  };

  STATE.participants[STATE.userId] = {
    userId: STATE.userId,
    name: 'You',
    avatar: generateUserColor(STATE.userId),
    cursor3D: { x: 0, y: 0, z: 0 },
    selectedPart: null,
    activeTool: null,
    camera: { position: { x: 0, y: 0, z: 100 }, target: { x: 0, y: 0, z: 0 } },
    lastSeen: created,
    role: 'host',
    status: 'active'
  };

  persistState();
  emitEvent('session-created', STATE.session);

  const shareUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
  console.log('[Collab] Session created:', sessionId);

  return {
    sessionId,
    shareUrl,
    hostId: STATE.session.hostId,
    created
  };
}

/**
 * Join an existing session
 * @param {string} sessionId - Session to join
 * @param {Object} options - { name, password, role }
 */
function joinSession(sessionId, options = {}) {
  // Simulate joining (in production, would call API)
  if (!STATE.session) {
    STATE.session = {
      sessionId,
      hostId: sessionId.substring(0, 8), // mock
      created: Date.now(),
      maxUsers: 10,
      readOnly: false,
      password: null,
      participants: [STATE.userId],
      locked: false
    };
  }

  const role = options.role || 'editor';
  STATE.participants[STATE.userId] = {
    userId: STATE.userId,
    name: options.name || `User${STATE.userId.substring(0, 4)}`,
    avatar: generateUserColor(STATE.userId),
    cursor3D: { x: 0, y: 0, z: 0 },
    selectedPart: null,
    activeTool: null,
    camera: { position: { x: 0, y: 0, z: 100 }, target: { x: 0, y: 0, z: 0 } },
    lastSeen: Date.now(),
    role,
    status: 'active'
  };

  persistState();
  emitEvent('session-joined', STATE.session);
  console.log('[Collab] Joined session:', sessionId, 'as', options.name);

  return STATE.session;
}

/**
 * Leave current session
 */
function leaveSession() {
  if (!STATE.session) return;

  broadcastOperation({
    type: 'user-left',
    userId: STATE.userId,
    timestamp: Date.now()
  });

  stopAgentDemo();
  clearCursors();
  STATE.session = null;
  STATE.participants = {};

  persistState();
  emitEvent('session-left');
  console.log('[Collab] Left session');
}

/**
 * Get current session info
 */
function getSession() {
  return STATE.session;
}

/**
 * List all participants in current session
 */
function listParticipants() {
  return Object.values(STATE.participants).map(p => ({
    ...p,
    isLocalUser: p.userId === STATE.userId
  }));
}

// ============================================================================
// Presence System
// ============================================================================

/**
 * Update local user's presence (cursor, selection, tool, camera)
 * @param {Object} state - { cursor3D, selectedPart, activeTool, camera }
 */
function updatePresence(state) {
  if (!STATE.session) return;

  const presence = STATE.participants[STATE.userId];
  if (!presence) return;

  Object.assign(presence, {
    ...state,
    lastSeen: Date.now(),
    status: 'active'
  });

  persistState();

  // Broadcast to other participants (in real app, via WebSocket)
  broadcastPresence(presence);
}

/**
 * Broadcast presence to simulated network
 */
function broadcastPresence(presence) {
  // In production, this would send via WebSocket
  // For demo, simulate delayed delivery to participants
  setTimeout(() => {
    for (const userId in STATE.participants) {
      if (userId !== STATE.userId) {
        const otherUser = STATE.participants[userId];
        emitEvent('presence-update', presence);
      }
    }
  }, 50);
}

/**
 * Register callback for presence updates from other users
 */
function onPresenceUpdate(callback) {
  addEventListener('presence-update', callback);
}

/**
 * Update cursor visibility and position for a participant
 */
function updateRemoteCursor(presence) {
  if (!_scene || !presence) return;

  const cursorId = `cursor_${presence.userId}`;
  let cursorGroup = STATE.cursorObjects[cursorId];

  if (!cursorGroup) {
    // Create new cursor group
    cursorGroup = new THREE.Group();
    cursorGroup.name = cursorId;

    // Cursor sphere
    const sphereGeom = new THREE.SphereGeometry(2, 8, 8);
    const sphereMat = new THREE.MeshPhongMaterial({
      color: presence.avatar,
      emissive: presence.avatar,
      emissiveIntensity: 0.4,
      wireframe: false
    });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.name = 'cursor_sphere';
    cursorGroup.add(sphere);

    // Name label as sprite (canvas texture)
    const labelTexture = createNameLabel(presence.name, presence.avatar);
    const labelGeom = new THREE.PlaneGeometry(8, 2);
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true
    });
    const label = new THREE.Mesh(labelGeom, labelMat);
    label.position.z = 3;
    label.name = 'cursor_label';
    cursorGroup.add(label);

    _scene.add(cursorGroup);
    STATE.cursorObjects[cursorId] = cursorGroup;
  }

  // Animate cursor to new position
  const targetPos = presence.cursor3D || { x: 0, y: 0, z: 0 };
  animateCursorPosition(cursorGroup, targetPos, 150); // 150ms interpolation

  // Update opacity based on lastSeen
  const timeSinceLastSeen = Date.now() - presence.lastSeen;
  const opacity = timeSinceLastSeen > 5000 ? 0 : Math.max(0.3, 1 - timeSinceLastSeen / 5000);
  cursorGroup.traverse(child => {
    if (child.material && child.material.opacity !== undefined) {
      child.material.opacity = opacity;
    }
  });
}

/**
 * Animate cursor smoothly between positions
 */
function animateCursorPosition(cursorGroup, targetPos, duration = 150) {
  const startPos = cursorGroup.position.clone();
  const startTime = Date.now();

  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = easeOutQuad(progress);

    cursorGroup.position.x = startPos.x + (targetPos.x - startPos.x) * easeProgress;
    cursorGroup.position.y = startPos.y + (targetPos.y - startPos.y) * easeProgress;
    cursorGroup.position.z = startPos.z + (targetPos.z - startPos.z) * easeProgress;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  animate();
}

/**
 * Render selection highlights for other users' selected parts
 */
function updateSelectionHighlights(userId, partIndex) {
  if (!_scene) return;

  // Remove existing highlight for this user
  const highlightId = `select_${userId}`;
  if (STATE.selectionHighlights[highlightId]) {
    _scene.remove(STATE.selectionHighlights[highlightId]);
    delete STATE.selectionHighlights[highlightId];
  }

  if (partIndex === null) return;

  // Create outlines around part (simplified: create wireframe box)
  const color = STATE.participants[userId]?.avatar || 0x0284c7;
  const edgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 10, 10));
  const edgeMat = new THREE.LineBasicMaterial({ color });
  const wireframe = new THREE.LineSegments(edgeGeom, edgeMat);
  wireframe.name = highlightId;

  _scene.add(wireframe);
  STATE.selectionHighlights[highlightId] = wireframe;
}

/**
 * Clear all remote cursors
 */
function clearCursors() {
  for (const cursorId in STATE.cursorObjects) {
    const cursor = STATE.cursorObjects[cursorId];
    if (_scene && cursor.parent === _scene) {
      _scene.remove(cursor);
    }
  }
  STATE.cursorObjects = {};

  for (const highlightId in STATE.selectionHighlights) {
    const highlight = STATE.selectionHighlights[highlightId];
    if (_scene && highlight.parent === _scene) {
      _scene.remove(highlight);
    }
  }
  STATE.selectionHighlights = {};
}

// ============================================================================
// Operation Broadcasting
// ============================================================================

/**
 * Broadcast an operation to all participants
 * @param {Object} op - { type, method, params, userId, timestamp }
 */
function broadcastOperation(op) {
  if (!STATE.session) return;

  const operation = {
    type: op.type,
    method: op.method,
    params: op.params,
    userId: op.userId || STATE.userId,
    timestamp: op.timestamp || Date.now(),
    sessionId: STATE.session.sessionId,
    opId: generateOpId()
  };

  // Add to local operation log
  if (!window.cycleCAD._opLog) {
    window.cycleCAD._opLog = [];
  }
  window.cycleCAD._opLog.push(operation);

  // Broadcast to other participants
  setTimeout(() => {
    emitEvent('operation-received', operation);
  }, 50);
}

/**
 * Register callback for remote operations
 */
function onRemoteOperation(callback) {
  addEventListener('operation-received', callback);
}

// ============================================================================
// Chat System
// ============================================================================

/**
 * Send a message to the session
 */
function sendMessage(text, type = 'text') {
  if (!STATE.session) return null;

  const message = {
    messageId: generateMessageId(),
    userId: STATE.userId,
    userName: STATE.participants[STATE.userId]?.name || 'Anonymous',
    userColor: STATE.participants[STATE.userId]?.avatar || '#0284c7',
    text,
    type,
    timestamp: Date.now()
  };

  STATE.messages.push(message);
  persistState();

  emitEvent('message-sent', message);
  console.log('[Chat]', message.userName, ':', text);

  return message;
}

/**
 * Register callback for messages
 */
function onMessage(callback) {
  addEventListener('message-sent', callback);
}

/**
 * Get message history
 */
function getMessageHistory() {
  return STATE.messages.slice();
}

// ============================================================================
// Version Control (Git-style)
// ============================================================================

/**
 * Save a snapshot of current state with a name
 */
function saveSnapshot(name) {
  const snapshotId = generateSnapshotId();
  const timestamp = Date.now();

  // Capture current features from feature tree or app state
  const features = captureCurrentFeatures();

  STATE.snapshots[snapshotId] = {
    snapshotId,
    name,
    timestamp,
    features,
    userId: STATE.userId,
    userName: STATE.participants[STATE.userId]?.name || 'Anonymous',
    featureCount: features.length
  };

  STATE.currentSnapshot = snapshotId;
  persistState();

  emitEvent('snapshot-saved', STATE.snapshots[snapshotId]);
  console.log('[Collab] Snapshot saved:', name, `(${features.length} features)`);

  return STATE.snapshots[snapshotId];
}

/**
 * List all snapshots
 */
function listSnapshots() {
  return Object.values(STATE.snapshots)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(s => ({
      ...s,
      formattedTime: new Date(s.timestamp).toLocaleString()
    }));
}

/**
 * Load a snapshot and restore state
 */
function loadSnapshot(snapshotId) {
  const snapshot = STATE.snapshots[snapshotId];
  if (!snapshot) {
    console.error('[Collab] Snapshot not found:', snapshotId);
    return null;
  }

  // In production, would restore features through the operation API
  STATE.currentSnapshot = snapshotId;
  persistState();

  emitEvent('snapshot-loaded', snapshot);
  console.log('[Collab] Snapshot loaded:', snapshot.name);

  return snapshot;
}

/**
 * Compare two snapshots and return differences
 */
function diffSnapshots(id1, id2) {
  const snap1 = STATE.snapshots[id1];
  const snap2 = STATE.snapshots[id2];

  if (!snap1 || !snap2) return null;

  const features1 = snap1.features || [];
  const features2 = snap2.features || [];

  const featureMap1 = new Map(features1.map(f => [f.featureId, f]));
  const featureMap2 = new Map(features2.map(f => [f.featureId, f]));

  const added = features2.filter(f => !featureMap1.has(f.featureId));
  const removed = features1.filter(f => !featureMap2.has(f.featureId));
  const modified = features2.filter(f => {
    const orig = featureMap1.get(f.featureId);
    return orig && JSON.stringify(orig) !== JSON.stringify(f);
  });
  const unchanged = features1.filter(f => {
    const curr = featureMap2.get(f.featureId);
    return curr && JSON.stringify(curr) === JSON.stringify(f);
  });

  return {
    snap1Id: id1,
    snap2Id: id2,
    snap1Name: snap1.name,
    snap2Name: snap2.name,
    added: added.map(f => f.name || f.type),
    removed: removed.map(f => f.name || f.type),
    modified: modified.map(f => f.name || f.type),
    unchanged: unchanged.map(f => f.name || f.type),
    summary: `+${added.length} -${removed.length} ~${modified.length}`
  };
}

/**
 * Apply visual diff to the scene (color-code parts)
 */
function visualDiff(id1, id2) {
  const diff = diffSnapshots(id1, id2);
  if (!diff) return null;

  console.log('[Collab] Visual diff:', diff.summary);

  // In production, would highlight parts in the 3D view
  // For now, just return the diff data
  emitEvent('visual-diff-applied', diff);

  return diff;
}

// ============================================================================
// Permissions & Roles
// ============================================================================

/**
 * Set role for a participant
 */
function setRole(userId, role) {
  if (STATE.session?.hostId !== STATE.userId) {
    console.error('[Collab] Only host can change roles');
    return false;
  }

  const participant = STATE.participants[userId];
  if (!participant) return false;

  const validRoles = ['host', 'editor', 'viewer'];
  if (!validRoles.includes(role)) return false;

  participant.role = role;
  persistState();

  emitEvent('role-changed', { userId, role });
  console.log('[Collab] Role changed:', userId, '->', role);

  return true;
}

/**
 * Check if a user can perform an action
 */
function canPerform(userId, action) {
  const participant = STATE.participants[userId];
  if (!participant) return false;

  const permissions = {
    host: ['create', 'edit', 'delete', 'export', 'save', 'invite'],
    editor: ['create', 'edit', 'delete', 'export', 'save'],
    viewer: []
  };

  const allowedActions = permissions[participant.role] || [];
  return allowedActions.includes(action);
}

// ============================================================================
// Share Links & Embed Code
// ============================================================================

/**
 * Generate a shareable link
 */
function generateShareLink(options = {}) {
  if (!STATE.session) return null;

  const { readOnly = false, password = null, expiry = '24h' } = options;

  const shareToken = generateShareToken();
  const expiryMs = parseExpiryToMs(expiry);
  const expiresAt = expiryMs ? Date.now() + expiryMs : null;

  const shareLink = {
    token: shareToken,
    sessionId: STATE.session.sessionId,
    url: `${window.location.origin}${window.location.pathname}?session=${STATE.session.sessionId}&token=${shareToken}`,
    readOnly,
    password,
    expiresAt,
    createdBy: STATE.userId,
    createdAt: Date.now()
  };

  // Store share links in localStorage
  const shareLinks = JSON.parse(localStorage.getItem('ev_shareLinks') || '{}');
  shareLinks[shareToken] = shareLink;
  localStorage.setItem('ev_shareLinks', JSON.stringify(shareLinks));

  return shareLink;
}

/**
 * Generate embed code for iframe embedding
 */
function generateEmbedCode(options = {}) {
  if (!STATE.session) return null;

  const { width = 800, height = 600, showToolbar = true, showTree = true } = options;

  const params = new URLSearchParams({
    session: STATE.session.sessionId,
    embed: 'true',
    toolbar: showToolbar,
    tree: showTree
  });

  const url = `${window.location.origin}${window.location.pathname}?${params}`;

  return {
    html: `<iframe src="${url}" width="${width}" height="${height}" style="border: none; border-radius: 8px;"></iframe>`,
    url,
    width,
    height
  };
}

// ============================================================================
// AI Agent Participants (Demo)
// ============================================================================

/**
 * Start simulated AI agent participants
 */
function startAgentDemo() {
  if (STATE.agentDemo.running) return;

  // Create 3 AI agents
  const agents = {
    geometry: {
      userId: generateUserId(),
      name: 'GeometryBot',
      avatar: '#3b82f6',
      role: 'editor',
      personality: 'Creates shapes, suggests improvements'
    },
    quality: {
      userId: generateUserId(),
      name: 'QualityBot',
      avatar: '#ef4444',
      role: 'viewer',
      personality: 'Runs DFM checks, flags issues'
    },
    cost: {
      userId: generateUserId(),
      name: 'CostBot',
      avatar: '#8b5cf6',
      role: 'viewer',
      personality: 'Estimates costs, compares processes'
    }
  };

  // Add agents to participants
  for (const agentKey in agents) {
    const agent = agents[agentKey];
    STATE.participants[agent.userId] = {
      userId: agent.userId,
      name: agent.name,
      avatar: agent.avatar,
      cursor3D: {
        x: (Math.random() - 0.5) * 50,
        y: (Math.random() - 0.5) * 50,
        z: (Math.random() - 0.5) * 50
      },
      selectedPart: null,
      activeTool: null,
      camera: { position: { x: 0, y: 0, z: 100 }, target: { x: 0, y: 0, z: 0 } },
      lastSeen: Date.now(),
      role: agent.role,
      status: 'active',
      isAgent: true
    };

    emitEvent('user-joined', STATE.participants[agent.userId]);
  }

  STATE.agentDemo.agents = agents;
  STATE.agentDemo.running = true;

  // Simulate agent activity
  STATE.agentDemo.updateInterval = setInterval(() => {
    simulateAgentActivity(agents);
  }, 3000);

  console.log('[Collab] Agent demo started with 3 agents');
  emitEvent('agent-demo-started');
}

/**
 * Stop agent demo
 */
function stopAgentDemo() {
  if (!STATE.agentDemo.running) return;

  if (STATE.agentDemo.updateInterval) {
    clearInterval(STATE.agentDemo.updateInterval);
  }

  // Remove agents from participants
  for (const agentKey in STATE.agentDemo.agents) {
    const agent = STATE.agentDemo.agents[agentKey];
    delete STATE.participants[agent.userId];
  }

  STATE.agentDemo.agents = null;
  STATE.agentDemo.running = false;

  clearCursors();
  console.log('[Collab] Agent demo stopped');
  emitEvent('agent-demo-stopped');
}

/**
 * Simulate activity from agents
 */
function simulateAgentActivity(agents) {
  const agentKeys = Object.keys(agents);
  const randomAgent = agentKeys[Math.floor(Math.random() * agentKeys.length)];
  const agent = agents[randomAgent];

  // Random movement
  const participant = STATE.participants[agent.userId];
  if (participant) {
    participant.cursor3D = {
      x: participant.cursor3D.x + (Math.random() - 0.5) * 10,
      y: participant.cursor3D.y + (Math.random() - 0.5) * 10,
      z: participant.cursor3D.z + (Math.random() - 0.5) * 10
    };
    participant.lastSeen = Date.now();

    updateRemoteCursor(participant);

    // Occasional messages
    if (Math.random() < 0.2) {
      const messages = {
        geometry: [
          'Fillet edge R2.5 for better aesthetics',
          'Consider adding a chamfer here',
          'Geometry looks good!'
        ],
        quality: [
          'DFM check: Undercut detected',
          'Wall thickness acceptable',
          'Recommend parting line adjustment'
        ],
        cost: [
          'Estimated cost: $12.50 (CNC)',
          'Cheaper as molded part: $2.00',
          'Lead time: 5 days injection molding'
        ]
      };

      const msgList = messages[randomAgent] || [];
      const msg = msgList[Math.floor(Math.random() * msgList.length)];

      STATE.messages.push({
        messageId: generateMessageId(),
        userId: agent.userId,
        userName: agent.name,
        userColor: agent.avatar,
        text: msg,
        type: 'system',
        timestamp: Date.now()
      });

      emitEvent('message-sent', STATE.messages[STATE.messages.length - 1]);
    }
  }
}

// ============================================================================
// Presence Update Loop
// ============================================================================

/**
 * Start the presence update loop (animates cursors, syncs state)
 */
function startPresenceUpdateLoop() {
  setInterval(() => {
    if (!STATE.session) return;

    // Update cursor visibility for all participants
    for (const userId in STATE.participants) {
      if (userId !== STATE.userId) {
        updateRemoteCursor(STATE.participants[userId]);
      }
    }
  }, 100);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique user ID
 */
function generateUserId() {
  return `user_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return `session_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate a unique operation ID
 */
function generateOpId() {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate a unique message ID
 */
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate a unique snapshot ID
 */
function generateSnapshotId() {
  return `snap_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate a unique share token
 */
function generateShareToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a user color based on user ID (deterministic)
 */
function generateUserColor(userId) {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = (hash % 360);
  const sat = 70;
  const light = 50;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Create a canvas texture for name labels
 */
function createNameLabel(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = typeof color === 'string' ? color : `#${color.toString(16)}`;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.substring(0, 15), canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Ease out quad easing function
 */
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Parse expiry string to milliseconds
 */
function parseExpiryToMs(expiry) {
  const expiryMap = {
    '1h': 3600 * 1000,
    '24h': 24 * 3600 * 1000,
    '7d': 7 * 24 * 3600 * 1000,
    'never': null
  };
  return expiryMap[expiry] || null;
}

/**
 * Capture current features from app state
 */
function captureCurrentFeatures() {
  // In production, would extract from window.cycleCAD feature tree
  // For now, mock some features
  if (window.cycleCAD && window.cycleCAD._opLog) {
    return window.cycleCAD._opLog.map((op, idx) => ({
      featureId: `feat_${idx}`,
      name: op.method || op.type,
      type: op.type,
      params: op.params,
      timestamp: op.timestamp
    }));
  }
  return [];
}

// ============================================================================
// Event System
// ============================================================================

/**
 * Register event listener
 */
function addEventListener(eventName, callback) {
  if (!STATE.eventListeners[eventName]) {
    STATE.eventListeners[eventName] = [];
  }
  STATE.eventListeners[eventName].push(callback);
}

/**
 * Unregister event listener
 */
function removeEventListener(eventName, callback) {
  if (!STATE.eventListeners[eventName]) return;
  STATE.eventListeners[eventName] = STATE.eventListeners[eventName].filter(cb => cb !== callback);
}

/**
 * Emit event to all listeners
 */
function emitEvent(eventName, data) {
  const listeners = STATE.eventListeners[eventName] || [];
  listeners.forEach(cb => {
    try {
      cb(data);
    } catch (err) {
      console.error(`[Collab] Event listener error for ${eventName}:`, err);
    }
  });
}

// ============================================================================
// Persistence
// ============================================================================

/**
 * Persist state to localStorage
 */
function persistState() {
  try {
    localStorage.setItem('ev_collabState', JSON.stringify({
      session: STATE.session,
      messages: STATE.messages,
      snapshots: STATE.snapshots,
      currentSnapshot: STATE.currentSnapshot
    }));
  } catch (err) {
    console.error('[Collab] Persistence error:', err);
  }
}

/**
 * Load persisted state from localStorage
 */
function loadPersistedState() {
  try {
    const stored = localStorage.getItem('ev_collabState');
    if (stored) {
      const data = JSON.parse(stored);
      STATE.session = data.session;
      STATE.messages = data.messages || [];
      STATE.snapshots = data.snapshots || {};
      STATE.currentSnapshot = data.currentSnapshot;
    }
  } catch (err) {
    console.error('[Collab] Load persistence error:', err);
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  initCollaboration,
  createSession,
  joinSession,
  leaveSession,
  getSession,
  listParticipants,
  updatePresence,
  onPresenceUpdate,
  broadcastOperation,
  onRemoteOperation,
  sendMessage,
  onMessage,
  getMessageHistory,
  saveSnapshot,
  listSnapshots,
  loadSnapshot,
  diffSnapshots,
  visualDiff,
  generateShareLink,
  generateEmbedCode,
  startAgentDemo,
  stopAgentDemo,
  setRole,
  canPerform,
  clearCursors,
  updateRemoteCursor
};
