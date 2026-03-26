/**
 * cycleCAD API Client Example (JavaScript/Node.js)
 *
 * Simple client for the cycleCAD REST API with both HTTP and WebSocket support.
 *
 * Usage (Node.js):
 *   node api-client-example.js
 *   node api-client-example.js --host localhost --port 3000
 *
 * Usage (Browser):
 *   Include <script src="api-client-example.js"></script>
 *   const client = new CycleCADClient('http://localhost:3000');
 *   client.execute('sketch.start', {plane: 'XY'}).then(r => console.log(r));
 */

// ============================================================================
// CycleCAD HTTP Client
// ============================================================================

class CycleCADClient {
  constructor(baseUrl = 'http://localhost:3000', apiKey = null) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.isNode = typeof window === 'undefined';
  }

  /**
   * Make HTTP request (works in Node.js and browser)
   */
  async _request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const options = { method, headers };
    if (data) options.body = JSON.stringify(data);

    try {
      let response;

      // Use native fetch if available (browser or Node 18+)
      if (typeof fetch !== 'undefined') {
        response = await fetch(url, options);
      } else {
        // Fallback for older Node.js versions
        const http = require('http');
        response = await this._nodeRequest(url, options);
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`API Error (${response.status}): ${error.error || response.statusText}`);
      }

      return await response.json();
    } catch (e) {
      throw new Error(`Request failed: ${e.message}`);
    }
  }

  /**
   * Node.js HTTP request fallback
   */
  _nodeRequest(url, options) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const http = require(urlObj.protocol === 'https:' ? 'https' : 'http');
      const isHttps = urlObj.protocol === 'https:';

      const opts = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method,
        headers: options.headers
      };

      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode < 400,
            status: res.statusCode,
            json: () => Promise.resolve(JSON.parse(data))
          });
        });
      });

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  /**
   * Execute single command
   */
  async execute(method, params = {}) {
    return this._request('POST', '/api/execute', { method, params });
  }

  /**
   * Execute batch of commands
   */
  async batch(commands) {
    return this._request('POST', '/api/batch', { commands });
  }

  /**
   * Get API schema
   */
  async getSchema() {
    return this._request('GET', '/api/schema');
  }

  /**
   * Get server health
   */
  async getHealth() {
    return this._request('GET', '/api/health');
  }

  /**
   * Get command history
   */
  async getHistory(count = 20) {
    return this._request('GET', `/api/history?count=${count}`);
  }

  /**
   * Get all models
   */
  async getModels() {
    return this._request('GET', '/api/models');
  }

  /**
   * Get specific model
   */
  async getModel(modelId) {
    return this._request('GET', `/api/models/${modelId}`);
  }

  /**
   * Delete model
   */
  async deleteModel(modelId) {
    return this._request('DELETE', `/api/models/${modelId}`);
  }

  /**
   * Connect WebSocket
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/api/ws';

      try {
        const ws = new (this.isNode ? require('ws') : WebSocket)(wsUrl);

        ws.onopen = () => {
          console.log('✓ WebSocket connected');
          resolve(new CycleCADWebSocket(ws));
        };

        ws.onerror = (e) => {
          reject(new Error(`WebSocket error: ${e.message}`));
        };
      } catch (e) {
        reject(e);
      }
    });
  }
}

// ============================================================================
// CycleCAD WebSocket Client
// ============================================================================

class CycleCADWebSocket {
  constructor(ws) {
    this.ws = ws;
    this.listeners = {};
    this.pendingRequests = new Map();
    this.requestId = 0;

    ws.onmessage = (event) => {
      const data = typeof event.data === 'string'
        ? JSON.parse(event.data)
        : JSON.parse(event.data.toString());

      // Emit events
      if (data.type) {
        this._emit(data.type, data);
      }

      // Resolve pending requests
      if (data.requestId && this.pendingRequests.has(data.requestId)) {
        const { resolve } = this.pendingRequests.get(data.requestId);
        this.pendingRequests.delete(data.requestId);
        resolve(data);
      }
    };

    ws.onerror = (e) => this._emit('error', e);
    ws.onclose = () => this._emit('close');
  }

  /**
   * Execute command via WebSocket
   */
  async execute(method, params = {}) {
    const requestId = ++this.requestId;
    const message = { requestId, method, params };

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, { resolve });
      this.ws.send(JSON.stringify(message));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          resolve({ ok: false, error: 'Request timeout' });
        }
      }, 30000);
    });
  }

  /**
   * Listen for events
   */
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Emit event
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(`Event listener error: ${e.message}`); }
      });
    }
  }

  /**
   * Close connection
   */
  close() {
    this.ws.close();
  }
}

// ============================================================================
// EXAMPLES
// ============================================================================

async function example1_simplePartHTTP(client) {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 1: Simple Part (HTTP)');
  console.log('='.repeat(60) + '\n');

  // Start sketch
  console.log('1. Starting sketch...');
  let r = await client.execute('sketch.start', { plane: 'XY' });
  console.log(`   ✓ ${r.result.message}`);

  // Draw circle
  console.log('2. Drawing circle (r=25mm)...');
  r = await client.execute('sketch.circle', { cx: 0, cy: 0, radius: 25 });
  console.log(`   ✓ Circle: ${r.result.entityId}`);

  // End sketch
  console.log('3. Ending sketch...');
  r = await client.execute('sketch.end', {});

  // Extrude
  console.log('4. Extruding 50mm...');
  r = await client.execute('ops.extrude', {
    height: 50,
    symmetric: false,
    material: 'steel'
  });
  console.log(`   ✓ Extrusion: ${r.result.featureId}`);
  console.log(`     Volume: ${r.result.volume} mm³`);
}

