/**
 * Touch Handler for cycleCAD Mobile
 * Comprehensive touch gesture detection and handling
 * Supports tap, double-tap, long-press, swipe, pinch, and rotation
 */

class TouchHandler {
  constructor(viewport, options = {}) {
    this.viewport = viewport;
    this.options = {
      tapDelay: 300,
      longPressDelay: 500,
      swipeThreshold: 50,
      pinchThreshold: 20,
      ...options
    };

    this.state = {
      touchCount: 0,
      isMultiTouch: false,
      startX: 0,
      startY: 0,
      startDistance: 0,
      startRotation: 0,
      tapTimer: null,
      longPressTimer: null,
      isSwiping: false,
      isPinching: false,
      isRotating: false,
      touches: [],
      lastTap: 0
    };

    this.callbacks = {
      onTap: options.onTap || (() => {}),
      onDoubleTap: options.onDoubleTap || (() => {}),
      onLongPress: options.onLongPress || (() => {}),
      onSwipeLeft: options.onSwipeLeft || (() => {}),
      onSwipeRight: options.onSwipeRight || (() => {}),
      onSwipeUp: options.onSwipeUp || (() => {}),
      onSwipeDown: options.onSwipeDown || (() => {}),
      onPinch: options.onPinch || (() => {}),
      onRotate: options.onRotate || (() => {}),
      onPan: options.onPan || (() => {}),
      onContextMenu: options.onContextMenu || (() => {})
    };

    this.init();
  }

  init() {
    // Pointer events for cross-device support
    this.viewport.addEventListener('pointerdown', (e) => this.handlePointerDown(e), false);
    this.viewport.addEventListener('pointermove', (e) => this.handlePointerMove(e), false);
    this.viewport.addEventListener('pointerup', (e) => this.handlePointerUp(e), false);
    this.viewport.addEventListener('pointercancel', (e) => this.handlePointerCancel(e), false);

    // Fallback for browsers without pointer events
    if (!('PointerEvent' in window)) {
      this.viewport.addEventListener('touchstart', (e) => this.handleTouchStart(e), false);
      this.viewport.addEventListener('touchmove', (e) => this.handleTouchMove(e), false);
      this.viewport.addEventListener('touchend', (e) => this.handleTouchEnd(e), false);
      this.viewport.addEventListener('touchcancel', (e) => this.handleTouchCancel(e), false);
    }

    // Context menu
    this.viewport.addEventListener('contextmenu', (e) => this.handleContextMenu(e), false);

    // Gesture events for iOS Safari
    if ('GestureEvent' in window) {
      this.viewport.addEventListener('gesturestart', (e) => this.handleGestureStart(e), false);
      this.viewport.addEventListener('gesturechange', (e) => this.handleGestureChange(e), false);
      this.viewport.addEventListener('gestureend', (e) => this.handleGestureEnd(e), false);
    }
  }

  handlePointerDown(e) {
    // Ignore non-touch pointers (mouse, pen)
    if (e.pointerType !== 'touch') return;

    e.preventDefault();

    this.state.touches.push({
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now()
    });

    this.state.touchCount = this.state.touches.length;
    this.state.isMultiTouch = this.state.touchCount > 1;

    if (this.state.touchCount === 1) {
      this.handleSingleTouchStart(e);
    } else if (this.state.touchCount === 2) {
      this.handleMultiTouchStart(e);
    } else if (this.state.touchCount === 3) {
      // Three-finger tap = undo
      this.handleThreeFingerTap(e);
    }
  }

  handlePointerMove(e) {
    if (e.pointerType !== 'touch') return;

    const touch = this.state.touches.find(t => t.id === e.pointerId);
    if (!touch) return;

    touch.x = e.clientX;
    touch.y = e.clientY;

    if (this.state.touchCount === 1) {
      this.handleSingleTouchMove(e);
    } else if (this.state.touchCount === 2) {
      this.handleMultiTouchMove(e);
    }
  }

