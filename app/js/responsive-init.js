/**
 * Responsive Design Initialization for cycleCAD
 * Detects device type, loads mobile CSS, initializes touch handlers
 */

class ResponsiveInit {
  constructor() {
    this.device = null;
    this.isMobile = false;
    this.isTablet = false;
    this.isDesktop = false;
    this.isTouch = false;
    this.viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
    };

    this.init();
  }

  init() {
    this.detectDevice();
    this.loadMobileCSS();
    this.setViewportMeta();
    this.initTouchHandlers();
    this.initOrientationHandler();
    this.reportDeviceInfo();
    this.setupSafeAreas();
  }

  detectDevice() {
    const width = this.viewport.width;
    const height = this.viewport.height;
    const userAgent = navigator.userAgent;

    // Detect touch capability
    this.isTouch = (() => {
      try {
        document.createEvent('TouchEvent');
        return true;
      } catch (e) {
        return false;
      }
    })() || navigator.maxTouchPoints > 0;

    // Categorize by screen size
    if (width < 600) {
      this.isMobile = true;
      this.device = 'phone';
    } else if (width < 1200) {
      this.isTablet = true;
      this.device = 'tablet';
    } else {
      this.isDesktop = true;
      this.device = 'desktop';
    }

    // Detect specific device
    if (/iPad/.test(userAgent)) {
      this.device = 'ipad';
    } else if (/iPhone/.test(userAgent)) {
      this.device = 'iphone';
    } else if (/Android/.test(userAgent)) {
      this.device = /Tablet|iPad/.test(userAgent) ? 'android-tablet' : 'android-phone';
    } else if (/Windows NT/.test(userAgent) && /Touch/.test(userAgent)) {
      this.device = 'surface';
    }

    console.log('[Responsive] Device detected:', {
      device: this.device,
      isMobile: this.isMobile,
      isTablet: this.isTablet,
      isDesktop: this.isDesktop,
      isTouch: this.isTouch,
      viewport: this.viewport
    });
  }

  loadMobileCSS() {
    // Load mobile.css if not already present
    if (!document.getElementById('mobile-css')) {
      const link = document.createElement('link');
      link.id = 'mobile-css';
      link.rel = 'stylesheet';
      link.href = '/app/css/mobile.css';
      link.media = 'all';
      document.head.appendChild(link);

      link.onload = () => {
        console.log('[Responsive] mobile.css loaded successfully');
      };

      link.onerror = () => {
        console.warn('[Responsive] Failed to load mobile.css');
      };
    }
  }

  setViewportMeta() {
    // Check if viewport meta exists
    let viewportMeta = document.querySelector('meta[name="viewport"]');

    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.name = 'viewport';
      document.head.appendChild(viewportMeta);
    }

    // Set optimal viewport settings for mobile
    viewportMeta.content = [
      'width=device-width',
      'initial-scale=1.0',
      'viewport-fit=cover',
      'user-scalable=yes',
      'maximum-scale=5.0',
      'minimum-scale=1.0'
    ].join(', ');

    // Add theme-color meta for mobile browsers
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      themeMeta.content = '#ffffff';
      document.head.appendChild(themeMeta);
    }
  }

  setupSafeAreas() {
    // Set CSS custom properties for safe area insets
    const style = document.documentElement.style;

    // iOS notch support
    const topInset = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top') || '0'
    );
    const rightInset = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-right') || '0'
    );
    const bottomInset = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom') || '0'
    );
    const leftInset = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-left') || '0'
    );

    console.log('[Responsive] Safe areas:', { topInset, rightInset, bottomInset, leftInset });

    // Add viewport-fit for proper notch handling
    setViewportMeta();

    function setViewportMeta() {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta && !meta.content.includes('viewport-fit')) {
        meta.content += ', viewport-fit=cover';
      }
    }
  }

  initTouchHandlers() {
    if (!this.isTouch) {
      console.log('[Responsive] No touch capability detected');
      return;
    }

    // Prevent default touch behaviors that interfere with app
    document.addEventListener('touchmove', (e) => {
      // Allow scrolling in specific elements
      const scrollableSelectors = ['#left-panel', '#right-panel', '.bottom-sheet', '.results-log'];
      const target = e.target;

      const isScrollable = scrollableSelectors.some(selector => {
        return target.closest(selector);
      });

      if (!isScrollable && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent iOS tap highlight
    document.addEventListener('touchstart', () => {
      // iOS tap-to-focus handling
    }, false);

    // Initialize TouchHandler if available
    if (window.TouchHandler) {
      const viewport = document.getElementById('viewport');
      if (viewport) {
        window.touchHandler = new TouchHandler(viewport, {
          onTap: (touch) => this.handleTap(touch),
          onDoubleTap: (touch) => this.handleDoubleTap(touch),
          onLongPress: (touch) => this.handleLongPress(touch),
          onSwipeLeft: () => this.openRightPanel(),
          onSwipeRight: () => this.openLeftPanel(),
          onSwipeUp: () => this.expandTimeline(),
          onSwipeDown: () => this.collapseTimeline(),
          onPinch: (data) => this.handlePinch(data),
          onRotate: (data) => this.handleRotate(data),
          onContextMenu: (pos) => this.showContextMenu(pos)
        });

        console.log('[Responsive] TouchHandler initialized');
      }
    }

    console.log('[Responsive] Touch handlers initialized');
  }

  handleTap(touch) {
    console.log('[Responsive] Tap at', touch);
  }

  handleDoubleTap(touch) {
    console.log('[Responsive] Double-tap at', touch);
  }

  handleLongPress(touch) {
    console.log('[Responsive] Long-press at', touch);
  }

  handlePinch(data) {
    console.log('[Responsive] Pinch with scale', data.scale);
  }

  handleRotate(data) {
    console.log('[Responsive] Rotate with delta', data.delta);
  }

  openRightPanel() {
    const panel = document.getElementById('right-panel');
    const backdrop = document.querySelector('.right-panel-backdrop');
    if (panel) {
      panel.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    }
  }

  openLeftPanel() {
    const panel = document.getElementById('left-panel');
    const backdrop = document.querySelector('.left-panel-backdrop');
    if (panel) {
      panel.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    }
  }

  expandTimeline() {
    const timeline = document.querySelector('.timeline-container');
    if (timeline) {
      timeline.classList.add('open');
    }
  }

  collapseTimeline() {
    const timeline = document.querySelector('.timeline-container');
    if (timeline) {
      timeline.classList.remove('open');
    }
  }

  showContextMenu(pos) {
    console.log('[Responsive] Context menu at', pos);
  }

  initOrientationHandler() {
    window.addEventListener('orientationchange', () => {
      this.handleOrientationChange();
    });

    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }

  handleOrientationChange() {
    const orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';

    if (orientation !== this.viewport.orientation) {
      this.viewport.orientation = orientation;

      console.log('[Responsive] Orientation changed to', orientation);

      // Close open panels on orientation change
      document.getElementById('left-panel')?.classList.remove('open');
      document.getElementById('right-panel')?.classList.remove('open');
      document.querySelector('.left-panel-backdrop')?.classList.remove('open');
      document.querySelector('.right-panel-backdrop')?.classList.remove('open');

      // Re-layout as needed
      this.handleResize();
    }
  }

  handleResize() {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    if (newWidth !== this.viewport.width || newHeight !== this.viewport.height) {
      this.viewport.width = newWidth;
      this.viewport.height = newHeight;

      // Re-detect device type on resize
      const oldDevice = this.device;
      this.detectDevice();

      if (oldDevice !== this.device) {
        console.log('[Responsive] Device type changed from', oldDevice, 'to', this.device);
      }

      // Trigger layout recalculation
      window.dispatchEvent(new CustomEvent('mobileLayoutChange', {
        detail: {
          device: this.device,
          viewport: this.viewport,
          isMobile: this.isMobile,
          isTablet: this.isTablet,
          isDesktop: this.isDesktop
        }
      }));
    }
  }

  reportDeviceInfo() {
    // Add device info to status bar if available
    const statusBar = document.querySelector('.status-bar');
    if (statusBar) {
      const deviceInfo = document.createElement('span');
      deviceInfo.className = 'device-info';
      deviceInfo.style.marginLeft = 'auto';
      deviceInfo.textContent = `${this.device} • ${this.viewport.width}×${this.viewport.height}`;
      statusBar.appendChild(deviceInfo);
    }

    // Expose device info globally
    window.deviceInfo = {
      device: this.device,
      isMobile: this.isMobile,
      isTablet: this.isTablet,
      isDesktop: this.isDesktop,
      isTouch: this.isTouch,
      viewport: this.viewport
    };

    console.log('[Responsive] Device info exposed to window.deviceInfo');
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.responsiveInit = new ResponsiveInit();
  });
} else {
  window.responsiveInit = new ResponsiveInit();
}

// Also expose class globally for reference
window.ResponsiveInit = ResponsiveInit;
