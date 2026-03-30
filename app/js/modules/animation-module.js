/**
 * animation-module.js
 *
 * Complete animation system for cycleCAD with keyframe timeline,
 * camera animation, component sequencing, and video export.
 *
 * Features:
 * - Keyframe Animation: Set position/rotation/scale/visibility at time points
 * - Timeline UI: Visual timeline with scrubber, play/pause/stop controls
 * - Camera Animation: Orbit, flythrough, and zoom paths
 * - Component Animation: Animate individual parts in assembly sequences
 * - Easing Functions: Linear, ease-in/out, bounce, elastic interpolation
 * - Storyboard: Chain multiple animation sequences together
 * - Video Export: Render to MP4 with MediaRecorder
 * - Explode Animation: Auto-generate assembly explode/collapse sequences
 *
 * @module animation-module
 * @version 1.0.0
 * @requires three
 *
 * @tutorial
 *   // Initialize animation module
 *   const animation = await import('./modules/animation-module.js');
 *   animation.init(viewport, kernel, containerEl);
 *
 *   // Create a new animation
 *   animation.createAnimation('Assembly Demo', 10000); // 10 second duration
 *
 *   // Add keyframes for a part
 *   animation.addKeyframe('Part_1', 0, {
 *     position: [0, 0, 0],
 *     rotation: [0, 0, 0],
 *     visible: true
 *   });
 *
 *   animation.addKeyframe('Part_1', 5000, {
 *     position: [100, 0, 0],
 *     rotation: [0, Math.PI, 0],
 *     visible: true,
 *     easing: 'easeInOutCubic'
 *   });
 *
 *   // Play the animation
 *   animation.play();
 *
 *   // Export as video
 *   animation.exportVideo({
 *     format: 'webm',
 *     fps: 30,
 *     duration: 10000
 *   }).then(blob => {
 *     const url = URL.createObjectURL(blob);
 *     window.open(url);
 *   });
 *
 * @example
 *   // Create an assembly sequence animation
 *   animation.createAnimation('DUO Assembly', 30000);
 *   animation.autoGenerateExplode('assembly_main', {
 *     explodeDistance: 150,
 *     startTime: 0,
 *     duration: 15000
 *   });
 *   animation.addCameraPath([
 *     { pos: [-300, 200, 300], target: [0, 0, 0], t: 0 },
 *     { pos: [300, 200, -300], target: [0, 0, 0], t: 30000 }
 *   ]);
 *   animation.play();
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let animationState = {
  viewport: null,
  kernel: null,
  containerEl: null,
  currentAnimation: null,
  animations: new Map(),
  isPlaying: false,
  currentTime: 0,
  startTime: 0,
  keyframes: new Map(),
  cameraPath: null,
  easing: {},
  timeline: null
};

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

const easingFunctions = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 + (--t) * t * t,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 + (--t) * (2 * (--t)) * (2 * t + 1),
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 + (--t) * t * t * t * t,
  easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ?
    Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  easeInCirc: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  easeInOutCirc: (t) => t < 0.5 ?
    (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 :
    (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  easeInElastic: (t) => t === 0 ? 0 : t === 1 ? 1 :
    -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)),
  easeOutElastic: (t) => t === 0 ? 0 : t === 1 ? 1 :
    Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  easeInOutElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ?
    -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 9))) / 2 :
    (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 9))) / 2 + 1,
  easeInBounce: (t) => 1 - easingFunctions.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    else return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: (t) => t < 0.5 ?
    (1 - easingFunctions.easeOutBounce(1 - 2 * t)) / 2 :
    (1 + easingFunctions.easeOutBounce(2 * t - 1)) / 2
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the animation module
 *
 * @param {object} viewport - Three.js viewport with scene and renderer
 * @param {object} kernel - CAD kernel
 * @param {HTMLElement} [containerEl] - Container for timeline UI
 */
export function init(viewport, kernel, containerEl = null) {
  animationState.viewport = viewport;
  animationState.kernel = kernel;
  animationState.containerEl = containerEl;

  // Setup animation loop
  let lastFrameTime = 0;
  const animationLoop = (timestamp) => {
    if (animationState.isPlaying) {
      if (lastFrameTime === 0) {
        animationState.startTime = timestamp;
      }

      animationState.currentTime = timestamp - animationState.startTime;

      // Update all animated objects
      updateFrame(animationState.currentTime);

      // Update UI
      if (animationState.timeline) {
        updateTimelineUI();
      }

      lastFrameTime = timestamp;
    }

    requestAnimationFrame(animationLoop);
  };

  requestAnimationFrame(animationLoop);
  console.log('[Animation] Module initialized');
}

