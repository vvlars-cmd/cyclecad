/**
 * @file pentacad-bridge.js
 * @description Pentacad machine-bridge client — Phase-1 implementation.
 *
 *              Protocol: JSON messages over WebSocket to a small Python daemon
 *              ("pentabridge") that runs next to Kinetic Control on the shop
 *              LAN. The daemon translates our messages to LinuxCNC's
 *              halcmd / MDI / linuxcncrsh interfaces.
 *
 *              Message shape (JSON-RPC-ish):
 *                  client → daemon: {id, op, args?}
 *                  daemon → client: {id?, event?, ok, data?, error?}
 *
 *              Ops: jog · stream · pause · resume · abort · probe · home
 *                   mdi · feedOverride · spindleOverride · coolant · ping
 *
 *              Events (unsolicited from daemon): dro · alarm · line · halted
 *                   estop · streaming · complete · spindleLoad · probeResult
 *
 *              Safety: E-stop is ALWAYS hardware-first; the bridge is a
 *              co-operative layer, not an authority. The daemon refuses any
 *              motion command if Kinetic Control reports an active estop.
 *
 * @version 1.0.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 * @license AGPL-3.0-only
 * @module  pentacad-bridge
 */
(function () {
  'use strict';
  window.CycleCAD = window.CycleCAD || {};

  // ===========================================================================
  // CONSTANTS
  // ===========================================================================
  const VERSION = '1.0.0';
  const DEFAULT_URL = 'ws://localhost:7777';
  const PING_INTERVAL_MS = 5000;
  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_CAP_MS = 30000;
  const STREAM_WINDOW = 8;               // lines in-flight before we wait for ack
  const STREAM_BUFFER_MAX = 200000;      // cap on lines we hold while disconnected

  /**
   * Authoritative state machine for the bridge:
   *   disconnected → connecting → connected
   *                         ↘→ error → (retry with backoff)
   *   connected → streaming → complete / paused / aborted → connected
   *   any state → estop (hardware; client-side latch) → must ack-clear.
   */
  const STATES = Object.freeze({
    DISCONNECTED: 'disconnected',
    CONNECTING:   'connecting',
    CONNECTED:    'connected',
    STREAMING:    'streaming',
    PAUSED:       'paused',
    ABORTING:     'aborting',
    ESTOP:        'estop',
    ERROR:        'error'
  });

  // ===========================================================================
  // STATE
  // ===========================================================================
  const bridge = {
    ws: null,
    url: DEFAULT_URL,
    state: STATES.DISCONNECTED,
    prevState: STATES.DISCONNECTED,

    // DRO / live data from machine
    dro: { x: 0, y: 0, z: 0, a: 0, b: 0 },     // mm / degrees
    droTimestamp: 0,                           // epoch ms
    spindle: { rpm: 0, load: 0, on: false },
    feedRate: 0,
    feedOverride: 1.0,
    spindleOverride: 1.0,
    toolId: 0,
    coolant: { mist: false, flood: false },

    // Alarms / events ring buffer (last 50)
    alarms: [],
    eventLog: [],

    // Streaming state
    stream: {
      lines: [],           // queued G-code lines
      cursor: 0,           // next line to send
      inFlight: 0,         // lines sent but not yet acked
      total: 0,
      lineNumber: 0,       // N-number of most recent acked line
      startTime: 0,
      estimatedTotalSec: 0,
      paused: false,
      aborting: false,
      resumable: false,    // can be resumed on reconnect?
    },

    // Request/response tracking for JSON-RPC-ish calls
    nextMsgId: 1,
    pending: new Map(),    // id → { resolve, reject, timer }

    // Timers
    pingTimer: null,
    reconnectTimer: null,
    reconnectAttempts: 0,

    // User callbacks (not DOM events)
    listeners: { state:[], dro:[], spindle:[], event:[], alarm:[], stream:[] },
  };

  // ===========================================================================
  // EVENT PLUMBING — both window-level CustomEvents and local listener arrays
  // ===========================================================================
  function emit(name, detail) {
    try {
      const payload = Object.freeze({ ts: Date.now(), ...detail });
      bridge.eventLog.push({ name, detail: payload });
      if (bridge.eventLog.length > 50) bridge.eventLog.shift();
      // Both DOM event and direct listeners
      window.dispatchEvent(new CustomEvent('pentacad:' + name, { detail: payload }));
      const arr = bridge.listeners[name] || [];
      arr.forEach((fn) => { try { fn(payload); } catch (_) { /* swallow */ } });
    } catch (_) { /* swallow */ }
  }

  /**
   * Subscribe to a bridge event. Returns an unsubscribe function.
   * @param {'state'|'dro'|'spindle'|'event'|'alarm'|'stream'} name
   * @param {Function} fn
   * @returns {Function}
   */
  function on(name, fn) {
    if (!bridge.listeners[name]) bridge.listeners[name] = [];
    bridge.listeners[name].push(fn);
    return function off() {
      const i = bridge.listeners[name].indexOf(fn);
      if (i >= 0) bridge.listeners[name].splice(i, 1);
    };
  }

  function setState(next, reason) {
    if (next === bridge.state) return;
    bridge.prevState = bridge.state;
    bridge.state = next;
    emit('state', { from: bridge.prevState, to: next, reason: reason || null });
    // Back-compat event name used by existing pentacad.html
    emit('bridge-status', { from: bridge.prevState, to: next, reason: reason || null });
  }

  // ===========================================================================
  // CONNECT / DISCONNECT / RECONNECT
  // ===========================================================================
  /**
   * Connect to the bridge daemon. If already connected, no-op.
   * @param {string} [url] ws:// URL. Persists across reconnects.
   * @returns {Promise<boolean>} resolves true on CONNECTED state, false on failure.
   */
  function connect(url) {
    if (url) bridge.url = url;
    if (bridge.state === STATES.CONNECTING || bridge.state === STATES.CONNECTED) return Promise.resolve(true);
    if (typeof WebSocket === 'undefined') return Promise.reject(new Error('WebSocket unavailable in this environment'));

    return new Promise((resolve, reject) => {
      setState(STATES.CONNECTING, 'connect() called');
      let ws;
      try { ws = new WebSocket(bridge.url); }
      catch (err) { setState(STATES.ERROR, err.message); reject(err); scheduleReconnect(); return; }
      bridge.ws = ws;

      const timeout = setTimeout(() => {
        try { ws.close(); } catch (_) {}
        setState(STATES.ERROR, 'connect timeout');
        reject(new Error('connect timeout'));
        scheduleReconnect();
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        bridge.reconnectAttempts = 0;
        setState(STATES.CONNECTED, 'ws open');
        startPing();
        // If a stream was paused across a reconnect, resume it
        if (bridge.stream.resumable && bridge.stream.cursor < bridge.stream.total) {
          emit('stream', { kind: 'resuming', cursor: bridge.stream.cursor, total: bridge.stream.total });
          pumpStream();
        }
        resolve(true);
      };

      ws.onerror = (err) => {
        emit('event', { kind: 'ws-error', message: String(err) });
      };

      ws.onclose = (ev) => {
        clearTimeout(timeout);
        stopPing();
        const wasStreaming = bridge.state === STATES.STREAMING;
        setState(STATES.DISCONNECTED, 'ws closed (code ' + ev.code + ')');
        if (wasStreaming) bridge.stream.resumable = true;
        // Reject any pending RPC with a connection-lost error
        bridge.pending.forEach((p) => { p.reject(new Error('connection lost')); clearTimeout(p.timer); });
        bridge.pending.clear();
        scheduleReconnect();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handleMessage(msg);
        } catch (err) {
          emit('event', { kind: 'parse-error', raw: String(ev.data).slice(0, 200), message: err.message });
        }
      };
    });
  }

  function disconnect(reason) {
    stopPing();
    cancelReconnect();
    if (bridge.ws) { try { bridge.ws.close(1000, reason || 'client disconnect'); } catch (_) {} }
    bridge.ws = null;
    setState(STATES.DISCONNECTED, reason || 'client disconnect');
  }

  function scheduleReconnect() {
    cancelReconnect();
    const delay = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * Math.pow(2, bridge.reconnectAttempts));
    bridge.reconnectAttempts += 1;
    emit('event', { kind: 'reconnect-scheduled', attempt: bridge.reconnectAttempts, delayMs: delay });
    bridge.reconnectTimer = setTimeout(() => { connect().catch(() => { /* chain retries */ }); }, delay);
  }
  function cancelReconnect() {
    if (bridge.reconnectTimer) { clearTimeout(bridge.reconnectTimer); bridge.reconnectTimer = null; }
  }

  function startPing() {
    stopPing();
    bridge.pingTimer = setInterval(() => {
      if (bridge.state === STATES.CONNECTED || bridge.state === STATES.STREAMING || bridge.state === STATES.PAUSED) {
        call('ping', { ts: Date.now() }, 3000).catch(() => { /* ping failures are handled by ws onclose */ });
      }
    }, PING_INTERVAL_MS);
  }
  function stopPing() {
    if (bridge.pingTimer) { clearInterval(bridge.pingTimer); bridge.pingTimer = null; }
  }

  // ===========================================================================
  // JSON-RPC-ISH CALL/RESPONSE
  // ===========================================================================
  /**
   * Send an op and wait for its reply. Times out after timeoutMs.
   * @param {string} op
   * @param {object} [args]
   * @param {number} [timeoutMs=15000]
   * @returns {Promise<object>}
   */
  function call(op, args, timeoutMs) {
    if (!bridge.ws || bridge.ws.readyState !== 1) return Promise.reject(new Error('not connected'));
    const id = bridge.nextMsgId++;
    const msg = { id, op, args: args || {} };
    const t = Math.max(500, timeoutMs || 15000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        bridge.pending.delete(id);
        reject(new Error(op + ' timed out after ' + t + 'ms'));
      }, t);
      bridge.pending.set(id, { resolve, reject, timer });
      try { bridge.ws.send(JSON.stringify(msg)); }
      catch (err) { clearTimeout(timer); bridge.pending.delete(id); reject(err); }
    });
  }

  function handleMessage(msg) {
    // Response to a call
    if (msg.id != null && bridge.pending.has(msg.id)) {
      const p = bridge.pending.get(msg.id);
      bridge.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok === false) p.reject(new Error(msg.error || 'bridge error'));
      else p.resolve(msg.data || {});
      return;
    }
    // Unsolicited event
    if (msg.event) {
      dispatchIncomingEvent(msg.event, msg.data || {});
    }
  }

  function dispatchIncomingEvent(name, data) {
    switch (name) {
      case 'dro':
        Object.assign(bridge.dro, data.pos || {});
        bridge.droTimestamp = Date.now();
        if (typeof data.feedRate === 'number') bridge.feedRate = data.feedRate;
        emit('dro', { pos: { ...bridge.dro }, feedRate: bridge.feedRate });
        break;
      case 'spindle':
        Object.assign(bridge.spindle, data);
        emit('spindle', { ...bridge.spindle });
        break;
      case 'line':
        bridge.stream.lineNumber = data.lineNumber || 0;
        bridge.stream.inFlight = Math.max(0, bridge.stream.inFlight - 1);
        emit('stream', { kind: 'line', lineNumber: bridge.stream.lineNumber, cursor: bridge.stream.cursor, total: bridge.stream.total });
        pumpStream();
        break;
      case 'complete':
        bridge.stream.paused = false;
        bridge.stream.resumable = false;
        emit('stream', { kind: 'complete', totalLines: bridge.stream.total });
        setState(STATES.CONNECTED, 'stream complete');
        break;
      case 'estop':
        setState(STATES.ESTOP, 'estop asserted');
        emit('alarm', { level: 'critical', kind: 'estop', message: data.message || 'E-stop engaged' });
        break;
      case 'alarm':
        bridge.alarms.push({ ts: Date.now(), ...data });
        if (bridge.alarms.length > 50) bridge.alarms.shift();
        emit('alarm', data);
        break;
      case 'probe':
        emit('event', { kind: 'probe-result', ...data });
        break;
      case 'tool-change':
        bridge.toolId = data.toolId || 0;
        emit('event', { kind: 'tool-change', toolId: bridge.toolId });
        break;
      case 'coolant':
        Object.assign(bridge.coolant, data);
        emit('event', { kind: 'coolant', ...bridge.coolant });
        break;
      default:
        emit('event', { kind: name, ...data });
    }
  }

  // ===========================================================================
  // COMMANDS
  // ===========================================================================
  /**
   * Jog one step. Axis is one of X/Y/Z/A/B (+ sign baked into direction).
   * @param {{axis:'X'|'Y'|'Z'|'A'|'B', direction:1|-1, distance?:number, feedRate?:number}} params
   */
  function jog(params) {
    const axis = (params?.axis || 'X').toUpperCase();
    const dir = params?.direction >= 0 ? 1 : -1;
    const distance = Math.max(0.001, Number(params?.distance) || 0.1);
    const feedRate = Math.max(1, Number(params?.feedRate) || 200);
    return call('jog', { axis, direction: dir, distance, feedRate });
  }

  /**
   * Home one axis (or all). Defaults to 'ALL'.
   * @param {string} [axis]
   */
  function home(axis) { return call('home', { axis: (axis || 'ALL').toUpperCase() }, 120000); }

  /**
   * Begin streaming a G-code program. Splits on newlines, holds a window of
   * STREAM_WINDOW lines in-flight, auto-resumes on reconnect.
   * @param {string|string[]} gcode
   * @param {object} [opts] {toolLibrary, onLine}
   * @returns {Promise<{totalLines:number}>}
   */
  function stream(gcode, opts) {
    const lines = Array.isArray(gcode) ? gcode.slice() : String(gcode).split(/\r?\n/);
    // Filter blanks + strip inline comments? Keep raw for the daemon to reject if needed.
    bridge.stream.lines = lines;
    bridge.stream.cursor = 0;
    bridge.stream.inFlight = 0;
    bridge.stream.total = lines.length;
    bridge.stream.lineNumber = 0;
    bridge.stream.startTime = Date.now();
    bridge.stream.paused = false;
    bridge.stream.aborting = false;
    bridge.stream.resumable = true;
    setState(STATES.STREAMING, 'stream start');
    emit('stream', { kind: 'start', total: lines.length });
    pumpStream();
    return Promise.resolve({ totalLines: lines.length });
  }

  /** Transmit as many queued lines as the window permits. */
  function pumpStream() {
    if (bridge.state === STATES.ABORTING) return;
    if (bridge.stream.paused) return;
    while (
      bridge.stream.cursor < bridge.stream.total &&
      bridge.stream.inFlight < STREAM_WINDOW &&
      bridge.ws && bridge.ws.readyState === 1
    ) {
      const line = bridge.stream.lines[bridge.stream.cursor];
      const lineIdx = bridge.stream.cursor;
      const msg = { id: bridge.nextMsgId++, op: 'stream-line', args: { index: lineIdx, line } };
      try {
        bridge.ws.send(JSON.stringify(msg));
        bridge.stream.cursor += 1;
        bridge.stream.inFlight += 1;
      } catch (err) {
        emit('event', { kind: 'stream-send-error', index: lineIdx, message: err.message });
        break;
      }
    }
    if (bridge.stream.cursor >= bridge.stream.total && bridge.stream.inFlight === 0) {
      // Daemon should also send an explicit 'complete' event — this is a local-side fallback
      setTimeout(() => {
        if (bridge.state === STATES.STREAMING && bridge.stream.inFlight === 0) {
          emit('stream', { kind: 'drain-idle', cursor: bridge.stream.cursor, total: bridge.stream.total });
        }
      }, 2000);
    }
  }

  /** Pause the current stream (feed-hold). */
  function pause() {
    if (bridge.state !== STATES.STREAMING) return Promise.resolve({ ignored: true, reason: 'not streaming' });
    bridge.stream.paused = true;
    setState(STATES.PAUSED, 'user pause');
    return call('pause', {});
  }

  /** Resume after pause. */
  function resume() {
    if (bridge.state !== STATES.PAUSED) return Promise.resolve({ ignored: true, reason: 'not paused' });
    bridge.stream.paused = false;
    setState(STATES.STREAMING, 'user resume');
    const p = call('resume', {});
    pumpStream();
    return p;
  }

  /** Abort current stream. Safe-Z + spindle-off + coolant-off on daemon side. */
  function abort() {
    bridge.stream.aborting = true;
    bridge.stream.paused = false;
    bridge.stream.resumable = false;
    setState(STATES.ABORTING, 'user abort');
    return call('abort', {}, 5000).finally(() => {
      setState(STATES.CONNECTED, 'abort complete');
      emit('stream', { kind: 'aborted', cursor: bridge.stream.cursor, total: bridge.stream.total });
    });
  }

  /** Manual Data Input — single G-code line executed immediately. */
  function mdi(line) { return call('mdi', { line: String(line || '').trim() }); }

  /** Feed override multiplier [0..2]. */
  function feedOverride(factor) {
    const f = Math.max(0, Math.min(2, Number(factor) || 1));
    bridge.feedOverride = f;
    return call('feedOverride', { factor: f });
  }

  /** Spindle override multiplier [0..1.5]. */
  function spindleOverride(factor) {
    const f = Math.max(0, Math.min(1.5, Number(factor) || 1));
    bridge.spindleOverride = f;
    return call('spindleOverride', { factor: f });
  }

  /** Coolant control. */
  function coolant({ mist, flood } = {}) {
    return call('coolant', { mist: !!mist, flood: !!flood });
  }

  /** G38 probing. */
  function probe({ axis = 'Z', direction = -1, distance = 10, feedRate = 50 } = {}) {
    return call('probe', { axis, direction: direction >= 0 ? 1 : -1, distance, feedRate }, 60000);
  }

  /** Clear estop latch (after hardware reset on the machine side). */
  function clearEstop() {
    if (bridge.state === STATES.ESTOP) setState(STATES.CONNECTED, 'estop cleared');
    return call('clearEstop', {});
  }

  /** Snapshot current DRO + feeds + spindle. Does NOT round-trip; local state only. */
  function getStatus() {
    return {
      state: bridge.state,
      url: bridge.url,
      dro: { ...bridge.dro },
      droAgeMs: bridge.droTimestamp ? (Date.now() - bridge.droTimestamp) : null,
      spindle: { ...bridge.spindle },
      feedRate: bridge.feedRate,
      feedOverride: bridge.feedOverride,
      spindleOverride: bridge.spindleOverride,
      toolId: bridge.toolId,
      coolant: { ...bridge.coolant },
      alarms: bridge.alarms.slice(-5),
      stream: {
        active: bridge.state === STATES.STREAMING || bridge.state === STATES.PAUSED,
        cursor: bridge.stream.cursor,
        total: bridge.stream.total,
        lineNumber: bridge.stream.lineNumber,
        paused: bridge.stream.paused,
      }
    };
  }

  /** Back-compat: pentacad.html + earlier code expects this. */
  function getDRO() { return { ...bridge.dro }; }

  // ===========================================================================
  // MOCK MODE — run without a real daemon, for demo + tests
  // ===========================================================================
  /**
   * Start a local mock "daemon" that echoes a simulated DRO + line-acks on a
   * fake WS. Lets the UI demo end-to-end with no hardware.
   * @param {object} [opts] {rpm:18000, droHz:10}
   */
  function startMock(opts) {
    const rpm = opts?.rpm || 18000;
    const droHz = Math.max(1, opts?.droHz || 10);
    bridge.url = 'mock://pentabridge';

    // Inject a fake WebSocket
    const fakeWs = {
      readyState: 1,
      send(raw) {
        try {
          const msg = JSON.parse(raw);
          // Simulate handling
          if (msg.op === 'stream-line') {
            setTimeout(() => handleMessage({ event: 'line', data: { lineNumber: msg.args.index + 1 } }), 15);
          } else if (msg.op === 'jog') {
            const axis = msg.args.axis.toLowerCase();
            const prev = bridge.dro[axis] || 0;
            bridge.dro[axis] = prev + msg.args.direction * msg.args.distance;
            handleMessage({ event: 'dro', data: { pos: { ...bridge.dro }, feedRate: msg.args.feedRate } });
            setTimeout(() => handleMessage({ id: msg.id, ok: true, data: { done: true } }), 5);
          } else if (msg.op === 'pause' || msg.op === 'resume' || msg.op === 'ping' || msg.op === 'feedOverride' || msg.op === 'spindleOverride' || msg.op === 'coolant' || msg.op === 'clearEstop' || msg.op === 'mdi') {
            setTimeout(() => handleMessage({ id: msg.id, ok: true, data: { acknowledged: true } }), 5);
          } else if (msg.op === 'home') {
            bridge.dro = { x:0, y:0, z:0, a:0, b:0 };
            handleMessage({ event: 'dro', data: { pos: { ...bridge.dro } } });
            setTimeout(() => handleMessage({ id: msg.id, ok: true, data: { homed: true } }), 300);
          } else if (msg.op === 'abort') {
            setTimeout(() => handleMessage({ id: msg.id, ok: true, data: { aborted: true } }), 5);
          } else if (msg.op === 'probe') {
            setTimeout(() => handleMessage({ event: 'probe', data: { contact: true, pos: { ...bridge.dro } } }), 200);
            setTimeout(() => handleMessage({ id: msg.id, ok: true, data: { pos: { ...bridge.dro } } }), 200);
          } else {
            setTimeout(() => handleMessage({ id: msg.id, ok: true, data: {} }), 5);
          }
        } catch (_) { /* ignore */ }
      },
      close() { this.readyState = 3; if (typeof fakeWs.onclose === 'function') fakeWs.onclose({ code: 1000 }); }
    };
    bridge.ws = fakeWs;
    setState(STATES.CONNECTED, 'mock mode');
    startPing();

    // Emit fake DRO on a timer so the UI gets live updates
    const droJitter = () => {
      bridge.dro.x += (Math.random() - 0.5) * 0.002;
      bridge.dro.y += (Math.random() - 0.5) * 0.002;
      handleMessage({ event: 'dro', data: { pos: { ...bridge.dro }, feedRate: 0 } });
      handleMessage({ event: 'spindle', data: { rpm: 0, load: 0, on: false } });
    };
    bridge._mockTimer = setInterval(droJitter, 1000 / droHz);

    return bridge;
  }

  function stopMock() {
    if (bridge._mockTimer) { clearInterval(bridge._mockTimer); bridge._mockTimer = null; }
    stopPing();
    bridge.ws = null;
    setState(STATES.DISCONNECTED, 'mock stopped');
  }

  // ===========================================================================
  // SELF-TESTS
  // ===========================================================================
  function runSelfTests() {
    const out = [];
    const rec = (name, pass, detail) => { out.push({ name, pass, detail: detail || '' }); };

    // 1. State machine transitions
    const start = bridge.state;
    rec('initial state disconnected', start === STATES.DISCONNECTED, start);

    // 2. Mock connect
    startMock({ droHz: 1 });
    rec('mock connected', bridge.state === STATES.CONNECTED, bridge.state);

    // 3. Jog increments DRO
    const before = bridge.dro.x;
    jog({ axis: 'X', direction: 1, distance: 1 });
    const after = bridge.dro.x;
    rec('jog updates DRO', Math.abs((after - before) - 1) < 1e-6, 'Δx=' + (after - before));

    // 4. Stream split
    stream('G21\nG0 X0 Y0\nG1 X10 F500\nM30');
    rec('stream parsed 4 lines', bridge.stream.total === 4, 'total=' + bridge.stream.total);

    // 5. Getters
    const s = getStatus();
    rec('getStatus returns state', s.state === STATES.STREAMING || s.state === STATES.CONNECTED, s.state);

    stopMock();
    rec('stopMock returns to disconnected', bridge.state === STATES.DISCONNECTED, bridge.state);

    const allPass = out.every((r) => r.pass);
    return { results: out, allPass };
  }

  // ===========================================================================
  // COORDINATOR INTEGRATION
  // ===========================================================================
  function init(options) {
    const opts = options || {};
    if (opts.url) bridge.url = opts.url;
    if (opts.autoConnect) connect().catch(() => { /* will reconnect on its own */ });
    if (opts.mock) startMock(opts.mock === true ? {} : opts.mock);
    try {
      const t = runSelfTests();
      if (!t.allPass) console.warn('[pentacad-bridge] self-test failures:', t.results.filter((r) => !r.pass));
    } catch (err) {
      console.warn('[pentacad-bridge] self-test threw:', err && err.message);
    }
    return true;
  }

  /**
   * Unified command dispatcher (used by pentacad coordinator).
   * Accepts {method:'bridge.<op>', params}.
   */
  function execute(request) {
    const m = request?.method || '';
    const p = request?.params || {};
    const op = m.replace(/^bridge\./, '');
    switch (op) {
      case 'connect':         return connect(p.url);
      case 'disconnect':      return disconnect(p.reason);
      case 'jog':             return jog(p);
      case 'home':            return home(p.axis);
      case 'stream':          return stream(p.gcode, p);
      case 'pause':           return pause();
      case 'resume':          return resume();
      case 'abort':           return abort();
      case 'mdi':             return mdi(p.line);
      case 'feedOverride':    return feedOverride(p.factor);
      case 'spindleOverride': return spindleOverride(p.factor);
      case 'coolant':         return coolant(p);
      case 'probe':           return probe(p);
      case 'clearEstop':      return clearEstop();
      case 'getStatus':       return Promise.resolve(getStatus());
      case 'getDRO':          return Promise.resolve(getDRO());
      case 'startMock':       return Promise.resolve(startMock(p));
      case 'stopMock':        return Promise.resolve(stopMock());
      case 'selfTest':        return Promise.resolve(runSelfTests());
      default: return Promise.reject(new Error('unknown bridge op: ' + op));
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  window.CycleCAD.PentacadBridge = {
    version: VERSION,
    STATES,
    // Connection
    connect, disconnect, getStatus, getDRO, on,
    // Motion
    jog, home, stream, pause, resume, abort, mdi,
    feedOverride, spindleOverride, coolant, probe, clearEstop,
    // Mock
    startMock, stopMock,
    // Coordinator hooks
    init, execute, runSelfTests,
    // For debugging
    _bridge: bridge
  };

  // Auto self-test on module load (non-blocking)
  try { runSelfTests(); } catch (_) { /* ignore */ }

  /* eslint-disable-next-line no-console */
  console.log('[pentacad-bridge] v' + VERSION + ' loaded');
})();
