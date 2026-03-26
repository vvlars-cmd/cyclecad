#!/usr/bin/env node

/**
 * cyclecad-cli.js — Command-line interface for cycleCAD Agent API
 *
 * Usage:
 *   cyclecad shape.cylinder --radius 25 --height 80
 *   cyclecad feature.fillet --radius 5 --edges all
 *   cyclecad --list
 *   cyclecad --describe shape.cylinder
 *   cyclecad --interactive
 *   cyclecad --batch script.txt
 *
 * Global flags:
 *   --help, -h              Show usage
 *   --version, -v           Show version
 *   --json                  Output raw JSON
 *   --server <url>          Server URL (default: http://localhost:3000)
 *   --quiet, -q             Suppress status messages
 *   --list                  List all commands
 *   --describe <command>    Show help for specific command
 *   --interactive, -i       Interactive REPL mode
 *   --batch <file>          Batch mode: execute commands from file
 *
 * No external dependencies — pure Node.js built-ins.
 */

const http = require('http');
const https = require('https');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ============================================================================
// Configuration
// ============================================================================

const VERSION = '0.1.0';
const DEFAULT_SERVER = 'http://localhost:3000';
const API_ENDPOINT = '/api/execute';

// ANSI colors for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Command schema (extracted from Agent API)
const COMMAND_SCHEMA = {
  shape: {
    cylinder: { params: { radius: 'number', height: 'number' }, description: 'Create a cylinder' },
    box: { params: { width: 'number', height: 'number', depth: 'number' }, description: 'Create a box' },
    sphere: { params: { radius: 'number' }, description: 'Create a sphere' },
    cone: { params: { radius: 'number', height: 'number' }, description: 'Create a cone' },
  },
  sketch: {
    start: { params: { plane: 'string?' }, description: 'Start sketch mode' },
    end: { params: {}, description: 'End sketch' },
    line: { params: { x1: 'number', y1: 'number', x2: 'number', y2: 'number' }, description: 'Draw a line' },
    rect: { params: { x: 'number?', y: 'number?', width: 'number', height: 'number' }, description: 'Draw a rectangle' },
    circle: { params: { cx: 'number?', cy: 'number?', radius: 'number' }, description: 'Draw a circle' },
    arc: { params: { cx: 'number?', cy: 'number?', radius: 'number', startAngle: 'number?', endAngle: 'number?' }, description: 'Draw an arc' },
    clear: { params: {}, description: 'Clear sketch' },
    entities: { params: {}, description: 'List sketch entities' },
  },
  feature: {
    extrude: { params: { height: 'number', taper: 'number?' }, description: 'Extrude sketch' },
    revolve: { params: { angle: 'number', axis: 'string?' }, description: 'Revolve sketch' },
    fillet: { params: { radius: 'number', edges: 'string?' }, description: 'Fillet edges' },
    chamfer: { params: { size: 'number', edges: 'string?' }, description: 'Chamfer edges' },
    pattern: { params: { type: 'string', count: 'number', spacing: 'number' }, description: 'Pattern feature' },
  },
  assembly: {
    addComponent: { params: { name: 'string', meshOrFile: 'string|object', position: 'array?' }, description: 'Add component' },
    removeComponent: { params: { target: 'string' }, description: 'Remove component' },
    mate: { params: { target1: 'string', target2: 'string', type: 'string?' }, description: 'Define mate' },
    explode: { params: { target: 'string', distance: 'number?' }, description: 'Explode assembly' },
    bom: { params: { target: 'string?' }, description: 'Generate BOM' },
  },
  render: {
    snapshot: { params: { width: 'number?', height: 'number?' }, description: 'Render snapshot' },
    multiview: { params: { width: 'number?', height: 'number?' }, description: 'Render 6 views' },
    highlight: { params: { target: 'string', color: 'string?' }, description: 'Highlight component' },
    hide: { params: { target: 'string', hidden: 'bool?' }, description: 'Hide/show component' },
    section: { params: { enabled: 'bool?', axis: 'string?', position: 'number?' }, description: 'Section cut' },
  },
  validate: {
    dimensions: { params: { target: 'string' }, description: 'Check dimensions' },
    wallThickness: { params: { target: 'string', minWall: 'number?' }, description: 'Check wall thickness' },
    printability: { params: { target: 'string', process: 'string?' }, description: 'Check printability' },
    cost: { params: { target: 'string', process: 'string?', material: 'string?' }, description: 'Estimate cost' },
    mass: { params: { target: 'string', material: 'string?' }, description: 'Estimate mass' },
    surfaceArea: { params: { target: 'string' }, description: 'Calculate surface area' },
    centerOfMass: { params: { target: 'string' }, description: 'Get center of mass' },
    designReview: { params: { target: 'string' }, description: 'Design review' },
  },
  export: {
    stl: { params: { filename: 'string?', binary: 'bool?' }, description: 'Export STL' },
    obj: { params: { filename: 'string?' }, description: 'Export OBJ' },
    gltf: { params: { filename: 'string?' }, description: 'Export glTF' },
    json: { params: { filename: 'string?' }, description: 'Export JSON' },
    step: { params: { filename: 'string?' }, description: 'Export STEP' },
  },
  marketplace: {
    list: { params: { category: 'string?' }, description: 'List marketplace items' },
    search: { params: { query: 'string', category: 'string?' }, description: 'Search marketplace' },
    publish: { params: { name: 'string', price: 'number?', category: 'string?' }, description: 'Publish to marketplace' },
  },
  cam: {
    slice: { params: { printer: 'string?', layer: 'number?' }, description: 'Slice for 3D printing' },
    toolpath: { params: { tool: 'string', depth: 'number?' }, description: 'Generate CNC toolpath' },
  },
  meta: {
    getSchema: { params: {}, description: 'Get full API schema' },
    getState: { params: {}, description: 'Get session state' },
    version: { params: {}, description: 'Get API version' },
    history: { params: {}, description: 'Get command history' },
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

function color(str, colorName) {
  return COLORS[colorName] + str + COLORS.reset;
}

function log(msg, level = 'info') {
  const timestamp = new Date().toISOString().substr(11, 8);
  const prefix = {
    info: color(`[${timestamp}]`, 'cyan'),
    success: color(`[${timestamp}] ✓`, 'green'),
    error: color(`[${timestamp}] ✗`, 'red'),
    warn: color(`[${timestamp}] ⚠`, 'yellow'),
    debug: color(`[${timestamp}] ◆`, 'gray'),
  }[level] || `[${timestamp}]`;

  console.log(`${prefix} ${msg}`);
}

function spinner(msg) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  process.stdout.write(msg + ' ');
  const interval = setInterval(() => {
    process.stdout.write('\b' + frames[frame % frames.length]);
    frame++;
  }, 80);
  return () => {
    clearInterval(interval);
    process.stdout.write('\b');
  };
}

function formatTable(headers, rows) {
  const colWidths = headers.map((h, i) => Math.max(h.length, Math.max(...rows.map(r => String(r[i] || '').length))));

  const sep = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const headerRow = '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |';

  const dataRows = rows.map(row =>
    '| ' + row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' | ') + ' |'
  );

  return [sep, headerRow, sep, ...dataRows, sep].join('\n');
}

