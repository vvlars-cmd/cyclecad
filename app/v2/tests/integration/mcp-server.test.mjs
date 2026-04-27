/**
 * tests/integration/mcp-server.test.mjs
 *
 * Tests for the Stage 5 MCP server (server/mcp/index.mjs).
 *
 * The server is normally driven over stdio; spinning a subprocess inside a
 * runner is awkward and flaky on CI. We test the static surface instead:
 *
 *   1. The server file passes `node --check` (syntax valid).
 *   2. The exported `getMcpTools()` returns ≥ 30 tools, each with a name,
 *      description, and inputSchema per the MCP tool definition shape.
 *   3. None of the MCP-formatted tools leak the private `_endpoint` field.
 *   4. The agent-tools.json source is well-formed JSON with ≥ 30 entries.
 *   5. The manifest.json file is well-formed and references the same tool
 *      names that the server actually exposes.
 *   6. The README documents the --list-tools flag.
 */

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE       = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(HERE, '..', '..');

const MCP_INDEX_PATH    = path.join(REPO_ROOT, 'server', 'mcp', 'index.mjs');
const MCP_MANIFEST_PATH = path.join(REPO_ROOT, 'server', 'mcp', 'manifest.json');
const MCP_README_PATH   = path.join(REPO_ROOT, 'server', 'mcp', 'README.md');
const TOOLS_PATH        = path.join(REPO_ROOT, 'scripts', 'agent-tools.json');

const MIN_TOOLS = 30;

test('server/mcp/index.mjs passes node --check', () => {
  const r = spawnSync(process.execPath, ['--check', MCP_INDEX_PATH], { encoding: 'utf-8' });
  if (r.status !== 0) {
    throw new Error(`node --check failed:\n${r.stderr || r.stdout}`);
  }
});

test('agent-tools.json is valid JSON with >= 30 entries', async () => {
  const raw = await readFile(TOOLS_PATH, 'utf-8');
  const json = JSON.parse(raw);
  assert(Array.isArray(json.tools), 'tools[] must be an array');
  assert(
    json.tools.length >= MIN_TOOLS,
    `expected >= ${MIN_TOOLS} tools, got ${json.tools.length}`
  );
  for (const t of json.tools) {
    assert(typeof t.name === 'string' && t.name.length > 0, `tool name missing: ${JSON.stringify(t).slice(0, 80)}`);
    assert(typeof t.description === 'string', `tool ${t.name} description must be a string`);
    assert(t.input_schema && typeof t.input_schema === 'object', `tool ${t.name} input_schema must be an object`);
    assert(t._endpoint && typeof t._endpoint === 'object', `tool ${t.name} _endpoint must exist (it is private routing data)`);
  }
});

test('getMcpTools() returns the catalog formatted for MCP', async () => {
  const mod = await import(pathToFileURL(MCP_INDEX_PATH).href);
  assert(typeof mod.getMcpTools === 'function', 'getMcpTools must be exported');
  const tools = await mod.getMcpTools();
  assert(Array.isArray(tools), 'getMcpTools must return an array');
  assert(tools.length >= MIN_TOOLS, `expected >= ${MIN_TOOLS} tools, got ${tools.length}`);
});

test('every MCP tool has name + description + inputSchema (camelCase)', async () => {
  const mod = await import(pathToFileURL(MCP_INDEX_PATH).href);
  const tools = await mod.getMcpTools();
  for (const t of tools) {
    assert(typeof t.name === 'string' && t.name.length > 0, `missing name`);
    assertEq(typeof t.description, 'string', `${t.name} description must be a string`);
    assert(t.inputSchema && typeof t.inputSchema === 'object', `${t.name} inputSchema must be an object`);
    assertEq(t.inputSchema.type, 'object', `${t.name} inputSchema.type must be "object"`);
  }
});

test('MCP tool list MUST NOT leak the private _endpoint field', async () => {
  const mod = await import(pathToFileURL(MCP_INDEX_PATH).href);
  const tools = await mod.getMcpTools();
  for (const t of tools) {
    assertEq(t._endpoint, undefined, `${t.name} must not expose _endpoint`);
    assertEq(t.input_schema, undefined, `${t.name} must use camelCase inputSchema, not input_schema`);
  }
});

test('manifest.json is valid and lists the same tool names', async () => {
  const raw = await readFile(MCP_MANIFEST_PATH, 'utf-8');
  const manifest = JSON.parse(raw);
  assertEq(manifest.name, 'cyclecad-suite', 'manifest.name');
  assertEq(manifest.transport, 'stdio', 'manifest.transport');
  assert(Array.isArray(manifest.tools), 'manifest.tools must be an array');
  assert(manifest.tools.length >= MIN_TOOLS, `manifest.tools length ${manifest.tools.length} < ${MIN_TOOLS}`);

  const mod = await import(pathToFileURL(MCP_INDEX_PATH).href);
  const liveTools = await mod.getMcpTools();
  const liveNames = new Set(liveTools.map(t => t.name));
  for (const name of manifest.tools) {
    assert(liveNames.has(name), `manifest references unknown tool: ${name}`);
  }
});

test('manifest.json declares the JSON-RPC methods we implement', async () => {
  const raw = await readFile(MCP_MANIFEST_PATH, 'utf-8');
  const manifest = JSON.parse(raw);
  const required = ['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read'];
  for (const m of required) {
    assert(manifest.rpcMethods.includes(m), `manifest.rpcMethods missing ${m}`);
  }
});

test('README documents the --list-tools flag', async () => {
  const txt = await readFile(MCP_README_PATH, 'utf-8');
  assert(txt.includes('--list-tools'), 'README must document --list-tools');
  assert(txt.includes('claude_desktop_config.json'), 'README must document Claude Desktop registration');
  assert(txt.includes('claude mcp add'), 'README must document Claude Code registration');
});

test('--list-tools CLI prints >= 30 tool lines and exits 0', () => {
  const r = spawnSync(process.execPath, [MCP_INDEX_PATH, '--list-tools'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  assertEq(r.status, 0, `--list-tools exit status: ${r.status} stderr=${r.stderr}`);
  const lines = r.stdout.split('\n').filter(l => l && !l.startsWith('#'));
  assert(lines.length >= MIN_TOOLS, `expected >= ${MIN_TOOLS} tool lines, got ${lines.length}`);
  for (const line of lines) {
    assert(line.includes('\t'), `--list-tools line missing TAB separator: ${line.slice(0, 60)}`);
  }
});

await summary();
