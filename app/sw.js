/**
 * cycleCAD Service Worker
 * Enables offline mode, caching strategies, and background sync
 * v3.0.0
 */

const CACHE_VERSION = 'cyclecad-v3.0.0';
const STATIC_CACHE = 'cyclecad-static-v3';
const DYNAMIC_CACHE = 'cyclecad-dynamic-v3';
const MODEL_CACHE = 'cyclecad-models-v3';
const API_CACHE = 'cyclecad-api-v3';

// Essential files to precache on install
const PRECACHE_URLS = [
  '/app/',
  '/app/index.html',
  '/app/offline.html',
  '/app/manifest.json',
  '/app/js/app.js',
  '/app/js/viewport.js',
  '/app/js/sketch.js',
  '/app/js/operations.js',
  '/app/js/constraint-solver.js',
  '/app/js/advanced-ops.js',
  '/app/js/assembly.js',
  '/app/js/dxf-export.js',
  '/app/js/export.js',
  '/app/js/params.js',
  '/app/js/tree.js',
  '/app/js/shortcuts.js',
  '/app/css/style.css',
  '/app/offline.html'
];

// CDN resources to cache (long TTL)
const CDN_PATTERNS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com'
];

// API endpoints — network-first with fallback
const API_PATTERNS = [
  '/api/',
  '/convert',
  '/health'
];

// Model files — cache with size limit
const MODEL_PATTERNS = [
  /\.glb$/i,
  /\.gltf$/i,
  /\.step$/i,
  /\.stp$/i,
  /\.stl$/i,
  /\.obj$/i
];

// Max size for model cache (500MB)
const MODEL_CACHE_MAX_SIZE = 500 * 1024 * 1024;

/**
 * INSTALL EVENT
 * Precache all essential files
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Install event, precaching essential files...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching', PRECACHE_URLS.length, 'files');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Precache complete, skipping wait...');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Precache failed:', err);
      })
  );
});

/**
 * ACTIVATE EVENT
 * Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event, cleaning old caches...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE &&
                cacheName !== DYNAMIC_CACHE &&
                cacheName !== MODEL_CACHE &&
                cacheName !== API_CACHE &&
                !cacheName.startsWith('cyclecad-')) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Old caches cleaned, claiming clients...');
        return self.clients.claim();
      })
  );
});

/**
 * FETCH EVENT
 * Routing based on URL pattern
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions and internal protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // API calls — network-first with cache fallback
  if (isApiCall(url.pathname)) {
    event.respondWith(networkFirstApiCall(request));
    return;
  }

  // Model files — cache-first with size management
  if (isModelFile(url.pathname)) {
    event.respondWith(cacheFirstModel(request));
    return;
  }

  // CDN resources — cache-first with long TTL
  if (isCdnResource(url.hostname)) {
    event.respondWith(cacheFirstCdn(request));
    return;
  }

  // Static assets (HTML, JS, CSS) — cache-first, update in background
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // Default — network-first with offline fallback
  event.respondWith(networkFirstWithFallback(request));
});

/**
 * BACKGROUND SYNC
 * Sync queued operations when back online
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);

  if (event.tag === 'sync-operations') {
    event.waitUntil(syncOfflineOperations());
  }
});

/**
 * HELPER: API Call — Network-first
 */
async function networkFirstApiCall(request) {
  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    console.log('[SW] Network failed, falling back to cache for:', request.url);
    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    // Return offline response
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'API unavailable. Changes will sync when online.'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * HELPER: Model Files — Cache-first with LRU eviction
 */
async function cacheFirstModel(request) {
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    console.log('[SW] Model cache hit:', request.url);
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      // Check cache size before adding
      const size = parseInt(response.headers.get('content-length') || 0);

      if (size > 0) {
        await enforceModelCacheSize(size);
        cache.put(request, response.clone());
      }
    }

    return response;
  } catch (err) {
    console.log('[SW] Model fetch failed:', request.url);

    // Try to return from cache anyway
    const cached = await cache.match(request);
    if (cached) return cached;

    // Return offline response
    return new Response(
      'Model file not available offline',
      { status: 503 }
    );
  }
}

/**
 * HELPER: CDN Resources — Cache-first with long TTL
 */
async function cacheFirstCdn(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    console.log('[SW] CDN cache hit:', request.url);
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    console.log('[SW] CDN fetch failed:', request.url);

    const cached = await cache.match(request);
    if (cached) return cached;

    return new Response('CDN resource unavailable', { status: 503 });
  }
}

/**
 * HELPER: Static Assets — Cache-first with background update
 */
async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    console.log('[SW] Static cache hit:', request.url);

    // Update in background (don't block response)
    fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response.clone());
          console.log('[SW] Updated static file:', request.url);

          // Notify clients of update
          notifyClientsOfUpdate();
        }
      })
      .catch((err) => console.log('[SW] Background update failed:', err));

    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    console.log('[SW] Static fetch failed:', request.url);

    // Return offline page for HTML requests
    if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
      const offline = await cache.match('/app/offline.html');
      if (offline) return offline;
    }

    return new Response('Offline', { status: 503 });
  }
}

