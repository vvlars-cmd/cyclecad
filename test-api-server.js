#!/usr/bin/env node

/**
 * Test suite for cycleCAD API Server
 *
 * Usage:
 *   npm run test:api
 *   node test-api-server.js
 *
 * Verifies all API endpoints and core functionality without external dependencies.
 */

const http = require('http');
const crypto = require('crypto');

// ============================================================================
// TEST FRAMEWORK
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  dim: '\x1b[2m'
};

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.log(`${colors.red}✗ ${message}${colors.reset}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`${colors.green}✓${colors.reset} ${message}`);
  passCount++;
}

function section(title) {
  console.log(`\n${colors.blue}${title}${colors.reset}`);
  console.log(colors.dim + '='.repeat(60) + colors.reset);
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// ============================================================================
// TESTS
// ============================================================================

async function testHealth() {
  section('1. Health Check');
  const { status, body } = await request('GET', '/api/health');
  assert(status === 200, 'Health endpoint returns 200');
  assert(body.ok === true || body.status === 'ok', 'Server status is OK');
  assert(body.version, 'Version is present');
  assert(body.sessionId, 'Session ID is present');
}

async function testSchema() {
  section('2. API Schema');
  const { status, body } = await request('GET', '/api/schema');
  assert(status === 200, 'Schema endpoint returns 200');
  assert(body.version, 'Schema has version');
  assert(body.namespaces, 'Schema has namespaces');
  assert(Object.keys(body.namespaces).length > 0, 'Schema has at least one namespace');
  assert(body.totalCommands > 0, 'Schema lists commands');
  console.log(`  ${colors.dim}(${body.totalCommands} total commands)${colors.reset}`);
}

async function testExecuteSingleCommand() {
  section('3. Execute Single Command');

  // Valid command
  let { status, body } = await request('POST', '/api/execute', {
    method: 'meta.ping',
    params: {}
  });
  assert(status === 200, 'Execute endpoint returns 200');
  assert(body.ok === true, 'Ping command succeeds');
  assert(body.result.status === 'pong', 'Ping returns pong');
  assert(body.elapsed >= 0, 'Elapsed time is tracked');

  // Invalid method
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'invalid.method',
    params: {}
  }));
  assert(status === 400, 'Invalid method returns 400');
  assert(body.ok === false, 'Invalid method fails gracefully');
  assert(body.error, 'Error message is provided');

  // Missing method
  ({ status, body } = await request('POST', '/api/execute', {
    params: {}
  }));
  assert(status === 400, 'Missing method returns 400');
  assert(body.error.includes('method'), 'Error mentions missing method');
}

async function testBatchCommands() {
  section('4. Batch Commands');
  const { status, body } = await request('POST', '/api/batch', {
    commands: [
      { method: 'meta.ping', params: {} },
      { method: 'query.materials', params: {} },
      { method: 'meta.version', params: {} }
    ]
  });
  assert(status === 200, 'Batch endpoint returns 200');
  assert(body.ok === true, 'Batch succeeds');
  assert(body.results.length === 3, 'All 3 commands executed');
  assert(body.executed === 3, 'Executed count is correct');
  assert(body.total === 3, 'Total count is correct');
  assert(body.elapsed >= 0, 'Total elapsed time is tracked');
}

async function testModelManagement() {
  section('5. Model Management');

  // Get models (empty at start)
  let { status, body } = await request('GET', '/api/models');
  assert(status === 200, 'Get models returns 200');
  assert(body.ok === true, 'Models endpoint succeeds');
  assert(Array.isArray(body.models), 'Models is an array');
  const initialCount = body.count;

  // Add component
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'assembly.addComponent',
    params: { name: 'TestComponent', position: [0, 0, 0] }
  }));
  assert(status === 200, 'Add component returns 200');
  assert(body.result.id, 'Component has ID');
  assert(body.result.name === 'TestComponent', 'Component name is correct');
  const componentId = body.result.id;

  // List models
  ({ status, body } = await request('GET', '/api/models'));
  assert(body.count > initialCount, 'Model count increased');

  // Get specific model
  ({ status, body } = await request('GET', `/api/models/${componentId}`));
  assert(status === 200, 'Get specific model returns 200');
  assert(body.model.id === componentId, 'Model ID matches');

  // Delete model
  ({ status, body } = await request('DELETE', `/api/models/${componentId}`));
  assert(status === 200, 'Delete model returns 200');
  assert(body.ok === true, 'Delete succeeds');

  // Verify deletion
  ({ status, body } = await request('GET', `/api/models/${componentId}`));
  assert(status === 404, 'Deleted model returns 404');
}

async function testHistory() {
  section('6. Command History');

  // Execute some commands first
  await request('POST', '/api/execute', { method: 'meta.ping', params: {} });
  await request('POST', '/api/execute', { method: 'query.materials', params: {} });

  // Get history
  const { status, body } = await request('GET', '/api/history?count=10');
  assert(status === 200, 'History endpoint returns 200');
  assert(body.sessionId, 'History has session ID');
  assert(body.total >= 2, 'History records previous commands');
  assert(Array.isArray(body.recent), 'Recent is an array');
}

async function testRateLimiting() {
  section('7. Rate Limiting');

  // Check rate limit headers
  const { headers } = await request('GET', '/api/health');
  assert(headers['ratelimit-limit'], 'Rate limit header present');
  assert(headers['ratelimit-remaining'], 'Rate limit remaining header present');
  assert(headers['ratelimit-reset'], 'Rate limit reset header present');
  const limit = parseInt(headers['ratelimit-limit']);
  const remaining = parseInt(headers['ratelimit-remaining']);
  assert(remaining <= limit, 'Remaining is less than limit');
}

async function testCORS() {
  section('8. CORS Headers');

  const { headers } = await request('GET', '/api/health');
  assert(headers['access-control-allow-origin'] === '*', 'CORS origin header present');
  assert(headers['access-control-allow-methods'], 'CORS methods header present');
  assert(headers['access-control-allow-headers'], 'CORS headers header present');
}

async function testCOOPCOEP() {
  section('9. COOP/COEP Headers');

  const { headers } = await request('GET', '/api/health');
  assert(headers['cross-origin-opener-policy'], 'COOP header present');
  assert(headers['cross-origin-embedder-policy'], 'COEP header present');
}

async function testSketchCommands() {
  section('10. Sketch Commands');

  // Start sketch
  let { status, body } = await request('POST', '/api/execute', {
    method: 'sketch.start',
    params: { plane: 'XY' }
  });
  assert(status === 200, 'Sketch start returns 200');
  assert(body.result.status === 'active', 'Sketch is active');

  // Draw circle
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'sketch.circle',
    params: { cx: 0, cy: 0, radius: 25 }
  }));
  assert(status === 200, 'Circle command returns 200');
  assert(body.result.radius === 25, 'Circle radius is correct');

  // Draw line
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'sketch.line',
    params: { x1: 0, y1: 0, x2: 100, y2: 50 }
  }));
  assert(status === 200, 'Line command returns 200');
  assert(body.result.length > 0, 'Line length calculated');

  // End sketch
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'sketch.end',
    params: {}
  }));
  assert(status === 200, 'Sketch end returns 200');
  assert(body.result.status === 'complete', 'Sketch completed');
}

async function testOperationCommands() {
  section('11. Operation Commands');

  // Extrude
  let { status, body } = await request('POST', '/api/execute', {
    method: 'ops.extrude',
    params: { height: 50, material: 'steel' }
  });
  assert(status === 200, 'Extrude returns 200');
  assert(body.result.height === 50, 'Extrude height is correct');

  // Fillet
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'ops.fillet',
    params: { target: 'extrude_1', radius: 5 }
  }));
  assert(status === 200, 'Fillet returns 200');
  assert(body.result.radius === 5, 'Fillet radius is correct');

  // Chamfer
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'ops.chamfer',
    params: { target: 'extrude_1', distance: 2 }
  }));
  assert(status === 200, 'Chamfer returns 200');
  assert(body.result.distance === 2, 'Chamfer distance is correct');
}

async function testViewCommands() {
  section('12. View Commands');

  const views = ['isometric', 'top', 'front'];
  for (const view of views) {
    const { status, body } = await request('POST', '/api/execute', {
      method: 'view.set',
      params: { view }
    });
    assert(status === 200, `Setting view to ${view} returns 200`);
    assert(body.result.view === view, `View set to ${view}`);
  }
}

async function testValidationCommands() {
  section('13. Validation Commands');

  // Mass calculation
  let { status, body } = await request('POST', '/api/execute', {
    method: 'validate.mass',
    params: { target: 'test', material: 'steel' }
  });
  assert(status === 200, 'Mass calculation returns 200');
  assert(typeof body.result.mass === 'number', 'Mass is a number');

  // Cost estimation
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'validate.cost',
    params: { target: 'test', process: 'FDM', material: 'PLA' }
  }));
  assert(status === 200, 'Cost estimation returns 200');
  assert(body.result.estimatedCost >= 0, 'Cost is non-negative');
}

async function testQueryCommands() {
  section('14. Query Commands');

  // Query materials
  let { status, body } = await request('POST', '/api/execute', {
    method: 'query.materials',
    params: {}
  });
  assert(status === 200, 'Query materials returns 200');
  assert(Array.isArray(body.result.materials), 'Materials is an array');
  assert(body.result.materials.length > 0, 'Materials list not empty');

  // Query features
  ({ status, body } = await request('POST', '/api/execute', {
    method: 'query.features',
    params: {}
  }));
  assert(status === 200, 'Query features returns 200');
  assert(Array.isArray(body.result.features), 'Features is an array');
}

async function testErrorHandling() {
  section('15. Error Handling');

  // Invalid JSON
  let { status } = await request('POST', '/api/execute', 'invalid json');
  assert(status === 400, 'Invalid JSON returns 400');

  // Method typo (should suggest correction)
  const { body } = await request('POST', '/api/execute', {
    method: 'sketch.circl',  // typo
    params: {}
  });
  assert(body.error.includes('Did you mean'), 'Server suggests correction for typo');

  // Unknown endpoint
  const { status: notFoundStatus } = await request('GET', '/api/unknown');
  assert(notFoundStatus === 404, 'Unknown endpoint returns 404');
}

// ============================================================================
// RUNNER
// ============================================================================

async function main() {
  console.log('\n' + colors.blue + '█'.repeat(60));
  console.log('█ cycleCAD API Server — Test Suite');
  console.log('█'.repeat(60) + colors.reset);

  // Check if server is running
  console.log('\n' + colors.dim + 'Checking if server is running on localhost:3000...');
  try {
    await request('GET', '/api/health');
    console.log(colors.reset + '✓ Server is running\n');
  } catch (e) {
    console.log(colors.red + `✗ Server is not running!`);
    console.log(`\nStart the server with: npm run server\n` + colors.reset);
    process.exit(1);
  }

  // Run all tests
  try {
    await testHealth();
    await testSchema();
    await testExecuteSingleCommand();
    await testBatchCommands();
    await testModelManagement();
    await testHistory();
    await testRateLimiting();
    await testCORS();
    await testCOOPCOEP();
    await testSketchCommands();
    await testOperationCommands();
    await testViewCommands();
    await testValidationCommands();
    await testQueryCommands();
    await testErrorHandling();
  } catch (e) {
    // Error already printed by assert()
  }

  // Summary
  const total = passCount + failCount;
  const percentage = total > 0 ? Math.round((passCount / total) * 100) : 0;

  console.log('\n' + colors.blue + '='.repeat(60));
  console.log(`${colors.green}✓ ${passCount} passed ${colors.reset}| ${colors.red}✗ ${failCount} failed${colors.reset}`);
  console.log(`${percentage}% success rate (${passCount}/${total} tests)`);
  console.log(colors.blue + '='.repeat(60) + colors.reset + '\n');

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.log(`${colors.red}✗ Test suite error: ${e.message}${colors.reset}`);
  process.exit(1);
});
