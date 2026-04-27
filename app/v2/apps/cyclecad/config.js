// =====================================================================
// apps/cyclecad/config.js
// ---------------------------------------------------------------------
// Runtime configuration loaded by the cycleCAD shell. The HTML
// index.html includes <script src="config.js"></script> BEFORE any
// module imports so window.CYCLECAD_CONFIG is available globally to
// shared/meter.js and any widget that needs the API base URL.
//
// Strategy: hostname-sniff. When the page is served from cyclecad.com
// (or any subdomain), we route the API and bridge to the production
// subdomains. Anywhere else (localhost, *.local, codespaces, IPs), we
// fall back to the dev defaults so nothing has to change for local dev.
// =====================================================================

(function configureCyclecad() {
  'use strict';

  var host = (typeof location !== 'undefined' && location.hostname) || 'localhost';
  var isProd = host === 'cyclecad.com' || host.endsWith('.cyclecad.com');

  var apiBase = isProd
    ? 'https://api.cyclecad.com'
    : 'http://' + host + ':8787';

  var bridgeBase = isProd
    ? 'wss://bridge.cyclecad.com'
    : 'ws://' + host + ':9090';

  var s3Base = isProd
    ? 'https://s3.cyclecad.com'
    : 'http://' + host + ':9000';

  // Don't clobber an existing config (e.g. injected by a build pipeline
  // or a test harness).
  window.CYCLECAD_CONFIG = window.CYCLECAD_CONFIG || {
    apiBase:    apiBase,
    bridgeBase: bridgeBase,
    s3Base:     s3Base,
    domain:     'cyclecad.com',
    version:    'Stage 2.8',
    env:        isProd ? 'production' : 'development',
  };
})();
