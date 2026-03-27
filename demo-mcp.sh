#!/bin/bash
# Demo script showing how to test the MCP server

echo "===== cycleCAD MCP Server Demo ====="
echo ""
echo "Starting MCP server in background..."
node bin/cyclecad-mcp &
PID=$!
sleep 1

echo ""
echo "Sending initialize request..."
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize"}' | node -e "
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.once('line', (line) => {
  const req = JSON.parse(line);
  // Send to MCP server via spawn
  const { spawn } = require('child_process');
  const proc = spawn('node', ['bin/cyclecad-mcp']);
  proc.stdin.write(JSON.stringify(req) + '\n');
  proc.stdout.once('data', (data) => {
    console.log('Response:');
    console.log(JSON.stringify(JSON.parse(data), null, 2));
    proc.kill();
    process.exit(0);
  });
});
"

echo ""
echo "Sending tools/list request..."
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}' | node -e "
const { spawn } = require('child_process');
const proc = spawn('node', ['bin/cyclecad-mcp']);
const rl = require('readline').createInterface({ input: process.stdin });
rl.once('line', (line) => {
  const req = JSON.parse(line);
  proc.stdin.write(JSON.stringify(req) + '\n');
  proc.stdout.once('data', (data) => {
    const resp = JSON.parse(data);
    console.log('Available tools: ' + resp.result.tools.length);
    resp.result.tools.slice(0, 5).forEach(t => {
      console.log('  - ' + t.name + ': ' + t.description);
    });
    console.log('  ... and ' + (resp.result.tools.length - 5) + ' more');
    proc.kill();
    process.exit(0);
  });
  proc.stderr.on('data', () => {}); // Suppress stderr
});
"

echo ""
echo "Killing background MCP process..."
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

echo ""
echo "Done!"