function formatJSON(obj, indent = 2) {
  return JSON.stringify(obj, null, indent);
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.flags[key] = argv[++i];
      } else {
        args.flags[key] = val || true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.flags[key] = argv[++i];
      } else {
        args.flags[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }

  return args;
}

function parseCommand(cmdStr) {
  const parts = cmdStr.trim().split(/\s+/);
  const method = parts[0];
  const params = {};

  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith('--')) {
      const key = parts[i].slice(2);
      let value = parts[i + 1];

      if (value && !value.startsWith('--')) {
        try {
          params[key] = JSON.parse(value);
        } catch {
          params[key] = value;
        }
        i++;
      } else {
        params[key] = true;
      }
    }
  }

  return { method, params };
}

function validateCommand(method, params) {
  const [ns, cmd] = method.split('.');
  if (!COMMAND_SCHEMA[ns] || !COMMAND_SCHEMA[ns][cmd]) {
    return { ok: false, error: `Unknown command: ${method}` };
  }
  return { ok: true };
}

// ============================================================================
// HTTP Communication
// ============================================================================

function makeRequest(serverUrl, method, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_ENDPOINT, serverUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const body = JSON.stringify({ method, params });
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data: { error: 'Invalid JSON response' } });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ============================================================================
// Command Execution
// ============================================================================

