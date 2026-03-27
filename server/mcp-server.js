#!/usr/bin/env node

/**
 * cycleCAD MCP Server
 *
 * Implements the Model Context Protocol (MCP) for the cycleCAD Agent API.
 * Exposes all 55+ commands from the Agent API as MCP tools.
 *
 * Protocol: JSON-RPC 2.0 over stdio
 * Methods: initialize, tools/list, tools/call
 *
 * Usage:
 *   npx cyclecad-mcp [--help] [--port 3000] [--ws-url ws://localhost:3000/api/ws]
 */

const readline = require('readline');
const http = require('http');

// Try to load WebSocket, but make it optional
let WebSocket = null;
try {
  WebSocket = require('ws');
} catch (e) {
  if (config && config.debug) {
    console.error('[MCP] WebSocket module not available, using HTTP only');
  }
}

// =============================================================================
// Configuration
// =============================================================================

const config = {
  wsUrl: process.env.CYCLECAD_WS_URL || 'ws://localhost:3000/api/ws',
  httpUrl: process.env.CYCLECAD_HTTP_URL || 'http://localhost:3000/api/execute',
  timeout: 30000,
  debug: process.env.DEBUG_MCP === '1'
};

// =============================================================================
// MCP Protocol Implementation
// =============================================================================

class MCPServer {
  constructor() {
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.wsConnection = null;
    this.isInitialized = false;
    this.commandQueue = [];
    this.sessionId = null;
  }

