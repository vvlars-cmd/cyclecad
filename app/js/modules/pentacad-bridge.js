/**
 * @file pentacad-bridge.js
 * @description Pentacad machine-bridge client. Connects the browser to the
 *              controller-bridge service (running on LAN next to the machine)
 *              over WebSocket, streams G-code downstream, and receives live
 *              DRO / spindle / probe / alarm data upstream.
 *
 *              Scope for Phase 3:
 *                - WebSocket connect/reconnect with token auth
 *                - G-code streaming with pause/resume/abort
 *                - Jog, feed override, spindle override
 *                - DRO readback (X/Y/Z/A/B)
 *                - Alarm/status channel
 *                - E-stop is ALWAYS hardware-first — the bridge cannot override
 *
 * @version 0.1.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 * @license AGPL-3.0-only
 * @module  pentacad-bridge
 */

'use strict';

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.PentacadBridge = (() => {
  const VERSION = '0.1.0';
  const DEFAULT_URL = 'ws://localhost:7777';

  // ============================================================================
  // STATE
  // ============================================================================

  const bridge = {
    ws: null,
    url: DEFAULT_URL,
    status: 'disconnected',    // disconnected | connecting | connected | error
    dro: { x: 0, y: 0, z: 0, a: 0, b: 0 },
    spindle: { rpm: 0, load: 0 },
    alarms: [],
    lastPing: 0,
    reconnectAttempts: 0,
  };

  // ============================================================================
  // CONNECT
  // ============================================================================

  function connect(url) {
    if (url) bridge.url = url;
    if (bridge.ws) bridge.ws.close();

    setStatus('connecting');
    try {
      bridge.ws = new WebSocket(bridge.url);
    } catch (e) {
      setStatus('error');
      console.error('[pentacad-bridge] WebSocket creation failed:', e);
      return;
    }

    bridge.ws.addEventListener('open', () => {
      setStatus('connected');
      bridge.reconnectAttempts = 0;
      console.log(`[pentacad-bridge] Connected to ${bridge.url}`);
    });

    bridge.ws.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch (err) {
        console.warn('[pentacad-bridge] Bad message:', e.data);
      }
    });

    bridge.ws.addEventListener('close', () => {
      setStatus('disconnected');
      // Auto-reconnect with exponential backoff
      const delay = Math.min(1000 * (2 ** bridge.reconnectAttempts), 30000);
      bridge.reconnectAttempts++;
      setTimeout(() => {
        if (bridge.status === 'disconnected') connect(bridge.url);
      }, delay);
    });

    bridge.ws.addEventListener('error', (e) => {
      setStatus('error');
      console.error('[pentacad-bridge] WebSocket error', e);
    });
  }

  function disconnect() {
    if (bridge.ws) bridge.ws.close();
    bridge.ws = null;
    setStatus('disconnected');
  }

  function setStatus(status) {
    bridge.status = status;
    window.dispatchEvent(new CustomEvent('pentacad:bridge-status', {
      detail: { status, url: bridge.url },
    }));
    if (ctx?.state) ctx.state.bridgeStatus = status;
  }

  // ============================================================================
  // MESSAGE HANDLING (upstream from bridge)
  // ============================================================================

  function handleMessage(msg) {
    switch (msg.type) {
      case 'dro':
        bridge.dro = { ...bridge.dro, ...msg.position };
        emit('dro', bridge.dro);
        break;
      case 'spindle':
        bridge.spindle = { ...bridge.spindle, ...msg };
        emit('spindle', bridge.spindle);
        break;
      case 'alarm':
        bridge.alarms.push({ time: Date.now(), ...msg });
        emit('alarm', msg);
        break;
      case 'pong':
        bridge.lastPing = Date.now();
        break;
      default:
        emit('message', msg);
    }
  }

  function emit(eventName, detail) {
    window.dispatchEvent(new CustomEvent(`pentacad:${eventName}`, { detail }));
  }

  // ============================================================================
  // DOWNSTREAM (browser → bridge → machine)
  // ============================================================================

  function send(obj) {
    if (bridge.status !== 'connected') {
      console.warn('[pentacad-bridge] Not connected — message dropped');
      return false;
    }
    bridge.ws.send(JSON.stringify(obj));
    return true;
  }

  function streamGCode(gcode, options = {}) {
    // TODO Phase 3: real drip-feed with ack per block
    const lines = gcode.split(/\r?\n/).filter(l => l && !l.startsWith('(') && l !== '%');
    console.log(`[pentacad-bridge] Streaming ${lines.length} G-code blocks (stub)`);
    return send({ type: 'stream', lines, options });
  }

  function jog(axis, delta, feed) {
    return send({ type: 'jog', axis, delta, feed });
  }

  function feedOverride(percent) {
    return send({ type: 'feed-override', percent });
  }

  function pause()  { return send({ type: 'pause' }); }
  function resume() { return send({ type: 'resume' }); }
  function abort()  { return send({ type: 'abort' }); }

  // ============================================================================
  // INIT
  // ============================================================================

  let ctx = null;

  function init(context) {
    ctx = context;
    console.log(`[pentacad-bridge] v${VERSION} initialized — default URL ${DEFAULT_URL}`);
    // Do NOT auto-connect; the user must pick a machine and click connect.
    // Autoconnecting on page load gets flagged as suspicious by some LAN setups.
  }

  function execute(request) {
    const { method, params } = request || {};
    if (method === 'bridge.connect')      return connect(params?.url);
    if (method === 'bridge.disconnect')   return disconnect();
    if (method === 'bridge.status')       return bridge.status;
    if (method === 'bridge.dro')          return bridge.dro;
    if (method === 'bridge.stream')       return streamGCode(params.gcode, params.options);
    if (method === 'bridge.jog')          return jog(params.axis, params.delta, params.feed);
    if (method === 'bridge.feedOverride') return feedOverride(params.percent);
    if (method === 'bridge.pause')        return pause();
    if (method === 'bridge.resume')       return resume();
    if (method === 'bridge.abort')        return abort();
    return { error: 'unknown_bridge_method', method };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    version: VERSION,
    init,
    execute,
    connect,
    disconnect,
    streamGCode,
    jog,
    feedOverride,
    pause,
    resume,
    abort,
    getStatus: () => bridge.status,
    getDRO: () => bridge.dro,
  };
})();