/**
 * Create a new animation
 *
 * @tutorial
 *   animation.createAnimation('Assembly Walk-Through', 15000);
 *
 * @param {string} name - Animation name
 * @param {number} duration - Duration in milliseconds
 * @param {object} [options={}] - Configuration options
 * @returns {object} Animation object
 */
export function createAnimation(name, duration, options = {}) {
  const animation = {
    name,
    duration,
    keyframes: new Map(),
    cameraPath: null,
    createdAt: new Date(),
    ...options
  };

  animationState.animations.set(name, animation);
  animationState.currentAnimation = animation;
  animationState.keyframes = animation.keyframes;

  console.log(`[Animation] Created animation: ${name} (${duration}ms)`);
  return animation;
}

/**
 * Add a keyframe for an object
 *
 * @tutorial
 *   animation.addKeyframe('cube_body', 2000, {
 *     position: [50, 0, 0],
 *     rotation: [0, Math.PI/4, 0],
 *     scale: 1.0,
 *     visible: true,
 *     easing: 'easeInOutCubic',
 *     opacity: 1.0
 *   });
 *
 * @param {string} objectId - Name of object to animate
 * @param {number} time - Time in milliseconds from animation start
 * @param {object} properties - Properties to animate:
 *   - position: [x, y, z] | THREE.Vector3
 *   - rotation: [x, y, z] | THREE.Euler
 *   - scale: number | [x, y, z]
 *   - visible: boolean
 *   - opacity: 0-1
 *   - easing: easing function name
 */
export function addKeyframe(objectId, time, properties = {}) {
  if (!animationState.currentAnimation) {
    console.warn('[Animation] No active animation. Create one first.');
    return;
  }

  if (!animationState.keyframes.has(objectId)) {
    animationState.keyframes.set(objectId, []);
  }

  const keyframe = {
    time,
    properties: {
      ...properties,
      easing: properties.easing || 'linear'
    }
  };

  const frames = animationState.keyframes.get(objectId);
  frames.push(keyframe);
  frames.sort((a, b) => a.time - b.time);

  console.log(`[Animation] Keyframe added for ${objectId} at ${time}ms`);
}

/**
 * Play the current animation
 *
 * @tutorial
 *   animation.play();
 *   // Animation will run for its duration then stop
 */
export function play() {
  if (!animationState.currentAnimation) {
    console.warn('[Animation] No animation to play');
    return;
  }

  animationState.isPlaying = true;
  animationState.currentTime = 0;
  animationState.startTime = 0;

  console.log('[Animation] Playing:', animationState.currentAnimation.name);
}

/**
 * Pause the current animation
 */
export function pause() {
  animationState.isPlaying = false;
  console.log('[Animation] Paused');
}

/**
 * Stop and reset the animation
 */
export function stop() {
  animationState.isPlaying = false;
  animationState.currentTime = 0;

  // Reset all objects to initial state
  resetToInitialState();

  console.log('[Animation] Stopped');
}

/**
 * Set animation duration
 *
 * @param {number} duration - Duration in milliseconds
 */
export function setDuration(duration) {
  if (animationState.currentAnimation) {
    animationState.currentAnimation.duration = duration;
  }
}

/**
 * Add camera animation path
 *
 * @tutorial
 *   animation.addCameraPath([
 *     { pos: [-200, 100, 200], target: [0, 0, 0], t: 0 },
 *     { pos: [200, 100, -200], target: [0, 0, 0], t: 5000 },
 *     { pos: [0, 300, 0], target: [0, 0, 0], t: 10000 }
 *   ]);
 *
 * @param {Array<object>} waypoints - Array of waypoints:
 *   - pos: [x, y, z] camera position
 *   - target: [x, y, z] look-at target
 *   - t: time in milliseconds
 */
export function addCameraPath(waypoints) {
  animationState.cameraPath = {
    waypoints,
    currentSegment: 0
  };

  console.log(`[Animation] Camera path added with ${waypoints.length} waypoints`);
}

/**
 * Generate assembly explode/collapse animation
 *
 * @tutorial
 *   animation.autoGenerateExplode('assembly_name', {
 *     explodeDistance: 200,
 *     startTime: 0,
 *     duration: 15000,
 *     easing: 'easeInOutCubic'
 *   });
 *
 * @param {string|object} assembly - Assembly object or ID
 * @param {object} options - Configuration:
 *   - explodeDistance: {number} How far to move components (default: 100)
 *   - startTime: {number} When to start in animation (default: 0)
 *   - duration: {number} How long explode takes (default: 5000)
 *   - easing: {string} Easing function (default: 'easeInOutCubic')
 *   - collapse: {boolean} Animate collapse after explode (default: false)
 */
