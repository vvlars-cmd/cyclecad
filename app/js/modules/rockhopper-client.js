/**
 * @file rockhopper-client.js
 * @description Pentacad client for Pocket NC / Pentamachine's **Rockhopper**
 *              WebSocket server. Rockhopper ships on every Pentamachine V2 by
 *              default (part of the Kinetic Control OS), so there is NO custom
 *              daemon to install — Pentacad talks directly to what's already
 *              running on the machine.
 *
 *              Protocol verified against the actual Rockhopper source:
 *              https://github.com/PocketNC/Rockhopper/blob/master/LinuxCNCWebSktSvr.py
 *
 *              Kinetic Control internals (from v5.8.4 disk image):
 *                - Rockhopper listens on ws://<machine>:8000/websocket/
 *                - Subprotocol REQUIRED: 'linuxcnc'
 *                - Login first: {id, user, password, date?}
 *                - Then command messages: {id, command, name, ...params}
 *                - Server replies: {id, code: '?OK'|'?ERR'|…, data: …}
 *                - 150+ StatusItems (watchable). 50+ CommandItems (put ops).
 *                - Default credentials: default / default (installed by AddUser.py)
 *                - CORS origin regex: https?://([a-z0-9]+\.)?pocketnc.com
 *                  — so Pentacad from cyclecad.com hits CORS unless served from
 *                  the machine itself or proxied. See notes at bottom of file.
 *
 * @version 1.0.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 * @license AGPL-3.0-only
 * @module  rockhopper-client
 */
