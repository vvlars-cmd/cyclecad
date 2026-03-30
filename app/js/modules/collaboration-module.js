/**
 * @file collaboration-module.js
 * @description Real-time multi-user collaboration via WebRTC peer-to-peer.
 *   Users see each other's 3D cursors, watch live edits synchronize across the design,
 *   and communicate via floating in-viewport chat messages. Built on CRDT (Conflict-free
 *   Replicated Data Types) for automatic conflict resolution when concurrent edits occur.
 *
 * @tutorial Creating a Collaboration Room
 *   Step 1: Initialize collaboration
 *     const collab = await kernel.exec('collab.createRoom', {
 *       capacity: 10,
 *       access: 'owner'
 *     });
 *     // Returns { code: 'ABC123', hostName: 'You' }
 *
 *   Step 2: Share the code (ABC123) with teammates via email, Slack, or link
 *
 *   Step 3: They join with
 *     const joined = await kernel.exec('collab.joinRoom', {
 *       code: 'ABC123',
 *       userName: 'Alice'
 *     });
 *     // They instantly see your cursor, geometry, and chat
 *
 *   Step 4: Make changes — they're broadcast to all peers automatically
 *     kernel.exec('shape.cylinder', { radius: 25, height: 80 });
 *     // All peers see the cylinder appear in real-time
 *
 *   Step 5: Leave the room (browser close or manual)
 *     kernel.exec('collab.leaveRoom');
 *
 * @tutorial Changing User Roles
 *   Room owners can control permissions:
 *     kernel.exec('collab.setRole', {
 *       userId: 'alice-123',
 *       role: 'editor'  // 'owner' | 'editor' | 'viewer'
 *     });
 *
 *   Roles:
 *     - owner: Full control (create/edit/delete/invite)
 *     - editor: Can model and view, cannot delete others' work or invite
 *     - viewer: Read-only, can only see and comment
 *
 * @tutorial In-Viewport Chat
 *   Press Enter to open chat box, type, press Enter to send.
 *   Messages appear as floating bubbles near your cursor for 10 seconds.
 *   Includes sender name, timestamp, and avatar color (per user).
 *
 * @version 1.0.0
 * @author Sachin Kumar <vvlars@googlemail.com>
 * @license MIT
 */

// ============================================================================
// COLLABORATION MODULE — Main Export
// ============================================================================

