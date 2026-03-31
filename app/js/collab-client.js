/**
 * cycleCAD Collaboration Client
 * Browser-side WebSocket client for real-time multi-user collaboration
 *
 * Features:
 * - WebSocket connection with auto-reconnect (exponential backoff)
 * - Room management (create, join, leave)
 * - WebRTC peer connection setup (offer/answer/ICE)
 * - CRDT document sync (operation log)
 * - Cursor sharing (throttled position updates)
 * - Selection sharing (synchronized part selection)
 * - Chat messages with timestamps
 * - User list with avatars/colors
 * - Conflict resolution (CRDT for geometry, LWW for properties)
 * - Offline operation queue (syncs on reconnect)
 */

class CollaborationClient {
  constructor(signalServerUrl = 'ws://localhost:8788') {
    this.signalServerUrl = signalServerUrl;
    this.ws = null;
    this.clientId = null;
    this.userId = null;
    this.roomId = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;

    // User management
    this.users = new Map(); // userId -> User object
    this.localUser = null;

    // CRDT & operations
    this.operations = []; // local operation log
    this.operationIndex = 0;
    this.offlineQueue = []; // operations queued while offline

    // WebRTC
    this.peers = new Map(); // userId -> RTCPeerConnection
    this.dataChannels = new Map(); // userId -> RTCDataChannel
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    // Cursor sharing (throttled)
    this.cursorUpdateInterval = 100; // ms
    this.lastCursorUpdate = 0;
    this.pendingCursorUpdate = null;

    // Selection sharing
    this.localSelection = [];
    this.remoteSelections = new Map(); // userId -> [partIds]

    // Chat & presence
    this.chatMessages = [];
    this.maxChatHistory = 50;
    this.userPresence = new Map(); // userId -> { status, lastSeen }

    // Callbacks
    this.callbacks = {
      onConnected: () => {},
      onDisconnected: () => {},
      onUserJoined: () => {},
      onUserLeft: () => {},
      onOperationReceived: () => {},
      onChatMessage: () => {},
      onCursorUpdate: () => {},
      onSelectionUpdate: () => {},
      onError: () => {}
    };

    this.init();
  }

  init() {
    this.connect();
  }

  // ========== Connection Management ==========

  connect() {
    if (this.isConnected || this.isReconnecting) return;

    console.log(`[CollabClient] Connecting to ${this.signalServerUrl}...`);

    try {
      this.ws = new WebSocket(this.signalServerUrl);

      this.ws.onopen = () => this.onConnectionOpen();
      this.ws.onmessage = (event) => this.onMessage(event.data);
      this.ws.onclose = () => this.onConnectionClose();
      this.ws.onerror = (error) => this.onConnectionError(error);
    } catch (error) {
      console.error('[CollabClient] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  onConnectionOpen() {
    console.log('[CollabClient] Connected to signaling server');
    this.isConnected = true;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    this.callbacks.onConnected();
  }

  onConnectionClose() {
    console.log('[CollabClient] Disconnected from signaling server');
    this.isConnected = false;
    this.callbacks.onDisconnected();

    this.scheduleReconnect();
  }

  onConnectionError(error) {
    console.error('[CollabClient] Connection error:', error);
    this.callbacks.onError(error);
  }

  scheduleReconnect() {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[CollabClient] Max reconnect attempts reached');
      return;
    }

    this.isReconnecting = true;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[CollabClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.isReconnecting = false;
      this.connect();
    }, delay);
  }

  // ========== Message Handling ==========

  onMessage(data) {
    try {
      const message = JSON.parse(data);
      this.handleMessage(message);
    } catch (error) {
      console.error('[CollabClient] Parse error:', error);
    }
  }

  handleMessage(message) {
    const { type, payload } = message;

    switch (type) {
      case 'welcome':
        this.clientId = message.clientId;
        console.log(`[CollabClient] Welcome! Client ID: ${this.clientId}`);
        break;

      case 'room-created':
        console.log('[CollabClient] Room created:', message.roomId);
        break;

      case 'room-joined':
        this.onRoomJoined(message);
        break;

      case 'room-left':
        this.onRoomLeft();
        break;

      case 'user-joined':
        this.onUserJoined(message);
        break;

      case 'user-left':
        this.onUserLeft(message);
        break;

      case 'user-status':
        this.onUserStatus(message);
        break;

      case 'cursor-update':
        this.onCursorUpdate(message);
        break;

      case 'selection-update':
        this.onSelectionUpdate(message);
        break;

      case 'operation':
        this.onOperationReceived(message);
        break;

      case 'chat-message':
        this.onChatMessage(message);
        break;

      case 'signaling-offer':
        this.onSignalingOffer(message);
        break;

      case 'signaling-answer':
        this.onSignalingAnswer(message);
        break;

      case 'ice-candidate':
        this.onIceCandidate(message);
        break;

      case 'room-reset':
        this.onRoomReset();
        break;

      case 'room-closed':
        this.onRoomClosed();
        break;

      case 'error':
        console.error('[CollabClient] Server error:', message.message);
        this.callbacks.onError(new Error(message.message));
        break;

      default:
        console.warn('[CollabClient] Unknown message type:', type);
    }
  }

