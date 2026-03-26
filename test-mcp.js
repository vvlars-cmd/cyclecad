#!/usr/bin/env node

/**
 * Test utility for cyclecad-mcp server
 * Tests the MCP protocol without needing Claude API
 *
 * Usage:
 *   node test-mcp.js --help
 *   node test-mcp.js --list-tools
 *   node test-mcp.js --test-initialize
 *   node test-mcp.js --test-tool sketch_rect --args '{"width": 50, "height": 30}'
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Test utility for cyclecad-mcp server

Usage: node test-mcp.js [OPTIONS]

OPTIONS:
  --help              Show this help message
  --list-tools        List all available tools
  --test-initialize   Test server initialization
  --test-tool NAME    Test a specific tool
  --args JSON         Arguments for the tool (as JSON)
  --debug             Show debug output

EXAMPLES:
  node test-mcp.js --list-tools
  node test-mcp.js --test-initialize
  node test-mcp.js --test-tool sketch_rect --args '{"width": 50, "height": 30}'
  node test-mcp.js --test-tool ops_primitive --args '{"shape": "sphere", "radius": 10}'
  node test-mcp.js --test-tool query_materials
  node test-mcp.js --test-tool validate_dimensions --args '{"target": "extrude_1"}'

  `);
  process.exit(0);
}

const debug = args.includes('--debug');

async function runTest() {
  const mcpProcess = spawn('node', [path.join(__dirname, 'server', 'mcp-server.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let errorOutput = '';

  mcpProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  mcpProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
    if (debug) console.error('[MCP]', data.toString().trim());
  });

  mcpProcess.on('error', (err) => {
    console.error('Failed to start MCP server:', err);
    process.exit(1);
  });

  // Wait a bit for server to be ready
  await new Promise(resolve => setTimeout(resolve, 200));

  async function send(req) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        mcpProcess.kill();
        reject(new Error('No response from MCP server (timeout)'));
      }, 5000);

      const lines = [];
      const dataHandler = (data) => {
        const text = data.toString();
        lines.push(text);
        try {
          const combined = lines.join('');
          if (combined.includes('{')) {
            const json = JSON.parse(combined.trim());
            clearTimeout(timeout);
            mcpProcess.stdout.removeListener('data', dataHandler);
            resolve(json);
          }
        } catch (e) {
          // Not complete JSON yet
        }
      };

      mcpProcess.stdout.on('data', dataHandler);
      mcpProcess.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  try {
    // Initialize
    if (debug) console.log('Sending initialize request...');
    const initResp = await send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    if (debug) console.log('Initialize response:', JSON.stringify(initResp, null, 2));

    if (args.includes('--list-tools')) {
      // Get tools list
      if (debug) console.log('\nSending tools/list request...');
      const listResp = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const tools = listResp.result.tools;
      console.log(`\nAvailable Tools (${tools.length}):`);
      console.log('=' .repeat(70));

      // Group by namespace
      const byNamespace = {};
      tools.forEach(t => {
        const ns = t.name.split('_')[0];
        if (!byNamespace[ns]) byNamespace[ns] = [];
        byNamespace[ns].push(t.name);
      });

      Object.keys(byNamespace).sort().forEach(ns => {
        console.log(`\n${ns.toUpperCase()} (${byNamespace[ns].length} tools)`);
        byNamespace[ns].forEach(name => {
          const tool = tools.find(t => t.name === name);
          const desc = tool.description || 'No description';
          console.log(`  • ${name}`);
          console.log(`    ${desc}`);
        });
      });
      console.log('\n');
    }

    if (args.includes('--test-initialize')) {
      console.log('\nInitialization successful!');
      console.log('Server info:', initResp.result.serverInfo);
    }

    if (args.includes('--test-tool')) {
      const toolIdx = args.indexOf('--test-tool');
      const toolName = args[toolIdx + 1];
      if (!toolName) {
        console.error('Missing tool name after --test-tool');
        process.exit(1);
      }

      const argsIdx = args.indexOf('--args');
      let toolArgs = {};
      if (argsIdx !== -1 && args[argsIdx + 1]) {
        try {
          toolArgs = JSON.parse(args[argsIdx + 1]);
        } catch (e) {
          console.error('Invalid JSON in --args:', e.message);
          process.exit(1);
        }
      }

      console.log(`\nTesting tool: ${toolName}`);
      if (Object.keys(toolArgs).length > 0) {
        console.log('Arguments:', JSON.stringify(toolArgs, null, 2));
      } else {
        console.log('Arguments: (none)');
      }
      console.log('');

      const callResp = await send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArgs
        }
      });

      if (callResp.error) {
        console.error('Tool call failed:', callResp.error.message);
      } else {
        console.log('Tool call successful!');
        console.log('Result:', callResp.result.content[0].text);
      }
    }

  } catch (e) {
    console.error('Test failed:', e.message);
    process.exit(1);
  } finally {
    mcpProcess.kill();
  }
}

runTest().then(() => {
  process.exit(0);
}).catch(e => {
  console.error('Unexpected error:', e.message);
  process.exit(1);
});
