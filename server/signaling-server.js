#!/usr/bin/env node
/**
 * cycleCAD WebSocket Signaling Server
 * Real-time collaboration via WebRTC signaling, presence, and CRDT operation relay
 *
 * Features:
 * - Room management (create, join, leave, list)
 * - WebRTC signaling (offer, answer, ICE candidates)
 * - User presence (cursor position, selection, online status)
 * - CRDT operation relay (broadcast ops to all peers in room)
 * - Chat messages with timestamps
 * - Room capacity limits (max 10 users per room)
 * - Heartbeat/ping-pong for connection health
 * - Graceful reconnection with state recovery
 * - Rate limiting (100 messages/sec per client)
 * - Room state persistence (auto-save to disk)
 */

const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8788;
const MAX_USERS_PER_ROOM = 10;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 100; // messages per second
const STATE_SAVE_INTERVAL = 5000; // auto-save every 5 seconds
const STATE_FILE = path.join(__dirname, 'rooms-state.json');

// Data structures
const rooms = new Map(); // roomId -> Room object
const clients = new Map(); // clientId -> Client object
let clientCounter = 0;

// Express app for HTTP endpoints
const app = express();
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// ========== Room Management ==========

class Room {
  constructor(roomId, options = {}) {
    this.id = roomId;
    this.name = options.name || `Room ${roomId}`;
    this.password = options.password || null;
    this.users = new Map(); // userId -> User object
    this.operations = []; // CRDT operations log
    this.chatHistory = []; // chat messages
    this.createdAt = new Date();
    this.maxUsers = options.maxUsers || MAX_USERS_PER_ROOM;
    this.isPrivate = !!options.password;
  }

  addUser(userId, user) {
    if (this.users.size >= this.maxUsers) {
      throw new Error(`Room ${this.id} is full (max ${this.maxUsers} users)`);
    }
    this.users.set(userId, user);
    return user;
  }

  removeUser(userId) {
    this.users.delete(userId);
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  getUsers() {
    return Array.from(this.users.values());
  }

  broadcast(message, excludeUserId = null) {
    this.users.forEach((user, userId) => {
      if (excludeUserId && userId === excludeUserId) return;
      user.send(message);
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      userCount: this.users.size,
      maxUsers: this.maxUsers,
      isPrivate: this.isPrivate,
      createdAt: this.createdAt,
      users: this.getUsers().map(u => u.toJSON()),
      operationCount: this.operations.length,
      chatCount: this.chatHistory.length
    };
  }
}

class User {
  constructor(userId, clientId, name = `User ${userId}`) {
    this.id = userId;
    this.clientId = clientId;
    this.name = name;
    this.cursor = { x: 0, y: 0 };
    this.selection = [];
    this.color = generateUserColor();
    this.status = 'online';
    this.joinedAt = new Date();
    this.lastSeen = new Date();
    this.messageCount = 0;
  }

  send(message) {
    const client = clients.get(this.clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      cursor: this.cursor,
      selection: this.selection,
      status: this.status,
      joinedAt: this.joinedAt
    };
  }
}

class Client {
  constructor(ws, clientId) {
    this.ws = ws;
    this.id = clientId;
    this.userId = null;
    this.roomId = null;
    this.messageCount = 0;
    this.messageWindowStart = Date.now();
    this.isAlive = true;
    this.lastHeartbeat = Date.now();
  }

  checkRateLimit() {
    const now = Date.now();
    if (now - this.messageWindowStart > RATE_LIMIT_WINDOW) {
      this.messageCount = 0;
      this.messageWindowStart = now;
    }
    return this.messageCount++ < RATE_LIMIT_MAX;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      roomId: this.roomId,
      lastHeartbeat: this.lastHeartbeat
    };
  }
}

// ========== WebSocket Handlers ==========

wss.on('connection', (ws) => {
  const clientId = `client-${++clientCounter}`;
  const client = new Client(ws, clientId);
  clients.set(clientId, client);

  console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(client, message);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Parse error from ${clientId}:`, error.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      }));
    }
  });

  // Handle pong (heartbeat response)
  ws.on('pong', () => {
    client.isAlive = true;
    client.lastHeartbeat = Date.now();
  });

  // Handle client disconnect
  ws.on('close', () => {
    handleClientDisconnect(client);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] WebSocket error from ${clientId}:`, error.message);
  });
});

// ========== Message Handler ==========

