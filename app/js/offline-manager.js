/**
 * Offline Manager for cycleCAD
 * Handles online/offline detection, operation queuing, sync, and PWA features
 * ~400 lines
 */

class OfflineManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSWSupported = 'serviceWorker' in navigator;
    this.isDBSupported = 'indexedDB' in window;
    this.operationQueue = [];
    this.syncInProgress = false;
    this.updateAvailable = false;
    this.cacheSize = 0;

    this.init();
  }

  /**
   * Initialize offline manager
   */
  async init() {
    console.log('[OfflineManager] Initializing...');

    // Register service worker
    if (this.isSWSupported) {
      await this.registerServiceWorker();
    } else {
      console.warn('[OfflineManager] Service Workers not supported');
    }

    // Setup online/offline listeners
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Setup IndexedDB
    if (this.isDBSupported) {
      await this.initializeDatabase();
    }

    // Request permissions
    this.requestPermissions();

    // Sync offline operations if online
    if (this.isOnline) {
      await this.syncOperations();
    }

    // Check for updates
    this.checkForUpdates();

    // Setup UI
    this.setupUI();

    console.log('[OfflineManager] Ready. Online:', this.isOnline);
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/app/sw.js', {
        scope: '/app/'
      });

      console.log('[SW] Registered successfully');

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            this.showUpdatePrompt();
          }
        });
      });

      // Handle messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleSWMessage(event.data);
      });

    } catch (err) {
      console.error('[SW] Registration failed:', err);
    }
  }

  /**
   * Initialize IndexedDB
   */
  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('cyclecad', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[DB] Opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains('operationQueue')) {
          db.createObjectStore('operationQueue', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts', { keyPath: 'id', autoIncrement: true });
        }

        console.log('[DB] Upgraded successfully');
      };
    });
  }

  /**
   * Queue an operation for offline sync
   */
  async queueOperation(operation) {
    if (!this.isOnline && this.isDBSupported) {
      try {
        const tx = this.db.transaction('operationQueue', 'readwrite');
        const store = tx.objectStore('operationQueue');

        await new Promise((resolve, reject) => {
          const req = store.add({
            timestamp: Date.now(),
            data: operation
          });
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });

        console.log('[Offline] Operation queued:', operation);
        this.showNotification('Operation queued. Will sync when online.');

        return true;
      } catch (err) {
        console.error('[DB] Queue failed:', err);
        return false;
      }
    }

    return false;
  }

  /**
   * Sync offline operations when back online
   */
  async syncOperations() {
    if (this.syncInProgress) return;
    if (!this.isDBSupported) return;

    this.syncInProgress = true;

    try {
      const tx = this.db.transaction('operationQueue', 'readonly');
      const store = tx.objectStore('operationQueue');

      const operations = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

      console.log('[Offline] Syncing', operations.length, 'queued operations...');

      if (operations.length === 0) {
        this.syncInProgress = false;
        return;
      }

      // Notify SW to sync
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_OPERATIONS'
        });
      }

      // Show sync progress
      this.showSyncProgress(0, operations.length);

      // Sync each operation
      let syncedCount = 0;
      for (const op of operations) {
        try {
          const response = await fetch('/api/operations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op.data)
          });

          if (response.ok) {
            // Remove from queue
            const txW = this.db.transaction('operationQueue', 'readwrite');
            await new Promise((resolve, reject) => {
              const req = txW.objectStore('operationQueue').delete(op.id);
              req.onerror = () => reject(req.error);
              req.onsuccess = () => resolve();
            });

            syncedCount++;
            this.showSyncProgress(syncedCount, operations.length);
            console.log('[Offline] Synced operation:', op.id);
          }
        } catch (err) {
          console.error('[Offline] Sync failed for operation:', op.id, err);
        }
      }

      console.log('[Offline] Sync complete:', syncedCount, '/', operations.length);
      this.showNotification(`Synced ${syncedCount} operation(s).`);

    } catch (err) {
      console.error('[Offline] Sync failed:', err);
      this.showNotification('Sync failed. Will retry.');
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Handle online event
   */
  handleOnline() {
    console.log('[Offline] Online detected');
    this.isOnline = true;

    this.showNotification('Back online! Syncing changes...');
    this.updateOfflineBanner();
    this.syncOperations();
  }

  /**
   * Handle offline event
   */
  handleOffline() {
    console.log('[Offline] Offline detected');
    this.isOnline = false;

    this.showNotification('You are offline. Changes will sync when online.');
    this.updateOfflineBanner();
  }

  /**
   * Handle messages from service worker
   */
  handleSWMessage(data) {
    console.log('[Offline] SW message:', data.type);

    if (data.type === 'UPDATE_AVAILABLE') {
      this.showUpdatePrompt();
    }

    if (data.type === 'SYNC_COMPLETE') {
      this.showNotification('All changes synced!');
    }
  }

  /**
   * Show update prompt
   */
  showUpdatePrompt() {
    this.updateAvailable = true;

    if (!document.getElementById('update-prompt')) {
      const prompt = document.createElement('div');
      prompt.id = 'update-prompt';
      prompt.innerHTML = `
        <div style="
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #0284C7;
          color: white;
          padding: 16px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
          max-width: 320px;
        ">
          <strong>Update available!</strong>
          <p style="margin: 8px 0 0 0; font-size: 14px;">
            A new version of cycleCAD is ready.
          </p>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button onclick="window.location.reload()" style="
              background: white;
              color: #0284C7;
              border: none;
              padding: 8px 16px;
              border-radius: 4px;
              cursor: pointer;
              font-weight: 600;
              flex: 1;
            ">Update Now</button>
            <button onclick="this.closest('#update-prompt').remove()" style="
              background: rgba(255,255,255,0.2);
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 4px;
              cursor: pointer;
              flex: 1;
            ">Later</button>
          </div>
        </div>
      `;
      document.body.appendChild(prompt);

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        const el = document.getElementById('update-prompt');
        if (el) el.remove();
      }, 10000);
    }
  }

  /**
   * Show offline banner
   */
  updateOfflineBanner() {
    let banner = document.getElementById('offline-banner');

    if (!this.isOnline) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: #EF4444;
          color: white;
          padding: 12px 20px;
          text-align: center;
          font-weight: 500;
          z-index: 999998;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
        `;
        banner.textContent = 'You are offline. Your changes will sync when you reconnect.';
        document.body.insertBefore(banner, document.body.firstChild);
      }
    } else {
      if (banner) banner.remove();
    }
  }

  /**
   * Show notification toast
   */
  showNotification(message, duration = 4000) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: #1F2937;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999998;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
      font-size: 14px;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Show sync progress
   */
  showSyncProgress(current, total) {
    let progress = document.getElementById('sync-progress');

    if (!progress) {
      progress = document.createElement('div');
      progress.id = 'sync-progress';
      progress.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #1F2937;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 999998;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
        font-size: 13px;
        min-width: 300px;
      `;
      document.body.appendChild(progress);
    }

    const pct = Math.round((current / total) * 100);
    progress.innerHTML = `
      <div>Syncing changes... ${current}/${total}</div>
      <div style="
        background: rgba(255,255,255,0.1);
        height: 4px;
        border-radius: 2px;
        margin-top: 8px;
        overflow: hidden;
      ">
        <div style="
          background: #0284C7;
          height: 100%;
          width: ${pct}%;
          transition: width 0.2s ease;
        "></div>
      </div>
    `;

    if (current >= total) {
      setTimeout(() => progress.remove(), 1000);
    }
  }

  /**
   * Get cache size
   */
  async getCacheSize() {
    return new Promise((resolve) => {
      if (!this.isSWSupported) {
        resolve(0);
        return;
      }

      navigator.serviceWorker.controller?.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [new MessageChannel().port2]
      );

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.size !== undefined) {
          this.cacheSize = event.data.size;
          resolve(event.data.size);
        }
      });
    });
  }

  /**
   * Clear cache
   */
  async clearCache() {
    return new Promise((resolve) => {
      if (!this.isSWSupported) {
        resolve(false);
        return;
      }

      const channel = new MessageChannel();
      navigator.serviceWorker.controller?.postMessage(
        { type: 'CLEAR_CACHE' },
        [channel.port2]
      );

      channel.port1.onmessage = (event) => {
        if (event.data.success) {
          this.cacheSize = 0;
          this.showNotification('Cache cleared successfully.');
          resolve(true);
        }
      };
    });
  }

  /**
   * Check for updates
   */
  checkForUpdates() {
    if (!this.isSWSupported) return;

    // Check every hour
    setInterval(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/app/');
        if (registration) {
          await registration.update();
        }
      } catch (err) {
        console.error('[Offline] Update check failed:', err);
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Request permissions for notifications and install
   */
  requestPermissions() {
    // Install prompt
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPrompt = event;
      this.showInstallPrompt();
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully');
      this.installPrompt = null;
    });
  }

  /**
   * Show install prompt
   */
  showInstallPrompt() {
    if (!this.installPrompt || window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    if (!document.getElementById('install-prompt')) {
      const prompt = document.createElement('div');
      prompt.id = 'install-prompt';
      prompt.innerHTML = `
        <div style="
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: white;
          border: 2px solid #0284C7;
          border-radius: 12px;
          padding: 16px 20px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
          max-width: 320px;
        ">
          <strong style="color: #1F2937;">Add to Home Screen</strong>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #4B5563;">
            Access cycleCAD directly from your home screen or app drawer.
          </p>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button id="install-btn" style="
              background: #0284C7;
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              flex: 1;
            ">Install</button>
            <button onclick="this.closest('#install-prompt').remove()" style="
              background: #F3F4F6;
              color: #1F2937;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              cursor: pointer;
              flex: 1;
            ">Not now</button>
          </div>
        </div>
      `;
      document.body.appendChild(prompt);

      document.getElementById('install-btn').addEventListener('click', () => {
        this.installPrompt.prompt();
        this.installPrompt.userChoice.then((choice) => {
          if (choice.outcome === 'accepted') {
            console.log('[PWA] Install accepted');
          }
          document.getElementById('install-prompt')?.remove();
          this.installPrompt = null;
        });
      });

      // Auto-dismiss after 15 seconds
      setTimeout(() => {
        const el = document.getElementById('install-prompt');
        if (el) el.remove();
      }, 15000);
    }
  }

  /**
   * Setup UI controls
   */
  setupUI() {
    // Add offline manager UI to settings panel if it exists
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
      const offlineSection = document.createElement('div');
      offlineSection.id = 'offline-section';
      offlineSection.innerHTML = `
        <div style="padding: 12px 0; border-top: 1px solid #E5E7EB;">
          <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #1F2937;">
            Offline & Cache
          </h3>
          <button id="cache-status-btn" style="
            width: 100%;
            padding: 10px;
            margin-bottom: 8px;
            background: #F3F4F6;
            border: 1px solid #D1D5DB;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
          ">
            <div>Cache: Calculating...</div>
          </button>
          <button id="clear-cache-btn" style="
            width: 100%;
            padding: 10px;
            background: #FEE2E2;
            border: 1px solid #FCA5A5;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            color: #DC2626;
            font-size: 13px;
          ">
            Clear Cache
          </button>
        </div>
      `;
      settingsPanel.appendChild(offlineSection);

      // Cache size display
      this.getCacheSize().then((size) => {
        const btn = document.getElementById('cache-status-btn');
        if (btn) {
          const sizeStr = this.formatBytes(size);
          btn.textContent = `Cache: ${sizeStr}`;
        }
      });

      // Clear cache handler
      document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
        if (confirm('Clear all cached files? You can still work offline with cached projects.')) {
          await this.clearCache();
          const btn = document.getElementById('cache-status-btn');
          if (btn) btn.textContent = 'Cache: 0 B';
        }
      });
    }
  }

  /**
   * Format bytes to human-readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
  }
}

// Initialize on page load
window.offlineManager = new OfflineManager();

// Add styles for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(-20px);
    }
  }
`;
document.head.appendChild(style);

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineManager;
}