async function executeCommand(method, params, serverUrl, quiet = false) {
  const validation = validateCommand(method, params);
  if (!validation.ok) {
    log(validation.error, 'error');
    return { ok: false };
  }

  if (!quiet) {
    const stop = spinner(`Executing ${color(method, 'blue')}...`);
    try {
      const result = await makeRequest(serverUrl, method, params);
      stop();

      if (result.statusCode === 200 && result.data.ok) {
        log(`Command executed: ${color(method, 'green')}`, 'success');
        return { ok: true, result: result.data.result };
      } else {
        log(`Command failed: ${result.data.error || 'Unknown error'}`, 'error');
        return { ok: false, error: result.data.error };
      }
    } catch (err) {
      stop();
      log(`Connection failed: ${err.message}`, 'error');
      return { ok: false, error: err.message };
    }
  } else {
    try {
      const result = await makeRequest(serverUrl, method, params);
      if (result.statusCode === 200 && result.data.ok) {
        return { ok: true, result: result.data.result };
      } else {
        return { ok: false, error: result.data.error };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

// ============================================================================
// Output Formatting
// ============================================================================

function displayResult(result, asJson = false) {
  if (asJson) {
    console.log(formatJSON(result));
    return;
  }

  if (!result || typeof result !== 'object') {
    console.log(result);
    return;
  }

  // Handle different result types
  if (result.entityId) {
    console.log(color(`  Entity ID: ${result.entityId}`, 'blue'));
  }

  if (result.dimensions) {
    console.log(color('  Dimensions:', 'cyan'));
    console.log(`    Width:  ${result.dimensions.width} mm`);
    console.log(`    Height: ${result.dimensions.height} mm`);
    console.log(`    Depth:  ${result.dimensions.depth} mm`);
  }

  if (result.mass !== undefined) {
    console.log(color(`  Mass: ${result.mass.toFixed(2)} g`, 'cyan'));
  }

  if (result.surfaceArea !== undefined) {
    console.log(color(`  Surface Area: ${result.surfaceArea.toFixed(2)} mm²`, 'cyan'));
  }

  if (result.cost !== undefined) {
    console.log(color(`  Estimated Cost: $${result.cost.toFixed(2)}`, 'cyan'));
  }

  if (result.score) {
    const scoreColor = result.score === 'A' ? 'green' : result.score === 'F' ? 'red' : 'yellow';
    console.log(color(`  Design Review Score: ${result.score}`, scoreColor));
  }

  if (Array.isArray(result)) {
    result.forEach(item => displayResult(item, asJson));
  }
}

// ============================================================================
// Help & Documentation
// ============================================================================

function showHelp(command = null) {
  if (command) {
    const [ns, cmd] = command.split('.');
    const cmdInfo = COMMAND_SCHEMA[ns]?.[cmd];

    if (!cmdInfo) {
      log(`Unknown command: ${command}`, 'error');
      return;
    }

    console.log(`\n${color(`Command: ${command}`, 'bright')}`);
    console.log(`Description: ${cmdInfo.description}`);
    console.log(`\nParameters:`);

    Object.entries(cmdInfo.params || {}).forEach(([key, type]) => {
      console.log(`  ${color(key, 'yellow')}: ${type}`);
    });

    console.log(`\nExample:`);
    console.log(`  cyclecad ${command} ${Object.keys(cmdInfo.params || {})
      .map(k => `--${k} value`)
      .join(' ')}`);
    console.log('');
    return;
  }

  console.log(`
${color('cyclecad', 'bright')} — Agent API CLI for cycleCAD

${color('Usage:', 'bright')}
  cyclecad <namespace>.<command> [--param value ...]
  cyclecad --interactive
  cyclecad --batch <file>
  cyclecad --list
  cyclecad --describe <command>

${color('Global Flags:', 'bright')}
  --help, -h              Show this help message
  --version, -v           Show version
  --server <url>          Server URL (default: ${DEFAULT_SERVER})
  --json                  Output raw JSON
  --quiet, -q             Suppress status messages
  --list                  List all available commands
  --describe <cmd>        Show help for specific command
  --interactive, -i       Start interactive REPL
  --batch <file>          Execute commands from file

${color('Examples:', 'bright')}
  cyclecad shape.cylinder --radius 25 --height 80
  cyclecad feature.fillet --radius 5 --edges all
  cyclecad validate.cost --target extrude_1 --process CNC
  cyclecad --list
  cyclecad --describe shape.cylinder
  cyclecad --interactive
  cyclecad --batch script.txt

${color('Namespaces:', 'bright')}
  ${Object.keys(COMMAND_SCHEMA).map(ns => color(ns, 'cyan')).join(', ')}

For more info: ${color('https://github.com/vvlars-cmd/cyclecad', 'blue')}
`);
}

function listCommands() {
  console.log(`\n${color('Available Commands', 'bright')}\n`);

  Object.entries(COMMAND_SCHEMA).forEach(([ns, commands]) => {
    console.log(color(`${ns}/`, 'cyan'));
    Object.entries(commands).forEach(([cmd, info]) => {
      const params = Object.keys(info.params || {}).join(', ');
      console.log(`  ${cmd}${params ? ` (${params})` : ''}`);
      console.log(`    ${info.description}`);
    });
    console.log('');
  });
}

// ============================================================================
// Interactive REPL Mode
// ============================================================================

async function startREPL(serverUrl, asJson = false, quiet = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: color('cyclecad> ', 'blue'),
    terminal: true,
  });

  const history = [];
  let historyIndex = -1;

  // Setup readline history
  rl.on('line', (line) => {
    if (line.trim()) {
      history.push(line);
      historyIndex = history.length;
    }
  });

  rl.on('SIGINT', () => {
    console.log('');
    log('Goodbye!', 'info');
    rl.close();
    process.exit(0);
  });

  console.log(color('\ncyclecad Interactive REPL', 'bright'));
  console.log(`Type ${color('help', 'cyan')} for commands, ${color('exit', 'cyan')} to quit.\n`);

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'exit' || trimmed === 'quit') {
      log('Goodbye!', 'info');
      rl.close();
      process.exit(0);
    }

    if (trimmed === 'help') {
      listCommands();
      rl.prompt();
      return;
    }

    if (trimmed === 'history') {
      history.forEach((cmd, i) => console.log(`  ${i + 1}: ${cmd}`));
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('describe ')) {
      const cmd = trimmed.slice(9);
      showHelp(cmd);
      rl.prompt();
      return;
    }

    const { method, params } = parseCommand(trimmed);
    const result = await executeCommand(method, params, serverUrl, quiet);

    if (result.ok) {
      displayResult(result.result, asJson);
    } else {
      log(result.error, 'error');
    }

    rl.prompt();
  });
}