function handleMessage(client, message) {
  const { type, payload } = message;

  // Rate limiting
  if (!client.checkRateLimit()) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Rate limit exceeded',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  console.log(`[${new Date().toISOString()}] Message from ${client.id}: ${type}`);

  switch (type) {
    case 'join-room':
      handleJoinRoom(client, payload);
      break;

    case 'create-room':
      handleCreateRoom(client, payload);
      break;

    case 'leave-room':
      handleLeaveRoom(client);
      break;

    case 'signaling-offer':
      handleSignalingOffer(client, payload);
      break;

    case 'signaling-answer':
      handleSignalingAnswer(client, payload);
      break;

    case 'ice-candidate':
      handleIceCandidate(client, payload);
      break;

    case 'cursor-update':
      handleCursorUpdate(client, payload);
      break;

    case 'selection-update':
      handleSelectionUpdate(client, payload);
      break;

    case 'operation':
      handleOperation(client, payload);
      break;

    case 'chat-message':
      handleChatMessage(client, payload);
      break;

    case 'user-status':
      handleUserStatus(client, payload);
      break;

    case 'ping':
      client.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;

    default:
      console.warn(`[${new Date().toISOString()}] Unknown message type: ${type}`);
  }
}

// ========== Room Management Handlers ==========

function handleCreateRoom(client, payload) {
  const { roomId, name, password, maxUsers } = payload;

  if (!roomId || typeof roomId !== 'string') {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid roomId',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (rooms.has(roomId)) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Room already exists',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  const room = new Room(roomId, { name, password, maxUsers });
  rooms.set(roomId, room);

  client.ws.send(JSON.stringify({
    type: 'room-created',
    roomId,
    room: room.toJSON(),
    timestamp: new Date().toISOString()
  }));

  console.log(`[${new Date().toISOString()}] Room created: ${roomId}`);
}

function handleJoinRoom(client, payload) {
  const { roomId, userId, userName, password } = payload;

  if (!roomId || !userId) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid roomId or userId',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  let room = rooms.get(roomId);

  // Auto-create room if it doesn't exist
  if (!room) {
    room = new Room(roomId, { name: `Room ${roomId}` });
    rooms.set(roomId, room);
  }

  // Check password if required
  if (room.password && room.password !== password) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid room password',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Check capacity
  if (room.users.size >= room.maxUsers) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: `Room is full (max ${room.maxUsers} users)`,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Leave previous room if in one
  if (client.roomId) {
    handleLeaveRoom(client);
  }

  // Create user and add to room
  const user = new User(userId, client.id, userName);
  room.addUser(userId, user);
  client.userId = userId;
  client.roomId = roomId;

  // Send confirmation to joining user
  client.ws.send(JSON.stringify({
    type: 'room-joined',
    roomId,
    userId,
    room: room.toJSON(),
    operations: room.operations.slice(-100), // Send last 100 ops for sync
    chatHistory: room.chatHistory.slice(-50), // Send last 50 messages
    timestamp: new Date().toISOString()
  }));

  // Broadcast user joined to room
  room.broadcast({
    type: 'user-joined',
    user: user.toJSON(),
    userCount: room.users.size,
    timestamp: new Date().toISOString()
  }, userId);

  console.log(`[${new Date().toISOString()}] User ${userId} joined room ${roomId}`);
}

function handleLeaveRoom(client) {
  if (!client.roomId) return;

  const room = rooms.get(client.roomId);
  if (!room) return;

  const userId = client.userId;
  room.removeUser(userId);

  // Broadcast user left
  room.broadcast({
    type: 'user-left',
    userId,
    userCount: room.users.size,
    timestamp: new Date().toISOString()
  });

  // Delete empty rooms after 5 minutes
  if (room.users.size === 0) {
    setTimeout(() => {
      if (room.users.size === 0) {
        rooms.delete(client.roomId);
        console.log(`[${new Date().toISOString()}] Room deleted: ${client.roomId}`);
      }
    }, 300000);
  }

  client.roomId = null;
  client.userId = null;

  client.ws.send(JSON.stringify({
    type: 'room-left',
    timestamp: new Date().toISOString()
  }));

  console.log(`[${new Date().toISOString()}] User ${userId} left room ${room.id}`);
}

// ========== Real-time Handlers ==========

function handleSignalingOffer(client, payload) {
  const { targetUserId, offer } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  const targetUser = room.getUser(targetUserId);
  if (!targetUser) return;

  targetUser.send({
    type: 'signaling-offer',
    fromUserId: client.userId,
    offer,
    timestamp: new Date().toISOString()
  });
}

function handleSignalingAnswer(client, payload) {
  const { targetUserId, answer } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  const targetUser = room.getUser(targetUserId);
  if (!targetUser) return;

  targetUser.send({
    type: 'signaling-answer',
    fromUserId: client.userId,
    answer,
    timestamp: new Date().toISOString()
  });
}

function handleIceCandidate(client, payload) {
  const { targetUserId, candidate } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  const targetUser = room.getUser(targetUserId);
  if (!targetUser) return;

  targetUser.send({
    type: 'ice-candidate',
    fromUserId: client.userId,
    candidate,
    timestamp: new Date().toISOString()
  });
}

function handleCursorUpdate(client, payload) {
  const { x, y } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  const user = room.getUser(client.userId);
  if (!user) return;

  user.cursor = { x, y };

  room.broadcast({
    type: 'cursor-update',
    userId: client.userId,
    cursor: { x, y },
    timestamp: new Date().toISOString()
  }, client.userId);
}

function handleSelectionUpdate(client, payload) {
  const { selection } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  const user = room.getUser(client.userId);
  if (!user) return;

  user.selection = selection || [];

  room.broadcast({
    type: 'selection-update',
    userId: client.userId,
    selection: user.selection,
    timestamp: new Date().toISOString()
  }, client.userId);
}

function handleOperation(client, payload) {
  const { op } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  // Add operation to log
  room.operations.push({
    userId: client.userId,
    op,
    timestamp: new Date().toISOString()
  });

  // Broadcast to room
  room.broadcast({
    type: 'operation',
    userId: client.userId,
    op,
    timestamp: new Date().toISOString()
  }, client.userId);
}

function handleChatMessage(client, payload) {
  const { text } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  const user = room.getUser(client.userId);
  if (!user) return;

  user.messageCount++;

  const message = {
    userId: client.userId,
    userName: user.name,
    userColor: user.color,
    text,
    timestamp: new Date().toISOString()
  };

  room.chatHistory.push(message);

  // Broadcast to room
  room.broadcast({
    type: 'chat-message',
    ...message
  });
}

function handleUserStatus(client, payload) {
  const { status } = payload;
  const room = rooms.get(client.roomId);
  if (!room) return;

  const user = room.getUser(client.userId);
  if (!user) return;

  user.status = status;
  user.lastSeen = new Date();

  room.broadcast({
    type: 'user-status',
    userId: client.userId,
    status,
    timestamp: new Date().toISOString()
  });
}

function handleClientDisconnect(client) {
  console.log(`[${new Date().toISOString()}] Client disconnected: ${client.id}`);

  if (client.roomId) {
    handleLeaveRoom(client);
  }

  clients.delete(client.id);
}

// ========== Heartbeat ==========

function startHeartbeat() {
  setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((ws) => {
      const client = Array.from(clients.values()).find(c => c.ws === ws);
      if (!client) return;

      if (!client.isAlive) {
        return ws.terminate();
      }

      client.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);
}

// ========== State Persistence ==========

function saveRoomState() {
  const state = {
    timestamp: new Date().toISOString(),
    rooms: Array.from(rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      password: room.password,
      maxUsers: room.maxUsers,
      createdAt: room.createdAt,
      users: room.getUsers().map(u => u.toJSON()),
      operations: room.operations,
      chatHistory: room.chatHistory
    }))
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadRoomState() {
  if (!fs.existsSync(STATE_FILE)) return;

  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    // Restore rooms without users (users must rejoin)
    state.rooms.forEach(roomData => {
      const room = new Room(roomData.id, {
        name: roomData.name,
        password: roomData.password,
        maxUsers: roomData.maxUsers
      });
      room.operations = roomData.operations || [];
      room.chatHistory = roomData.chatHistory || [];
      rooms.set(room.id, room);
    });
    console.log(`[${new Date().toISOString()}] Loaded ${rooms.size} rooms from state file`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading room state:`, error.message);
  }
}

setInterval(saveRoomState, STATE_SAVE_INTERVAL);

// ========== HTTP Endpoints ==========

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    clients: clients.size,
    rooms: rooms.size
  });
});

app.get('/stats', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    clients: clients.size,
    rooms: rooms.size,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => room.toJSON());
  res.json({
    timestamp: new Date().toISOString(),
    count: roomList.length,
    rooms: roomList
  });
});

app.get('/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    timestamp: new Date().toISOString(),
    room: room.toJSON()
  });
});

app.post('/rooms/:roomId/reset', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Notify users before reset
  room.broadcast({
    type: 'room-reset',
    timestamp: new Date().toISOString()
  });

  room.operations = [];
  room.chatHistory = [];

  res.json({
    timestamp: new Date().toISOString(),
    message: 'Room reset successful'
  });
});

app.post('/rooms/:roomId/close', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  room.broadcast({
    type: 'room-closed',
    timestamp: new Date().toISOString()
  });

  rooms.delete(req.params.roomId);

  res.json({
    timestamp: new Date().toISOString(),
    message: 'Room closed'
  });
});

// ========== Utility Functions ==========

function generateUserColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#D5A6BD'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ========== Server Startup ==========

function start() {
  loadRoomState();
  startHeartbeat();

  server.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`cycleCAD WebSocket Signaling Server v1.0.0`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Server listening on port ${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
    console.log(`HTTP Health: http://localhost:${PORT}/health`);
    console.log(`HTTP Stats: http://localhost:${PORT}/stats`);
    console.log(`HTTP Rooms: http://localhost:${PORT}/rooms`);
    console.log(`${'='.repeat(60)}\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n[${new Date().toISOString()}] Shutting down gracefully...`);
    saveRoomState();

    // Notify all clients
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'server-shutdown',
          message: 'Server is shutting down',
          timestamp: new Date().toISOString()
        }));
      }
    });

    wss.close(() => {
      console.log(`[${new Date().toISOString()}] Server closed`);
      process.exit(0);
    });
  });
}

start();

module.exports = { rooms, clients, Room, User, Client };