(function () {
  'use strict';
  window.CycleCAD = window.CycleCAD || {};

  const VERSION = '1.0.0';
  const DEFAULT_WS_URL = 'ws://localhost:8000/websocket/';
  const DEFAULT_SUBPROTOCOL = 'linuxcnc';
  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_CAP_MS = 30000;

  /**
   * Confirmed Rockhopper reply codes (from LinuxCNCServerCommand).
   */
  const Code = Object.freeze({
    OK:                        '?OK',
    ERR:                       '?ERR',
    STATUS_NOT_WATCHED:        '?Status Item Not Being Watched',
    STATUS_NOT_FOUND:          '?Status Item Not Found',
    INVALID_COMMAND:           '?Invalid Command',
    INVALID_PARAMETER:         '?Invalid Parameter',
    EXEC_ERROR:                '?Error executing command',
    MISSING_PARAMETER:         '?Missing Parameter',
    LINUXCNC_NOT_RUNNING:      '?LinuxCNC is not running',
    NOT_LOGGED_IN:             '?User not logged in',
    INVALID_USER:              '?Invalid User ID'
  });

  /**
   * Status items that Pentacad watches on connect. Each name is a canonical
   * Rockhopper StatusItem — defined in LinuxCNCWebSktSvr.py.
   * Full list: 150+ items — see Rockhopper/CLIENT_CONFIG.JSON or send `list_get`.
   */
  const DEFAULT_WATCH = Object.freeze([
    'actual_position',        // float[9]  X Y Z A B C U V W in machine units
    'joint_actual_position',  // float[] per joint
    'task_state',             // int: 1=estop, 2=estop_reset, 3=off, 4=on
    'task_mode',              // int: 1=manual, 2=auto, 3=mdi
    'exec_state',             // 1..10 enum (see StatusItems help)
    'interp_state',           // 1=idle, 2=reading, 3=paused, 4=waiting
    'motion_mode',            // 1=free, 2=coord, 3=teleop
    'motion_line',            // current G-code line N
    'axis_mask',              // bitmask of enabled axes
    'axes',                   // int
    'angular_units',          // string from [TRAJ]
    'linear_units',           // string from [TRAJ]
    'program_units',          // 1=INCH, 2=MM, 3=CM
    'estop',                  // int 0|1
    'enabled',                // traj planner enabled
    'feedrate',               // current feed override factor
    'rapidrate',              // current rapid override factor
    'spindlerate',            // current spindle override factor (where supported)
    'spindle',                // dict {speed, override, brake, direction, enabled, ...}
    'tool_in_spindle',        // int tool ID
    'file',                   // loaded program filename
    'ini_filename',           // active .ini path
    'homed',                  // int[] per joint 0|1
    'current_vel',            // commanded cartesian velocity
    'distance_to_go',         // remaining distance of current move
    'current_line'            // currently executing line (alias for motion_line in some fields)
  ]);

  // =========================================================================
  // STATE
  // =========================================================================
  const state = {
    ws: null,
    wsUrl: DEFAULT_WS_URL,
    phase: 'disconnected',    // disconnected|connecting|authenticating|connected|error
    authed: false,
    username: null,
    nextMsgId: 1,
    pending: new Map(),       // id → {resolve, reject, timer, command}
    status: {},               // latest values per watched item
    subscribed: new Set(),    // names we are actively watching
    listeners: { status: [], state: [], error: [], log: [] },
    reconnectAttempts: 0,
    reconnectTimer: null,
    _mockTimer: null
  };

  // =========================================================================
  // EVENT PLUMBING
  // =========================================================================
  function emit(channel, payload) {
    const frozen = Object.freeze({ ts: Date.now(), ...payload });
    try { window.dispatchEvent(new CustomEvent('rockhopper:' + channel, { detail: frozen })); } catch (_) {}
    const arr = state.listeners[channel] || [];
    arr.forEach(fn => { try { fn(frozen); } catch (_) {} });
  }

  /**
   * Subscribe to a local bus channel.
   * @param {'status'|'state'|'error'|'log'} channel
   * @param {Function} fn
   * @returns {Function} unsubscribe
   */
  function on(channel, fn) {
    if (!state.listeners[channel]) state.listeners[channel] = [];
    state.listeners[channel].push(fn);
    return function off() {
      const i = state.listeners[channel].indexOf(fn);
      if (i >= 0) state.listeners[channel].splice(i, 1);
    };
  }

  function setPhase(next, reason) {
    if (next === state.phase) return;
    const prev = state.phase;
    state.phase = next;
    emit('state', { from: prev, to: next, reason: reason || null });
  }

  // =========================================================================
  // CONNECT / LOGIN / RECONNECT
  // =========================================================================

  /**
   * Open a Rockhopper WebSocket connection, log in, and start the default
   * watch subscriptions.
   *
   * @param {object} [opts]
   * @param {string} [opts.url]        Full ws:// URL; overrides host/port.
   * @param {string} [opts.host]       Machine IP/hostname. Port defaults to 8000.
   * @param {number} [opts.port=8000]
   * @param {boolean} [opts.secure=false] Use wss:// (for nginx + LetsEncrypt installs)
   * @param {string} [opts.username='default']
   * @param {string} [opts.password='default']
   * @param {string[]} [opts.subscribe] Status item names to watch. Defaults to DEFAULT_WATCH.
   * @returns {Promise<'connected'>}
   */
  async function connect(opts = {}) {
    if (opts.url) state.wsUrl = opts.url;
    else if (opts.host) {
      const scheme = opts.secure ? 'wss' : 'ws';
      const port = opts.port || 8000;
      state.wsUrl = `${scheme}://${opts.host}:${port}/websocket/`;
    }
    if (state.phase === 'connected' || state.phase === 'connecting') return state.phase;
    if (typeof WebSocket === 'undefined') throw new Error('WebSocket unavailable');

    const username = opts.username || 'default';
    const password = opts.password || 'default';
    const subscribe = opts.subscribe || DEFAULT_WATCH;

    setPhase('connecting', `to ${state.wsUrl}`);

    return new Promise((resolve, reject) => {
      let ws;
      try {
        // Rockhopper REQUIRES the 'linuxcnc' subprotocol — plain WS connections are closed.
        ws = new WebSocket(state.wsUrl, [DEFAULT_SUBPROTOCOL]);
      } catch (err) {
        setPhase('error', err.message);
        reject(err);
        scheduleReconnect(opts);
        return;
      }
      state.ws = ws;

      const timeout = setTimeout(() => {
        try { ws.close(); } catch (_) {}
        setPhase('error', 'connect timeout');
        reject(new Error('Rockhopper connect timeout'));
        scheduleReconnect(opts);
      }, 15000);

      ws.onopen = async () => {
        clearTimeout(timeout);
        state.reconnectAttempts = 0;
        setPhase('authenticating', 'ws open');

        // --- Login phase (no `command` field on this message) ---
        try {
          const loginId = state.nextMsgId++;
          const loginReply = await new Promise((res, rej) => {
            const timer = setTimeout(() => { state.pending.delete(loginId); rej(new Error('login timeout')); }, 10000);
            state.pending.set(loginId, { resolve: res, reject: rej, timer, command: 'login' });
            ws.send(JSON.stringify({
              id: loginId,
              user: username,
              password: password,
              date: new Date().toISOString()
            }));
          });
          if (loginReply.code === Code.OK) {
            state.authed = true;
            state.username = username;
          } else {
            emit('error', { kind: 'auth_failed', code: loginReply.code, message: loginReply.data });
            setPhase('error', 'auth rejected');
            reject(new Error('Rockhopper login rejected: ' + loginReply.code));
            return;
          }
        } catch (err) {
          emit('error', { kind: 'auth_error', message: err.message });
          setPhase('error', 'auth error');
          reject(err);
          return;
        }

        setPhase('connected', 'ready');

        // Start default watches — best-effort, don't block the resolve
        subscribe.forEach((name) => { watch(name).catch(() => { /* swallow */ }); });

        resolve('connected');
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handleMessage(msg);
        } catch (err) {
          emit('error', { kind: 'parse_error', raw: String(ev.data).slice(0, 200) });
        }
      };

      ws.onerror = () => emit('error', { kind: 'ws_error' });

      ws.onclose = (ev) => {
        clearTimeout(timeout);
        setPhase('disconnected', `ws closed (${ev.code})`);
        state.pending.forEach((p) => { clearTimeout(p.timer); p.reject(new Error('connection lost')); });
        state.pending.clear();
        state.authed = false;
        scheduleReconnect(opts);
      };
    });
  }

  function scheduleReconnect(opts) {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    const delay = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * Math.pow(2, state.reconnectAttempts));
    state.reconnectAttempts += 1;
    emit('log', { kind: 'reconnect_scheduled', attempt: state.reconnectAttempts, delayMs: delay });
    state.reconnectTimer = setTimeout(() => { connect(opts || {}).catch(() => { /* keep chaining */ }); }, delay);
  }

  function disconnect() {
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
    state.reconnectAttempts = 0;
    if (state.ws) { try { state.ws.close(1000, 'client disconnect'); } catch (_) {} }
    state.ws = null;
    state.authed = false;
    setPhase('disconnected', 'client disconnect');
  }

  // =========================================================================
  // MESSAGE DISPATCH — responses + unsolicited status pushes
  // =========================================================================
  function handleMessage(msg) {
    if (msg.id != null && state.pending.has(msg.id)) {
      const p = state.pending.get(msg.id);
      state.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.code === Code.OK) p.resolve(msg);
      else p.reject(new Error((msg.code || 'error') + ' ' + (msg.data || '')));
    }

    // Unsolicited watch update: always carries `name` and `code='?OK'` and `data`
    if (msg.name && msg.code === Code.OK && msg.id != null) {
      state.status[msg.name] = msg.data;
      emit('status', { name: msg.name, data: msg.data });
    }
  }

  // =========================================================================
  // CALL HELPERS
  // =========================================================================

  /**
   * Send any Rockhopper command and await its reply.
   * @param {object} body — the full message object (must include {command, …})
   * @param {number} [timeoutMs=10000]
   * @returns {Promise<object>} the reply message
   */
  function send(body, timeoutMs) {
    if (!state.ws || state.ws.readyState !== 1) return Promise.reject(new Error('Rockhopper WS not open'));
    const id = state.nextMsgId++;
    const full = Object.assign({ id }, body);
    const t = Math.max(500, timeoutMs || 10000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { state.pending.delete(id); reject(new Error((body.command || 'send') + ' timed out after ' + t + 'ms')); }, t);
      state.pending.set(id, { resolve, reject, timer, command: body.command });
      try { state.ws.send(JSON.stringify(full)); }
      catch (err) { clearTimeout(timer); state.pending.delete(id); reject(err); }
    });
  }

  /**
   * Read a single status value (non-streaming).
   * @param {string} name           — Rockhopper StatusItem name
   * @param {number} [index]        — required for array-typed items
   * @returns {Promise<*>}
   */
  function get(name, index) {
    const body = { command: 'get', name };
    if (index != null) body.index = index;
    return send(body).then((r) => r.data);
  }

  /**
   * Subscribe to a status item. Server pushes updates when the value changes.
   * @param {string} name
   * @param {number} [index]
   * @returns {Promise<object>}
   */
  function watch(name, index) {
    const body = { command: 'watch', name };
    if (index != null) body.index = index;
    return send(body).then((r) => {
      state.subscribed.add(name);
      if (r.data !== undefined) state.status[name] = r.data;
      return r;
    });
  }

  /** Stop watching a status item. */
  function unwatch(name) {
    return send({ command: 'unwatch', name }).then((r) => {
      state.subscribed.delete(name);
      return r;
    });
  }

  /**
   * Enumerate all watchable StatusItems the server knows about.
   * Returns the full metadata including valtype + help text.
   */
  function listStatus() { return send({ command: 'list_get' }).then((r) => r.data); }

  /** Enumerate all CommandItems (what `put` can execute). */
  function listCommands() { return send({ command: 'list_put' }).then((r) => r.data); }

  // =========================================================================
  // PUT COMMANDS — execute LinuxCNC commands through Rockhopper
  //
  // The `put` command takes a `name` (matching a CommandItem) and flat param
  // fields at the top level (NOT nested in a 'data' object). Each CommandItem
  // declares its paramTypes, e.g.:
  //    mdi       → { mdi: string }
  //    jog       → { jog: 'JOG_INCREMENT'|…, axis: int, velocity?: float, distance?: float }
  //    state     → { state: 'STATE_ESTOP'|'STATE_ESTOP_RESET'|'STATE_ON'|'STATE_OFF' }
  //    mode      → { mode: 'MODE_AUTO'|'MODE_MANUAL'|'MODE_MDI' }
  //    feedrate  → { rate: float }
  //    spindleoverride → { factor: float }
  //    flood     → { onoff: 'FLOOD_ON'|'FLOOD_OFF' }
  //    mist      → { onoff: 'MIST_ON'|'MIST_OFF' }
  //    home      → { axis: int }   (joint index, NOT letter)
  //    unhome    → { axis: int }
  //    program_open → { filename: string }
  //    auto      → { auto: 'AUTO_RUN'|'AUTO_STEP'|'AUTO_RESUME'|'AUTO_PAUSE', run_from?: int }
  //    abort     → {}
  //    brake     → { onoff: 'BRAKE_ENGAGE'|'BRAKE_RELEASE' }
  //    spindle   → { spindle: 'SPINDLE_FORWARD'|'SPINDLE_REVERSE'|'SPINDLE_OFF'|… }
  // =========================================================================

  /**
   * Low-level put. Pass the command name and its params as a flat object.
   * @example put('mdi', { mdi: 'G0 X0 Y0' })
   * @example put('jog', { jog: 'JOG_INCREMENT', axis: 0, velocity: 200, distance: 0.1 })
   */
  function put(commandName, params) {
    return send(Object.assign({ command: 'put', name: commandName }, params || {}));
  }

  // ---- High-level wrappers mapping Pentacad actions to CommandItems -----

  const JOINT = Object.freeze({ X: 0, Y: 1, Z: 2, A: 3, B: 4, C: 5 });

  /** Send one-line MDI G-code. Requires `mode MODE_MDI` first. */
  function mdi(line) { return put('mdi', { mdi: String(line).trim() }); }

  /** Switch control mode. 'auto' | 'manual' | 'mdi' */
  function setMode(mode) {
    const m = { auto: 'MODE_AUTO', manual: 'MODE_MANUAL', mdi: 'MODE_MDI' }[String(mode).toLowerCase()];
    if (!m) throw new Error('invalid mode: ' + mode);
    return put('mode', { mode: m });
  }

  /** Set task state. 'on' | 'off' | 'estop' | 'estop_reset' (clears latch) */
  function setState(st) {
    const s = { on: 'STATE_ON', off: 'STATE_OFF', estop: 'STATE_ESTOP', estop_reset: 'STATE_ESTOP_RESET' }[String(st).toLowerCase()];
    if (!s) throw new Error('invalid state: ' + st);
    return put('state', { state: s });
  }

  const clearEstop = () => setState('estop_reset');
  const powerOn    = () => setState('on');
  const powerOff   = () => setState('off');

  /**
   * Jog one axis. Rockhopper uses joint indices — we accept axis letter too.
   * @param {{axis:'X'|'Y'|'Z'|'A'|'B'|'C'|number, direction?:1|-1, distance?:number, velocity?:number, mode?:'increment'|'continuous'|'stop'}} p
   */
  function jog(p) {
    const rawAxis = p.axis;
    const axisIdx = (typeof rawAxis === 'number') ? rawAxis : JOINT[String(rawAxis).toUpperCase()];
    if (axisIdx == null) throw new Error('unknown axis: ' + rawAxis);
    const jogMode = ({
      increment: 'JOG_INCREMENT',
      continuous: 'JOG_CONTINUOUS',
      stop: 'JOG_STOP'
    })[String(p.mode || 'increment').toLowerCase()] || 'JOG_INCREMENT';
    const body = { jog: jogMode, axis: axisIdx };
    if (p.velocity != null)      body.velocity = Number(p.velocity);
    if (p.distance != null)      body.distance = (Number(p.direction) >= 0 ? 1 : -1) * Math.abs(Number(p.distance) || 0);
    return put('jog', body);
  }

  /** Home one joint (0..N) or axis letter. */
  function home(axisOrIdx) {
    const idx = (typeof axisOrIdx === 'number') ? axisOrIdx : JOINT[String(axisOrIdx).toUpperCase()];
    if (idx == null) throw new Error('unknown axis: ' + axisOrIdx);
    return put('home', { axis: idx });
  }

  /** Home all five axes sequentially (X, Y, Z, A, B). */
  async function homeAll() {
    for (const letter of ['X', 'Y', 'Z', 'A', 'B']) { await home(letter); }
    return { homed: ['X', 'Y', 'Z', 'A', 'B'] };
  }

  /** Feed rate override: 1.0 = 100%, clamped [0, 2]. */
  function feedOverride(factor) {
    return put('feedrate', { rate: Math.max(0, Math.min(2, Number(factor) || 1)) });
  }

  /** Spindle override factor. */
  function spindleOverride(factor) {
    return put('spindleoverride', { factor: Math.max(0, Math.min(1.5, Number(factor) || 1)) });
  }

  /** Coolant. Pass { mist?: bool, flood?: bool } — either/both. */
  function coolant({ mist, flood } = {}) {
    const ops = [];
    if (mist != null)  ops.push(put('mist',  { onoff: mist  ? 'MIST_ON'  : 'MIST_OFF'  }));
    if (flood != null) ops.push(put('flood', { onoff: flood ? 'FLOOD_ON' : 'FLOOD_OFF' }));
    return Promise.all(ops);
  }

  /** Spindle direction. 'forward' | 'reverse' | 'off' */
  function spindle(dir) {
    const d = ({ forward: 'SPINDLE_FORWARD', reverse: 'SPINDLE_REVERSE', off: 'SPINDLE_OFF' })[String(dir).toLowerCase()];
    if (!d) throw new Error('invalid spindle: ' + dir);
    return put('spindle', { spindle: d });
  }

  /** Run / step / pause / resume auto program. */
  function auto(action, runFrom) {
    const a = ({ run: 'AUTO_RUN', step: 'AUTO_STEP', pause: 'AUTO_PAUSE', resume: 'AUTO_RESUME' })[String(action).toLowerCase()];
    if (!a) throw new Error('invalid auto action: ' + action);
    const body = { auto: a };
    if (runFrom != null) body.run_from = runFrom;
    return put('auto', body);
  }

  /** Equivalent to `auto('pause')`. */
  const pause  = () => auto('pause');
  /** Equivalent to `auto('resume')`. */
  const resume = () => auto('resume');
  /** Stop task immediately. */
  const abort  = () => put('abort', {});

  /** Open an NGC file that already exists on the controller filesystem. */
  function openFile(filename) { return put('program_open', { filename }); }

  /** Upload + open a program.
   *  Rockhopper provides `program_upload_chunk` for large files;
   *  this wrapper handles the chunking transparently. */
  async function uploadAndRun(filename, gcode, opts = {}) {
    const chunkSize = opts.chunkSize || 8192;
    const text = String(gcode);
    const chunks = Math.ceil(text.length / chunkSize);
    for (let i = 0; i < chunks; i++) {
      const data = text.slice(i * chunkSize, (i + 1) * chunkSize);
      await put('program_upload_chunk', {
        filename,
        data,
        start: i === 0,
        end:   i === chunks - 1,
        ovw:   !!opts.overwrite
      });
    }
    await openFile(filename);
    if (opts.autostart !== false) {
      await setMode('auto');
      await auto('run');
    }
    return { filename, chunks, size: text.length };
  }

  /** Delete a program. */
  function deleteFile(filename) { return put('program_delete', { filename }); }

  // =========================================================================
  // CONVENIENCE READERS — return cached values (populated by watches)
  // =========================================================================
  function getStatus() {
    return {
      phase: state.phase,
      wsUrl: state.wsUrl,
      authed: state.authed,
      username: state.username,
      subscribed: Array.from(state.subscribed),
      ...state.status
    };
  }

  /**
   * Current DRO position as {x,y,z,a,b}. Computed from actual_position
   * (which is float[9] X Y Z A B C U V W — we pick the first five for the V2).
   */
  function getDRO() {
    const p = state.status.actual_position;
    if (!Array.isArray(p)) return { x: 0, y: 0, z: 0, a: 0, b: 0 };
    return { x: p[0] || 0, y: p[1] || 0, z: p[2] || 0, a: p[3] || 0, b: p[4] || 0 };
  }

  /** Raw status cache (direct ref — treat as read-only). */
  function getRawStatus() { return state.status; }

  // =========================================================================
  // MOCK MODE — exercises the same code paths with no real machine
  // =========================================================================
  function startMock() {
    const fakePos = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const fakeWs = {
      readyState: 1,
      send(raw) {
        try {
          const m = JSON.parse(raw);
          // Login message has no `command` field
          if (!m.command && m.user && m.password) {
            setTimeout(() => handleMessage({ id: m.id, code: Code.OK, data: Code.OK }), 5);
            return;
          }
          if (m.command === 'watch' || m.command === 'get') {
            const val = m.name === 'actual_position' ? fakePos.slice() :
                        m.name === 'estop' ? 0 :
                        m.name === 'task_state' ? 4 :
                        m.name === 'task_mode' ? 1 :
                        m.name === 'program_units' ? 2 :
                        m.name === 'axis_mask' ? 0x1F :
                        m.name === 'homed' ? [1, 1, 1, 1, 1] :
                        m.name === 'tool_in_spindle' ? 0 :
                        0;
            setTimeout(() => handleMessage({ id: m.id, code: Code.OK, name: m.name, data: val }), 5);
            return;
          }
          if (m.command === 'put' && m.name === 'jog') {
            const idx = m.axis;
            fakePos[idx] += Number(m.distance || 0);
            setTimeout(() => handleMessage({ id: m.id, code: Code.OK, data: Code.OK }), 5);
            setTimeout(() => handleMessage({ id: state.nextMsgId++, code: Code.OK, name: 'actual_position', data: fakePos.slice() }), 10);
            return;
          }
          // Default ack
          setTimeout(() => handleMessage({ id: m.id, code: Code.OK, data: Code.OK }), 5);
        } catch (_) {}
      },
      close() { this.readyState = 3; if (typeof this.onclose === 'function') this.onclose({ code: 1000 }); }
    };
    state.ws = fakeWs;
    state.wsUrl = 'mock://rockhopper';
    setPhase('connected', 'mock');
    state.authed = true;
    // Jitter the position
    state._mockTimer = setInterval(() => {
      fakePos[0] += (Math.random() - 0.5) * 0.0005;
      fakePos[1] += (Math.random() - 0.5) * 0.0005;
      handleMessage({ id: state.nextMsgId++, code: Code.OK, name: 'actual_position', data: fakePos.slice() });
    }, 100);
  }

  function stopMock() {
    if (state._mockTimer) { clearInterval(state._mockTimer); state._mockTimer = null; }
    state.ws = null;
    state.authed = false;
    setPhase('disconnected', 'mock stopped');
  }

  // =========================================================================
  // SELF-TESTS
  // =========================================================================
  function runSelfTests() {
    const out = [];
    const rec = (name, pass, detail) => { out.push({ name, pass, detail: detail || '' }); };

    rec('Code.OK is canonical Rockhopper token', Code.OK === '?OK', Code.OK);
    rec('linuxcnc subprotocol constant', DEFAULT_SUBPROTOCOL === 'linuxcnc', DEFAULT_SUBPROTOCOL);
    rec('JOINT map includes X..B', JOINT.X === 0 && JOINT.A === 3 && JOINT.B === 4, JSON.stringify(JOINT));
    rec('DEFAULT_WATCH is non-empty', DEFAULT_WATCH.length > 10, 'len=' + DEFAULT_WATCH.length);

    const allPass = out.every(r => r.pass);
    return { results: out, allPass };
  }

  function init(options) {
    const opts = options || {};
    try {
      const t = runSelfTests();
      if (!t.allPass) console.warn('[rockhopper-client] self-test failures:', t.results.filter(r => !r.pass));
    } catch (err) {
      console.warn('[rockhopper-client] self-test threw:', err && err.message);
    }
    if (opts.autoConnect) connect(opts).catch((err) => emit('error', { kind: 'auto_connect_failed', message: err.message }));
    if (opts.mock) startMock();
    return true;
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  window.CycleCAD.Rockhopper = {
    version: VERSION,
    Code,
    DEFAULT_WATCH,
    JOINT,

    connect, disconnect, on,

    // Raw + enumeration
    send, get, watch, unwatch, listStatus, listCommands, put,

    // Motion / state
    mdi, setMode, setState, clearEstop, powerOn, powerOff,
    jog, home, homeAll,
    feedOverride, spindleOverride, spindle, coolant,
    auto, pause, resume, abort,

    // Program upload / file management
    openFile, uploadAndRun, deleteFile,

    // Getters
    getStatus, getDRO, getRawStatus,

    // Mock
    startMock, stopMock,

    // Lifecycle
    init, runSelfTests,

    // Debug
    _state: state
  };

  /* eslint-disable-next-line no-console */
  console.log('[rockhopper-client] v' + VERSION + ' loaded');
})();

