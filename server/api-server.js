#!/usr/bin/env node

/**
 * cycleCAD API Server v0.2.0
 *
 * REST API server for cycleCAD that exposes the Agent API via HTTP.
 * Enables any language/platform to drive cycleCAD through JSON-RPC style endpoints.
 *
 * Features:
 * - POST /api/execute — Execute single Agent API command
 * - GET /api/schema — Introspect full API schema
 * - POST /api/batch — Execute multiple commands
 * - GET /api/history — View command history
 * - GET /api/health — Health check
 * - WebSocket /api/ws — Bidirectional real-time connection
 * - Static file serving for cycleCAD web app
 * - Rate limiting (100 req/min per IP)
 * - API key authentication (optional)
 *
 * Zero external dependencies — uses only Node.js built-ins.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.CYCLECAD_API_KEY || null;  // Optional auth
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '../app');
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';
const CERT_FILE = process.env.CERT_FILE || '';
const KEY_FILE = process.env.KEY_FILE || '';
const DEV_MODE = process.argv.includes('--dev');

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();  // ip -> [timestamps]
  }

  isAllowed(ip) {
    const now = Date.now();
    if (!this.requests.has(ip)) {
      this.requests.set(ip, []);
    }

    const timestamps = this.requests.get(ip);

    // Remove old entries outside the window
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
    this.requests.set(ip, validTimestamps);

    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    return true;
  }

  remaining(ip) {
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
    return Math.max(0, this.maxRequests - validTimestamps.length);
  }
}

const limiter = new RateLimiter(100, 60000);

// ============================================================================
// API SERVER STATE
// ============================================================================

class APIServer extends EventEmitter {
  constructor() {
    super();
    this.sessionId = crypto.randomUUID();
    this.startTime = Date.now();
    this.commandLog = [];
    this.features = [];
    this.models = [];
    this.wsClients = new Set();
    this.tokenBuckets = new Map();  // IP -> { tokens, lastRefill }
  }

  executeCommand(cmd) {
    const start = performance.now();

    try {
      if (!cmd || !cmd.method) {
        return this._err('Missing "method" field in command');
      }

      const handler = AGENT_COMMANDS[cmd.method];
      if (!handler) {
        const suggestions = this._suggestMethod(cmd.method);
        return this._err(
          `Unknown method: "${cmd.method}".` +
          (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '') +
          ` Use GET /api/schema to see available commands.`
        );
      }

      const result = handler.call(this, cmd.params || {});
      const elapsed = Math.round(performance.now() - start);

      // Log command
      const entry = {
        id: `cmd_${this.commandLog.length}`,
        method: cmd.method,
        params: cmd.params,
        elapsed,
        ok: true,
        timestamp: new Date().toISOString(),
        result: typeof result === 'object' ? Object.keys(result).slice(0, 3) : String(result).slice(0, 100)
      };
      this.commandLog.push(entry);

      // Broadcast to WebSocket clients
      this._broadcastWS({
        type: 'commandExecuted',
        method: cmd.method,
        elapsed,
        ok: true
      });

      return {
        ok: true,
        result,
        elapsed,
        sessionId: this.sessionId
      };
    } catch (e) {
      const elapsed = Math.round(performance.now() - start);
      const entry = {
        id: `cmd_${this.commandLog.length}`,
        method: cmd.method,
        params: cmd.params,
        elapsed,
        ok: false,
        error: e.message,
        timestamp: new Date().toISOString()
      };
      this.commandLog.push(entry);

      this._broadcastWS({
        type: 'commandFailed',
        method: cmd.method,
        error: e.message,
        elapsed
      });

      return this._err(e.message, elapsed);
    }
  }

  executeBatch(commands) {
    const results = [];
    const errors = [];
    const start = performance.now();

    for (let i = 0; i < commands.length; i++) {
      const r = this.executeCommand(commands[i]);
      results.push(r);
      if (!r.ok) {
        errors.push({ index: i, method: commands[i].method, error: r.error });
      }
    }

    const elapsed = Math.round(performance.now() - start);

    return {
      ok: errors.length === 0,
      results,
      errors,
      executed: results.length - errors.length,
      total: commands.length,
      elapsed,
      sessionId: this.sessionId
    };
  }

  getSchema() {
    const schema = {};

    for (const [method, handler] of Object.entries(AGENT_COMMANDS)) {
      const [namespace, command] = method.split('.');
      if (!schema[namespace]) {
        schema[namespace] = { description: NAMESPACE_DESCRIPTIONS[namespace] || '', commands: {} };
      }

      schema[namespace].commands[command] = {
        method,
        description: handler.description || 'No description',
        params: handler.params || {},
        returns: handler.returns || {}
      };
    }

    return {
      version: '0.2.0',
      sessionId: this.sessionId,
      namespaces: schema,
      totalCommands: Object.keys(AGENT_COMMANDS).length
    };
  }

  getHistory(count = 20) {
    return {
      sessionId: this.sessionId,
      total: this.commandLog.length,
      recent: this.commandLog.slice(-count),
      timestamp: new Date().toISOString()
    };
  }

  getHealth() {
    return {
      status: 'ok',
      version: '0.2.0',
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      sessionId: this.sessionId,
      commands: Object.keys(AGENT_COMMANDS).length,
      commandsExecuted: this.commandLog.length,
      features: this.features.length,
      models: this.models.length,
      wsClients: this.wsClients.size,
      timestamp: new Date().toISOString()
    };
  }

  addWSClient(ws) {
    this.wsClients.add(ws);
    return this.wsClients.size;
  }

  removeWSClient(ws) {
    this.wsClients.delete(ws);
    return this.wsClients.size;
  }

  _broadcastWS(message) {
    const data = JSON.stringify(message);
    for (const ws of this.wsClients) {
      try {
        ws.send(data);
      } catch (e) {
        // Silently ignore errors
      }
    }
  }

  _err(msg, elapsed = 0) {
    return {
      ok: false,
      error: msg,
      elapsed,
      sessionId: this.sessionId
    };
  }

  _suggestMethod(invalid) {
    const allMethods = Object.keys(AGENT_COMMANDS);
    const suggestions = allMethods
      .filter(m => this._editDistance(invalid, m) <= 3)
      .slice(0, 3);
    return suggestions;
  }

  _editDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    return matrix[b.length][a.length];
  }
}

const server = new APIServer();

// ============================================================================
// AGENT COMMANDS (Mock implementations for server-side)
// ============================================================================

const AGENT_COMMANDS = {
  // SKETCH commands
  'sketch.start': {
    description: 'Start a 2D sketch on a plane',
    params: { plane: 'string (XY|XZ|YZ)' },
    returns: { sketchId: 'string', plane: 'string', status: 'string' },
    handler(params) {
      const plane = params.plane || 'XY';
      if (!['XY', 'XZ', 'YZ'].includes(plane)) {
        throw new Error(`Invalid plane: ${plane}`);
      }
      return {
        sketchId: `sketch_${Date.now()}`,
        plane,
        status: 'active',
        message: `Sketch started on ${plane} plane`
      };
    }
  },

  'sketch.line': {
    description: 'Draw a line segment',
    params: { x1: 'number', y1: 'number', x2: 'number', y2: 'number' },
    returns: { entityId: 'string', type: 'string', length: 'number' },
    handler(params) {
      const dx = params.x2 - params.x1;
      const dy = params.y2 - params.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      return { entityId: `line_${Date.now()}`, type: 'line', length };
    }
  },

  'sketch.circle': {
    description: 'Draw a circle',
    params: { cx: 'number', cy: 'number', radius: 'number' },
    returns: { entityId: 'string', type: 'string', radius: 'number' },
    handler(params) {
      return {
        entityId: `circle_${Date.now()}`,
        type: 'circle',
        radius: params.radius,
        center: [params.cx, params.cy],
        area: Math.PI * params.radius * params.radius
      };
    }
  },

  'sketch.rect': {
    description: 'Draw a rectangle',
    params: { x: 'number', y: 'number', width: 'number', height: 'number' },
    returns: { entityId: 'string', type: 'string', area: 'number' },
    handler(params) {
      return {
        entityId: `rect_${Date.now()}`,
        type: 'rect',
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
        area: params.width * params.height
      };
    }
  },

  'sketch.end': {
    description: 'End the sketch',
    params: {},
    returns: { status: 'string', message: 'string' },
    handler(params) {
      return { status: 'complete', message: 'Sketch ended' };
    }
  },

  // OPERATIONS commands
  'ops.extrude': {
    description: 'Extrude a sketch into 3D',
    params: { height: 'number', symmetric: 'boolean', material: 'string' },
    returns: { featureId: 'string', type: 'string', volume: 'number' },
    handler(params) {
      const volume = params.height * 100;  // Mock calculation
      return {
        featureId: `extrude_${Date.now()}`,
        type: 'extrude',
        height: params.height,
        symmetric: params.symmetric || false,
        material: params.material || 'steel',
        volume
      };
    }
  },

  'ops.fillet': {
    description: 'Fillet edges of a feature',
    params: { target: 'string', radius: 'number' },
    returns: { featureId: 'string', radius: 'number' },
    handler(params) {
      return {
        featureId: `fillet_${Date.now()}`,
        target: params.target,
        radius: params.radius
      };
    }
  },

  'ops.chamfer': {
    description: 'Chamfer edges of a feature',
    params: { target: 'string', distance: 'number' },
    returns: { featureId: 'string', distance: 'number' },
    handler(params) {
      return {
        featureId: `chamfer_${Date.now()}`,
        target: params.target,
        distance: params.distance
      };
    }
  },

  'ops.hole': {
    description: 'Create a hole',
    params: { radius: 'number', depth: 'number' },
    returns: { featureId: 'string', radius: 'number', depth: 'number' },
    handler(params) {
      return {
        featureId: `hole_${Date.now()}`,
        radius: params.radius,
        depth: params.depth,
        type: 'hole'
      };
    }
  },

  'ops.pattern': {
    description: 'Create a rectangular or circular pattern',
    params: { target: 'string', type: 'string', count: 'number', spacing: 'number' },
    returns: { featureId: 'string', count: 'number' },
    handler(params) {
      return {
        featureId: `pattern_${Date.now()}`,
        target: params.target,
        type: params.type || 'rect',
        count: params.count,
        spacing: params.spacing
      };
    }
  },

  // VIEW commands
  'view.set': {
    description: 'Set viewport view (isometric, top, front, right, bottom, back, left)',
    params: { view: 'string' },
    returns: { view: 'string', message: 'string' },
    handler(params) {
      const validViews = ['isometric', 'top', 'front', 'right', 'bottom', 'back', 'left'];
      if (!validViews.includes(params.view)) {
        throw new Error(`Invalid view: ${params.view}`);
      }
      return { view: params.view, message: `View set to ${params.view}` };
    }
  },

  'view.grid': {
    description: 'Toggle grid visibility',
    params: { visible: 'boolean' },
    returns: { visible: 'boolean', message: 'string' },
    handler(params) {
      return {
        visible: params.visible !== false,
        message: `Grid ${params.visible !== false ? 'enabled' : 'disabled'}`
      };
    }
  },

  'view.wireframe': {
    description: 'Toggle wireframe mode',
    params: { enabled: 'boolean' },
    returns: { enabled: 'boolean', message: 'string' },
    handler(params) {
      return {
        enabled: params.enabled !== false,
        message: `Wireframe ${params.enabled !== false ? 'enabled' : 'disabled'}`
      };
    }
  },

  // EXPORT commands
  'export.stl': {
    description: 'Export to STL format',
    params: { filename: 'string', binary: 'boolean' },
    returns: { filename: 'string', format: 'string', message: 'string' },
    handler(params) {
      return {
        filename: params.filename || 'output.stl',
        format: params.binary ? 'binary' : 'ascii',
        bytes: Math.floor(Math.random() * 10000000),
        message: 'Export would save to file'
      };
    }
  },

  'export.obj': {
    description: 'Export to OBJ format',
    params: { filename: 'string' },
    returns: { filename: 'string', format: 'string' },
    handler(params) {
      return {
        filename: params.filename || 'output.obj',
        format: 'obj',
        message: 'Export would save to file'
      };
    }
  },

  'export.gltf': {
    description: 'Export to glTF format',
    params: { filename: 'string' },
    returns: { filename: 'string', format: 'string' },
    handler(params) {
      return {
        filename: params.filename || 'output.gltf',
        format: 'gltf',
        message: 'Export would save to file'
      };
    }
  },

  // QUERY commands
  'query.features': {
    description: 'List all features in the model',
    params: {},
    returns: { features: 'array', count: 'number' },
    handler(params) {
      return {
        features: server.features,
        count: server.features.length
      };
    }
  },

  'query.bbox': {
    description: 'Get bounding box of a feature',
    params: { target: 'string' },
    returns: { min: 'array', max: 'array', size: 'array' },
    handler(params) {
      return {
        target: params.target,
        min: [-50, -50, -50],
        max: [50, 50, 50],
        size: [100, 100, 100]
      };
    }
  },

  'query.materials': {
    description: 'List available materials',
    params: {},
    returns: { materials: 'array' },
    handler(params) {
      return {
        materials: ['steel', 'aluminum', 'brass', 'plastic', 'titanium', 'carbon-fiber', 'rubber', 'wood']
      };
    }
  },

  // VALIDATE commands
  'validate.dimensions': {
    description: 'Check feature dimensions',
    params: { target: 'string' },
    returns: { target: 'string', length: 'number', width: 'number', height: 'number' },
    handler(params) {
      return {
        target: params.target,
        length: 100,
        width: 50,
        height: 75,
        message: 'Dimensions OK'
      };
    }
  },

  'validate.cost': {
    description: 'Estimate manufacturing cost',
    params: { target: 'string', process: 'string', material: 'string' },
    returns: { target: 'string', process: 'string', estimatedCost: 'number' },
    handler(params) {
      const costMap = { 'FDM': 15, 'SLA': 25, 'CNC': 50, 'injection': 100 };
      const cost = costMap[params.process] || 20;
      return {
        target: params.target,
        process: params.process || 'FDM',
        material: params.material || 'PLA',
        estimatedCost: cost,
        currency: 'USD'
      };
    }
  },

  'validate.mass': {
    description: 'Calculate feature mass',
    params: { target: 'string', material: 'string' },
    returns: { target: 'string', mass: 'number', material: 'string' },
    handler(params) {
      const densities = { steel: 7.85, aluminum: 2.70, brass: 8.56, titanium: 4.5 };
      const density = densities[params.material] || 7.85;
      return {
        target: params.target,
        mass: Math.round(density * 100) / 100,
        unit: 'kg',
        material: params.material || 'steel'
      };
    }
  },

  // ASSEMBLY commands
  'assembly.addComponent': {
    description: 'Add a component to the assembly',
    params: { name: 'string', position: 'array' },
    returns: { componentId: 'string', name: 'string' },
    handler(params) {
      const comp = {
        id: `comp_${Date.now()}`,
        name: params.name || 'Component',
        position: params.position || [0, 0, 0]
      };
      server.models.push(comp);
      return comp;
    }
  },

  'assembly.list': {
    description: 'List all components in assembly',
    params: {},
    returns: { components: 'array', count: 'number' },
    handler(params) {
      return {
        components: server.models,
        count: server.models.length
      };
    }
  },

  // META commands
  'meta.ping': {
    description: 'Ping the server',
    params: {},
    returns: { status: 'string', timestamp: 'string' },
    handler(params) {
      return {
        status: 'pong',
        timestamp: new Date().toISOString()
      };
    }
  },

  'meta.version': {
    description: 'Get server and API version',
    params: {},
    returns: { version: 'string', name: 'string' },
    handler(params) {
      return {
        name: 'cycleCAD API Server',
        version: '0.2.0',
        nodeVersion: process.version
      };
    }
  },

  'meta.schema': {
    description: 'Get API schema',
    params: {},
    returns: { schema: 'object' },
    handler(params) {
      return server.getSchema();
    }
  }
};

// Bind handlers
for (const [key, cmd] of Object.entries(AGENT_COMMANDS)) {
  if (cmd.handler) {
    // Create a wrapper that calls handler with 'this' bound to server
    const originalHandler = cmd.handler;
    cmd.handler = function(params) {
      return originalHandler.call(this, params);
    };
  }
}

const NAMESPACE_DESCRIPTIONS = {
  sketch: 'Create 2D sketches on planes',
  ops: 'Perform 3D operations (extrude, fillet, etc)',
  view: 'Control viewport and visualization',
  export: 'Export to various file formats',
  query: 'Query model data',
  validate: 'Validate and analyze models',
  assembly: 'Manage assemblies and components',
  meta: 'Server metadata and introspection'
};

// ============================================================================
// HTTP SERVER
// ============================================================================

function createServer() {
  return http.createServer((req, res) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
    res.setHeader('Access-Control-Max-Age', '3600');

    // COOP/COEP for SharedArrayBuffer
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate limiting
    if (!limiter.isAllowed(clientIp)) {
      respondJSON(res, 429, {
        ok: false,
        error: 'Too many requests',
        retryAfter: 60
      });
      return;
    }

    res.setHeader('RateLimit-Remaining', limiter.remaining(clientIp));
    res.setHeader('RateLimit-Limit', '100');
    res.setHeader('RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);

    // API key auth
    if (API_KEY) {
      const providedKey = req.headers['x-api-key'] || new url.URL(req.url, `http://${req.headers.host}`).searchParams.get('api_key');
      if (providedKey !== API_KEY) {
        respondJSON(res, 401, {
          ok: false,
          error: 'Unauthorized - invalid or missing API key'
        });
        return;
      }
    }

    const parsedUrl = new url.URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // === ROUTING ===

    if (pathname === '/api/execute' && req.method === 'POST') {
      handleExecute(req, res);
    } else if (pathname === '/api/batch' && req.method === 'POST') {
      handleBatch(req, res);
    } else if (pathname === '/api/schema' && req.method === 'GET') {
      respondJSON(res, 200, server.getSchema());
    } else if (pathname === '/api/health' && req.method === 'GET') {
      respondJSON(res, 200, server.getHealth());
    } else if (pathname === '/api/history' && req.method === 'GET') {
      const count = parseInt(parsedUrl.searchParams.get('count') || '20', 10);
      respondJSON(res, 200, server.getHistory(count));
    } else if (pathname === '/api/models' && req.method === 'GET') {
      respondJSON(res, 200, {
        ok: true,
        models: server.models,
        count: server.models.length
      });
    } else if (pathname.match(/^\/api\/models\/[^\/]+$/) && req.method === 'GET') {
      const id = pathname.split('/').pop();
      const model = server.models.find(m => m.id === id);
      if (!model) {
        respondJSON(res, 404, { ok: false, error: 'Model not found' });
      } else {
        respondJSON(res, 200, { ok: true, model });
      }
    } else if (pathname.match(/^\/api\/models\/[^\/]+$/) && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      server.models = server.models.filter(m => m.id !== id);
      respondJSON(res, 200, {
        ok: true,
        message: `Model ${id} deleted`,
        remaining: server.models.length
      });
    } else if (pathname === '/api/ws' && req.headers.upgrade === 'websocket') {
      handleWebSocket(req);
    } else if (pathname === '/') {
      serveFile(res, path.join(STATIC_DIR, 'index.html'));
    } else if (pathname === '/app' || pathname === '/app/') {
      serveFile(res, path.join(STATIC_DIR, 'index.html'));
    } else if (pathname.startsWith('/api/')) {
      respondJSON(res, 404, {
        ok: false,
        error: 'Unknown API endpoint',
        endpoint: pathname,
        availableEndpoints: [
          'POST /api/execute',
          'POST /api/batch',
          'GET /api/schema',
          'GET /api/health',
          'GET /api/history',
          'GET /api/models',
          'GET /api/models/:id',
          'DELETE /api/models/:id',
          'WebSocket /api/ws'
        ]
      });
    } else {
      // Serve static files
      const filePath = path.join(STATIC_DIR, pathname);
      serveFile(res, filePath);
    }
  });
}

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

function handleExecute(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const cmd = JSON.parse(body);
      const result = server.executeCommand(cmd);
      respondJSON(res, result.ok ? 200 : 400, result);
    } catch (e) {
      respondJSON(res, 400, {
        ok: false,
        error: `Invalid JSON: ${e.message}`
      });
    }
  });
}

function handleBatch(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(body);
      if (!Array.isArray(payload.commands)) {
        return respondJSON(res, 400, {
          ok: false,
          error: 'Expected { commands: [{ method, params }] }'
        });
      }

      const result = server.executeBatch(payload.commands);
      respondJSON(res, result.ok ? 200 : 400, result);
    } catch (e) {
      respondJSON(res, 400, {
        ok: false,
        error: `Invalid JSON: ${e.message}`
      });
    }
  });
}

function handleWebSocket(req) {
  // Basic WebSocket upgrade (simplified, not full RFC 6455)
  const key = req.headers['sec-websocket-key'];
  const sha1 = crypto.createHash('sha1');
  sha1.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  const accept = sha1.digest('base64');

  const head = Buffer.from(
    `HTTP/1.1 101 Switching Protocols\r\n` +
    `Upgrade: websocket\r\n` +
    `Connection: Upgrade\r\n` +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    `\r\n`
  );

  req.socket.write(head);

  // Create a mock WebSocket client
  const ws = {
    send: (data) => {
      const frame = createWebSocketFrame(data);
      req.socket.write(frame);
    },
    close: () => {
      req.socket.destroy();
    }
  };

  server.addWSClient(ws);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    sessionId: server.sessionId,
    message: 'Connected to cycleCAD API Server'
  }));

  // Send ping every 30s
  const pingInterval = setInterval(() => {
    try {
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    } catch (e) {
      clearInterval(pingInterval);
    }
  }, 30000);

  // Parse incoming WebSocket frames (simplified)
  let frameBuffer = Buffer.alloc(0);

  req.socket.on('data', (chunk) => {
    frameBuffer = Buffer.concat([frameBuffer, chunk]);

    while (frameBuffer.length >= 2) {
      try {
        const { payload, bytesRead } = parseWebSocketFrame(frameBuffer);
        if (payload === null) break;  // Incomplete frame

        frameBuffer = frameBuffer.slice(bytesRead);

        if (payload) {
          try {
            const cmd = JSON.parse(payload);
            const result = server.executeCommand(cmd);
            ws.send(JSON.stringify(result));
          } catch (e) {
            ws.send(JSON.stringify({ ok: false, error: e.message }));
          }
        }
      } catch (e) {
        ws.close();
        break;
      }
    }
  });

  req.socket.on('end', () => {
    clearInterval(pingInterval);
    server.removeWSClient(ws);
  });

  req.socket.on('error', () => {
    clearInterval(pingInterval);
    server.removeWSClient(ws);
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function respondJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function serveFile(res, filePath) {
  // Prevent directory traversal
  const normalizedPath = path.normalize(filePath);
  const normalizedBase = path.normalize(STATIC_DIR);

  if (!normalizedPath.startsWith(normalizedBase)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    if (stats.isDirectory()) {
      serveFile(res, path.join(filePath, 'index.html'));
      return;
    }

    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

function createWebSocketFrame(data) {
  const buffer = Buffer.from(data);
  const frame = Buffer.alloc(buffer.length + 2);
  frame[0] = 0x81;  // FIN + text frame
  frame[1] = buffer.length;
  buffer.copy(frame, 2);
  return frame;
}

function parseWebSocketFrame(buffer) {
  if (buffer.length < 2) return { payload: null, bytesRead: 0 };

  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLength = buffer[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return { payload: null, bytesRead: 0 };
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return { payload: null, bytesRead: 0 };
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  const maskOffset = masked ? 4 : 0;
  const totalLength = offset + maskOffset + payloadLength;

  if (buffer.length < totalLength) return { payload: null, bytesRead: 0 };

  let payload = buffer.slice(offset + maskOffset, offset + maskOffset + payloadLength);

  if (masked) {
    const mask = buffer.slice(offset, offset + 4);
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  return {
    payload: opcode === 1 ? payload.toString('utf8') : null,
    bytesRead: totalLength
  };
}

// ============================================================================
// STARTUP
// ============================================================================

function startup() {
  const httpServer = createServer();

  httpServer.listen(PORT, HOST, () => {
    const isDev = DEV_MODE ? ' [DEV MODE]' : '';
    const banner = `
╔═══════════════════════════════════════════════════════════╗
║  cycleCAD API Server v0.2.0${isDev.padEnd(20)} ║
║                                                           ║
║  HTTP:      http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}                          ║
║  API:       POST /api/execute                            ║
║  Batch:     POST /api/batch                              ║
║  Schema:    GET /api/schema                              ║
║  Health:    GET /api/health                              ║
║  History:   GET /api/history                             ║
║  Models:    GET /api/models                              ║
║  WebSocket: ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api/ws            ║
║  Static:    ${STATIC_DIR.slice(-30).padEnd(30)} ║
║                                                           ║
║  Rate Limit: 100 requests/minute                          ║
║  Session ID: ${server.sessionId.slice(0, 50).padEnd(50)} ║
╚═══════════════════════════════════════════════════════════╝
`;
    console.log(banner);

    if (DEV_MODE) {
      console.log('✓ Development mode enabled');
    }
    if (API_KEY) {
      console.log(`✓ API key authentication enabled (${API_KEY.slice(0, 8)}...)`);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

startup();