  /**
   * Initialize the MCP server and optionally connect to cycleCAD
   */
  async initialize() {
    this.isInitialized = true;
    this.sessionId = this.generateId('session');

    // Try to connect to cycleCAD WebSocket (non-blocking)
    this.connectToWebSocket().catch(err => {
      if (config.debug) console.error('[MCP] WebSocket connection failed:', err.message);
    });

    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: 'cyclecad-mcp',
        version: '1.0.0'
      }
    };
  }

  /**
   * Connect to cycleCAD via WebSocket
   */
  async connectToWebSocket() {
    if (!WebSocket) {
      if (config.debug) console.error('[MCP] WebSocket not available, skipping connection');
      return;
    }

    try {
      this.wsConnection = new WebSocket(config.wsUrl);

      this.wsConnection.on('open', () => {
        if (config.debug) console.error('[MCP] WebSocket connected');
        // Process queued commands
        while (this.commandQueue.length > 0) {
          const cmd = this.commandQueue.shift();
          this.sendCommand(cmd.method, cmd.params, cmd.resolve, cmd.reject);
        }
      });

      this.wsConnection.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject, timeout } = this.pendingRequests.get(msg.id);
            clearTimeout(timeout);
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              reject(new Error(msg.error));
            } else {
              resolve(msg.result);
            }
          }
        } catch (e) {
          if (config.debug) console.error('[MCP] WebSocket message parse error:', e);
        }
      });

      this.wsConnection.on('error', (err) => {
        if (config.debug) console.error('[MCP] WebSocket error:', err.message);
      });

      this.wsConnection.on('close', () => {
        if (config.debug) console.error('[MCP] WebSocket closed');
        this.wsConnection = null;
      });
    } catch (e) {
      if (config.debug) console.error('[MCP] WebSocket connection error:', e.message);
      throw e;
    }
  }

  /**
   * Execute a cycleCAD command via WebSocket or HTTP
   */
  async executeCommand(method, params = {}) {
    const cmd = { method, params };

    if (WebSocket && this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      // Use WebSocket
      return this.sendCommandViaWS(cmd);
    } else if (this.isInitialized && WebSocket) {
      // Queue for when connected
      return new Promise((resolve, reject) => {
        this.commandQueue.push({ method, params, resolve, reject });
        // Try HTTP as fallback immediately
        this.sendCommandViaHTTP(cmd).then(resolve).catch(() => {
          // Keep queued
        });
      });
    } else {
      // Use HTTP
      return this.sendCommandViaHTTP(cmd);
    }
  }

  /**
   * Send command via WebSocket
   */
  sendCommandViaWS(cmd) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Command timeout: ${cmd.method}`));
      }, config.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.wsConnection.send(JSON.stringify({ id, ...cmd }));
      } catch (e) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  /**
   * Send command via HTTP POST
   */
  sendCommandViaHTTP(cmd) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(cmd);
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = http.request(config.httpUrl, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.ok) {
              resolve(result.result);
            } else {
              reject(new Error(result.error || 'Command failed'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(config.timeout, () => {
        req.destroy();
        reject(new Error(`HTTP timeout: ${cmd.method}`));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Get all available tools (MCP tools/list)
   */
  getTools() {
    return TOOL_DEFINITIONS;
  }

  /**
   * Call a tool (MCP tools/call)
   */
  async callTool(name, args) {
    const tool = TOOL_DEFINITIONS.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Extract command method from tool name
    // Tool name format: "sketch_start" -> method: "sketch.start"
    const method = name.replace(/_/g, '.');

    try {
      const result = await this.executeCommand(method, args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: e.message,
              method,
              args
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// MCP Tool Definitions
// =============================================================================

/**
 * Convert Agent API schema to MCP tool definitions
 */
const TOOL_DEFINITIONS = [
  // SKETCH tools
  {
    name: 'sketch_start',
    description: 'Start sketch mode on XY, XZ, or YZ plane',
    inputSchema: {
      type: 'object',
      properties: {
        plane: { type: 'string', enum: ['XY', 'XZ', 'YZ'], description: 'Construction plane' }
      },
      required: []
    }
  },
  {
    name: 'sketch_end',
    description: 'End sketch and return all entities drawn',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'sketch_line',
    description: 'Draw a line segment in the sketch',
    inputSchema: {
      type: 'object',
      properties: {
        x1: { type: 'number', description: 'Start X coordinate' },
        y1: { type: 'number', description: 'Start Y coordinate' },
        x2: { type: 'number', description: 'End X coordinate' },
        y2: { type: 'number', description: 'End Y coordinate' }
      },
      required: ['x1', 'y1', 'x2', 'y2']
    }
  },
  {
    name: 'sketch_rect',
    description: 'Draw a rectangle in the sketch',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Origin X (default: 0)' },
        y: { type: 'number', description: 'Origin Y (default: 0)' },
        width: { type: 'number', description: 'Rectangle width' },
        height: { type: 'number', description: 'Rectangle height' }
      },
      required: ['width', 'height']
    }
  },
  {
    name: 'sketch_circle',
    description: 'Draw a circle in the sketch',
    inputSchema: {
      type: 'object',
      properties: {
        cx: { type: 'number', description: 'Center X (default: 0)' },
        cy: { type: 'number', description: 'Center Y (default: 0)' },
        radius: { type: 'number', description: 'Circle radius' }
      },
      required: ['radius']
    }
  },
  {
    name: 'sketch_arc',
    description: 'Draw an arc in the sketch',
    inputSchema: {
      type: 'object',
      properties: {
        cx: { type: 'number', description: 'Center X (default: 0)' },
        cy: { type: 'number', description: 'Center Y (default: 0)' },
        radius: { type: 'number', description: 'Arc radius' },
        startAngle: { type: 'number', description: 'Start angle in radians (default: 0)' },
        endAngle: { type: 'number', description: 'End angle in radians (default: π)' }
      },
      required: ['radius']
    }
  },
  {
    name: 'sketch_clear',
    description: 'Clear all sketch entities',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'sketch_entities',
    description: 'List all entities in the current sketch',
    inputSchema: { type: 'object', properties: {} }
  },

  // OPERATIONS tools
  {
    name: 'ops_extrude',
    description: 'Extrude sketch profile into 3D solid',
    inputSchema: {
      type: 'object',
      properties: {
        height: { type: 'number', description: 'Extrusion height' },
        symmetric: { type: 'boolean', description: 'Extrude symmetrically' },
        material: { type: 'string', description: 'Material name (steel, aluminum, etc)' }
      },
      required: ['height']
    }
  },
  {
    name: 'ops_revolve',
    description: 'Revolve sketch profile around an axis',
    inputSchema: {
      type: 'object',
      properties: {
        axis: { type: 'string', enum: ['X', 'Y', 'Z'], description: 'Rotation axis' },
        angle: { type: 'number', description: 'Revolution angle in degrees' },
        material: { type: 'string', description: 'Material name' }
      },
      required: []
    }
  },
  {
    name: 'ops_primitive',
    description: 'Create a primitive 3D shape (box, sphere, cylinder, etc)',
    inputSchema: {
      type: 'object',
      properties: {
        shape: { type: 'string', enum: ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule'] },
        width: { type: 'number', description: 'Width dimension' },
        height: { type: 'number', description: 'Height dimension' },
        depth: { type: 'number', description: 'Depth dimension' },
        radius: { type: 'number', description: 'Radius' },
        segments: { type: 'number', description: 'Tessellation segments' },
        material: { type: 'string', description: 'Material name' }
      },
      required: ['shape']
    }
  },
  {
    name: 'ops_fillet',
    description: 'Apply fillet radius to edges of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID to fillet' },
        radius: { type: 'number', description: 'Fillet radius' }
      },
      required: ['target']
    }
  },
  {
    name: 'ops_chamfer',
    description: 'Apply chamfer to edges of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID to chamfer' },
        distance: { type: 'number', description: 'Chamfer distance' }
      },
      required: ['target']
    }
  },
  {
    name: 'ops_boolean',
    description: 'Perform boolean operation (union, cut, intersect)',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['union', 'cut', 'intersect'] },
        targetA: { type: 'string', description: 'First feature ID' },
        targetB: { type: 'string', description: 'Second feature ID' }
      },
      required: ['operation', 'targetA', 'targetB']
    }
  },
  {
    name: 'ops_shell',
    description: 'Create a hollow shell from a solid',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID to shell' },
        thickness: { type: 'number', description: 'Shell wall thickness' }
      },
      required: ['target']
    }
  },
  {
    name: 'ops_pattern',
    description: 'Create array pattern of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID to pattern' },
        type: { type: 'string', enum: ['rect', 'circular'], description: 'Pattern type' },
        count: { type: 'number', description: 'Number of copies' },
        spacing: { type: 'number', description: 'Space between copies' }
      },
      required: ['target']
    }
  },
  {
    name: 'ops_material',
    description: 'Change material of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        material: { type: 'string', description: 'Material name' }
      },
      required: ['target', 'material']
    }
  },
  {
    name: 'ops_sweep',
    description: 'Sweep a profile along a path',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'object', description: 'Profile to sweep' },
        path: { type: 'object', description: 'Path to follow' },
        twist: { type: 'number', description: 'Twist angle' },
        scale: { type: 'number', description: 'Scale interpolation' }
      },
      required: ['profile', 'path']
    }
  },
  {
    name: 'ops_loft',
    description: 'Loft between multiple profiles',
    inputSchema: {
      type: 'object',
      properties: {
        profiles: { type: 'array', description: 'Profiles to loft between' }
      },
      required: ['profiles']
    }
  },
  {
    name: 'ops_spring',
    description: 'Generate a helical spring',
    inputSchema: {
      type: 'object',
      properties: {
        radius: { type: 'number', description: 'Spring radius' },
        wireRadius: { type: 'number', description: 'Wire radius' },
        height: { type: 'number', description: 'Spring height' },
        turns: { type: 'number', description: 'Number of turns' },
        material: { type: 'string', description: 'Material name' }
      },
      required: []
    }
  },
  {
    name: 'ops_thread',
    description: 'Generate a screw thread',
    inputSchema: {
      type: 'object',
      properties: {
        outerRadius: { type: 'number', description: 'Outer radius' },
        innerRadius: { type: 'number', description: 'Inner radius' },
        pitch: { type: 'number', description: 'Thread pitch' },
        length: { type: 'number', description: 'Thread length' },
        material: { type: 'string', description: 'Material name' }
      },
      required: []
    }
  },
  {
    name: 'ops_bend',
    description: 'Bend sheet metal',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID to bend' },
        angle: { type: 'number', description: 'Bend angle in degrees' },
        radius: { type: 'number', description: 'Bend radius' }
      },
      required: ['target']
    }
  },

  // TRANSFORM tools
  {
    name: 'transform_move',
    description: 'Translate a feature by X, Y, Z offset',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        x: { type: 'number', description: 'X offset' },
        y: { type: 'number', description: 'Y offset' },
        z: { type: 'number', description: 'Z offset' }
      },
      required: ['target']
    }
  },
  {
    name: 'transform_rotate',
    description: 'Rotate a feature around X, Y, Z axes',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        x: { type: 'number', description: 'Rotation around X axis (degrees)' },
        y: { type: 'number', description: 'Rotation around Y axis (degrees)' },
        z: { type: 'number', description: 'Rotation around Z axis (degrees)' }
      },
      required: ['target']
    }
  },
  {
    name: 'transform_scale',
    description: 'Scale a feature along X, Y, Z axes',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        x: { type: 'number', description: 'X scale factor' },
        y: { type: 'number', description: 'Y scale factor' },
        z: { type: 'number', description: 'Z scale factor' }
      },
      required: ['target']
    }
  },

  // VIEW tools
  {
    name: 'view_set',
    description: 'Set camera to a standard view',
    inputSchema: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['front', 'back', 'left', 'right', 'top', 'bottom', 'isometric'],
          description: 'View direction'
        }
      },
      required: []
    }
  },
  {
    name: 'view_fit',
    description: 'Fit view to a feature or all features',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID (optional, fits all if omitted)' }
      },
      required: []
    }
  },
  {
    name: 'view_wireframe',
    description: 'Toggle wireframe rendering',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Enable or disable wireframe' }
      },
      required: []
    }
  },
  {
    name: 'view_grid',
    description: 'Toggle grid visibility',
    inputSchema: {
      type: 'object',
      properties: {
        visible: { type: 'boolean', description: 'Show or hide grid' }
      },
      required: []
    }
  },

  // EXPORT tools
  {
    name: 'export_stl',
    description: 'Export model as STL file',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename' },
        binary: { type: 'boolean', description: 'Use binary format (default: true)' }
      },
      required: []
    }
  },
  {
    name: 'export_obj',
    description: 'Export model as OBJ file',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename' }
      },
      required: []
    }
  },
  {
    name: 'export_gltf',
    description: 'Export model as glTF 2.0 file',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename' }
      },
      required: []
    }
  },
  {
    name: 'export_json',
    description: 'Export model as cycleCAD JSON',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename' }
      },
      required: []
    }
  },

  // VALIDATE tools
  {
    name: 'validate_dimensions',
    description: 'Get dimensions and bounding box of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' }
      },
      required: ['target']
    }
  },
  {
    name: 'validate_wallThickness',
    description: 'Check minimum wall thickness of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        minWall: { type: 'number', description: 'Minimum wall thickness in mm' }
      },
      required: ['target']
    }
  },
  {
    name: 'validate_printability',
    description: 'Check if part is printable via FDM, SLA, or CNC',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        process: { type: 'string', enum: ['FDM', 'SLA', 'CNC'], description: 'Manufacturing process' }
      },
      required: ['target']
    }
  },
  {
    name: 'validate_cost',
    description: 'Estimate manufacturing cost',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        process: { type: 'string', enum: ['FDM', 'SLA', 'CNC', 'injection'], description: 'Manufacturing process' },
        material: { type: 'string', description: 'Material name' }
      },
      required: ['target']
    }
  },
  {
    name: 'validate_mass',
    description: 'Estimate part mass (weight)',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        material: { type: 'string', description: 'Material name' }
      },
      required: ['target']
    }
  },
  {
    name: 'validate_surfaceArea',
    description: 'Calculate surface area of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' }
      },
      required: ['target']
    }
  },
  {
    name: 'validate_centerOfMass',
    description: 'Get geometric centroid of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' }
      },
      required: ['target']
    }
  },
  {
    name: 'validate_designReview',
    description: 'Auto-analyze feature for manufacturing issues (scored A/B/C/F)',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' }
      },
      required: ['target']
    }
  },

  // RENDER tools
  {
    name: 'render_snapshot',
    description: 'Render current viewport as PNG image',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Image width in pixels' },
        height: { type: 'number', description: 'Image height in pixels' }
      },
      required: []
    }
  },
  {
    name: 'render_multiview',
    description: 'Render 6 standard views (front/back/left/right/top/isometric) as PNGs',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Image width in pixels' },
        height: { type: 'number', description: 'Image height in pixels' }
      },
      required: []
    }
  },
  {
    name: 'render_highlight',
    description: 'Highlight a component with color',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        color: { type: 'string', description: 'Hex color code (e.g., #FF0000)' },
        duration: { type: 'number', description: 'Duration in milliseconds' }
      },
      required: ['target']
    }
  },
  {
    name: 'render_hide',
    description: 'Hide or show a component',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        hidden: { type: 'boolean', description: 'Hide or show' }
      },
      required: ['target']
    }
  },
  {
    name: 'render_section',
    description: 'Enable section cutting (cross-section)',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Enable or disable section cut' },
        axis: { type: 'string', enum: ['X', 'Y', 'Z'], description: 'Cut axis' },
        position: { type: 'number', description: 'Cut position along axis' },
        mode: { type: 'string', enum: ['single', 'clip'], description: 'Section mode' }
      },
      required: []
    }
  },

  // QUERY tools
  {
    name: 'query_features',
    description: 'List all features in the model',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'query_bbox',
    description: 'Get bounding box of a feature',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' }
      },
      required: ['target']
    }
  },
  {
    name: 'query_materials',
    description: 'List available materials',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'query_session',
    description: 'Get session info',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'query_log',
    description: 'Get recent command log',
    inputSchema: {
      type: 'object',
      properties: {
        last: { type: 'number', description: 'Number of recent commands' }
      },
      required: []
    }
  },

  // ASSEMBLY tools
  {
    name: 'assembly_addComponent',
    description: 'Add component to assembly',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name' },
        meshOrFile: { type: 'string', description: 'Feature ID or file path' },
        position: { type: 'array', description: '[x, y, z] position' },
        material: { type: 'string', description: 'Material name' }
      },
      required: ['name']
    }
  },
  {
    name: 'assembly_removeComponent',
    description: 'Remove component from assembly',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Component ID' }
      },
      required: ['target']
    }
  },
  {
    name: 'assembly_mate',
    description: 'Define mate constraint between components',
    inputSchema: {
      type: 'object',
      properties: {
        target1: { type: 'string', description: 'First component ID' },
        target2: { type: 'string', description: 'Second component ID' },
        type: { type: 'string', enum: ['coincident', 'concentric', 'parallel', 'tangent'], description: 'Mate type' },
        offset: { type: 'number', description: 'Mate offset' }
      },
      required: ['target1', 'target2']
    }
  },
  {
    name: 'assembly_explode',
    description: 'Explode component or assembly',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Component ID or "*" for all' },
        distance: { type: 'number', description: 'Explode distance' }
      },
      required: ['target']
    }
  },

  // SCENE tools
  {
    name: 'scene_clear',
    description: 'Clear all features from the scene',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'scene_snapshot',
    description: 'Capture viewport as PNG (legacy)',
    inputSchema: { type: 'object', properties: {} }
  },

  // AI tools
  {
    name: 'ai_identifyPart',
    description: 'Identify part using Gemini Vision API',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        imageData: { type: 'string', description: 'Base64 image data (optional)' }
      },
      required: ['target']
    }
  },
  {
    name: 'ai_suggestImprovements',
    description: 'Get AI-generated design improvement suggestions',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' }
      },
      required: ['target']
    }
  },
  {
    name: 'ai_estimateCostAI',
    description: 'AI-powered cost estimation with recommendations',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Feature ID' },
        process: { type: 'string', enum: ['FDM', 'SLA', 'CNC', 'auto'], description: 'Manufacturing process' },
        material: { type: 'string', description: 'Material name or "auto"' },
        quantity: { type: 'number', description: 'Production quantity' }
      },
      required: ['target']
    }
  },

  // META tools
  {
    name: 'meta_ping',
    description: 'Health check and session uptime',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'meta_version',
    description: 'Get version info and feature flags',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'meta_schema',
    description: 'Get full API schema',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'meta_modules',
    description: 'Check which modules are available',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'meta_history',
    description: 'Get undo/redo history stack',
    inputSchema: { type: 'object', properties: {} }
  }
];

// =============================================================================
// Main Server Loop
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
cycleCAD MCP Server
Usage: cyclecad-mcp [OPTIONS]

OPTIONS:
  --help            Show this help message
  --ws-url URL      WebSocket URL (default: ws://localhost:3000/api/ws)
  --http-url URL    HTTP URL (default: http://localhost:3000/api/execute)
  --debug           Enable debug logging
  --version         Show version

ENVIRONMENT:
  CYCLECAD_WS_URL     WebSocket URL
  CYCLECAD_HTTP_URL   HTTP URL
  DEBUG_MCP           Enable debug logging

EXAMPLES:
  npx cyclecad-mcp
  npx cyclecad-mcp --debug
  npx cyclecad-mcp --ws-url ws://10.0.0.1:3000/api/ws

    `);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('cyclecad-mcp 1.0.0');
    process.exit(0);
  }

  // Parse environment and CLI args
  if (args.includes('--debug')) config.debug = true;

  const wsIdx = args.indexOf('--ws-url');
  if (wsIdx !== -1 && args[wsIdx + 1]) {
    config.wsUrl = args[wsIdx + 1];
  }

  const httpIdx = args.indexOf('--http-url');
  if (httpIdx !== -1 && args[httpIdx + 1]) {
    config.httpUrl = args[httpIdx + 1];
  }

  const server = new MCPServer();

  // Setup stdio transport
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  let isInitialized = false;

  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);
      let response = null;

      if (config.debug) {
        console.error(`[MCP] ← ${request.method}`);
      }

      if (request.method === 'initialize') {
        const result = await server.initialize();
        isInitialized = true;
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } else if (request.method === 'tools/list') {
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: server.getTools()
          }
        };
      } else if (request.method === 'tools/call') {
        const result = await server.callTool(request.params.name, request.params.arguments);
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } else {
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Unknown method: ${request.method}`
          }
        };
      }

      if (config.debug) {
        console.error(`[MCP] → ${response.result ? 'OK' : 'ERROR'}`);
      }

      console.log(JSON.stringify(response));
    } catch (e) {
      console.error(`[MCP Server Error] ${e.message}`);
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: e.message
        }
      }));
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });

  if (config.debug) {
    console.error('[MCP] Server ready, waiting for requests...');
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