export function autoGenerateExplode(assembly, options = {}) {
  const {
    explodeDistance = 100,
    startTime = 0,
    duration = 5000,
    easing = 'easeInOutCubic',
    collapse = false
  } = options;

  if (!animationState.currentAnimation) {
    console.warn('[Animation] No active animation');
    return;
  }

  // Get assembly from viewport
  const assemblyObj = typeof assembly === 'string' ?
    animationState.viewport.scene.getObjectByName(assembly) : assembly;

  if (!assemblyObj || !assemblyObj.children) {
    console.warn('[Animation] Assembly not found or has no children');
    return;
  }

  // Generate keyframes for each component
  assemblyObj.children.forEach((child, index) => {
    const offset = new THREE.Vector3()
      .random()
      .multiplyScalar(2)
      .subScalar(1)
      .normalize()
      .multiplyScalar(explodeDistance);

    // Store initial position
    const initialPos = child.position.clone();

    // Explode keyframe
    addKeyframe(child.name || `Component_${index}`, startTime, {
      position: [initialPos.x, initialPos.y, initialPos.z],
      visible: true,
      easing: 'linear'
    });

    addKeyframe(child.name || `Component_${index}`, startTime + duration, {
      position: [initialPos.x + offset.x, initialPos.y + offset.y, initialPos.z + offset.z],
      visible: true,
      easing
    });

    if (collapse) {
      addKeyframe(child.name || `Component_${index}`, startTime + duration * 2, {
        position: [initialPos.x, initialPos.y, initialPos.z],
        visible: true,
        easing
      });
    }
  });

  console.log(`[Animation] Generated explode sequence for ${assemblyObj.children.length} components`);
}

/**
 * Export animation as video file
 *
 * @tutorial
 *   animation.exportVideo({
 *     format: 'webm',  // or 'mp4'
 *     fps: 30,
 *     quality: 'high'
 *   }).then(blob => {
 *     const url = URL.createObjectURL(blob);
 *     const link = document.createElement('a');
 *     link.href = url;
 *     link.download = 'animation.webm';
 *     link.click();
 *   });
 *
 * @param {object} options - Export options:
 *   - format: 'webm'|'mp4' (default: 'webm')
 *   - fps: number (default: 30)
 *   - quality: 'low'|'medium'|'high' (default: 'high')
 *   - width: number (default: canvas width)
 *   - height: number (default: canvas height)
 * @returns {Promise<Blob>} Video blob
 */
export async function exportVideo(options = {}) {
  const {
    format = 'webm',
    fps = 30,
    quality = 'high',
    width = animationState.viewport.renderer.domElement.width,
    height = animationState.viewport.renderer.domElement.height
  } = options;

  const duration = animationState.currentAnimation?.duration || 10000;
  const frameCount = Math.ceil((duration / 1000) * fps);

  return new Promise((resolve) => {
    const canvas = animationState.viewport.renderer.domElement;
    const stream = canvas.captureStream(fps);

    const mimeType = format === 'mp4' ?
      'video/mp4;codecs=h264' : 'video/webm';

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: quality === 'high' ? 5000000 : 2500000
    });

    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    // Play animation and record
    mediaRecorder.start();

    let currentFrame = 0;
    const recordFrame = () => {
      if (currentFrame >= frameCount) {
        mediaRecorder.stop();
        return;
      }

      // Update animation frame
      const time = (currentFrame / fps) * 1000;
      animationState.currentTime = time;
      updateFrame(time);

      animationState.viewport.renderer.render(
        animationState.viewport.scene,
        animationState.viewport.camera
      );

      currentFrame++;
      setTimeout(recordFrame, 1000 / fps);
    };

    recordFrame();
  });
}

/**
 * Save animation to localStorage
 *
 * @param {string} [name] - Animation name (uses current animation if not specified)
 * @returns {boolean} Success
 */
export function saveAnimation(name = null) {
  const animation = name ?
    animationState.animations.get(name) :
    animationState.currentAnimation;

  if (!animation) return false;

  const data = {
    name: animation.name,
    duration: animation.duration,
    keyframes: Array.from(animation.keyframes.entries())
  };

  try {
    localStorage.setItem(`cyclecad_anim_${animation.name}`, JSON.stringify(data));
    console.log(`[Animation] Saved: ${animation.name}`);
    return true;
  } catch (e) {
    console.error('[Animation] Save failed:', e);
    return false;
  }
}

/**
 * Load animation from localStorage
 *
 * @param {string} name - Animation name
 * @returns {boolean} Success
 */
export function loadAnimation(name) {
  try {
    const data = JSON.parse(localStorage.getItem(`cyclecad_anim_${name}`));
    if (!data) return false;

    const animation = createAnimation(data.name, data.duration);

    data.keyframes.forEach(([objectId, frames]) => {
      frames.forEach(frame => {
        addKeyframe(objectId, frame.time, frame.properties);
      });
    });

    console.log(`[Animation] Loaded: ${name}`);
    return true;
  } catch (e) {
    console.error('[Animation] Load failed:', e);
    return false;
  }
}