  handlePointerUp(e) {
    if (e.pointerType !== 'touch') return;

    const touchIndex = this.state.touches.findIndex(t => t.id === e.pointerId);
    if (touchIndex === -1) return;

    const touch = this.state.touches[touchIndex];
    const duration = Date.now() - touch.startTime;

    this.state.touches.splice(touchIndex, 1);
    this.state.touchCount = this.state.touches.length;
    this.state.isMultiTouch = this.state.touchCount > 0;

    if (duration < 500 && this.state.touchCount === 0) {
      this.handleSingleTouchEnd(touch);
    }

    // Clear multi-touch states
    if (this.state.touchCount === 0) {
      this.state.isSwiping = false;
      this.state.isPinching = false;
      this.state.isRotating = false;
    }
  }

  handlePointerCancel(e) {
    if (e.pointerType !== 'touch') return;

    this.state.touches = this.state.touches.filter(t => t.id !== e.pointerId);
    this.state.touchCount = this.state.touches.length;

    this.clearTimers();
  }

  // Single touch handling
  handleSingleTouchStart(e) {
    const touch = this.state.touches[0];

    // Clear existing timers
    clearTimeout(this.state.tapTimer);
    clearTimeout(this.state.longPressTimer);

    // Long press detection
    this.state.longPressTimer = setTimeout(() => {
      this.callbacks.onLongPress(touch);
      navigator.vibrate?.(50);
    }, this.options.longPressDelay);

    // Double tap detection
    const now = Date.now();
    if (now - this.state.lastTap < this.options.tapDelay) {
      clearTimeout(this.state.longPressTimer);
      this.callbacks.onDoubleTap(touch);
      navigator.vibrate?.(30);
      this.state.lastTap = 0; // Prevent triple-tap
    } else {
      this.state.lastTap = now;
    }
  }

  handleSingleTouchMove(e) {
    const touch = this.state.touches[0];
    const dx = touch.x - touch.startX;
    const dy = touch.y - touch.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Detect swipe if movement exceeds threshold
    if (distance > this.options.swipeThreshold && !this.state.isSwiping) {
      clearTimeout(this.state.longPressTimer);
      this.state.isSwiping = true;

      const angle = Math.atan2(dy, dx);
      const angleDeg = angle * (180 / Math.PI);

      // Determine swipe direction (45 degree tolerance)
      if (angleDeg > -45 && angleDeg < 45) {
        // Right swipe
        this.callbacks.onSwipeRight({ distance, touch });
      } else if (angleDeg > 45 && angleDeg < 135) {
        // Down swipe
        this.callbacks.onSwipeDown({ distance, touch });
      } else if ((angleDeg > 135 && angleDeg < 180) || (angleDeg > -180 && angleDeg < -135)) {
        // Left swipe
        this.callbacks.onSwipeLeft({ distance, touch });
      } else if (angleDeg > -135 && angleDeg < -45) {
        // Up swipe
        this.callbacks.onSwipeUp({ distance, touch });
      }
    }

    // Pan for continuous movement
    if (this.state.isSwiping) {
      this.callbacks.onPan({ dx, dy, touch });
    }
  }

  handleSingleTouchEnd(touch) {
    clearTimeout(this.state.tapTimer);
    clearTimeout(this.state.longPressTimer);

    const duration = Date.now() - touch.startTime;
    const dx = touch.x - touch.startX;
    const dy = touch.y - touch.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Tap if short duration and minimal movement
    if (duration < this.options.longPressDelay && distance < this.options.swipeThreshold) {
      this.callbacks.onTap(touch);
      navigator.vibrate?.(10);
    }

    this.state.isSwiping = false;
  }

  // Multi-touch handling
  handleMultiTouchStart(e) {
    clearTimeout(this.state.longPressTimer);

    if (this.state.touchCount === 2) {
      this.state.startDistance = this.getTouchDistance();
      this.state.startRotation = this.getTouchRotation();
      this.state.isPinching = true;
      this.state.isRotating = true;
    }
  }

  handleMultiTouchMove(e) {
    if (this.state.touchCount !== 2) return;

    const currentDistance = this.getTouchDistance();
    const currentRotation = this.getTouchRotation();

    // Pinch detection
    const distanceDelta = currentDistance - this.state.startDistance;
    if (Math.abs(distanceDelta) > this.options.pinchThreshold) {
      this.state.isPinching = true;
      const scale = currentDistance / this.state.startDistance;
      this.callbacks.onPinch({ scale, distance: currentDistance });
    }

    // Rotation detection
    const rotationDelta = currentRotation - this.state.startRotation;
    if (Math.abs(rotationDelta) > 5) { // 5 degree threshold
      this.state.isRotating = true;
      this.callbacks.onRotate({ rotation: currentRotation, delta: rotationDelta });
    }

    // Two-finger pan
    if (this.state.touchCount === 2) {
      const touch1 = this.state.touches[0];
      const touch2 = this.state.touches[1];
      const centerX = (touch1.x + touch2.x) / 2;
      const centerY = (touch1.y + touch2.y) / 2;
      const startCenterX = (touch1.startX + touch2.startX) / 2;
      const startCenterY = (touch1.startY + touch2.startY) / 2;

      const dx = centerX - startCenterX;
      const dy = centerY - startCenterY;

      this.callbacks.onPan({ dx, dy, touch1, touch2 });
    }
  }