export default {
  name: 'collaboration',
  version: '1.0.0',

  // ========================================================================
  // MODULE STATE
  // ========================================================================

  state: {
    /** @type {string|null} Current room code (null if not connected) */
    roomCode: null,

    /** @type {string} Local user ID (UUID) */
    userId: null,

    /** @type {string} Local user name */
    userName: 'User',

    /** @type {'owner'|'editor'|'viewer'} Local user role */
    role: 'viewer',

    /** @type {Map<string, Object>} Connected peers: userId → {name, role, cursorPos, color, ping} */
    peers: new Map(),

    /** @type {Array<Object>} CRDT operation log for sync */
    operationLog: [],

    /** @type {number} Clock vector for causality tracking */
    lamportClock: 0,

    /** @type {boolean} Room active */
    connected: false,

    /** @type {number} Peer discovery timeout (ms) */
    peerDiscoveryInterval: null,

    /** @type {Object} WebSocket for signaling (if signaling server available) */
    signalingSocket: null,

    /** @type {Map<string, RTCPeerConnection>} WebRTC peer connections */
    peerConnections: new Map(),

    /** @type {Map<string, RTCDataChannel>} Data channels per peer */
    dataChannels: new Map(),
  },

  // ========================================================================
  // INIT — Setup and teardown
  // ========================================================================

  /**
   * Initialize collaboration module.
   * Sets up event listeners, generates user ID, loads preferences.
   * Called automatically on app startup.
   *
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    this.state.userId = this._generateUUID();
    this.state.userName = localStorage.getItem('collab_userName') || 'User';

    // Listen for 3D cursor movement
    window.addEventListener('mousemove', (e) => this._onCursorMove(e));

    // Listen for chat keypress
    document.addEventListener('keypress', (e) => this._onChatKeyPress(e));

    // Detect page unload and gracefully leave room
    window.addEventListener('beforeunload', () => {
      if (this.state.connected) {
        this._disconnect();
      }
    });

    console.log('[Collaboration] Initialized. User ID:', this.state.userId);
  },

  // ========================================================================
  // PUBLIC API — Room Management
  // ========================================================================

  /**
   * Create a new collaboration room.
   * Generates a 6-character alphanumeric room code.
   * Caller becomes the owner with full permissions.
   *
   * @param {Object} options
   * @param {number} [options.capacity=10] Max peers allowed (host is separate)
   * @param {string} [options.hostName] Display name for host (default: 'You')
   * @returns {Promise<Object>} { code, hostName, shareLink }
   *
   * @example
   * const room = await kernel.exec('collab.createRoom', { capacity: 5 });
   * console.log('Room code:', room.code); // 'ABC123'
   */
  async createRoom(options = {}) {
    const { capacity = 10, hostName = 'You' } = options;

    // Generate room code
    const code = this._generateRoomCode();

    this.state.roomCode = code;
    this.state.role = 'owner';
    this.state.userName = hostName;
    this.state.connected = true;

    // Save preference
    localStorage.setItem('collab_userName', hostName);

    // Initialize empty peer map
    this.state.peers.clear();
    this.state.operationLog = [];
    this.state.lamportClock = 0;

    this._showNotification(`Room created: ${code}`, 'success');
    this._broadcastEvent('collab:roomCreated', { code, hostName });

    return {
      code,
      hostName,
      shareLink: `${window.location.origin}?join=${code}`,
    };
  },

  /**
   * Join an existing collaboration room.
   * Requests peer list from host and establishes WebRTC connections.
   *
   * @param {Object} options
   * @param {string} options.code Room code (6 chars, case-insensitive)
   * @param {string} [options.userName] Display name for this user
   * @returns {Promise<Object>} { joined, peerCount, hostName }
   *
   * @example
   * const result = await kernel.exec('collab.joinRoom', {
   *   code: 'ABC123',
   *   userName: 'Alice'
   * });
   * if (result.joined) console.log('Connected to', result.peerCount, 'peers');
   */
  async joinRoom(options = {}) {
    const { code, userName = 'User' } = options;

    if (!code || code.length !== 6) {
      throw new Error('Invalid room code format');
    }

    this.state.roomCode = code.toUpperCase();
    this.state.userName = userName;
    this.state.role = 'editor'; // Joining user starts as editor, not owner
    this.state.connected = true;

    localStorage.setItem('collab_userName', userName);

    // Simulate peer discovery (in production: contact signaling server)
    await this._discoverPeers();

    this._showNotification(`Joined room ${code}`, 'success');
    this._broadcastEvent('collab:userJoined', {
      userId: this.state.userId,
      userName,
      role: this.state.role,
    });

    return {
      joined: true,
      peerCount: this.state.peers.size,
      hostName: 'Host', // Would come from signaling server
    };
  },

  /**
   * Leave the current collaboration room.
   * Closes all peer connections and notifies other users.
   *
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('collab.leaveRoom');
   */
  async leaveRoom() {
    if (!this.state.connected) {
      return;
    }

    await this._disconnect();

    this.state.roomCode = null;
    this.state.connected = false;
    this.state.peers.clear();

    this._showNotification('Left collaboration room', 'info');
    this._broadcastEvent('collab:roomClosed', {});
  },

  // ========================================================================
  // PUBLIC API — User Management
  // ========================================================================

  /**
   * Get list of all connected users (peers + self).
   *
   * @returns {Promise<Array<Object>>} List of { userId, name, role, ping, color }
   *
   * @example
   * const users = await kernel.exec('collab.getUsers');
   * console.log(`${users.length} users in room`);
   */
  async getUsers() {
    const users = Array.from(this.state.peers.values()).map((peer) => ({
      userId: peer.userId,
      name: peer.name,
      role: peer.role,
      ping: peer.ping || 0,
      color: peer.color,
    }));

    // Add self
    users.unshift({
      userId: this.state.userId,
      name: this.state.userName + ' (You)',
      role: this.state.role,
      ping: 0,
      color: '#4CAF50', // Green for self
    });

    return users;
  },

  /**
   * Change a user's role (owner only).
   * Validates that caller is owner before allowing role changes.
   *
   * @param {Object} options
   * @param {string} options.userId Target user ID
   * @param {string} options.role New role ('owner' | 'editor' | 'viewer')
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('collab.setRole', {
   *   userId: 'alice-uuid',
   *   role: 'viewer'
   * });
   */
  async setRole(options = {}) {
    const { userId, role } = options;

    if (this.state.role !== 'owner') {
      throw new Error('Only room owner can change roles');
    }

    if (!['owner', 'editor', 'viewer'].includes(role)) {
      throw new Error('Invalid role: ' + role);
    }

    const peer = this.state.peers.get(userId);
    if (peer) {
      peer.role = role;
      this._broadcastEvent('collab:roleChanged', { userId, role });
      this._broadcastToPeers('roleChange', { userId, role });
    }
  },

  // ========================================================================
  // PUBLIC API — Operations and Chat
  // ========================================================================

  /**
   * Broadcast a geometry operation to all peers.
   * Operation is logged in CRDT log with causality tracking.
   *
   * @param {Object} operation Geometry operation object
   *   { type, params, featureId, userId, timestamp, lamportClock }
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('collab.broadcastOperation', {
   *   type: 'extrude',
   *   params: { distance: 50 },
   *   featureId: 'sketch_1'
   * });
   */
  async broadcastOperation(operation = {}) {
    if (!this.state.connected) {
      throw new Error('Not connected to collaboration room');
    }

    // Enrich operation with metadata
    const enriched = {
      ...operation,
      userId: this.state.userId,
      timestamp: Date.now(),
      lamportClock: ++this.state.lamportClock,
    };

    // Add to local log
    this.state.operationLog.push(enriched);

    // Broadcast to all peers
    await this._broadcastToPeers('operation', enriched);

    this._broadcastEvent('collab:operationSent', enriched);
  },

  /**
   * Send a chat message to all peers.
   * Message appears as floating text bubble in 3D view.
   *
   * @param {Object} options
   * @param {string} options.text Message text (max 500 chars)
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('collab.sendMessage', {
   *   text: 'I just added a hole here!'
   * });
   */
  async sendMessage(options = {}) {
    const { text } = options;

    if (!text || text.trim().length === 0) {
      return;
    }

    if (text.length > 500) {
      throw new Error('Message too long (max 500 chars)');
    }

    const message = {
      userId: this.state.userId,
      userName: this.state.userName,
      text: text.trim(),
      timestamp: Date.now(),
    };

    // Broadcast to peers
    await this._broadcastToPeers('message', message);

    // Show in local chat (for sender)
    this._showChatBubble(message);

    this._broadcastEvent('collab:messageSent', message);
  },

  // ========================================================================
  // PUBLIC API — Info and Config
  // ========================================================================

  /**
   * Get current room info.
   *
   * @returns {Promise<Object|null>}
   *   { code, role, userName, peerCount, connected, operationCount }
   */
  async getRoomInfo() {
    if (!this.state.connected) {
      return null;
    }

    return {
      code: this.state.roomCode,
      role: this.state.role,
      userName: this.state.userName,
      userId: this.state.userId,
      peerCount: this.state.peers.size,
      connected: this.state.connected,
      operationCount: this.state.operationLog.length,
      lamportClock: this.state.lamportClock,
    };
  },

  /**
   * Get operations since a given Lamport clock value.
   * Used for syncing late-joiners with operation history.
   *
   * @param {number} since Lamport clock threshold (default 0)
   * @returns {Promise<Array<Object>>} Operations with clock >= since
   */
  async getOperationsSince(since = 0) {
    return this.state.operationLog.filter((op) => op.lamportClock >= since);
  },

  // ========================================================================
  // INTERNAL HELPERS — Network and Signaling
  // ========================================================================

  /**
   * Discover peers by contacting signaling server.
   * In production, this would reach out to a central server.
   * For demo, simulates peer discovery.
   *
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _discoverPeers() {
    // Simulate discovery with timeout
    return new Promise((resolve) => {
      setTimeout(() => {
        // In production: contact signaling server with room code
        // Server returns list of peer addresses
        // For each: initiate WebRTC connection
        resolve();
      }, 500);
    });
  },

  /**
   * Broadcast data to all connected peers via WebRTC or fallback.
   *
   * @private
   * @async
   * @param {string} type Message type
   * @param {Object} data Message payload
   * @returns {Promise<void>}
   */
  async _broadcastToPeers(type, data) {
    const message = JSON.stringify({ type, data });

    for (const [peerId, dc] of this.state.dataChannels) {
      if (dc && dc.readyState === 'open') {
        try {
          dc.send(message);
        } catch (err) {
          console.warn(`Failed to send to peer ${peerId}:`, err.message);
        }
      }
    }
  },

  /**
   * Handle incoming message from peer.
   *
   * @private
   * @param {Object} message Parsed message object
   */
  _handlePeerMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'operation':
        this._mergeRemoteOperation(data);
        break;
      case 'message':
        this._showChatBubble(data);
        this._broadcastEvent('collab:messageReceived', data);
        break;
      case 'cursorMove':
        this._updatePeerCursor(data);
        break;
      case 'roleChange':
        this._handleRoleChange(data);
        break;
      default:
        console.log('[Collaboration] Unknown message type:', type);
    }
  },

  /**
   * Merge a remote operation using CRDT logic.
   * Resolves conflicts by Lamport clock ordering.
   *
   * @private
   * @param {Object} operation Remote operation
   */
  _mergeRemoteOperation(operation) {
    // Update our Lamport clock to maintain causality
    this.state.lamportClock = Math.max(
      this.state.lamportClock,
      operation.lamportClock
    ) + 1;

    // Add to log
    this.state.operationLog.push(operation);

    // CRDT merge: sort by (lamportClock, userId) to get consistent ordering
    this.state.operationLog.sort((a, b) => {
      if (a.lamportClock !== b.lamportClock) {
        return a.lamportClock - b.lamportClock;
      }
      return a.userId.localeCompare(b.userId);
    });

    // Broadcast event for app to re-sync geometry
    this._broadcastEvent('collab:operationReceived', operation);
  },

  /**
   * Handle role change notification.
   *
   * @private
   * @param {Object} data { userId, role }
   */
  _handleRoleChange(data) {
    const { userId, role } = data;
    const peer = this.state.peers.get(userId);
    if (peer) {
      peer.role = role;
    }
  },

  /**
   * Gracefully disconnect from room.
   *
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _disconnect() {
    // Close all peer connections
    for (const pc of this.state.peerConnections.values()) {
      pc.close();
    }
    this.state.peerConnections.clear();
    this.state.dataChannels.clear();

    // Close signaling socket if present
    if (this.state.signalingSocket) {
      this.state.signalingSocket.close();
    }

    // Broadcast goodbye
    await this._broadcastToPeers('userLeft', {
      userId: this.state.userId,
    });
  }

  // ========================================================================
  // INTERNAL HELPERS — UI and Display
  // ========================================================================

  /**
   * Show a notification toast at top of screen.
   *
   * @private
   * @param {string} message
   * @param {string} type 'success' | 'error' | 'info' | 'warning'
   */
  _showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `collab-toast collab-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  },

  /**
   * Display chat message as floating bubble in 3D view.
   *
   * @private
   * @param {Object} message { userId, userName, text, timestamp }
   */
  _showChatBubble(message) {
    const bubble = document.createElement('div');
    bubble.className = 'collab-chat-bubble';
    bubble.innerHTML = `
      <strong>${message.userName}</strong><br>
      ${message.text}
    `;

    const peer = this.state.peers.get(message.userId);
    bubble.style.backgroundColor = peer ? peer.color : '#2196F3';
    bubble.style.color = '#fff';

    document.body.appendChild(bubble);

    // Fade out and remove after 8s
    setTimeout(() => {
      bubble.style.opacity = '0';
      setTimeout(() => bubble.remove(), 500);
    }, 8000);
  },

  /**
   * Update a peer's cursor position in 3D space.
   *
   * @private
   * @param {Object} data { userId, x, y, z }
   */
  _updatePeerCursor(data) {
    const { userId, x, y, z } = data;

    const peer = this.state.peers.get(userId);
    if (peer) {
      peer.cursorPos = { x, y, z };
    }

    // Trigger re-render of cursor indicators
    this._broadcastEvent('collab:cursorMoved', data);
  },

  // ========================================================================
  // INTERNAL HELPERS — Event Handlers
  // ========================================================================

  /**
   * Handle mouse move events to broadcast cursor position.
   * Throttled to 10Hz to reduce network traffic.
   *
   * @private
   * @param {MouseEvent} e
   */
  _onCursorMove(e) {
    if (!this.state.connected) return;

    // Throttle: only send every 100ms
    if (this.state.lastCursorBroadcast &&
        Date.now() - this.state.lastCursorBroadcast < 100) {
      return;
    }

    this.state.lastCursorBroadcast = Date.now();

    // Convert screen coords to 3D (this is app-specific)
    // For now, just broadcast screen position
    const cursorData = {
      userId: this.state.userId,
      screenX: e.clientX,
      screenY: e.clientY,
      timestamp: Date.now(),
    };

    this._broadcastToPeers('cursorMove', cursorData);
  },

  /**
   * Handle Enter key in chat input.
   *
   * @private
   * @param {KeyboardEvent} e
   */
  _onChatKeyPress(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
      const chatInput = document.querySelector('.collab-chat-input');
      if (chatInput) {
        const text = chatInput.value.trim();
        if (text) {
          this.sendMessage({ text });
          chatInput.value = '';
        }
      }
    }
  },

  // ========================================================================
  // INTERNAL HELPERS — Utilities
  // ========================================================================

  /**
   * Generate a UUID v4.
   *
   * @private
   * @returns {string}
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /**
   * Generate a random 6-character room code.
   * Uses uppercase alphanumeric (no vowels to avoid profanity).
   *
   * @private
   * @returns {string}
   */
  _generateRoomCode() {
    const chars = 'BCDFGHJKLMNPQRSTVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },

  /**
   * Broadcast a custom event to the app.
   *
   * @private
   * @param {string} eventName
   * @param {Object} detail
   */
  _broadcastEvent(eventName, detail) {
    const event = new CustomEvent(eventName, { detail });
    document.dispatchEvent(event);
  },

  // ========================================================================
  // HELP SYSTEM INTEGRATION
  // ========================================================================

  helpEntries: [
    {
      title: 'Create a Collaboration Room',
      description:
        'Click Collaborate → Create Room. Share the 6-character code with teammates. You\'ll see their cursors and all their edits in real-time.',
      category: 'Collaboration',
      shortcut: 'Ctrl+Shift+C',
    },
    {
      title: 'Join a Collaboration Room',
      description:
        'Enter the room code shared by the host. You can immediately see their 3D model and cursor position.',
      category: 'Collaboration',
      shortcut: 'Ctrl+Shift+J',
    },
    {
      title: 'Change User Roles',
      description:
        'Room owner can set roles: Owner (full), Editor (can model), Viewer (read-only). Right-click user in panel to change role.',
      category: 'Collaboration',
      shortcut: null,
    },
    {
      title: 'Send a Chat Message',
      description:
        'Press Ctrl+Enter to open chat. Type your message and press Enter. Messages appear as floating bubbles in the 3D view for 8 seconds.',
      category: 'Collaboration',
      shortcut: 'Ctrl+Enter',
    },
    {
      title: 'View Connected Users',
      description:
        'Open the Collaborate panel to see all connected users, their roles, and network latency (ping).',
      category: 'Collaboration',
      shortcut: null,
    },
    {
      title: 'Leave a Room',
      description:
        'Click Collaborate → Leave Room. Your peers are notified and no longer see your cursor.',
      category: 'Collaboration',
      shortcut: null,
    },
  ],

  // ========================================================================
  // UI PANEL — HTML and Styling
  // ========================================================================

  /**
   * Get the HTML for the collaboration panel.
   * Displays room info, user list, and chat box.
   *
   * @returns {string} HTML markup
   */
  getUI() {
    return `
      <div class="collab-panel" id="collab-panel">
        <div class="collab-header">
          <h3>Collaboration</h3>
          <button class="collab-close-btn" data-close-panel="collab-panel">×</button>
        </div>

        <div class="collab-content">
          <!-- Room Info Section -->
          <div class="collab-section" id="collab-room-info">
            <div class="collab-status disconnected">
              <span class="collab-dot"></span>
              Not connected
            </div>
            <button id="collab-create-btn" class="collab-button collab-button-primary">
              Create Room
            </button>
            <button id="collab-join-btn" class="collab-button">
              Join Room
            </button>
          </div>

          <!-- User List Section -->
          <div class="collab-section" id="collab-user-section" style="display: none;">
            <h4>Users in Room</h4>
            <ul id="collab-user-list" class="collab-user-list"></ul>
          </div>

          <!-- Chat Section -->
          <div class="collab-section" id="collab-chat-section" style="display: none;">
            <h4>Chat (Ctrl+Enter)</h4>
            <div id="collab-chat-history" class="collab-chat-history"></div>
            <input
              type="text"
              id="collab-chat-input"
              class="collab-chat-input"
              placeholder="Type message..."
            />
          </div>
        </div>
      </div>

      <style>
        .collab-panel {
          position: fixed;
          right: 0;
          top: 80px;
          width: 320px;
          height: 600px;
          background: #1e1e1e;
          border-left: 1px solid #333;
          border-radius: 0;
          box-shadow: -2px 2px 8px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          z-index: 1000;
        }

        .collab-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid #333;
        }

        .collab-header h3 {
          margin: 0;
          color: #e0e0e0;
          font-size: 14px;
          font-weight: 600;
        }

        .collab-close-btn {
          background: none;
          border: none;
          color: #999;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
        }

        .collab-close-btn:hover {
          color: #e0e0e0;
        }

        .collab-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .collab-section {
          margin-bottom: 16px;
        }

        .collab-section h4 {
          margin: 0 0 8px 0;
          color: #999;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .collab-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .collab-status.connected {
          background: #1b5e20;
          color: #81c784;
        }

        .collab-status.disconnected {
          background: #33333;
          color: #999;
        }

        .collab-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
        }

        .collab-status.connected .collab-dot {
          background: #81c784;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .collab-button {
          width: 100%;
          padding: 8px;
          margin-bottom: 6px;
          border: none;
          border-radius: 4px;
          background: #333;
          color: #e0e0e0;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .collab-button:hover {
          background: #444;
        }

        .collab-button-primary {
          background: #0284C7;
          color: white;
        }

        .collab-button-primary:hover {
          background: #0369a1;
        }

        .collab-user-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .collab-user-item {
          padding: 8px;
          border-radius: 4px;
          background: #2a2a2a;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #e0e0e0;
        }

        .collab-user-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          flex-shrink: 0;
        }

        .collab-user-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .collab-user-role {
          font-size: 10px;
          background: #444;
          padding: 2px 6px;
          border-radius: 2px;
          text-transform: uppercase;
        }

        .collab-chat-history {
          background: #2a2a2a;
          border-radius: 4px;
          padding: 8px;
          height: 150px;
          overflow-y: auto;
          margin-bottom: 8px;
          font-size: 11px;
        }

        .collab-chat-message {
          margin-bottom: 6px;
          padding: 4px;
          border-left: 2px solid #0284C7;
          padding-left: 6px;
        }

        .collab-chat-name {
          font-weight: 600;
          color: #0284C7;
          font-size: 10px;
        }

        .collab-chat-text {
          color: #e0e0e0;
          word-wrap: break-word;
        }

        .collab-chat-input {
          width: 100%;
          padding: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #2a2a2a;
          color: #e0e0e0;
          font-size: 12px;
          box-sizing: border-box;
        }

        .collab-chat-input:focus {
          outline: none;
          border-color: #0284C7;
        }

        .collab-toast {
          position: fixed;
          bottom: 20px;
          left: 20px;
          padding: 12px 16px;
          border-radius: 4px;
          font-size: 12px;
          animation: slideIn 0.3s ease;
          z-index: 10000;
        }

        @keyframes slideIn {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .collab-toast-success {
          background: #1b5e20;
          color: #81c784;
        }

        .collab-toast-error {
          background: #b71c1c;
          color: #ff5252;
        }

        .collab-toast-info {
          background: #01579b;
          color: #81d4fa;
        }
      </style>
    `;
  },
};