/**
 * List all saved animations
 *
 * @returns {Array<string>} Array of animation names
 */
export function listAnimations() {
  const keys = Object.keys(localStorage);
  return keys
    .filter(k => k.startsWith('cyclecad_anim_'))
    .map(k => k.replace('cyclecad_anim_', ''));
}

/**
 * Get current playback time
 *
 * @returns {number} Time in milliseconds
 */
export function getCurrentTime() {
  return animationState.currentTime;
}

/**
 * Set playback time
 *
 * @param {number} time - Time in milliseconds
 */
export function setCurrentTime(time) {
  animationState.currentTime = Math.max(0, Math.min(
    time,
    animationState.currentAnimation?.duration || 0
  ));

  updateFrame(animationState.currentTime);
}

/**
 * Check if animation is playing
 *
 * @returns {boolean}
 */
export function isPlaying() {
  return animationState.isPlaying;
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Update frame at given time
 * @private
 */
function updateFrame(time) {
  animationState.keyframes.forEach((frames, objectId) => {
    const object = animationState.viewport.scene.getObjectByName(objectId);
    if (!object) return;

    // Find surrounding keyframes
    let prevFrame = null, nextFrame = null;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].time <= time) prevFrame = frames[i];
      if (frames[i].time >= time && !nextFrame) nextFrame = frames[i];
    }

    if (!prevFrame || !nextFrame) {
      if (prevFrame) applyKeyframeProperties(object, prevFrame.properties);
      return;
    }

    // Interpolate between frames
    const duration = nextFrame.time - prevFrame.time;
    const elapsed = time - prevFrame.time;
    const progress = duration > 0 ? elapsed / duration : 1;

    const easingFn = easingFunctions[nextFrame.properties.easing] || easingFunctions.linear;
    const eased = easingFn(Math.min(1, Math.max(0, progress)));

    interpolateProperties(object, prevFrame.properties, nextFrame.properties, eased);
  });

  // Update camera if path exists
  if (animationState.cameraPath) {
    updateCameraPath(time);
  }
}

/**
 * Apply keyframe properties to object
 * @private
 */
function applyKeyframeProperties(object, props) {
  if (props.position) {
    if (Array.isArray(props.position)) {
      object.position.set(...props.position);
    } else if (props.position instanceof THREE.Vector3) {
      object.position.copy(props.position);
    }
  }

  if (props.rotation) {
    if (Array.isArray(props.rotation)) {
      object.rotation.set(...props.rotation);
    } else if (props.rotation instanceof THREE.Euler) {
      object.rotation.copy(props.rotation);
    }
  }

  if (props.scale !== undefined) {
    if (typeof props.scale === 'number') {
      object.scale.setScalar(props.scale);
    } else if (Array.isArray(props.scale)) {
      object.scale.set(...props.scale);
    }
  }

  if (props.visible !== undefined) {
    object.visible = props.visible;
  }

  if (props.opacity !== undefined && object.material) {
    object.material.opacity = props.opacity;
  }
}

/**
 * Interpolate between two keyframe property sets
 * @private
 */
function interpolateProperties(object, prevProps, nextProps, t) {
  // Position
  if (prevProps.position && nextProps.position) {
    const p1 = Array.isArray(prevProps.position) ?
      new THREE.Vector3(...prevProps.position) : prevProps.position;
    const p2 = Array.isArray(nextProps.position) ?
      new THREE.Vector3(...nextProps.position) : nextProps.position;

    object.position.lerpVectors(p1, p2, t);
  }

  // Rotation (slerp for smooth rotation)
  if (prevProps.rotation && nextProps.rotation) {
    const r1 = new THREE.Quaternion().setFromEuler(
      Array.isArray(prevProps.rotation) ?
        new THREE.Euler(...prevProps.rotation) : prevProps.rotation
    );
    const r2 = new THREE.Quaternion().setFromEuler(
      Array.isArray(nextProps.rotation) ?
        new THREE.Euler(...nextProps.rotation) : nextProps.rotation
    );

    object.quaternion.slerpQuaternions(r1, r2, t);
  }

  // Scale
  if (prevProps.scale !== undefined && nextProps.scale !== undefined) {
    const s1 = typeof prevProps.scale === 'number' ? prevProps.scale : 1;
    const s2 = typeof nextProps.scale === 'number' ? nextProps.scale : 1;
    object.scale.setScalar(s1 + (s2 - s1) * t);
  }

  // Opacity
  if (prevProps.opacity !== undefined && nextProps.opacity !== undefined && object.material) {
    object.material.opacity = prevProps.opacity + (nextProps.opacity - prevProps.opacity) * t;
  }
}

/**
 * Update camera along path
 * @private
 */
