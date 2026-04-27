/**
 * @file widgets/admin-platform-overview.js
 * @description Admin · cross-cutting infrastructure dashboard for the
 *   THREE distribution channels of the cycleCAD Suite (Docker stack ·
 *   MCP server · Web hosting on cyclecad.com) plus the FOUR databases
 *   (Postgres · Redis · MinIO · JSON-file data layer used by OutreachPro).
 *
 *   Five tabs:
 *     1. Docker        — six service cards + stack-wide log tail
 *     2. MCP server    — status pill, tool catalog, recent calls, test panel
 *     3. Web hosting   — domain status grid, edge stats, hosting mode
 *     4. Databases     — Postgres / Redis / MinIO / JSON-file cards
 *     5. Distribution  — overview of all three channels (Try-it CTAs)
 *
 *   The widget tries a handful of /api/admin/* endpoints; if any 404 it
 *   falls back to demo data so the dashboard always renders.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const ENDPOINTS = {
  dockerStatus:  '/api/admin/docker/status',
  dockerLogs:    '/api/admin/docker/logs',
  dockerRestart: '/api/admin/docker/restart',
  mcpStatus:     '/api/admin/mcp/status',
  mcpCalls:      '/api/admin/mcp/calls',
  webDomains:    '/api/admin/web/domains',
  webReissue:    '/api/admin/web/reissue-tls',
  dbStats:       '/api/admin/db/stats',
  dbBackup:      '/api/admin/db/backup',
};

const ADMIN_KEY_NAME = 'cyclecad.adminKey';

const PALETTE = {
  sky:     '#3B82F6',
  emerald: '#10B981',
  purple:  '#7C3AED',
  gold:    '#D4A843',
  rose:    '#E11D48',
  slate:   '#64748B',
  amber:   '#F59E0B',
};

/**
 * @typedef {Object} ServiceCard
 * @property {string} name
 * @property {string} image
 * @property {string} state            running | exited | unhealthy
 * @property {string} health           healthy | starting | unhealthy
 * @property {number} cpuPct
 * @property {number} memPct
 * @property {number} memMB
 * @property {string} uptime
 * @property {string} netIn
 * @property {string} netOut
 * @property {string} lastLog
 *
 * @typedef {Object} DomainRow
 * @property {string} host
 * @property {boolean} dnsOk
 * @property {string} tlsExpiry
 * @property {string} upstream
 * @property {number} responseMs
 * @property {string} lastFailure
 *
 * @typedef {Object} McpToolRow
 * @property {string} name
 * @property {string} description
 * @property {string} lastCalledAt
 * @property {number} callCount
 * @property {number} avgLatencyMs
 * @property {number} errorRatePct
 */

