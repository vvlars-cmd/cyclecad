#!/usr/bin/env node

/**
 * server.js — Development server for cycleCAD Agent API
 *
 * This is a mock server for testing the CLI. In production, this would be
 * replaced by the actual cycleCAD application with a real Agent API backend.
 *
 * Usage:
 *   node bin/server.js [--port 3000]
 *
 * Then in another terminal:
 *   ./bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80
 */

const http = require('http');
const url = require('url');

const PORT = process.argv[2] === '--port' ? parseInt(process.argv[3]) : 3000;

// Mock state
const state = {
  features: [],
  assembly: [],
  sessionId: null,
};

// Mock command handlers
const handlers = {
  'shape.cylinder': (params) => ({
    ok: true,
    result: {
      entityId: `cylinder_${Date.now()}`,
      type: 'shape',
      radius: params.radius || 25,
      height: params.height || 80,
      volume: Math.PI * (params.radius || 25) ** 2 * (params.height || 80),
      message: `Created cylinder with radius ${params.radius}mm and height ${params.height}mm`,
    },
  }),

  'shape.box': (params) => ({
    ok: true,
    result: {
      entityId: `box_${Date.now()}`,
      type: 'shape',
      width: params.width || 50,
      height: params.height || 50,
      depth: params.depth || 50,
      volume: (params.width || 50) * (params.height || 50) * (params.depth || 50),
      message: `Created box with dimensions ${params.width}x${params.height}x${params.depth}mm`,
    },
  }),

  'shape.sphere': (params) => ({
    ok: true,
    result: {
      entityId: `sphere_${Date.now()}`,
      type: 'shape',
      radius: params.radius || 25,
      volume: (4 / 3) * Math.PI * (params.radius || 25) ** 3,
      message: `Created sphere with radius ${params.radius}mm`,
    },
  }),

  'sketch.start': (params) => ({
    ok: true,
    result: {
      sketchId: `sketch_${Date.now()}`,
      plane: params.plane || 'XY',
      message: 'Sketch started on plane XY',
    },
  }),

  'sketch.end': (params) => ({
    ok: true,
    result: {
      sketchId: `sketch_${Date.now()}`,
      entities: 3,
      message: 'Sketch ended. 3 entities captured.',
    },
  }),

  'sketch.circle': (params) => ({
    ok: true,
    result: {
      entityId: `circle_${Date.now()}`,
      cx: params.cx || 0,
      cy: params.cy || 0,
      radius: params.radius || 25,
      message: `Created circle at (${params.cx || 0}, ${params.cy || 0}) with radius ${params.radius}mm`,
    },
  }),

  'feature.extrude': (params) => ({
    ok: true,
    result: {
      entityId: `extrude_${Date.now()}`,
      height: params.height || 10,
      message: `Extruded sketch by ${params.height}mm`,
    },
  }),

  'feature.fillet': (params) => ({
    ok: true,
    result: {
      entityId: `fillet_${Date.now()}`,
      radius: params.radius || 5,
      edges: params.edges || 'all',
      message: `Applied fillet with radius ${params.radius}mm to ${params.edges || 'all'} edges`,
    },
  }),

  'validate.dimensions': (params) => ({
    ok: true,
    result: {
      target: params.target,
      dimensions: {
        width: 80,
        height: 40,
        depth: 30,
      },
      message: 'Dimensions calculated',
    },
  }),

  'validate.cost': (params) => ({
    ok: true,
    result: {
      target: params.target,
      process: params.process || 'FDM',
      material: params.material || 'PLA',
      cost: Math.random() * 100,
      message: `Cost estimation for ${params.process} using ${params.material}`,
    },
  }),

  'validate.mass': (params) => ({
    ok: true,
    result: {
      target: params.target,
      material: params.material || 'steel',
      mass: Math.random() * 5000,
      message: `Mass estimated using ${params.material} density`,
    },
  }),

  'export.stl': (params) => ({
    ok: true,
    result: {
      filename: params.filename || 'output.stl',
      format: 'STL',
      binary: params.binary !== false,
      size: Math.floor(Math.random() * 10000000),
      message: `Exported to ${params.filename || 'output.stl'}`,
    },
  }),

  'meta.version': (params) => ({
    ok: true,
    result: {
      version: '0.1.0',
      apiVersion: '1.0.0',
      agent: 'cyclecad-cli',
    },
  }),

  'meta.getSchema': (params) => ({
    ok: true,
    result: {
      namespaces: ['shape', 'sketch', 'feature', 'assembly', 'render', 'validate', 'export', 'marketplace', 'cam', 'meta'],
      commands: 55,
      message: 'Full API schema available via /schema endpoint',
    },
  }),
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  // Health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Server is running' }));
    return;
  }

  // API endpoint
  if (parsedUrl.pathname === '/api/execute' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { method, params } = JSON.parse(body);

        // Find handler
        const handler = handlers[method];
        if (!handler) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: `Unknown command: ${method}`,
          }));
          return;
        }

        // Execute handler
        const result = handler(params || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: err.message,
        }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n  cyclecad Agent API mock server running on http://localhost:${PORT}\n`);
  console.log(`  Try: ./bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80\n`);
});