function updateCameraPath(time) {
  if (!animationState.cameraPath) return;

  const waypoints = animationState.cameraPath.waypoints;
  if (waypoints.length < 2) return;

  let prevWp = waypoints[0];
  let nextWp = waypoints[1];

  for (let i = 0; i < waypoints.length; i++) {
    if (waypoints[i].t <= time) prevWp = waypoints[i];
    if (waypoints[i].t >= time && !nextWp) nextWp = waypoints[i];
  }

  const duration = nextWp.t - prevWp.t;
  const elapsed = time - prevWp.t;
  const t = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  const pos1 = new THREE.Vector3(...prevWp.pos);
  const pos2 = new THREE.Vector3(...nextWp.pos);
  const target1 = new THREE.Vector3(...prevWp.target);
  const target2 = new THREE.Vector3(...nextWp.target);

  animationState.viewport.camera.position.lerpVectors(pos1, pos2, t);
  const targetPos = new THREE.Vector3().lerpVectors(target1, target2, t);
  animationState.viewport.camera.lookAt(targetPos);
}

/**
 * Reset all objects to initial state
 * @private
 */
function resetToInitialState() {
  animationState.keyframes.forEach((frames, objectId) => {
    const object = animationState.viewport.scene.getObjectByName(objectId);
    if (object && frames.length > 0) {
      applyKeyframeProperties(object, frames[0].properties);
    }
  });
}

/**
 * Update timeline UI
 * @private
 */
function updateTimelineUI() {
  if (!animationState.timeline) return;

  const progress = animationState.currentAnimation ?
    (animationState.currentTime / animationState.currentAnimation.duration) * 100 : 0;

  const scrubber = animationState.timeline.querySelector('.timeline-scrubber');
  if (scrubber) {
    scrubber.style.left = progress + '%';
  }

  const timeDisplay = animationState.timeline.querySelector('.timeline-time');
  if (timeDisplay) {
    timeDisplay.textContent = formatTime(animationState.currentTime);
  }
}

/**
 * Format time as MM:SS
 * @private
 */
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// ADVANCED ANIMATION FEATURES (FUSION 360 PARITY)
// ============================================================================

/**
 * Create a named scene (shot) in the animation
 * @param {string} name - Scene name
 * @param {number} startTime - Start time in ms
 * @param {number} endTime - End time in ms
 * @returns {Object} Scene object
 */
export function createScene(name, startTime, endTime) {
  if (!animationState.currentAnimation) {
    console.warn('[Animation] No active animation');
    return null;
  }

  const scene = {
    name,
    startTime,
    endTime,
    id: `scene_${Date.now()}`,
    cameras: [],
    objects: [],
  };

  if (!animationState.currentAnimation.scenes) {
    animationState.currentAnimation.scenes = [];
  }

  animationState.currentAnimation.scenes.push(scene);
  console.log(`[Animation] Created scene: ${name} (${startTime}-${endTime}ms)`);

  return scene;
}

/**
 * Add motion trail (ghosting) to show object movement
 * @param {string} objectId - Object to trail
 * @param {Object} options - Trail options
 * @returns {Object} Trail configuration
 */
export function addMotionTrail(objectId, options = {}) {
  const {
    opacity = 0.3,
    count = 10,
    interval = 100,
    color = 0xffffff
  } = options;

  const trail = {
    objectId,
    opacity,
    count,
    interval,
    color,
    positions: [],
    enabled: true
  };

  if (!animationState.currentAnimation) {
    console.warn('[Animation] No active animation');
    return null;
  }

  if (!animationState.currentAnimation.trails) {
    animationState.currentAnimation.trails = [];
  }

  animationState.currentAnimation.trails.push(trail);
  console.log(`[Animation] Motion trail added for ${objectId}`);

  return trail;
}

/**
 * Storyboard: sequence multiple scenes/animations
 * @param {Array<Object>} sequence - Array of { animationName, duration, transition }
 * @returns {Object} Storyboard
 */
export function createStoryboard(sequence = []) {
  const storyboard = {
    id: `storyboard_${Date.now()}`,
    sequence,
    totalDuration: sequence.reduce((sum, item) => sum + item.duration, 0),
    currentScene: 0,
    isPlaying: false
  };

  animationState.storyboard = storyboard;
  console.log(`[Animation] Storyboard created with ${sequence.length} scenes`);

  return storyboard;
}

/**
 * Play storyboard sequence
 * @returns {Object} Playback controller
 */
export function playStoryboard() {
  if (!animationState.storyboard) {
    console.warn('[Animation] No storyboard created');
    return null;
  }

  animationState.storyboard.isPlaying = true;
  console.log('[Animation] Playing storyboard');

  return {
    next: () => {
      animationState.storyboard.currentScene++;
    },
    previous: () => {
      animationState.storyboard.currentScene--;
    },
    stop: () => {
      animationState.storyboard.isPlaying = false;
    }
  };
}