/**
 * Initialise the platform-overview widget.
 *
 * @param {{mount: string|HTMLElement, defaultTab?: string}} opts
 * @returns {Promise<{api: object, on: Function, destroy: Function}>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('admin-platform-overview: mount not found');

  const wrap = document.createElement('div');
  wrap.className = 'pt-admin-platform-overview';
  wrap.style.cssText = `
    font: 13px/1.5 Inter, -apple-system, sans-serif; color: #1A1A1A;
    padding: 24px; max-width: 1280px;
  `;
  wrap.innerHTML = renderShell();
  root.appendChild(wrap);

  const adminKey = (() => { try { return localStorage.getItem(ADMIN_KEY_NAME); } catch { return null; } })();
  const listeners = { change: [], refresh: [], tab: [], result: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const timers = new Set();
  const eventSources = new Set();
  let activeTab = opts.defaultTab || 'docker';
  let lastSnapshot = { docker: null, mcp: null, web: null, db: null };

  // ---------------------------------------------------------------- fetch helpers
  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { headers: adminKey ? { 'X-Admin-Key': adminKey } : {} });
      if (!r.ok) return { ok: false, status: r.status };
      return await r.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function postJSON(url, body) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(adminKey ? { 'X-Admin-Key': adminKey } : {}) },
        body: JSON.stringify(body || {}),
      });
      if (!r.ok) return { ok: false, status: r.status };
      return await r.json().catch(() => ({ ok: true }));
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------- demo data
  function demoDocker() {
    return {
      ok: true,
      services: [
        { name: 'postgres', image: 'postgres:16-alpine',         state: 'running', health: 'healthy', cpuPct: 1.2, memPct: 18, memMB: 92,  uptime: '3d 4h', netIn: '12 MB', netOut: '4 MB',  lastLog: 'database system is ready to accept connections' },
        { name: 'redis',    image: 'redis:7-alpine',             state: 'running', health: 'healthy', cpuPct: 0.4, memPct:  6, memMB: 28,  uptime: '3d 4h', netIn: '2 MB',  netOut: '1 MB',  lastLog: 'Ready to accept connections tcp' },
        { name: 'minio',    image: 'minio/minio:RELEASE.2024',   state: 'running', health: 'healthy', cpuPct: 0.9, memPct: 14, memMB: 76,  uptime: '3d 4h', netIn: '40 MB', netOut: '120 MB', lastLog: 'API: http://172.18.0.3:9000' },
        { name: 'meter',    image: 'cyclecad/meter:fastify-22',  state: 'running', health: 'healthy', cpuPct: 2.6, memPct: 22, memMB: 116, uptime: '3d 4h', netIn: '8 MB',  netOut: '14 MB', lastLog: 'Server listening at http://0.0.0.0:8787' },
        { name: 'bridge',   image: 'cyclecad/bridge:linuxcnc',   state: 'running', health: 'healthy', cpuPct: 0.3, memPct:  4, memMB: 22,  uptime: '3d 4h', netIn: '0 MB',  netOut: '0 MB',  lastLog: 'mock-mode bridge listening on 9090' },
        { name: 'caddy',    image: 'caddy:2-alpine',             state: 'running', health: 'healthy', cpuPct: 0.5, memPct:  3, memMB: 18,  uptime: '3d 4h', netIn: '60 MB', netOut: '210 MB',lastLog: 'serving cyclecad.com via HTTPS' },
      ],
      stack: { healthy: 6, total: 6, totalMemMB: 412, diskUsedGB: 18, diskTotalGB: 40 },
      logs: [
        { ts: nowIso(-30), svc: 'meter',    level: 'info',  msg: 'POST /api/meter/spend 200 12ms' },
        { ts: nowIso(-25), svc: 'postgres', level: 'info',  msg: 'checkpoint complete' },
        { ts: nowIso(-22), svc: 'redis',    level: 'info',  msg: 'OK PING reply' },
        { ts: nowIso(-18), svc: 'caddy',    level: 'info',  msg: 'GET cyclecad.com 200 4ms' },
        { ts: nowIso(-12), svc: 'meter',    level: 'warn',  msg: 'rate-limit hit · actor=demo · key=anon' },
        { ts: nowIso(-9),  svc: 'minio',    level: 'info',  msg: 'PUT cyclecad/parts/iso/M6.step 201' },
        { ts: nowIso(-4),  svc: 'bridge',   level: 'info',  msg: 'mock joint update interval=200ms' },
      ],
    };
  }
  function demoMcp() {
    const sample = [
      'lib.list_categories', 'lib.list_parts', 'lib.fetch_part', 'lib.import_step', 'lib.upload_pdf',
      'lib.search_parts', 'lib.tag_part', 'lib.delete_part', 'lib.bulk_import', 'lib.export_bundle',
      'lib.create_drawing', 'lib.list_drawings', 'lib.fetch_drawing', 'lib.regen_drawing', 'lib.delete_drawing',
      'lib.create_project', 'lib.list_projects', 'lib.fetch_project', 'lib.archive_project', 'lib.fork_project',
      'meter.balance', 'meter.spend', 'meter.refund', 'meter.recent', 'meter.actor_summary',
      'meter.tx_lookup', 'meter.bypass_grant', 'meter.bypass_list', 'meter.audit_chain', 'meter.config_dump',
    ];
    const tools = sample.map((n, i) => ({
      name: n,
      description: `${n.startsWith('lib.') ? 'Library' : 'Meter'} tool · ${n.split('.')[1].replace(/_/g, ' ')}`,
      lastCalledAt: nowIso(-(i + 1) * 60),
      callCount: 40 + (i * 3) % 73,
      avgLatencyMs: 6 + (i * 5) % 90,
      errorRatePct: i === 7 ? 1.2 : 0,
    }));
    return {
      ok: true,
      server: { running: true, version: '0.5.0', uptime: '14h 22m', transport: 'stdio', clients: 2, registered: true },
      tools,
      recent: [
        { tool: 'lib.list_parts',    client: 'claude-code',    args: { category: 'fasteners' }, result: '24 parts',  ms: 18, ok: true,  ts: nowIso(-12) },
        { tool: 'meter.balance',     client: 'claude-desktop', args: { actor: 'admin' },        result: '$CYCLE 9 821', ms: 9, ok: true,  ts: nowIso(-46) },
        { tool: 'lib.fetch_part',    client: 'claude-code',    args: { id: 'p_iso_m6' },        result: 'OK · 1 step', ms: 22, ok: true,  ts: nowIso(-90) },
        { tool: 'lib.create_drawing',client: 'claude-code',    args: { partId: 'p_iso_m6' },    result: 'd_4f12',     ms: 320, ok: true, ts: nowIso(-180) },
        { tool: 'meter.spend',       client: 'claude-code',    args: { actor: 'admin', cost: 12 }, result: 'tx_a18',  ms: 11, ok: true,  ts: nowIso(-260) },
      ],
    };
  }
  function demoWeb() {
    return {
      ok: true,
      domains: [
        { host: 'cyclecad.com',        dnsOk: true,  tlsExpiry: '2026-09-12', upstream: 'apps:80',    responseMs: 42,  lastFailure: '—' },
        { host: 'www.cyclecad.com',    dnsOk: true,  tlsExpiry: '2026-09-12', upstream: 'apps:80',    responseMs: 44,  lastFailure: '—' },
        { host: 'api.cyclecad.com',    dnsOk: true,  tlsExpiry: '2026-09-12', upstream: 'meter:8787', responseMs: 18,  lastFailure: '—' },
        { host: 'bridge.cyclecad.com', dnsOk: true,  tlsExpiry: '2026-09-12', upstream: 'bridge:9090',responseMs: 22,  lastFailure: '—' },
        { host: 's3.cyclecad.com',     dnsOk: true,  tlsExpiry: '2026-09-12', upstream: 'minio:9000', responseMs: 31,  lastFailure: '—' },
      ],
      hosting: { mode: inferHostingMode(), build: 'docker-compose.prod.yml', cdn: 'Caddy 2 · LE auto-cert' },
      edge: { reqPerMin: 142, fourxxRate: 0.6, fivexxRate: 0.0, cacheHitRatio: 78 },
    };
  }
  function demoDb() {
    return {
      ok: true,
      postgres: {
        rowsTotal: 184_220, connections: 6, slowQueries1h: 0, replicationLagMs: 0,
        topTables: [
          { name: 'audit_chain',  size: '54 MB', rows: 92_400 },
          { name: 'ledger',       size: '38 MB', rows: 41_120 },
          { name: 'parts',        size: '22 MB', rows: 18_640 },
          { name: 'drawings',     size: '14 MB', rows:  6_240 },
          { name: 'projects',     size:  '4 MB', rows:  1_820 },
        ],
      },
      redis: { opsPerSec: 84, hitRate: 96, memUsedMB: 28, evictedKeys: 0, persistence: 'AOF · everysec' },
      minio: {
        buckets: 4, totalSize: '6.2 GB', monthlyEgressGB: 12,
        topBuckets: [
          { name: 'cyclecad-parts',    size: '3.1 GB' },
          { name: 'cyclecad-drawings', size: '2.4 GB' },
          { name: 'cyclecad-bundles',  size: '0.6 GB' },
          { name: 'cyclecad-renders',  size: '0.1 GB' },
        ],
      },
      jsonFile: {
        leads:     { size: '184 KB', mtime: nowIso(-1800) },
        campaigns: { size:  '42 KB', mtime: nowIso(-3600 * 4) },
        templates: { size:  '18 KB', mtime: nowIso(-86400 * 2) },
      },
    };
  }

  function inferHostingMode() {
    try {
      const cfg = (typeof window !== 'undefined' && window.CYCLECAD_CONFIG) || {};
      if (cfg.deployMode) return cfg.deployMode;
      if (typeof location !== 'undefined') {
        if (/cyclecad\.com$/.test(location.hostname)) return 'VPS · docker-compose.prod';
        if (/pages\.dev$/.test(location.hostname))   return 'Cloudflare Pages + Fly.io';
        if (/fly\.dev$/.test(location.hostname))     return 'Fly.io';
        if (/^localhost|127\.0\.0\.1$/.test(location.hostname)) return 'localhost (dev)';
      }
    } catch {}
    return 'localhost (dev)';
  }

  // ---------------------------------------------------------------- refresh per-tab
  async function refreshDocker() {
    const r = await fetchJSON(ENDPOINTS.dockerStatus);
    const data = (r && r.ok && r.services) ? r : demoDocker();
    lastSnapshot.docker = data;
    if (activeTab === 'docker') paintDocker(data);
    emit('refresh', { tab: 'docker', source: r.ok ? 'server' : 'demo', data });
    return data;
  }
  async function refreshMcp() {
    const [s, c] = await Promise.all([fetchJSON(ENDPOINTS.mcpStatus), fetchJSON(ENDPOINTS.mcpCalls + '?limit=20')]);
    const sOk = s && s.ok && s.server;
    const cOk = c && c.ok && c.recent;
    const demo = demoMcp();
    const data = {
      ok: true,
      server: sOk ? s.server : demo.server,
      tools:  sOk && s.tools ? s.tools : demo.tools,
      recent: cOk ? c.recent : demo.recent,
      _source: { status: sOk ? 'server' : 'demo', calls: cOk ? 'server' : 'demo' },
    };
    lastSnapshot.mcp = data;
    if (activeTab === 'mcp') paintMcp(data);
    emit('refresh', { tab: 'mcp', source: data._source, data });
    return data;
  }
  async function refreshWeb() {
    const r = await fetchJSON(ENDPOINTS.webDomains);
    const data = (r && r.ok && r.domains) ? r : demoWeb();
    lastSnapshot.web = data;
    if (activeTab === 'web') paintWeb(data);
    emit('refresh', { tab: 'web', source: r.ok ? 'server' : 'demo', data });
    return data;
  }
  async function refreshDb() {
    const r = await fetchJSON(ENDPOINTS.dbStats);
    const data = (r && r.ok && r.postgres) ? r : demoDb();
    lastSnapshot.db = data;
    if (activeTab === 'db') paintDb(data);
    emit('refresh', { tab: 'db', source: r.ok ? 'server' : 'demo', data });
    return data;
  }
  async function refreshAll() {
    await Promise.all([refreshDocker(), refreshMcp(), refreshWeb(), refreshDb()]);
    if (activeTab === 'channels') paintChannels();
  }

  // ---------------------------------------------------------------- paint Docker
  function paintDocker(data) {
    const body = wrap.querySelector('[data-tab-body]');
    const stack = data.stack || { healthy: 0, total: 0, totalMemMB: 0, diskUsedGB: 0, diskTotalGB: 0 };
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin-bottom:14px">
        <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase">Stack health</div>
        <div style="font:600 14px Georgia">${stack.healthy}/${stack.total} healthy</div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">total mem: ${stack.totalMemMB} MB</div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">disk: ${stack.diskUsedGB} GB / ${stack.diskTotalGB} GB</div>
        <span style="flex:1"></span>
        <button data-refresh-docker style="${btn(PALETTE.emerald)}">REFRESH</button>
      </div>
      <div data-svc-grid style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        ${(data.services || []).map(svcCard).join('')}
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase">Stack log tail</div>
          <span style="flex:1"></span>
          <select data-log-filter style="font:11px Inter;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px">
            <option value="all">all</option><option value="info">info</option>
            <option value="warn">warn</option><option value="error">error</option>
          </select>
        </div>
        <pre data-log-tail style="margin:0;background:#0F172A;color:#E2E8F0;padding:10px;border-radius:4px;font:11px Menlo,monospace;max-height:180px;overflow:auto">${(data.logs||[]).map(logLine).join('\n')}</pre>
      </div>`;
    body.querySelector('[data-refresh-docker]').addEventListener('click', refreshDocker);
    body.querySelector('[data-log-filter]').addEventListener('change', (e) => {
      const lvl = e.target.value;
      const lines = (data.logs || []).filter(l => lvl === 'all' || l.level === lvl);
      body.querySelector('[data-log-tail]').textContent = lines.map(logLine).join('\n');
    });
    body.querySelectorAll('[data-restart]').forEach(b => b.addEventListener('click', async () => {
      const svc = b.getAttribute('data-restart');
      b.disabled = true; b.textContent = 'restarting…';
      const r = await postJSON(ENDPOINTS.dockerRestart, { service: svc });
      b.textContent = r.ok ? 'queued' : 'demo';
      setTimeout(() => { b.disabled = false; b.textContent = 'Restart'; }, 1500);
      emit('result', { kind: 'docker.restart', service: svc, result: r });
    }));
  }
  function svcCard(s) {
    const pill = healthPill(s.health);
    return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${stateColor(s)};border-radius:6px;padding:12px 14px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font:600 14px Georgia">${esc(s.name)}</div>
          ${pill}
          <span style="flex:1"></span>
          <button data-restart="${esc(s.name)}" style="${btn('#f3f4f6','#1A1A1A')};padding:3px 8px;font-size:10px">Restart</button>
        </div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate};margin-top:2px">${esc(s.image)}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px;font:11px Menlo,monospace">
          <div>cpu: ${s.cpuPct.toFixed(1)}%</div>
          <div>mem: ${s.memPct}% (${s.memMB} MB)</div>
          <div>up: ${esc(s.uptime)}</div>
          <div>net: ${esc(s.netIn)} / ${esc(s.netOut)}</div>
        </div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate};margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(s.lastLog)}">▎${esc(s.lastLog)}</div>
      </div>`;
  }
  function logLine(l) {
    const c = l.level === 'error' ? '#FCA5A5' : l.level === 'warn' ? '#FCD34D' : '#94A3B8';
    return `<span style="color:${c}">${formatTs(l.ts)} [${(l.svc||'').padEnd(8)}] ${(l.level||'info').padEnd(5)}</span> ${esc(l.msg)}`;
  }

  // ---------------------------------------------------------------- paint MCP
  function paintMcp(data) {
    const body = wrap.querySelector('[data-tab-body]');
    const sv = data.server || {};
    const statusColor = sv.running ? PALETTE.emerald : PALETTE.rose;
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin-bottom:14px">
        <div style="background:${statusColor};color:#fff;padding:4px 10px;border-radius:999px;font:600 11px Inter;letter-spacing:1.5px">
          ${sv.running ? 'RUNNING' : (sv.registered === false ? 'NOT REGISTERED' : 'STOPPED')}
        </div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">v${esc(sv.version || '?')}</div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">uptime: ${esc(sv.uptime || '?')}</div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">transport: ${esc(sv.transport || 'stdio')}</div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">clients: ${sv.clients ?? 0}</div>
        <span style="flex:1"></span>
        <button data-mcp-register style="${btn(PALETTE.purple)}">Register with Claude Code</button>
        <button data-refresh-mcp style="${btn(PALETTE.emerald)}">REFRESH</button>
      </div>

      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px">
          <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Tool catalog · ${(data.tools||[]).length}</div>
          <div style="max-height:280px;overflow:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="text-align:left;color:#9CA3AF;font:10px Inter;text-transform:uppercase">
                <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb">name</th>
                <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb">last</th>
                <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right">calls</th>
                <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right">avg ms</th>
                <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right">err %</th>
              </tr></thead>
              <tbody>${(data.tools||[]).map(t => `
                <tr>
                  <td style="padding:5px 4px;font:11px Menlo,monospace">${esc(t.name)}</td>
                  <td style="padding:5px 4px;color:${PALETTE.slate};font:11px Menlo,monospace">${formatTs(t.lastCalledAt)}</td>
                  <td style="padding:5px 4px;text-align:right">${t.callCount}</td>
                  <td style="padding:5px 4px;text-align:right">${t.avgLatencyMs}</td>
                  <td style="padding:5px 4px;text-align:right;color:${t.errorRatePct ? PALETTE.rose : '#1A1A1A'}">${t.errorRatePct.toFixed(1)}</td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px">
            <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Recent calls · ${(data.recent||[]).length}</div>
            <div style="max-height:160px;overflow:auto;font:11px Menlo,monospace">
              ${(data.recent||[]).map(c => `
                <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f3f4f6">
                  <span style="color:${c.ok ? PALETTE.emerald : PALETTE.rose}">${c.ok ? '●' : '×'}</span>
                  <span style="color:${PALETTE.slate};width:64px">${formatTs(c.ts)}</span>
                  <span style="flex:1;color:#1A1A1A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(JSON.stringify(c.args))}">${esc(c.tool)}</span>
                  <span style="color:${PALETTE.slate}">${c.ms}ms</span>
                </div>`).join('') || '<div style="color:#9CA3AF">no calls yet</div>'}
            </div>
          </div>

          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px">
            <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Test tool call</div>
            <div style="display:grid;grid-template-columns:1fr;gap:6px">
              <select data-mcp-tool style="font:11px Menlo,monospace;padding:5px;border:1px solid #e5e7eb;border-radius:4px">
                ${(data.tools||[]).map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')}
              </select>
              <textarea data-mcp-args rows="3" placeholder='{"foo":"bar"}' style="font:11px Menlo,monospace;padding:5px;border:1px solid #e5e7eb;border-radius:4px;resize:vertical">{}</textarea>
              <div style="display:flex;gap:6px">
                <button data-mcp-run style="${btn(PALETTE.emerald)};flex:1">Run</button>
              </div>
              <pre data-mcp-out style="margin:0;background:#0F172A;color:#E2E8F0;padding:8px;border-radius:4px;font:11px Menlo,monospace;max-height:120px;overflow:auto;display:none"></pre>
            </div>
          </div>
        </div>
      </div>`;

    body.querySelector('[data-refresh-mcp]').addEventListener('click', refreshMcp);
    body.querySelector('[data-mcp-register]').addEventListener('click', () => openMcpRegisterModal());
    body.querySelector('[data-mcp-run]').addEventListener('click', () => {
      const tool = body.querySelector('[data-mcp-tool]').value;
      const argsRaw = body.querySelector('[data-mcp-args]').value;
      let args = {};
      try { args = JSON.parse(argsRaw || '{}'); } catch { /* keep empty */ }
      const out = body.querySelector('[data-mcp-out]');
      out.style.display = 'block';
      const fakeRes = { ok: true, tool, args, result: 'demo · backend not wired', ms: 12 };
      out.textContent = JSON.stringify(fakeRes, null, 2);
      emit('result', { kind: 'mcp.test', tool, args, result: fakeRes });
    });
  }
  function openMcpRegisterModal() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:18px 20px;max-width:560px;width:90%">
        <div style="font:600 16px Georgia;margin-bottom:6px">Register with Claude Code</div>
        <div style="color:${PALETTE.slate};font-size:12px;margin-bottom:10px">Paste this into a terminal where Claude Code is installed.</div>
        <pre style="background:#0F172A;color:#E2E8F0;padding:10px;border-radius:4px;font:12px Menlo,monospace;white-space:pre-wrap">claude mcp add cyclecad-suite -- node ${'$' + '{'}HOME${'}'}/.cyclecad/mcp/index.mjs</pre>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button data-copy style="${btn(PALETTE.emerald)}">Copy</button>
          <button data-close style="${btn('#f3f4f6','#1A1A1A')}">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-copy]').addEventListener('click', () => {
      try { navigator.clipboard.writeText(modal.querySelector('pre').textContent); } catch {}
    });
  }

  // ---------------------------------------------------------------- paint Web
  function paintWeb(data) {
    const body = wrap.querySelector('[data-tab-body]');
    const e = data.edge || {};
    const h = data.hosting || {};
    body.innerHTML = `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px;margin-bottom:14px">
        <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Domains</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="text-align:left;color:#9CA3AF;font:10px Inter;text-transform:uppercase">
            <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb">host</th>
            <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb">dns</th>
            <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb">tls expiry</th>
            <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb">upstream</th>
            <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right">resp</th>
            <th style="padding:6px 4px;border-bottom:1px solid #e5e7eb">last failure</th>
          </tr></thead>
          <tbody>${(data.domains||[]).map(d => `
            <tr>
              <td style="padding:5px 4px;font:12px Menlo,monospace">${esc(d.host)}</td>
              <td style="padding:5px 4px;color:${d.dnsOk ? PALETTE.emerald : PALETTE.rose}">${d.dnsOk ? 'OK' : 'FAIL'}</td>
              <td style="padding:5px 4px;font:11px Menlo,monospace">${esc(d.tlsExpiry)}</td>
              <td style="padding:5px 4px;font:11px Menlo,monospace;color:${PALETTE.slate}">${esc(d.upstream)}</td>
              <td style="padding:5px 4px;text-align:right">${d.responseMs} ms</td>
              <td style="padding:5px 4px;color:${PALETTE.slate}">${esc(d.lastFailure)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${PALETTE.gold};border-radius:6px;padding:14px">
          <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Hosting option</div>
          <div style="font:600 18px Georgia">${esc(h.mode || 'unknown')}</div>
          <div style="font:11px Menlo,monospace;color:${PALETTE.slate};margin-top:4px">build: ${esc(h.build || '—')}</div>
          <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">cdn: ${esc(h.cdn || '—')}</div>
          <button data-reissue-tls style="${btn(PALETTE.purple)};margin-top:10px">Reissue TLS</button>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${PALETTE.sky};border-radius:6px;padding:14px">
          <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Edge stats · last hour</div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;font:12px Menlo,monospace">
            <div>req/min: <strong>${e.reqPerMin ?? 0}</strong></div>
            <div>4xx: <strong>${(e.fourxxRate ?? 0).toFixed(2)}%</strong></div>
            <div>5xx: <strong style="color:${(e.fivexxRate||0) > 0 ? PALETTE.rose : '#1A1A1A'}">${(e.fivexxRate ?? 0).toFixed(2)}%</strong></div>
            <div>cache hit: <strong>${e.cacheHitRatio ?? 0}%</strong></div>
          </div>
        </div>
      </div>`;
    body.querySelector('[data-reissue-tls]').addEventListener('click', async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'requesting…';
      const r = await postJSON(ENDPOINTS.webReissue, {});
      ev.target.textContent = r.ok ? 'queued' : 'demo';
      setTimeout(() => { ev.target.disabled = false; ev.target.textContent = 'Reissue TLS'; }, 1800);
      emit('result', { kind: 'web.reissue', result: r });
    });
  }

  // ---------------------------------------------------------------- paint DB
  function paintDb(data) {
    const body = wrap.querySelector('[data-tab-body]');
    const pg = data.postgres || {}; const rd = data.redis || {}; const mn = data.minio || {}; const jf = data.jsonFile || {};
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
        ${dbCard('Postgres', PALETTE.sky, `
          <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">rows: <strong>${(pg.rowsTotal||0).toLocaleString()}</strong> · conn: ${pg.connections||0} · slow 1h: ${pg.slowQueries1h||0} · lag: ${pg.replicationLagMs||0}ms</div>
          <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11.5px">
            <thead><tr style="text-align:left;color:#9CA3AF;font:10px Inter;text-transform:uppercase"><th>table</th><th style="text-align:right">size</th><th style="text-align:right">rows</th></tr></thead>
            <tbody>${(pg.topTables||[]).map(t => `<tr><td style="padding:3px 0;font:11px Menlo,monospace">${esc(t.name)}</td><td style="text-align:right">${esc(t.size)}</td><td style="text-align:right">${(t.rows||0).toLocaleString()}</td></tr>`).join('')}</tbody>
          </table>`,
          'postgres')}

        ${dbCard('Redis', PALETTE.rose, `
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;font:12px Menlo,monospace">
            <div>ops/sec: <strong>${rd.opsPerSec ?? 0}</strong></div>
            <div>hit rate: <strong>${rd.hitRate ?? 0}%</strong></div>
            <div>mem used: <strong>${rd.memUsedMB ?? 0} MB</strong></div>
            <div>evicted: <strong>${rd.evictedKeys ?? 0}</strong></div>
          </div>
          <div style="font:11px Menlo,monospace;color:${PALETTE.slate};margin-top:8px">persistence: ${esc(rd.persistence || '—')}</div>`,
          null /* no backup */)}

        ${dbCard('MinIO', PALETTE.gold, `
          <div style="font:11px Menlo,monospace;color:${PALETTE.slate}">buckets: <strong>${mn.buckets||0}</strong> · total: <strong>${esc(mn.totalSize||'0')}</strong> · est. egress: ${mn.monthlyEgressGB||0} GB/mo</div>
          <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11.5px">
            <thead><tr style="text-align:left;color:#9CA3AF;font:10px Inter;text-transform:uppercase"><th>bucket</th><th style="text-align:right">size</th></tr></thead>
            <tbody>${(mn.topBuckets||[]).map(b => `<tr><td style="padding:3px 0;font:11px Menlo,monospace">${esc(b.name)}</td><td style="text-align:right">${esc(b.size)}</td></tr>`).join('')}</tbody>
          </table>`,
          'minio')}

        ${dbCard('JSON-file · OutreachPro', PALETTE.purple, `
          <table style="width:100%;border-collapse:collapse;font-size:11.5px">
            <thead><tr style="text-align:left;color:#9CA3AF;font:10px Inter;text-transform:uppercase"><th>file</th><th>size</th><th>last modified</th></tr></thead>
            <tbody>
              <tr><td style="padding:3px 0;font:11px Menlo,monospace">leads.json</td><td>${esc(jf.leads?.size||'?')}</td><td>${formatTs(jf.leads?.mtime)}</td></tr>
              <tr><td style="padding:3px 0;font:11px Menlo,monospace">campaigns.json</td><td>${esc(jf.campaigns?.size||'?')}</td><td>${formatTs(jf.campaigns?.mtime)}</td></tr>
              <tr><td style="padding:3px 0;font:11px Menlo,monospace">templates.json</td><td>${esc(jf.templates?.size||'?')}</td><td>${formatTs(jf.templates?.mtime)}</td></tr>
            </tbody>
          </table>
          <div style="font:11px Menlo,monospace;color:${PALETTE.slate};margin-top:8px">path: /app/data</div>`,
          'json')}
      </div>
      <div style="margin-top:14px"><a href="/admin/migrations" style="font:11px Inter;color:${PALETTE.purple}">Run migration → /admin/migrations</a></div>`;

    body.querySelectorAll('[data-backup]').forEach(b => b.addEventListener('click', async () => {
      const kind = b.getAttribute('data-backup');
      b.disabled = true; b.textContent = 'queued…';
      const r = await postJSON(`${ENDPOINTS.dbBackup}?kind=${encodeURIComponent(kind)}`, {});
      b.textContent = r.ok ? 'OK' : 'demo';
      setTimeout(() => { b.disabled = false; b.textContent = 'Backup now'; }, 1500);
      emit('result', { kind: 'db.backup', target: kind, result: r });
    }));
  }
  function dbCard(title, color, inner, backupKind) {
    return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${color};border-radius:6px;padding:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="font:600 14px Georgia">${esc(title)}</div>
          <span style="flex:1"></span>
          ${backupKind ? `<button data-backup="${esc(backupKind)}" style="${btn(color)};padding:3px 8px;font-size:10px">Backup now</button>` : ''}
        </div>
        ${inner}
      </div>`;
  }

  // ---------------------------------------------------------------- paint Channels (overview)
  function paintChannels() {
    const body = wrap.querySelector('[data-tab-body]');
    const d = lastSnapshot.docker || demoDocker();
    const m = lastSnapshot.mcp    || demoMcp();
    const w = lastSnapshot.web    || demoWeb();
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${PALETTE.sky};border-radius:6px;padding:16px">
          <div style="font:600 11px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase">Channel · 1</div>
          <div style="font:600 22px Georgia;margin-top:2px">Docker</div>
          <div style="color:${PALETTE.slate};font:11px Menlo,monospace;margin-top:4px">docker compose up -d</div>
          <ul style="margin:10px 0;padding-left:18px;font-size:12.5px;line-height:1.7">
            <li>${(d.services||[]).length} containers running</li>
            <li>${(d.stack||{}).healthy||0}/${(d.stack||{}).total||0} healthchecks green</li>
            <li>ports: 5432 · 6379 · 9000/9001 · 8787 · 9090 · 80</li>
            <li>image: postgres:16-alpine, redis:7-alpine, minio/minio</li>
          </ul>
          <button data-cta="docker" style="${btn(PALETTE.sky)};width:100%">Open shell URL</button>
        </div>

        <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${PALETTE.purple};border-radius:6px;padding:16px">
          <div style="font:600 11px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase">Channel · 2</div>
          <div style="font:600 22px Georgia;margin-top:2px">MCP server</div>
          <div style="color:${PALETTE.slate};font:11px Menlo,monospace;margin-top:4px">stdio · JSON-RPC</div>
          <ul style="margin:10px 0;padding-left:18px;font-size:12.5px;line-height:1.7">
            <li>registered with ${(m.server||{}).clients ?? 0} clients</li>
            <li>${(m.tools||[]).length} tools exposed</li>
            <li>uptime: ${esc((m.server||{}).uptime || '?')}</li>
            <li>last invoke: ${formatTs((m.recent||[])[0]?.ts) || '—'}</li>
          </ul>
          <button data-cta="mcp" style="${btn(PALETTE.purple)};width:100%">Copy registration command</button>
        </div>

        <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${PALETTE.emerald};border-radius:6px;padding:16px">
          <div style="font:600 11px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase">Channel · 3</div>
          <div style="font:600 22px Georgia;margin-top:2px">Web · cyclecad.com</div>
          <div style="color:${PALETTE.slate};font:11px Menlo,monospace;margin-top:4px">Caddy 2 · LE auto-cert</div>
          <ul style="margin:10px 0;padding-left:18px;font-size:12.5px;line-height:1.7">
            <li>visitors today: ${(w.edge||{}).reqPerMin ? Math.round((w.edge.reqPerMin)*4) : 0}</li>
            <li>top apps: cyclecad · meter · bridge</li>
            <li>tls expiry: ${esc((w.domains||[])[0]?.tlsExpiry || '—')}</li>
            <li>cdn: ${esc((w.hosting||{}).cdn || '—')}</li>
          </ul>
          <button data-cta="web" style="${btn(PALETTE.emerald)};width:100%">Open https://cyclecad.com</button>
        </div>
      </div>

      <div style="margin-top:14px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px">
        <div style="font:600 12px Inter;color:#4B5563;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Distribution health roll-up</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:12px">
          <div>Docker · <strong style="color:${(d.stack||{}).healthy === (d.stack||{}).total ? PALETTE.emerald : PALETTE.amber}">${(d.stack||{}).healthy||0}/${(d.stack||{}).total||0}</strong></div>
          <div>MCP · <strong style="color:${(m.server||{}).running ? PALETTE.emerald : PALETTE.rose}">${(m.server||{}).running ? 'running' : 'down'}</strong></div>
          <div>Domains · <strong style="color:${PALETTE.emerald}">${((w.domains||[]).filter(x=>x.dnsOk)).length}/${(w.domains||[]).length}</strong></div>
          <div>5xx · <strong style="color:${((w.edge||{}).fivexxRate||0)>0 ? PALETTE.rose : PALETTE.emerald}">${((w.edge||{}).fivexxRate||0).toFixed(2)}%</strong></div>
        </div>
      </div>`;

    body.querySelectorAll('[data-cta]').forEach(b => b.addEventListener('click', () => {
      const kind = b.getAttribute('data-cta');
      if (kind === 'docker') {
        try { window.open(location.origin.replace(/:\d+/, '') + ':8080', '_blank', 'noopener'); } catch {}
      } else if (kind === 'mcp') {
        const cmd = `claude mcp add cyclecad-suite -- node $HOME/.cyclecad/mcp/index.mjs`;
        try { navigator.clipboard.writeText(cmd); } catch {}
      } else if (kind === 'web') {
        try { window.open('https://cyclecad.com', '_blank', 'noopener'); } catch {}
      }
      emit('result', { kind: 'channel.cta', channel: kind });
    }));
  }

  // ---------------------------------------------------------------- shell + tabs
  function renderShell() {
    return `
      <header style="display:flex;align-items:end;justify-content:space-between;margin-bottom:14px">
        <div>
          <h2 style="font:600 22px Georgia;margin:0">Platform overview</h2>
          <div style="color:#9CA3AF;font:italic 12px Inter;margin-top:2px">Docker · MCP · Web · Databases · Distribution channels</div>
        </div>
        <div style="font:11px Menlo,monospace;color:${PALETTE.slate}" data-source-summary>—</div>
      </header>
      <nav data-tabs style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;margin-bottom:14px">
        ${[
          ['docker',   'Docker'],
          ['mcp',      'MCP server'],
          ['web',      'Web hosting'],
          ['db',       'Databases'],
          ['channels', 'Distribution'],
        ].map(([id, label]) => `
          <button data-tab="${id}" style="background:transparent;border:none;padding:8px 14px;font:600 12px Inter;letter-spacing:1px;text-transform:uppercase;color:#9CA3AF;cursor:pointer;border-bottom:2px solid transparent">${label}</button>
        `).join('')}
      </nav>
      <div data-tab-body></div>
    `;
  }

  function setTab(id) {
    activeTab = id;
    wrap.querySelectorAll('[data-tab]').forEach(b => {
      const on = b.getAttribute('data-tab') === id;
      b.style.color = on ? '#1A1A1A' : '#9CA3AF';
      b.style.borderBottomColor = on ? PALETTE.emerald : 'transparent';
    });
    if (id === 'docker')   paintDocker(lastSnapshot.docker || demoDocker());
    if (id === 'mcp')      paintMcp(lastSnapshot.mcp    || demoMcp());
    if (id === 'web')      paintWeb(lastSnapshot.web    || demoWeb());
    if (id === 'db')       paintDb(lastSnapshot.db     || demoDb());
    if (id === 'channels') paintChannels();
    emit('tab', { tab: id });
  }

  // ---------------------------------------------------------------- bootstrap
  wrap.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.getAttribute('data-tab'))));
  await refreshAll();
  setTab(activeTab);

  // 15s auto-poll for active tab
  const poll = setInterval(() => {
    if (activeTab === 'docker')   refreshDocker();
    else if (activeTab === 'mcp') refreshMcp();
    else if (activeTab === 'web') refreshWeb();
    else if (activeTab === 'db')  refreshDb();
    else                          refreshAll();
  }, 15000);
  timers.add(poll);

  // ---------------------------------------------------------------- helpers (text)
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function nowIso(deltaSec) { return new Date(Date.now() + (deltaSec || 0) * 1000).toISOString(); }
  function formatTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    return d.toLocaleTimeString();
  }
  function btn(bg, fg = '#fff') {
    return `background:${bg};color:${fg};border:none;padding:6px 12px;border-radius:4px;font:600 11px Inter;cursor:pointer`;
  }
  function healthPill(h) {
    const c = h === 'healthy' ? PALETTE.emerald : h === 'starting' ? PALETTE.amber : PALETTE.rose;
    return `<span style="background:${c};color:#fff;padding:1px 8px;border-radius:999px;font:600 9px Inter;letter-spacing:1px;text-transform:uppercase">${esc(h || '?')}</span>`;
  }
  function stateColor(s) {
    if (s.health === 'healthy') return PALETTE.emerald;
    if (s.health === 'starting') return PALETTE.amber;
    return PALETTE.rose;
  }

  // ---------------------------------------------------------------- public API
  return {
    /**
     * Imperative API surface.
     */
    api: {
      /**
       * Refresh the data for the currently active tab (or all tabs when on "channels").
       * @returns {Promise<void>}
       */
      async refresh() {
        if (activeTab === 'docker')   await refreshDocker();
        else if (activeTab === 'mcp') await refreshMcp();
        else if (activeTab === 'web') await refreshWeb();
        else if (activeTab === 'db')  await refreshDb();
        else                          await refreshAll();
      },
      /**
       * Refresh every tab's snapshot regardless of which one is active.
       * @returns {Promise<void>}
       */
      refreshAll,
      /**
       * Switch to a tab by id.
       * @param {string} id one of "docker" | "mcp" | "web" | "db" | "channels"
       */
      setTab,
      /**
       * Return the active tab id.
       * @returns {string}
       */
      getTab: () => activeTab,
      /**
       * Return the most recent snapshots fetched from the server (or demo data).
       * @returns {{docker: object|null, mcp: object|null, web: object|null, db: object|null}}
       */
      getSnapshot: () => ({ ...lastSnapshot }),
      /**
       * Compatibility shim — call refresh and return a structured result for tests.
       * @returns {Promise<{ok: boolean, tab: string}>}
       */
      async run() {
        await this.refresh();
        emit('result', { ok: true, tab: activeTab });
        return { ok: true, tab: activeTab };
      },
      /**
       * Restart a docker service (no-op against demo backend).
       * @param {string} service
       * @returns {Promise<object>}
       */
      restartService(service) { return postJSON(ENDPOINTS.dockerRestart, { service }); },
      /**
       * Trigger a backup for one of "postgres" | "minio" | "json".
       * @param {string} kind
       * @returns {Promise<object>}
       */
      backup(kind) { return postJSON(`${ENDPOINTS.dbBackup}?kind=${encodeURIComponent(kind)}`, {}); },
    },
    /**
     * Subscribe to widget events.
     * @param {('change'|'refresh'|'tab'|'result')} event
     * @param {Function} fn
     */
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    /**
     * Tear down — clears intervals, closes EventSources, removes the DOM node.
     */
    destroy() {
      for (const t of timers) clearInterval(t);
      timers.clear();
      for (const es of eventSources) { try { es.close(); } catch {} }
      eventSources.clear();
      wrap.remove();
    },
  };
}