// ============================================================================
// Batch Mode
// ============================================================================

async function executeBatch(filePath, serverUrl, asJson = false, quiet = false) {
  let commands;

  try {
    commands = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  } catch (err) {
    log(`Failed to read file: ${err.message}`, 'error');
    process.exit(1);
  }

  log(`Executing ${commands.length} commands from ${filePath}...`, 'info');

  let succeeded = 0;
  let failed = 0;

  for (const cmdStr of commands) {
    const { method, params } = parseCommand(cmdStr);
    const result = await executeCommand(method, params, serverUrl, true);

    if (result.ok) {
      log(`✓ ${method}`, 'success');
      succeeded++;
      if (asJson) {
        displayResult(result.result, true);
      }
    } else {
      log(`✗ ${method}: ${result.error}`, 'error');
      failed++;
    }
  }

  console.log('');
  log(`Batch complete: ${color(succeeded + ' succeeded', 'green')}, ${color(failed + ' failed', failed > 0 ? 'red' : 'green')}`, 'info');

  if (failed > 0) {
    process.exit(1);
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const args = parseArgs(process.argv);

  // Global flags
  if (args.flags.help || args.flags.h) {
    showHelp(args._[0]);
    process.exit(0);
  }

  if (args.flags.version || args.flags.v) {
    console.log(`cyclecad-cli v${VERSION}`);
    process.exit(0);
  }

  const serverUrl = args.flags.server || DEFAULT_SERVER;
  const asJson = args.flags.json || false;
  const quiet = args.flags.quiet || args.flags.q || false;

  if (args.flags.list) {
    listCommands();
    process.exit(0);
  }

  if (args.flags.describe) {
    showHelp(args.flags.describe);
    process.exit(0);
  }

  if (args.flags.interactive || args.flags.i) {
    await startREPL(serverUrl, asJson, quiet);
    return;
  }

  if (args.flags.batch) {
    await executeBatch(args.flags.batch, serverUrl, asJson, quiet);
    return;
  }

  // Single command execution
  if (args._.length === 0) {
    showHelp();
    process.exit(0);
  }

  const method = args._[0];

  // Convert remaining args to params
  const params = {};
  for (let i = 1; i < args._.length; i++) {
    if (args._[i].startsWith('--')) {
      const key = args._[i].slice(2);
      const val = args._[i + 1];
      if (val && !val.startsWith('--')) {
        try {
          params[key] = JSON.parse(val);
        } catch {
          params[key] = val;
        }
        i++;
      } else {
        params[key] = true;
      }
    }
  }

  // Merge flags into params
  Object.assign(params, args.flags);

  const result = await executeCommand(method, params, serverUrl, quiet);

  if (result.ok) {
    displayResult(result.result, asJson);
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'error');
  process.exit(1);
});