async function example2_batchOperations(client) {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 2: Batch Operations');
  console.log('='.repeat(60) + '\n');

  const commands = [
    { method: 'sketch.start', params: { plane: 'XY' } },
    { method: 'sketch.rect', params: { x: 0, y: 0, width: 60, height: 40 } },
    { method: 'sketch.end', params: {} },
    { method: 'ops.extrude', params: { height: 30, material: 'aluminum' } }
  ];

  console.log('Executing 4 commands in batch...');
  const r = await client.batch(commands);

  if (r.ok) {
    console.log(`✓ All ${r.executed} commands succeeded (${r.elapsed}ms)`);
    r.results.forEach((res, i) => {
      console.log(`  [${i + 1}] ${commands[i].method}: ${res.elapsed}ms`);
    });
  } else {
    console.log(`✗ Failed with ${r.errors.length} errors`);
  }
}

async function example3_queryValidation(client) {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 3: Query & Validation');
  console.log('='.repeat(60) + '\n');

  console.log('1. Available materials:');
  let r = await client.execute('query.materials', {});
  r.result.materials.forEach(m => console.log(`   • ${m}`));

  console.log('\n2. Validate mass:');
  r = await client.execute('validate.mass', {
    target: 'extrude_1234',
    material: 'steel'
  });
  console.log(`   Mass: ${r.result.mass} kg`);

  console.log('\n3. Estimate cost:');
  r = await client.execute('validate.cost', {
    target: 'extrude_1234',
    process: 'FDM',
    material: 'PLA'
  });
  console.log(`   Cost: $${r.result.estimatedCost} USD`);
}

async function example4_serverInfo(client) {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 4: Server Information');
  console.log('='.repeat(60) + '\n');

  console.log('1. Health check:');
  const health = await client.getHealth();
  console.log(`   Status: ${health.status}`);
  console.log(`   Version: ${health.version}`);
  console.log(`   Uptime: ${health.uptime}s`);
  console.log(`   Commands available: ${health.commands}`);
  console.log(`   Commands executed: ${health.commandsExecuted}`);

  console.log('\n2. Command history (last 5):');
  const history = await client.getHistory(5);
  console.log(`   Total: ${history.total}`);
  history.recent.forEach(entry => {
    const status = entry.ok ? '✓' : '✗';
    console.log(`   [${status}] ${entry.method} (${entry.elapsed}ms)`);
  });
}

async function example5_websocket(client) {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 5: WebSocket Real-Time Connection');
  console.log('='.repeat(60) + '\n');

  try {
    console.log('Connecting to WebSocket...');
    const ws = await client.connectWebSocket();

    // Listen for events
    ws.on('ping', (data) => {
      console.log(`   ← ping (${new Date(data.timestamp).toLocaleTimeString()})`);
    });

    ws.on('error', (e) => {
      console.log(`   ✗ Error: ${e.message}`);
    });

    ws.on('close', () => {
      console.log('   ✗ Connection closed');
    });

    // Send commands
    console.log('\n1. Sending commands via WebSocket:');

    console.log('   → sketch.start');
    let r = await ws.execute('sketch.start', { plane: 'XY' });
    console.log(`   ← ${r.result.message}`);

    console.log('   → sketch.circle');
    r = await ws.execute('sketch.circle', { cx: 0, cy: 0, radius: 30 });
    console.log(`   ← Circle: ${r.result.entityId}`);

    console.log('   → sketch.end');
    r = await ws.execute('sketch.end', {});
    console.log(`   ← ${r.result.message}`);

    // Keep connection open for 3 seconds to see pings
    console.log('\n2. Listening for pings (3s)...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n3. Closing connection...');
    ws.close();
  } catch (e) {
    console.log(`   ✗ WebSocket error: ${e.message}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  const host = args.host || 'localhost';
  const port = args.port || 3000;
  const example = args.example || 'all';

  console.log('\n' + '█'.repeat(60));
  console.log('█ cycleCAD API Client — Example Usage');
  console.log('█'.repeat(60));
  console.log(`\nConnecting to ${host}:${port}...`);

  try {
    const client = new CycleCADClient(`http://${host}:${port}`, args['api-key']);

    // Test connection
    const health = await client.getHealth();
    console.log(`✓ Connected to cycleCAD v${health.version}\n`);

    // Run examples
    const examples = {
      all: [
        example4_serverInfo,
        example1_simplePartHTTP,
        example2_batchOperations,
        example3_queryValidation,
        example5_websocket
      ],
      simple: [example1_simplePartHTTP],
      batch: [example2_batchOperations],
      query: [example3_queryValidation],
      server: [example4_serverInfo],
      websocket: [example5_websocket]
    };

    const exampleFns = examples[example] || examples.all;

    for (const fn of exampleFns) {
      try {
        await fn(client);
      } catch (e) {
        console.log(`\n✗ Example failed: ${e.message}`);
      }
    }

    console.log('\n' + '█'.repeat(60));
    console.log('█ Examples completed!');
    console.log('█'.repeat(60) + '\n');
  } catch (e) {
    console.log(`\n✗ Connection failed: ${e.message}`);
    console.log('\nMake sure the API server is running:');
    console.log(`  npm run server`);
    process.exit(1);
  }
}

// Export for use as module
if (typeof module !== 'undefined') {
  module.exports = { CycleCADClient, CycleCADWebSocket };

  // Run examples if called directly
  if (require.main === module) {
    main().catch(e => {
      console.error(e);
      process.exit(1);
    });
  }
}