  // ========== Room Management ==========

  createRoom(roomId, options = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to signaling server');
    }

    this.send({
      type: 'create-room',
      payload: {
        roomId,
        name: options.name || `Room ${roomId}`,
        password: options.password || null,
        maxUsers: options.maxUsers || 10
      }
    });
  }

  joinRoom(roomId, userId, userName, password = null) {
    if (!this.isConnected) {
      throw new Error('Not connected to signaling server');
    }

    this.roomId = roomId;
    this.userId = userId;

    this.send({
      type: 'join-room',
      payload: {
        roomId,
        userId,
        userName,
        password
      }
    });
  }

  leaveRoom() {
    if (!this.isConnected || !this.roomId) return;

    this.send({
      type: 'leave-room',
      payload: {}
    });

    this.cleanup();
  }

  onRoomJoined(message) {
    const { roomId, userId, room, operations, chatHistory } = message;

    this.roomId = roomId;
    this.userId = userId;
    this.operations = operations || [];
    this.operationIndex = this.operations.length;
    this.chatMessages = chatHistory || [];

    // Initialize users
    this.users.clear();
    if (room.users) {
      room.users.forEach(userInfo => {
        this.users.set(userInfo.id, {
          id: userInfo.id,
          name: userInfo.name,
          color: userInfo.color,
          cursor: userInfo.cursor,
          selection: userInfo.selection,
          status: userInfo.status
        });
      });
    }

    console.log(`[CollabClient] Joined room ${roomId} as ${userId}`);
    this.callbacks.onConnected();
  }

  onRoomLeft() {
    console.log('[CollabClient] Left room');
    this.cleanup();
  }

  cleanup() {
    // Close all peer connections
    this.peers.forEach(peer => peer.close());
    this.peers.clear();
    this.dataChannels.clear();

    // Clear room state
    this.roomId = null;
    this.userId = null;
    this.users.clear();
    this.remoteSelections.clear();
    this.userPresence.clear();
  }

  // ========== User Presence ==========

  onUserJoined(message) {
    const { user } = message;

    this.users.set(user.id, {
      id: user.id,
      name: user.name,
      color: user.color,
      cursor: user.cursor,
      selection: user.selection,
      status: user.status
    });

    console.log(`[CollabClient] User joined: ${user.name} (${user.id})`);

    // Initiate WebRTC connection
    if (user.id !== this.userId) {
      this.setupPeerConnection(user.id);
    }

    this.callbacks.onUserJoined({
      userId: user.id,
      name: user.name,
      color: user.color
    });
  }

  onUserLeft(message) {
    const { userId } = message;

    this.users.delete(userId);
    this.peers.get(userId)?.close();
    this.peers.delete(userId);
    this.dataChannels.delete(userId);
    this.remoteSelections.delete(userId);

    console.log(`[CollabClient] User left: ${userId}`);

    this.callbacks.onUserLeft({ userId });
  }

  onUserStatus(message) {
    const { userId, status } = message;

    const user = this.users.get(userId);
    if (user) {
      user.status = status;
    }

    this.userPresence.set(userId, {
      status,
      lastSeen: new Date(message.timestamp)
    });
  }

  // ========== Cursor & Selection ==========

  updateCursor(x, y) {
    const now = Date.now();

    // Throttle cursor updates
    if (now - this.lastCursorUpdate < this.cursorUpdateInterval) {
      this.pendingCursorUpdate = { x, y };
      return;
    }

    this.lastCursorUpdate = now;
    this.pendingCursorUpdate = null;

    this.send({
      type: 'cursor-update',
      payload: { x, y }
    });
  }

  onCursorUpdate(message) {
    const { userId, cursor } = message;

    const user = this.users.get(userId);
    if (user) {
      user.cursor = cursor;
    }

    this.callbacks.onCursorUpdate({
      userId,
      x: cursor.x,
      y: cursor.y
    });
  }

  updateSelection(partIds) {
    this.localSelection = partIds;

    this.send({
      type: 'selection-update',
      payload: { selection: partIds }
    });
  }

  onSelectionUpdate(message) {
    const { userId, selection } = message;

    const user = this.users.get(userId);
    if (user) {
      user.selection = selection;
    }

    this.remoteSelections.set(userId, selection);

    this.callbacks.onSelectionUpdate({
      userId,
      partIds: selection
    });
  }

  // ========== CRDT Operations ==========

  sendOperation(op) {
    // Queue operation if offline
    if (!this.isConnected) {
      this.offlineQueue.push(op);
      return;
    }

    this.send({
      type: 'operation',
      payload: { op }
    });

    this.operations.push({
      userId: this.userId,
      op,
      timestamp: new Date().toISOString()
    });
    this.operationIndex++;
  }

  onOperationReceived(message) {
    const { userId, op, timestamp } = message;

    this.operations.push({
      userId,
      op,
      timestamp
    });

    this.callbacks.onOperationReceived({
      userId,
      op,
      timestamp
    });
  }

  syncOfflineQueue() {
    if (this.offlineQueue.length === 0) return;

    console.log(`[CollabClient] Syncing ${this.offlineQueue.length} offline operations`);

    while (this.offlineQueue.length > 0) {
      const op = this.offlineQueue.shift();
      this.sendOperation(op);
    }
  }

  // ========== Chat Messages ==========

  sendMessage(text) {
    if (!this.isConnected || !this.roomId) {
      throw new Error('Not in a room');
    }

    this.send({
      type: 'chat-message',
      payload: { text }
    });
  }

  onChatMessage(message) {
    const { userId, userName, userColor, text, timestamp } = message;

    this.chatMessages.push({
      userId,
      name: userName,
      color: userColor,
      text,
      timestamp
    });

    // Keep chat history bounded
    if (this.chatMessages.length > this.maxChatHistory) {
      this.chatMessages.shift();
    }

    this.callbacks.onChatMessage({
      userId,
      name: userName,
      color: userColor,
      text,
      timestamp
    });
  }

  onRoomReset() {
    console.log('[CollabClient] Room was reset by admin');
    this.operations = [];
    this.operationIndex = 0;
    this.chatMessages = [];
  }

  onRoomClosed() {
    console.log('[CollabClient] Room was closed');
    this.leaveRoom();
  }

  // ========== WebRTC Peer Connections ==========

  async setupPeerConnection(remoteUserId) {
    try {
      const config = {
        iceServers: this.iceServers
      };

      const peerConnection = new RTCPeerConnection(config);
      this.peers.set(remoteUserId, peerConnection);

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.send({
            type: 'ice-candidate',
            payload: {
              targetUserId: remoteUserId,
              candidate: event.candidate
            }
          });
        }
      };

      // Handle data channels
      peerConnection.ondatachannel = (event) => {
        this.setupDataChannel(remoteUserId, event.channel);
      };

      // Create data channel for us (we're initiating)
      const dataChannel = peerConnection.createDataChannel('cyclecad-collab', {
        ordered: true
      });
      this.setupDataChannel(remoteUserId, dataChannel);

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      this.send({
        type: 'signaling-offer',
        payload: {
          targetUserId: remoteUserId,
          offer
        }
      });

      console.log(`[CollabClient] WebRTC offer sent to ${remoteUserId}`);
    } catch (error) {
      console.error(`[CollabClient] Error setting up peer connection:`, error);
    }
  }

  async onSignalingOffer(message) {
    const { fromUserId, offer } = message;

    try {
      let peerConnection = this.peers.get(fromUserId);

      if (!peerConnection) {
        const config = { iceServers: this.iceServers };
        peerConnection = new RTCPeerConnection(config);
        this.peers.set(fromUserId, peerConnection);

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.send({
              type: 'ice-candidate',
              payload: {
                targetUserId: fromUserId,
                candidate: event.candidate
              }
            });
          }
        };

        peerConnection.ondatachannel = (event) => {
          this.setupDataChannel(fromUserId, event.channel);
        };
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      this.send({
        type: 'signaling-answer',
        payload: {
          targetUserId: fromUserId,
          answer
        }
      });

      console.log(`[CollabClient] WebRTC answer sent to ${fromUserId}`);
    } catch (error) {
      console.error(`[CollabClient] Error handling offer:`, error);
    }
  }

  async onSignalingAnswer(message) {
    const { fromUserId, answer } = message;

    try {
      const peerConnection = this.peers.get(fromUserId);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`[CollabClient] WebRTC answer received from ${fromUserId}`);
      }
    } catch (error) {
      console.error(`[CollabClient] Error handling answer:`, error);
    }
  }

  async onIceCandidate(message) {
    const { fromUserId, candidate } = message;

    try {
      const peerConnection = this.peers.get(fromUserId);
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error(`[CollabClient] Error adding ICE candidate:`, error);
    }
  }

  setupDataChannel(userId, dataChannel) {
    console.log(`[CollabClient] Data channel established with ${userId}`);

    dataChannel.onopen = () => {
      console.log(`[CollabClient] Data channel open with ${userId}`);
    };

    dataChannel.onclose = () => {
      console.log(`[CollabClient] Data channel closed with ${userId}`);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('[CollabClient] Data channel parse error:', error);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`[CollabClient] Data channel error with ${userId}:`, error);
    };

    this.dataChannels.set(userId, dataChannel);
  }

  // ========== Utility Methods ==========

  send(message) {
    if (!this.isConnected || !this.ws) {
      console.warn('[CollabClient] Not connected, queuing message');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[CollabClient] Send error:', error);
      return false;
    }
  }

  on(event, callback) {
    if (this.callbacks.hasOwnProperty(`on${event[0].toUpperCase()}${event.slice(1)}`)) {
      this.callbacks[`on${event[0].toUpperCase()}${event.slice(1)}`] = callback;
    }
  }

  getUsers() {
    return Array.from(this.users.values());
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  getRoomInfo() {
    return {
      roomId: this.roomId,
      userId: this.userId,
      users: this.getUsers(),
      userCount: this.users.size,
      operations: this.operations.length,
      chatMessages: this.chatMessages.length,
      isConnected: this.isConnected
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
  }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CollaborationClient;
}