  handleThreeFingerTap(e) {
    // Three-finger tap triggers undo
    if (window.app && window.app.undo) {
      window.app.undo();
      navigator.vibrate?.([30, 20, 30]);
    }
  }

  handleContextMenu(e) {
    e.preventDefault();

    // Get touch position
    const rect = this.viewport.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.callbacks.onContextMenu({ x, y, event: e });
  }

  handleGestureStart(e) {
    e.preventDefault();
    this.state.startDistance = e.scale;
    this.state.startRotation = e.rotation;
  }

  handleGestureChange(e) {
    e.preventDefault();

    if (e.scale !== this.state.startDistance) {
      const scale = e.scale;
      this.callbacks.onPinch({ scale, distance: scale });
    }

    if (e.rotation !== this.state.startRotation) {
      const delta = e.rotation - this.state.startRotation;
      this.callbacks.onRotate({ rotation: e.rotation, delta });
    }
  }

  handleGestureEnd(e) {
    e.preventDefault();
    this.state.isPinching = false;
    this.state.isRotating = false;
  }

  // Fallback touch handlers
  handleTouchStart(e) {
    Array.from(e.touches).forEach(touch => {
      this.state.touches.push({
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now()
      });
    });

    this.state.touchCount = this.state.touches.length;
    if (this.state.touchCount === 1) {
      this.handleSingleTouchStart(e);
    } else if (this.state.touchCount === 2) {
      this.handleMultiTouchStart(e);
    }
  }

  handleTouchMove(e) {
    Array.from(e.touches).forEach(touch => {
      const t = this.state.touches.find(st => st.id === touch.identifier);
      if (t) {
        t.x = touch.clientX;
        t.y = touch.clientY;
      }
    });

    if (this.state.touchCount === 1) {
      this.handleSingleTouchMove(e);
    } else if (this.state.touchCount === 2) {
      this.handleMultiTouchMove(e);
    }
  }

  handleTouchEnd(e) {
    Array.from(e.changedTouches).forEach(touch => {
      const index = this.state.touches.findIndex(t => t.id === touch.identifier);
      if (index !== -1) {
        const t = this.state.touches[index];
        this.state.touches.splice(index, 1);

        if (this.state.touches.length === 0) {
          this.handleSingleTouchEnd(t);
        }
      }
    });

    this.state.touchCount = this.state.touches.length;
  }

  handleTouchCancel(e) {
    this.state.touches = [];
    this.state.touchCount = 0;
    this.clearTimers();
  }

  // Utility methods
  getTouchDistance() {
    if (this.state.touches.length !== 2) return 0;

    const t1 = this.state.touches[0];
    const t2 = this.state.touches[1];
    const dx = t2.x - t1.x;
    const dy = t2.y - t1.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  getTouchRotation() {
    if (this.state.touches.length !== 2) return 0;

    const t1 = this.state.touches[0];
    const t2 = this.state.touches[1];
    const dx = t2.x - t1.x;
    const dy = t2.y - t1.y;

    return Math.atan2(dy, dx) * (180 / Math.PI);
  }

  clearTimers() {
    clearTimeout(this.state.tapTimer);
    clearTimeout(this.state.longPressTimer);
  }

  destroy() {
    this.clearTimers();
    this.viewport.removeEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.viewport.removeEventListener('pointermove', this.handlePointerMove.bind(this));
    this.viewport.removeEventListener('pointerup', this.handlePointerUp.bind(this));
    this.viewport.removeEventListener('pointercancel', this.handlePointerCancel.bind(this));
    this.viewport.removeEventListener('contextmenu', this.handleContextMenu.bind(this));
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TouchHandler;
}