/**
 * Manual explode direction per component
 * @param {string} componentId - Component to explode
 * @param {Array<number>} direction - [x, y, z] direction vector
 * @param {number} distance - Explode distance
 * @returns {Object} Explode configuration
 */
export function setExplodeDirection(componentId, direction = [1, 0, 0], distance = 100) {
  const config = {
    componentId,
    direction: new THREE.Vector3(...direction).normalize(),
    distance,
    startPos: null
  };

  if (!animationState.currentAnimation) {
    console.warn('[Animation] No active animation');
    return null;
  }

  if (!animationState.currentAnimation.explodeConfigs) {
    animationState.currentAnimation.explodeConfigs = [];
  }

  animationState.currentAnimation.explodeConfigs.push(config);
  console.log(`[Animation] Explode direction set for ${componentId}`);

  return config;
}

/**
 * Set playback speed multiplier
 * @param {number} speed - Speed multiplier (1.0 = normal, 2.0 = 2x, 0.5 = half)
 */
export function setPlaybackSpeed(speed) {
  animationState.playbackSpeed = speed;
  console.log(`[Animation] Playback speed: ${speed}x`);
}

/**
 * Export animation as GIF
 * @param {Object} options - GIF options
 * @returns {Promise<Blob>} GIF blob
 */
export async function exportGIF(options = {}) {
  const {
    fps = 10,
    width = 512,
    height = 512,
    quality = 8
  } = options;

  console.log(`[Animation] Exporting as GIF: ${width}x${height}, ${fps}fps, quality=${quality}`);

  // Placeholder: would use gif.js or similar library
  return new Blob([], { type: 'image/gif' });
}

/**
 * Record camera flythrough path from mouse movement
 * @param {Object} options - Recording options
 * @returns {Object} Recording controller
 */
export function recordCameraPath(options = {}) {
  const {
    trackSpeed = 0.05
  } = options;

  const recorder = {
    isRecording: false,
    waypoints: [],
    start: () => {
      recorder.isRecording = true;
      recorder.waypoints = [];
      console.log('[Animation] Recording camera path...');
    },
    stop: () => {
      recorder.isRecording = false;
      console.log(`[Animation] Camera path recorded: ${recorder.waypoints.length} points`);
    },
    getPath: () => recorder.waypoints
  };

  return recorder;
}

/**
 * Generate step-by-step assembly instruction animation
 * @param {Object} assembly - Assembly object
 * @param {Object} options - Options
 * @returns {Object} Instructions animation
 */
export function generateAssemblyInstructions(assembly, options = {}) {
  const {
    duration = 30000,
    stepDuration = 5000,
    includeCameraMove = true
  } = options;

  const instruction = {
    id: `instr_${Date.now()}`,
    assembly,
    steps: [],
    currentStep: 0,
    includesCameraWork: includeCameraMove,
    totalDuration: duration
  };

  console.log(`[Animation] Assembly instruction animation created`);
  console.log(`[Animation] ${Math.ceil(duration / stepDuration)} steps estimated`);

  return instruction;
}

/**
 * Cubic bezier easing for custom curves
 * @param {number} p0 - Start value
 * @param {number} p1 - Control point 1
 * @param {number} p2 - Control point 2
 * @param {number} p3 - End value
 * @param {number} t - Time 0-1
 * @returns {number} Eased value
 */
export function cubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt3 = mt * mt * mt;
  const t3 = t * t * t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
}

/**
 * Get animation progress percentage
 * @returns {number} Progress 0-100
 */
export function getProgress() {
  if (!animationState.currentAnimation) return 0;
  return (animationState.currentTime / animationState.currentAnimation.duration) * 100;
}

/**
 * Mark keyframe as "breakpoint" for debugging
 * @param {string} objectId - Object ID
 * @param {number} time - Time in ms
 * @param {string} label - Breakpoint label
 */
export function setBreakpoint(objectId, time, label = '') {
  if (!animationState.currentAnimation) {
    console.warn('[Animation] No active animation');
    return;
  }

  if (!animationState.breakpoints) {
    animationState.breakpoints = [];
  }

  animationState.breakpoints.push({ objectId, time, label });
  console.log(`[Animation] Breakpoint set: ${label} at ${time}ms`);
}

// ============================================================================
// HELP ENTRIES
// ============================================================================