/* ============================================================================
 * NOTES ON DEPLOYMENT
 *
 * 1. CORS
 *    Rockhopper checks request Origin against the regex
 *        https?://([a-z0-9]+\.)?pocketnc.com
 *    Since Pentacad is served from cyclecad.com, direct connections will be
 *    rejected. Workarounds in priority order:
 *      (a) Serve Pentacad from the machine itself on a subdomain of pocketnc.com
 *          (Pentamachine owners can set /etc/hosts or a local DNS entry)
 *      (b) Patch Rockhopper to accept cyclecad.com origin — tiny PR to PocketNC/
 *          Rockhopper, or a local sed on the shop's copy
 *      (c) nginx reverse-proxy on the machine that strips the Origin header
 *      (d) Run Pentacad locally (file:// or http://localhost) — Origin is empty,
 *          which Rockhopper allows
 *
 * 2. SSL
 *    Rockhopper ships a self-signed cert at Rockhopper/server.crt. Most shops
 *    access Pentamachine over LAN without TLS. For wss://, either replace the
 *    cert or front with nginx + LetsEncrypt.
 *
 * 3. Auth
 *    Default credentials: user `default`, password `default` (set by
 *    AddUser.py). Rockhopper stores MD5 hashes. Change in production.
 *
 * 4. Reconnect semantics
 *    On ws close, we reconnect with exponential backoff up to 30s. Any
 *    pending RPC calls reject with 'connection lost'. Active watches must
 *    be re-registered after reconnect — the client does this automatically
 *    via the `subscribe` list passed to connect().
 * ============================================================================
 */