/**
 * HELPER: Network-first with offline fallback
 */
async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    console.log('[SW] Network failed, checking cache:', request.url);

    // Try dynamic cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Try static cache as last resort
    const staticCached = await caches.match(request, { cacheName: STATIC_CACHE });
    if (staticCached) return staticCached;

    // Return offline page for documents
    if (request.destination === 'document') {
      return caches.match('/app/offline.html');
    }

    return new Response('Offline', { status: 503 });
  }
}

/**
 * HELPER: Check if URL is an API call
 */
function isApiCall(pathname) {
  return API_PATTERNS.some((pattern) => {
    if (typeof pattern === 'string') {
      return pathname.includes(pattern);
    }
    return pattern.test(pathname);
  });
}

/**
 * HELPER: Check if URL is a model file
 */
function isModelFile(pathname) {
  return MODEL_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * HELPER: Check if hostname is CDN
 */
function isCdnResource(hostname) {
  return CDN_PATTERNS.some((cdn) => hostname.includes(cdn));
}

/**
 * HELPER: Check if pathname is static asset
 */
function isStaticAsset(pathname) {
  return /\.(js|css|svg|png|jpg|jpeg|gif|woff|woff2|ttf|eot)$/i.test(pathname) ||
         pathname.endsWith('/app/') ||
         pathname.endsWith('/app/index.html');
}

/**
 * HELPER: Enforce model cache size limit (LRU eviction)
 */
async function enforceModelCacheSize(newSize) {
  const cache = await caches.open(MODEL_CACHE);
  const keys = await cache.keys();

  let totalSize = newSize;

  for (const request of keys) {
    const response = await cache.match(request);
    const size = parseInt(response.headers.get('content-length') || 0);
    totalSize += size;
  }

  if (totalSize > MODEL_CACHE_MAX_SIZE) {
    console.log('[SW] Model cache exceeds limit, evicting oldest files...');

    for (const request of keys) {
      const response = await cache.match(request);
      const size = parseInt(response.headers.get('content-length') || 0);

      await cache.delete(request);
      totalSize -= size;

      if (totalSize <= MODEL_CACHE_MAX_SIZE * 0.8) {
        console.log('[SW] Cache size reduced to', Math.round(totalSize / 1024 / 1024), 'MB');
        break;
      }
    }
  }
}

/**
 * HELPER: Sync offline operations when back online
 */
async function syncOfflineOperations() {
  try {
    // Get queued operations from IndexedDB
    const db = await openDatabase();
    const tx = db.transaction('operationQueue', 'readonly');
    const store = tx.objectStore('operationQueue');
    const operations = await store.getAll();

    console.log('[SW] Syncing', operations.length, 'queued operations...');

    for (const op of operations) {
      try {
        const response = await fetch('/api/operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op.data)
        });

        if (response.ok) {
          // Remove from queue
          const txW = db.transaction('operationQueue', 'readwrite');
          await txW.objectStore('operationQueue').delete(op.id);
          console.log('[SW] Synced operation:', op.id);
        }
      } catch (err) {
        console.error('[SW] Sync failed for operation:', op.id, err);
        // Leave in queue for next sync
      }
    }

    // Notify clients of sync completion
    notifyClientsOfSync();

  } catch (err) {
    console.error('[SW] Sync failed:', err);
    throw err;
  }
}

/**
 * HELPER: Open IndexedDB
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cyclecad', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('operationQueue')) {
        db.createObjectStore('operationQueue', { keyPath: 'id' });
      }
    };
  });
}

/**
 * HELPER: Notify all clients of update available
 */
function notifyClientsOfUpdate() {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'UPDATE_AVAILABLE',
        message: 'A new version of cycleCAD is available. Reload to update.'
      });
    });
  });
}

/**
 * HELPER: Notify all clients of sync completion
 */
function notifyClientsOfSync() {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        message: 'Offline changes have been synced.'
      });
    });
  });
}

/**
 * MESSAGE EVENT
 * Handle messages from clients
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    clearAllCaches().then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }

  if (event.data.type === 'GET_CACHE_SIZE') {
    getCacheSize().then((size) => {
      event.ports[0].postMessage({ size });
    });
  }
});

/**
 * HELPER: Clear all caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(cacheNames.map((name) => caches.delete(name)));
}

/**
 * HELPER: Get total cache size
 */
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();

    for (const request of keys) {
      const response = await cache.match(request);
      const size = parseInt(response.headers.get('content-length') || 0);
      totalSize += size;
    }
  }

  return totalSize;
}

console.log('[SW] Service Worker loaded and ready');