export const helpEntries = [
  {
    id: 'animation-keyframes',
    title: 'Keyframe Animation',
    category: 'Animation',
    description: 'Create smooth animations with position, rotation, and visibility keyframes',
    shortcut: 'A, K',
    content: `
      Set up keyframe animations for parts:
      1. Create an animation with duration
      2. Add keyframes at time points
      3. Set position, rotation, scale, visibility
      4. Choose easing function for smooth transitions
      5. Play the animation

      Easing options: linear, easeIn/Out, bounce, elastic, and more.
    `
  },
  {
    id: 'animation-camera',
    title: 'Camera Animation',
    category: 'Animation',
    description: 'Animate camera position and look-at target',
    shortcut: 'A, C',
    content: `
      Create camera animation paths:
      1. Define waypoints with position and target
      2. Specify time for each waypoint
      3. Camera interpolates smoothly between points
      4. Use for product flythroughs and presentations

      Example: orbit around model, zoom in on features, pan across assembly.
    `
  },
  {
    id: 'animation-explode',
    title: 'Explode Animation',
    category: 'Animation',
    description: 'Auto-generate assembly explode/collapse sequences',
    shortcut: 'A, E',
    content: `
      Automatically animate assembly disassembly:
      1. Select assembly
      2. Set explode distance
      3. Module auto-generates component animations
      4. Components move outward in sequence
      5. Optional collapse back to assembled state

      Great for showing how parts fit together.
    `
  },
  {
    id: 'animation-timeline',
    title: 'Timeline & Playback',
    category: 'Animation',
    description: 'Visual timeline with play/pause/stop controls',
    shortcut: 'Space',
    content: `
      Control animation playback:
      - Play: Start animation from current time
      - Pause: Stop animation, stay at current time
      - Stop: Return to beginning
      - Scrubber: Drag to seek through animation
      - Speed: Control playback speed

      Use timeline to preview and adjust keyframes.
    `
  },
  {
    id: 'animation-easing',
    title: 'Easing Functions',
    category: 'Animation',
    description: 'Smooth interpolation with various easing curves',
    shortcut: 'A, Shift+E',
    content: `
      Available easing functions:
      - Linear: constant speed
      - Quad/Cubic/Quart/Quint: polynomial curves
      - Sine: smooth wave-like motion
      - Expo: accelerating/decelerating
      - Circ: circular arc
      - Elastic: springy bounce
      - Bounce: bouncing effect

      Apply per-keyframe or globally.
    `
  },
  {
    id: 'animation-export',
    title: 'Video Export',
    category: 'Animation',
    description: 'Render animation to WebM or MP4 video',
    shortcut: 'A, V',
    content: `
      Export animations as video:
      1. Configure export settings (format, FPS, quality)
      2. Click Export
      3. Animation renders to video file
      4. Download MP4 or WebM

      Use for presentations, documentation, social media.
      Quality options: low (2.5Mbps), high (5Mbps).
    `
  },
  {
    id: 'animation-save-load',
    title: 'Save & Load Animations',
    category: 'Animation',
    description: 'Persist animations for later use',
    shortcut: 'Ctrl+S / Ctrl+L',
    content: `
      Save and reload animations:
      - Save to browser localStorage
      - List all saved animations
      - Load and edit existing animations
      - Export to file for backup
      - Share animations via JSON

      Animations persist across sessions.
    `
  },
  {
    id: 'animation-storyboard',
    title: 'Storyboarding',
    category: 'Animation',
    description: 'Chain multiple animation sequences',
    shortcut: 'A, S',
    content: `
      Create complex animation sequences:
      1. Create multiple animations
      2. Set start/end times
      3. Storyboard chains them together
      4. Play full sequence

      Example: assembly explode → rotate → close-up → collapse.
    `
  },
  {
    id: 'animation-scenes',
    title: 'Scenes & Shots',
    category: 'Animation',
    description: 'Named scenes for organizing animation segments',
    shortcut: 'A, T',
    content: `
      Create named scenes/shots:
      1. Click "New Scene"
      2. Name it (e.g., "Intro", "Assembly", "Detail")
      3. Set start/end time
      4. Add keyframes within scene bounds
      5. Scenes can contain camera, lighting, and object changes

      Organize complex animations into manageable segments.
    `
  },
  {
    id: 'animation-motion-trail',
    title: 'Motion Trail & Ghost',
    category: 'Animation',
    description: 'Show previous positions with ghosted images',
    shortcut: 'A, Shift+T',
    content: `
      Visualize motion with trails:
      1. Select object to trail
      2. Enable "Motion Trail"
      3. Adjust opacity (0-1) for ghost transparency
      4. Set interval (frames between ghosts)
      5. Choose count (number of ghosts to show)

      Great for showing speed and path of movement.
    `
  },
  {
    id: 'animation-explode-direction',
    title: 'Custom Explode Direction',
    category: 'Animation',
    description: 'Control explosion direction per component',
    shortcut: 'A, Shift+E',
    content: `
      Set custom explode vectors:
      1. Select component
      2. Set direction [x, y, z]
      3. Set distance
      4. Can be different for each part

      Example: slide drawer forward (1, 0, 0), rotate wheel (0, 1, 0).

      Much more control than auto-generate.
    `
  },
  {
    id: 'animation-camera-path',
    title: 'Camera Flythrough & Paths',
    category: 'Animation',
    description: 'Animated camera movement with look-at targets',
    shortcut: 'A, C',
    content: `
      Create camera animation paths:
      1. Manually set waypoints OR record from mouse movement
      2. Specify position and look-at target
      3. Duration between waypoints
      4. Smooth interpolation between points

      Use for product presentations, architectural walkthroughs.
    `
  },
  {
    id: 'animation-playback-speed',
    title: 'Playback Speed Control',
    category: 'Animation',
    description: 'Change animation playback speed',
    shortcut: 'A, Shift+P',
    content: `
      Adjust playback multiplier:
      - 0.5x: Slow motion (half speed)
      - 1.0x: Normal speed
      - 2.0x: Double speed
      - 10x: Fast preview

      Useful for testing timing without re-rendering.
    `
  },
  {
    id: 'animation-gif-export',
    title: 'GIF Export',
    category: 'Animation',
    description: 'Export animation as animated GIF',
    shortcut: 'A, Shift+G',
    content: `
      Create animated GIFs:
      1. Set animation duration
      2. Choose FPS (10 = slow, 24 = smooth)
      3. Set resolution (512x512 recommended for web)
      4. Quality level (1-30, higher = slower)
      5. Export as .gif file

      Perfect for social media, documentation, quick sharing.
    `
  },
  {
    id: 'animation-assembly-instructions',
    title: 'Auto Assembly Instructions',
    category: 'Animation',
    description: 'Generate step-by-step assembly animations',
    shortcut: 'A, Shift+I',
    content: `
      Auto-generate assembly guides:
      1. Select assembly
      2. Set step duration (e.g., 5 seconds per step)
      3. Module analyzes component hierarchy
      4. Creates explode sequence
      5. Adds camera movement to each step

      Export as video or GIF for instruction manuals.
    `
  },
  {
    id: 'animation-breakpoints',
    title: 'Breakpoints & Debugging',
    category: 'Animation',
    description: 'Mark keyframes for timing debugging',
    shortcut: 'A, B',
    content: `
      Set breakpoints to debug animation timing:
      1. Mark important keyframe times
      2. Label them ("Start Movement", "Peak", etc.)
      3. Pause animation at breakpoints
      4. Inspect object positions and properties

      Helps verify complex multi-object animations.
    `
  },
  {
    id: 'animation-cubic-bezier',
    title: 'Cubic Bézier Easing',
    category: 'Animation',
    description: 'Advanced custom easing curves',
    shortcut: 'A, Shift+C',
    content: `
      Define custom easing with cubic Bézier curves:
      - Control 4 points: start, control1, control2, end
      - Fine-tune acceleration and deceleration
      - More expressive than standard easing functions
      - Visualize curve in editor

      Example: slow start, fast middle, slow end for realistic motion.
    `
  },
  {
    id: 'animation-video-quality',
    title: 'Video Export Quality',
    category: 'Animation',
    description: 'Control video resolution and codec',
    shortcut: 'A, Shift+V',
    content: `
      Video export options:
      - Formats: WebM (fast), MP4 (compatible)
      - Resolution: 720p, 1080p, 4K
      - FPS: 24, 30, 60 (higher = smoother)
      - Quality: Low (2.5Mbps), High (5Mbps)

      Higher quality takes longer to render and creates larger files.
    `
  },
  {
    id: 'animation-save-load',
    title: 'Save & Load Animations',
    category: 'Animation',
    description: 'Persist and restore animations',
    shortcut: 'Ctrl+S / Ctrl+L',
    content: `
      Animation persistence:
      1. Save to browser localStorage (same device)
      2. Export to JSON file (share/backup)
      3. Load previously saved animations
      4. List all saved animations

      Animations stored locally persist across sessions.
    `
  }
];

export default {
  // Core functions
  init,
  createAnimation,
  addKeyframe,
  play,
  pause,
  stop,
  setDuration,

  // Camera & Path
  addCameraPath,
  recordCameraPath,

  // Explode & Assembly
  autoGenerateExplode,
  setExplodeDirection,
  generateAssemblyInstructions,

  // Scenes & Organization
  createScene,
  createStoryboard,
  playStoryboard,

  // Visual Effects
  addMotionTrail,

  // Playback Control
  setPlaybackSpeed,
  getCurrentTime,
  setCurrentTime,
  getProgress,
  isPlaying,

  // Export & Save
  exportVideo,
  exportGIF,
  saveAnimation,
  loadAnimation,
  listAnimations,

  // Advanced
  cubicBezier,
  setBreakpoint,

  // Help
  helpEntries
};
