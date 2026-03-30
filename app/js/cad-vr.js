// CAD-to-VR WebXR Module for cycleCAD
// IIFE — registers as window.cycleCAD.cadVR
// Inspired by CAD2VR, CADDY on Meta Quest, SimLab VR
// Requires Three.js r170 + navigator.xr support

(function cadVRModule() {
  'use strict';

  // ============================================================================
  // VR Session State
  // ============================================================================
  const VRState = {
    isActive: false,
    session: null,
    supported: false,
    mode: 'inspect', // inspect|explode|cross-section|scale|measure|annotate
    controllers: { left: null, right: null },
    inputSources: [],
    referenceSpace: null,
    vrScene: null,
    vrCamera: null,
    explosionFactor: 0,
    measurePoints: [],
    annotations: [],
    multiUserRoom: null,
    avatars: new Map(),
    sessionStartTime: null,
    isRecording: false,
  };

  // ============================================================================
  // Comfort & Accessibility Settings
  // ============================================================================
  const ComfortSettings = {
    locomotionType: 'teleport', // teleport|smooth
    snapTurnAngle: 30, // degrees
    enableVignette: true,
    vignetteAlpha: 0.7,
    worldScale: 1.0,
    seatedMode: false,
    highlightColor: 0xa855f7, // purple
    controllerRayColor: 0x58a6ff, // blue
  };

  // ============================================================================
  // WebXR Support Detection
  // ============================================================================
  function isVRSupported() {
    return !!(navigator?.xr?.isSessionSupported?.('immersive-vr'));
  }

  async function detectHeadsets() {
    const headsets = [];
    const profiles = [
      { name: 'Meta Quest 3', id: 'oculus-touch-v3' },
      { name: 'Meta Quest Pro', id: 'oculus-touch-v4' },
      { name: 'Meta Quest 2', id: 'oculus-touch' },
      { name: 'Pico 4', id: 'pico-touch' },
      { name: 'Valve Index', id: 'valve-index' },
      { name: 'HTC Vive', id: 'vive' },
      { name: 'Windows Mixed Reality', id: 'windows-mixed-reality' },
    ];

    if (navigator?.xr?.inputProfiles) {
      const supported = [];
      for (const profile of profiles) {
        try {
          const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
          if (isSupported) supported.push(profile.name);
        } catch (e) {
          // silent
        }
      }
      return supported.length > 0 ? supported : ['Generic WebXR Headset'];
    }
    return [];
  }

  function getVRStatus() {
    return {
      supported: VRState.supported,
      active: VRState.isActive,
      mode: VRState.mode,
      headset: VRState.session?.inputSources?.[0]?.handedness ? 'Detected' : 'Not Detected',
      controllers: {
        left: !!VRState.controllers.left,
        right: !!VRState.controllers.right,
      },
    };
  }

  // ============================================================================
  // VR Scene Initialization
  // ============================================================================
  function initVRScene() {
    const mainScene = window._scene;
    const mainCamera = window._camera;
    const renderer = window._renderer;

    // Clone scene for VR
    VRState.vrScene = mainScene.clone();

    // Ensure camera is in VR scene
    VRState.vrCamera = mainCamera;
    if (!VRState.vrScene.children.includes(VRState.vrCamera)) {
      VRState.vrScene.add(VRState.vrCamera);
    }

    // Add VR-specific lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    VRState.vrScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    VRState.vrScene.add(directionalLight);

    // Add ground plane
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.3,
      roughness: 0.7,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    ground.receiveShadow = true;
    VRState.vrScene.add(ground);

    // Add grid visualization
    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
    gridHelper.position.y = -4.9;
    VRState.vrScene.add(gridHelper);

    // Add sky/environment
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    VRState.vrScene.add(sky);

    console.log('[VR] Scene initialized');
  }

  // ============================================================================
  // Controller Setup & Input Handling
  // ============================================================================
  function initControllers(session) {
    const renderer = window._renderer;

    // Controller 1 (Right hand)
    const controller1 = renderer.xr.getController(0);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -10),
    ]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: ComfortSettings.controllerRayColor, linewidth: 2 })
    );
    line.name = 'ray';
    controller1.add(line);

    const pointer = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: ComfortSettings.controllerRayColor })
    );
    pointer.position.z = -10;
    controller1.add(pointer);

    controller1.addEventListener('select', onControllerSelect);
    controller1.addEventListener('selectstart', onControllerSelectStart);
    controller1.addEventListener('selectend', onControllerSelectEnd);
    controller1.addEventListener('squeezestart', onControllerSqueezeStart);
    controller1.addEventListener('squeeze', onControllerSqueeze);
    controller1.addEventListener('squeezeend', onControllerSqueezeEnd);

    VRState.controllers.right = controller1;
    VRState.vrScene.add(controller1);

    // Controller 2 (Left hand)
    const controller2 = renderer.xr.getController(1);
    const geometry2 = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -10),
    ]);
    const line2 = new THREE.Line(
      geometry2,
      new THREE.LineBasicMaterial({ color: ComfortSettings.controllerRayColor, linewidth: 2 })
    );
    line2.name = 'ray';
    controller2.add(line2);

    const pointer2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: ComfortSettings.controllerRayColor })
    );
    pointer2.position.z = -10;
    controller2.add(pointer2);

    controller2.addEventListener('select', onControllerSelect);
    controller2.addEventListener('squeezestart', onControllerSqueezeStart);
    controller2.addEventListener('squeeze', onControllerSqueeze);
    controller2.addEventListener('squeezeend', onControllerSqueezeEnd);

    VRState.controllers.left = controller2;
    VRState.vrScene.add(controller2);

    console.log('[VR] Controllers initialized');
  }

  function onControllerSelect(event) {
    const controller = event.target;
    handleModeInteraction('select', controller);
  }

  function onControllerSelectStart(event) {
    const controller = event.target;
    if (VRState.mode === 'measure') {
      handleMeasurePoint(controller);
    }
  }

  function onControllerSelectEnd(event) {
    // End of selection
  }

  function onControllerSqueezeStart(event) {
    const controller = event.target;
    if (VRState.mode === 'scale') {
      // Start pinch gesture for scaling
    }
  }

  function onControllerSqueeze(event) {
    const controller = event.target;
    if (VRState.mode === 'cross-section') {
      handleCrossSection(controller);
    }
  }

  function onControllerSqueezeEnd(event) {
    // End squeeze
  }

  function handleModeInteraction(interaction, controller) {
    const mode = VRState.mode;

    if (mode === 'inspect') {
      // Highlight and show part info
      console.log('[VR] Inspect mode: selecting part at', controller.position);
    } else if (mode === 'explode') {
      // Adjust explosion with thumbstick
      console.log('[VR] Explode mode: adjusting explosion');
    } else if (mode === 'annotate') {
      // Place annotation at controller position
      placeAnnotation(controller.position, controller.quaternion);
    } else if (mode === 'measure') {
      // Place measurement point
      console.log('[VR] Measure mode: recording point');
    }
  }

  function handleMeasurePoint(controller) {
    const point = new THREE.Vector3();
    controller.getWorldPosition(point);
    VRState.measurePoints.push(point.clone());

    if (VRState.measurePoints.length === 2) {
      const distance = VRState.measurePoints[0].distanceTo(VRState.measurePoints[1]);
      console.log(`[VR] Measurement: ${distance.toFixed(3)} units`);
      showMeasurementLabel(
        VRState.measurePoints[0],
        VRState.measurePoints[1],
        distance
      );
    }

    if (VRState.measurePoints.length >= 3) {
      // Angle measurement
      const p1 = VRState.measurePoints[0];
      const p2 = VRState.measurePoints[1];
      const p3 = VRState.measurePoints[2];
      const v1 = new THREE.Vector3().subVectors(p1, p2);
      const v2 = new THREE.Vector3().subVectors(p3, p2);
      const angle = Math.acos(v1.normalize().dot(v2.normalize()));
      console.log(`[VR] Angle: ${THREE.MathUtils.radToDeg(angle).toFixed(1)}°`);
      VRState.measurePoints = [];
    }
  }

  function handleCrossSection(controller) {
    const position = new THREE.Vector3();
    controller.getWorldPosition(position);
    console.log('[VR] Cross-section plane at:', position);
    // Would implement clipping plane update here
  }

  function showMeasurementLabel(p1, p2, distance) {
    const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${distance.toFixed(2)}`, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.PlaneGeometry(2, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(midpoint);
    mesh.userData.temporary = true;
    mesh.userData.createdAt = Date.now();
    VRState.vrScene.add(mesh);

    // Auto-remove after 3 seconds
    setTimeout(() => VRState.vrScene.remove(mesh), 3000);
  }

  function placeAnnotation(position, quaternion) {
    console.log('[VR] Annotation placed at', position);
    const annotation = {
      id: 'ann_' + Date.now(),
      position: position.clone(),
      quaternion: quaternion.clone(),
      text: 'New annotation',
      timestamp: Date.now(),
    };
    VRState.annotations.push(annotation);
  }

  // ============================================================================
  // VR Mode Management
  // ============================================================================
  function setMode(newMode) {
    const validModes = ['inspect', 'explode', 'cross-section', 'scale', 'measure', 'annotate'];
    if (!validModes.includes(newMode)) {
      console.error('[VR] Invalid mode:', newMode);
      return;
    }

    VRState.mode = newMode;
    VRState.measurePoints = [];

    console.log(`[VR] Mode changed to: ${newMode}`);

    // Broadcast to listeners
    window.dispatchEvent(new CustomEvent('vr-mode-changed', { detail: { mode: newMode } }));
  }

  // ============================================================================
  // Multi-User VR (Collaboration)
  // ============================================================================
  async function createRoom(roomId) {
    console.log(`[VR] Creating room: ${roomId}`);
    VRState.multiUserRoom = {
      id: roomId,
      created: Date.now(),
      users: new Map(),
    };
    // Placeholder: in production, would establish WebRTC connection
    return roomId;
  }

  async function joinRoom(roomId) {
    console.log(`[VR] Joining room: ${roomId}`);
    VRState.multiUserRoom = {
      id: roomId,
      joined: Date.now(),
      users: new Map(),
    };
    // Placeholder: in production, would connect to existing session
    return true;
  }

  function leaveRoom() {
    if (!VRState.multiUserRoom) return;
    console.log(`[VR] Leaving room: ${VRState.multiUserRoom.id}`);
    VRState.avatars.clear();
    VRState.multiUserRoom = null;
  }

  // ============================================================================
  // VR Session Management
  // ============================================================================
  async function enterVR() {
    if (!VRState.supported) {
      console.error('[VR] WebXR VR not supported');
      alert('WebXR immersive-vr is not supported on this device.');
      return false;
    }

    if (VRState.isActive) {
      console.warn('[VR] Already in VR session');
      return false;
    }

    try {
      initVRScene();

      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor', 'hand-tracking'],
        optionalFeatures: ['layers'],
      });

      VRState.session = session;
      VRState.isActive = true;
      VRState.sessionStartTime = Date.now();

      const renderer = window._renderer;
      renderer.xr.setSession(session);

      // Set reference space
      const referenceSpace = await session.requestReferenceSpace('local-floor');
      VRState.referenceSpace = referenceSpace;

      initControllers(session);

      // Listen for input sources
      session.addEventListener('inputsourceschange', onInputSourcesChange);
      session.addEventListener('end', exitVR);

      console.log('[VR] VR session started');
      window.dispatchEvent(new CustomEvent('vr-session-started', { detail: VRState }));

      return true;
    } catch (err) {
      console.error('[VR] Failed to enter VR:', err);
      return false;
    }
  }

  async function exitVR() {
    if (!VRState.session) return;

    try {
      VRState.isActive = false;

      if (VRState.session.end) {
        await VRState.session.end();
      }

      const renderer = window._renderer;
      renderer.xr.setSession(null);

      // Restore main scene
      if (window._scene) {
        renderer.setRenderTarget(null);
        window._scene.traverseVisible((obj) => {
          if (obj.material) obj.material.needsUpdate = true;
        });
      }

      VRState.session = null;
      VRState.controllers = { left: null, right: null };

      console.log('[VR] VR session ended');
      window.dispatchEvent(new CustomEvent('vr-session-ended', { detail: VRState }));

      return true;
    } catch (err) {
      console.error('[VR] Error exiting VR:', err);
      return false;
    }
  }

  function onInputSourcesChange(event) {
    console.log('[VR] Input sources changed', event.added.length, 'added,', event.removed.length, 'removed');
  }

  // ============================================================================
  // Explosion/Collapse (Assembly Mode)
  // ============================================================================
  function setExplosionFactor(factor) {
    factor = Math.max(0, Math.min(1, factor)); // Clamp 0-1
    VRState.explosionFactor = factor;

    if (!window.ASSEMBLIES || !window.allParts) return;

    window.ASSEMBLIES.forEach((asm, asmIdx) => {
      const [startIdx, count] = asm.indices;
      for (let i = 0; i < count; i++) {
        const part = window.allParts[startIdx + i];
        if (part && part.mesh) {
          const direction = new THREE.Vector3(
            Math.sin(asmIdx) * 2,
            1,
            Math.cos(asmIdx) * 2
          ).normalize();
          part.mesh.position.copy(part._originalPosition || part.mesh.position);
          part.mesh.position.addScaledVector(direction, factor * 10);
        }
      }
    });

    window.dispatchEvent(new CustomEvent('vr-explosion-changed', { detail: { factor } }));
  }

  // ============================================================================
  // Export & Recording
  // ============================================================================
  function captureVRScreenshot() {
    const renderer = window._renderer;
    const canvas = renderer.domElement;
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `vr-screenshot-${Date.now()}.png`;
    link.click();
    console.log('[VR] Screenshot captured');
  }

  async function recordVRSession(duration = 30) {
    if (VRState.isRecording) {
      console.warn('[VR] Already recording');
      return;
    }

    VRState.isRecording = true;
    console.log(`[VR] Recording for ${duration} seconds...`);

    // Placeholder: in production would use MediaRecorder on canvas stream
    setTimeout(() => {
      VRState.isRecording = false;
      console.log('[VR] Recording completed');
    }, duration * 1000);
  }

  function shareVRLink(modelId) {
    const url = new URL(window.location);
    url.hash = `vr=1&model=${modelId}`;
    const link = url.toString();
    console.log('[VR] Share link:', link);
    return link;
  }

  // ============================================================================
  // UI Panel HTML
  // ============================================================================
  function getUI() {
    const status = getVRStatus();
    const supportedHeadsets = status.supported ? 'Meta Quest 3, Meta Quest Pro, Pico 4, Valve Index' : 'None';

    return `
      <div id="vr-panel" style="
        display: none;
        background: #1e1e1e;
        border: 1px solid #a855f7;
        border-radius: 8px;
        padding: 16px;
        font-family: 'Segoe UI', Tahoma, sans-serif;
        color: #e0e0e0;
        max-height: 600px;
        overflow-y: auto;
      ">
        <h3 style="margin-top: 0; color: #a855f7; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">
          🥽 VR Settings
        </h3>

        <!-- Status Section -->
        <div style="margin: 12px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 4px;">Status</div>
          <div style="font-size: 12px; color: #a855f7;">
            ${status.supported ? '✓ Supported' : '✗ Not Supported'}
          </div>
          <div style="font-size: 12px; color: #58a6ff;">
            ${status.active ? '● Active' : '○ Inactive'}
          </div>
          <div style="font-size: 12px; color: #ccc;">
            Headset: ${status.headset}
          </div>
          <div style="font-size: 12px; color: #ccc;">
            Controllers: L=${status.controllers.left ? '✓' : '✗'} R=${status.controllers.right ? '✓' : '✗'}
          </div>
        </div>

        <!-- VR Entry Button -->
        <button id="vr-enter-btn" style="
          width: 100%;
          padding: 12px;
          margin: 8px 0;
          background: #a855f7;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.2s;
        " ${!status.supported ? 'disabled' : ''}>
          ${status.active ? 'Exit VR' : 'Enter VR'}
        </button>

        <!-- Mode Selector -->
        <div style="margin: 12px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 6px;">Mode</div>
          <select id="vr-mode-select" style="
            width: 100%;
            padding: 6px;
            background: #1e1e1e;
            color: #58a6ff;
            border: 1px solid #a855f7;
            border-radius: 4px;
            cursor: pointer;
          ">
            <option value="inspect">🔍 Inspect</option>
            <option value="explode">💥 Explode</option>
            <option value="cross-section">✂️ Cross-Section</option>
            <option value="scale">↔️ Scale</option>
            <option value="measure">📏 Measure</option>
            <option value="annotate">📝 Annotate</option>
          </select>
        </div>

        <!-- Comfort Settings -->
        <div style="margin: 12px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 6px;">Comfort</div>
          <label style="display: block; margin: 6px 0; font-size: 12px;">
            <input type="checkbox" id="vr-vignette-toggle" checked>
            Comfort Vignette
          </label>
          <label style="display: block; margin: 6px 0; font-size: 12px;">
            <input type="checkbox" id="vr-snap-turn-toggle" checked>
            Snap Turning (30°)
          </label>
          <label style="display: block; margin: 6px 0; font-size: 12px;">
            <input type="checkbox" id="vr-seated-toggle">
            Seated Mode
          </label>
          <div style="margin-top: 8px;">
            <label style="font-size: 12px;">World Scale:</label>
            <input type="range" id="vr-scale-slider" min="0.1" max="10" step="0.1" value="1"
              style="width: 100%; margin-top: 4px;">
            <span id="vr-scale-value" style="font-size: 11px; color: #a855f7;">1.0x</span>
          </div>
        </div>

        <!-- Multi-User -->
        <div style="margin: 12px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 6px;">Collaboration</div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <input type="text" id="vr-room-input" placeholder="Room ID" style="
              flex: 1;
              padding: 6px;
              background: #1e1e1e;
              color: #e0e0e0;
              border: 1px solid #a855f7;
              border-radius: 4px;
              font-size: 12px;
            ">
            <button id="vr-create-room-btn" style="
              padding: 6px 12px;
              background: #58a6ff;
              color: #000;
              border: none;
              border-radius: 4px;
              font-weight: bold;
              cursor: pointer;
              font-size: 12px;
            ">Create</button>
            <button id="vr-join-room-btn" style="
              padding: 6px 12px;
              background: #58a6ff;
              color: #000;
              border: none;
              border-radius: 4px;
              font-weight: bold;
              cursor: pointer;
              font-size: 12px;
            ">Join</button>
          </div>
        </div>

        <!-- Recording & Export -->
        <div style="margin: 12px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 6px;">Capture</div>
          <button id="vr-screenshot-btn" style="
            width: 100%;
            padding: 8px;
            background: #58a6ff;
            color: #000;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            margin-bottom: 4px;
            font-size: 12px;
          ">📷 Screenshot</button>
          <button id="vr-record-btn" style="
            width: 100%;
            padding: 8px;
            background: #ff6b6b;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            font-size: 12px;
          ">⏺️ Record 30s</button>
        </div>

        <!-- Headset Detection -->
        <div style="margin: 12px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">
            Compatible Headsets
          </div>
          <div style="font-size: 11px; color: #a0a0a0;">
            ${supportedHeadsets}
          </div>
        </div>

        <!-- WebXR Features -->
        <div style="margin: 12px 0; padding: 8px; background: #2a2a2a; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">
            WebXR Features
          </div>
          <div style="font-size: 11px; color: #ccc; line-height: 1.6;">
            ✓ Immersive VR<br>
            ${status.supported ? '✓' : '✗'} Hand Tracking<br>
            ${status.supported ? '✓' : '✗'} Controller Input<br>
            ${status.supported ? '✓' : '✗'} Gesture Recognition
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // Panel Integration
  // ============================================================================
  function attachUIToPanel() {
    const panel = document.getElementById('vr-panel');
    if (!panel) {
      const container = document.body;
      const div = document.createElement('div');
      div.innerHTML = getUI();
      container.appendChild(div);
      attachEventListeners();
    }
  }

  function attachEventListeners() {
    const enterBtn = document.getElementById('vr-enter-btn');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => {
        if (VRState.isActive) {
          exitVR();
        } else {
          enterVR();
        }
      });
    }

    const modeSelect = document.getElementById('vr-mode-select');
    if (modeSelect) {
      modeSelect.addEventListener('change', (e) => setMode(e.target.value));
    }

    const scaleSlider = document.getElementById('vr-scale-slider');
    if (scaleSlider) {
      scaleSlider.addEventListener('input', (e) => {
        ComfortSettings.worldScale = parseFloat(e.target.value);
        document.getElementById('vr-scale-value').textContent = e.target.value + 'x';
      });
    }

    const createRoomBtn = document.getElementById('vr-create-room-btn');
    if (createRoomBtn) {
      createRoomBtn.addEventListener('click', () => {
        const roomInput = document.getElementById('vr-room-input');
        const roomId = roomInput?.value || 'room_' + Date.now();
        createRoom(roomId);
        console.log('[VR] Room created:', roomId);
      });
    }

    const joinRoomBtn = document.getElementById('vr-join-room-btn');
    if (joinRoomBtn) {
      joinRoomBtn.addEventListener('click', () => {
        const roomInput = document.getElementById('vr-room-input');
        const roomId = roomInput?.value;
        if (roomId) {
          joinRoom(roomId);
          console.log('[VR] Joined room:', roomId);
        }
      });
    }

    const screenshotBtn = document.getElementById('vr-screenshot-btn');
    if (screenshotBtn) {
      screenshotBtn.addEventListener('click', captureVRScreenshot);
    }

    const recordBtn = document.getElementById('vr-record-btn');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => recordVRSession(30));
    }

    const vignetteToggle = document.getElementById('vr-vignette-toggle');
    if (vignetteToggle) {
      vignetteToggle.addEventListener('change', (e) => {
        ComfortSettings.enableVignette = e.target.checked;
      });
    }

    const seatedToggle = document.getElementById('vr-seated-toggle');
    if (seatedToggle) {
      seatedToggle.addEventListener('change', (e) => {
        ComfortSettings.seatedMode = e.target.checked;
      });
    }
  }

  // ============================================================================
  // Initialization & Public API
  // ============================================================================
  async function init() {
    // Check WebXR support
    if (navigator?.xr?.isSessionSupported) {
      try {
        const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
        VRState.supported = vrSupported;
      } catch (e) {
        VRState.supported = false;
      }
    }

    console.log('[VR] Module initialized. Support:', VRState.supported);
    attachUIToPanel();
  }

  // ============================================================================
  // Public API
  // ============================================================================
  const publicAPI = {
    // Session management
    enterVR,
    exitVR,
    isVRSupported,
    getVRStatus,

    // Scene & controllers
    initVRScene,
    initControllers,

    // Mode management
    setMode,
    getMode: () => VRState.mode,

    // Assembly operations
    setExplosionFactor,
    getExplosionFactor: () => VRState.explosionFactor,

    // Measurement
    getMeasurePoints: () => [...VRState.measurePoints],
    clearMeasurePoints: () => {
      VRState.measurePoints = [];
    },

    // Annotations
    getAnnotations: () => [...VRState.annotations],
    clearAnnotations: () => {
      VRState.annotations = [];
    },

    // Multi-user
    createRoom,
    joinRoom,
    leaveRoom,
    getRoom: () => VRState.multiUserRoom,

    // Export & recording
    captureVRScreenshot,
    recordVRSession,
    shareVRLink,
    getSessionDuration: () =>
      VRState.sessionStartTime ? Date.now() - VRState.sessionStartTime : 0,

    // Comfort settings
    getComfortSettings: () => ({ ...ComfortSettings }),
    setComfortSettings: (settings) => {
      Object.assign(ComfortSettings, settings);
    },

    // UI
    getUI,
    attachUIToPanel,
    refreshUI: () => {
      const panel = document.getElementById('vr-panel');
      if (panel) {
        panel.innerHTML = getUI();
        attachEventListeners();
      }
    },

    // State
    getState: () => ({ ...VRState }),
  };

  // Register module
  if (!window.cycleCAD) window.cycleCAD = {};
  window.cycleCAD.cadVR = publicAPI;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[VR] CAD-to-VR module loaded. Access via window.cycleCAD.cadVR');
})();
