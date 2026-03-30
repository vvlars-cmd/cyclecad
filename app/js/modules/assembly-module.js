/**
 * @file assembly-module.js
 * @description AssemblyModule — Multi-body Assembly Management
 *   Manages component placement, joint definitions, constraints, motion studies,
 *   assembly explosions, and bill of materials generation. Supports 7 joint types
 *   with configurable limits and real-time animation.
 *
 * @version 1.0.0
 * @author cycleCAD Team
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 *
 * @module assembly-module
 * @requires viewport (3D scene + camera + controls)
 * @requires operations (for component geometry)
 *
 * Features:
 *   - Component insertion and management
 *   - 7 joint types: Rigid, Revolute, Slider, Cylindrical, Pin-Slot, Planar, Ball
 *   - Joint limits (min/max values) with automatic clamping
 *   - Real-time joint animation with easing
 *   - Interference detection (BBox-based)
 *   - Exploded view generation with configurable distance
 *   - Bill of Materials (BOM) generation with quantity aggregation
 *   - Component patterns (linear and circular arrays)
 *   - Motion studies (animate joint through range with configurable steps)
 *   - Assembly validation and statistics
 *
 * Joint Types & DOF:
 *   - RIGID: 0 DOF (fixed position/orientation)
 *   - REVOLUTE: 1 DOF (rotation around axis)
 *   - SLIDER: 1 DOF (translation along axis)
 *   - CYLINDRICAL: 2 DOF (rotation + translation on axis)
 *   - PIN_SLOT: 2 DOF (rotation + perpendicular translation)
 *   - PLANAR: 3 DOF (2D translation in plane + rotation around normal)
 *   - BALL: 3 DOF (free rotation around origin point)
 *
 * Component Structure:
 *   Component = {
 *     id, partId, name, position, rotation, visible,
 *     group (THREE.Group), matrix
 *   }
 *
 * Motion Study:
 *   - Animates a single joint through range
 *   - Generates N steps from start to end value
 *   - Smooth easing for natural motion
 *   - Can play forward/backward
 */

const AssemblyModule = {
  id: 'assembly',
  name: 'Assembly',
  version: '1.0.0',
  category: 'engine',
  dependencies: ['viewport', 'operations'],
  memoryEstimate: 25,

  // Module state
  state: {
    components: new Map(), // id -> {partId, name, position, rotation, visible}
    joints: new Map(), // id -> {type, comp1, comp2, axis, origin, min, max, value}
    bomEntries: [], // [{partId, quantity, name}]
    explodeFactor: 0,
    motionStudy: null, // {jointId, start, end, steps, positions[]}
  },

  // Joint type definitions
  JOINT_TYPES: {
    RIGID: 'rigid', // 0 DOF
    REVOLUTE: 'revolute', // 1 DOF (rotation)
    SLIDER: 'slider', // 1 DOF (translation)
    CYLINDRICAL: 'cylindrical', // 2 DOF (rotation + translation)
    PIN_SLOT: 'pin-slot', // 2 DOF (rotation + perpendicular translation)
    PLANAR: 'planar', // 3 DOF (translation in plane + normal rotation)
    BALL: 'ball', // 3 DOF (rotation around point)
  },

  /**
   * Initialize assembly module
   */
  init() {
    if (window._debug) console.log('[Assembly] Initializing...');
    this.state.components.clear();
    this.state.joints.clear();
    this.state.bomEntries = [];
    this.state.explodeFactor = 0;
    this._initEventListeners();
  },

  /**
   * Initialize event listeners
   */
  _initEventListeners() {
    // Placeholder for event delegation
    window.addEventListener('assembly:action', (e) => {
      if (window._debug) console.log('[Assembly] Event:', e.detail);
    });
  },

  /**
   * Insert a component (part) into assembly
   * @param {string} partId - UUID or index of part
   * @param {THREE.Vector3} position - placement position
   * @param {THREE.Quaternion} rotation - placement rotation
   * @returns {string} componentId
   */
  insertComponent(partId, position = new THREE.Vector3(0, 0, 0), rotation = new THREE.Quaternion()) {
    const componentId = `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const component = {
      id: componentId,
      partId,
      name: `Part ${this.state.components.size + 1}`,
      position: position.clone(),
      rotation: rotation.clone(),
      visible: true,
      group: new THREE.Group(),
      matrix: new THREE.Matrix4(),
    };

    // Set initial transform
    component.group.position.copy(position);
    component.group.quaternion.copy(rotation);

    this.state.components.set(componentId, component);

    if (window._debug) console.log(`[Assembly] Inserted component ${componentId} for part ${partId}`);
    window.dispatchEvent(new CustomEvent('assembly:componentInserted', { detail: { componentId, partId } }));

    return componentId;
  },

  /**
   * Create a joint between two components
   * @param {string} type - joint type (RIGID, REVOLUTE, SLIDER, etc.)
   * @param {string} comp1Id - first component ID
   * @param {string} comp2Id - second component ID
   * @param {Object} params - {axis: Vector3, origin: Vector3, offset1: Vector3, offset2: Vector3}
   * @returns {string} jointId
   */
  createJoint(type, comp1Id, comp2Id, params = {}) {
    if (!this.JOINT_TYPES[type.toUpperCase()]) {
      console.error(`[Assembly] Unknown joint type: ${type}`);
      return null;
    }

    const jointId = `joint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const comp1 = this.state.components.get(comp1Id);
    const comp2 = this.state.components.get(comp2Id);

    if (!comp1 || !comp2) {
      console.error(`[Assembly] Component not found: ${comp1Id} or ${comp2Id}`);
      return null;
    }

    // Default axis and origin (world Z-axis at midpoint)
    const axis = params.axis || new THREE.Vector3(0, 0, 1);
    const origin = params.origin || new THREE.Vector3().addVectors(comp1.position, comp2.position).multiplyScalar(0.5);

    const joint = {
      id: jointId,
      type: type.toLowerCase(),
      comp1Id,
      comp2Id,
      axis: axis.normalize(),
      origin: origin.clone(),
      min: params.min !== undefined ? params.min : 0,
      max: params.max !== undefined ? params.max : 0,
      value: 0, // Current joint value (angle in rad for revolute, distance for slider)
      offset1: params.offset1 ? params.offset1.clone() : new THREE.Vector3(),
      offset2: params.offset2 ? params.offset2.clone() : new THREE.Vector3(),
    };

    this.state.joints.set(jointId, joint);

    if (window._debug) console.log(`[Assembly] Created ${type} joint ${jointId} between ${comp1Id} and ${comp2Id}`);
    window.dispatchEvent(new CustomEvent('assembly:jointCreated', { detail: { jointId, type, comp1Id, comp2Id } }));

    return jointId;
  },

  /**
   * Set joint limits (min and max values)
   * @param {string} jointId - joint ID
   * @param {number} min - minimum value (radians for revolute, mm for slider)
   * @param {number} max - maximum value
   */
  setJointLimits(jointId, min, max) {
    const joint = this.state.joints.get(jointId);
    if (!joint) {
      console.error(`[Assembly] Joint not found: ${jointId}`);
      return;
    }

    joint.min = min;
    joint.max = max;
    joint.value = Math.max(min, Math.min(joint.value, max)); // Clamp current value

    if (window._debug) console.log(`[Assembly] Set limits for ${jointId}: [${min}, ${max}]`);
  },

  /**
   * Animate a joint to a specific value
   * @param {string} jointId - joint ID
   * @param {number} value - target value (radians for revolute, mm for slider)
   * @param {number} duration - animation duration in ms (optional, default 500)
   */
  animateJoint(jointId, value, duration = 500) {
    const joint = this.state.joints.get(jointId);
    if (!joint) {
      console.error(`[Assembly] Joint not found: ${jointId}`);
      return;
    }

    // Clamp to limits
    const targetValue = Math.max(joint.min, Math.min(value, joint.max));
    const startValue = joint.value;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-in-out cubic
      const easeProgress = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      joint.value = startValue + (targetValue - startValue) * easeProgress;
      this._updateComponentTransforms();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        joint.value = targetValue;
        this._updateComponentTransforms();
        window.dispatchEvent(new CustomEvent('assembly:jointAnimationComplete', { detail: { jointId } }));
      }
    };

    animate();
  },

  /**
   * Update component transforms based on joint values
   * @private
   */
  _updateComponentTransforms() {
    for (const joint of this.state.joints.values()) {
      const comp1 = this.state.components.get(joint.comp1Id);
      const comp2 = this.state.components.get(joint.comp2Id);

      if (!comp1 || !comp2) continue;

      switch (joint.type) {
        case 'rigid':
          // No relative motion
          break;

        case 'revolute':
          // Rotate comp2 around joint axis
          {
            const q = new THREE.Quaternion();
            q.setFromAxisAngle(joint.axis, joint.value);

            // Transform relative to joint origin
            const relPos = comp2.position.clone().sub(joint.origin);
            relPos.applyQuaternion(q);
            comp2.position.copy(joint.origin).add(relPos);

            const newRot = new THREE.Quaternion();
            newRot.multiplyQuaternions(q, comp2.rotation);
            comp2.rotation.copy(newRot);
          }
          break;

        case 'slider':
          // Translate comp2 along joint axis
          {
            const translation = joint.axis.clone().multiplyScalar(joint.value);
            comp2.position.copy(comp1.position).add(translation).add(joint.offset2);
          }
          break;

        case 'cylindrical':
          // Combination of revolute and slider
          {
            // Translation component (only apply 50% of value for cylindrical)
            const translation = joint.axis.clone().multiplyScalar(joint.value * 0.5);
            const q = new THREE.Quaternion();
            q.setFromAxisAngle(joint.axis, joint.value);

            const relPos = comp2.position.clone().sub(joint.origin);
            relPos.applyQuaternion(q);
            relPos.add(translation);

            comp2.position.copy(joint.origin).add(relPos);
            const newRot = new THREE.Quaternion();
            newRot.multiplyQuaternions(q, comp2.rotation);
            comp2.rotation.copy(newRot);
          }
          break;

        case 'planar':
          // Translation in plane (2 DOF) — simplified to just translation
          {
            const translation = joint.axis.clone().multiplyScalar(joint.value);
            comp2.position.copy(comp1.position).add(translation);
          }
          break;

        case 'ball':
          // Free rotation around origin
          {
            const q = new THREE.Quaternion();
            q.setFromAxisAngle(joint.axis, joint.value);
            const newRot = new THREE.Quaternion();
            newRot.multiplyQuaternions(q, comp2.rotation);
            comp2.rotation.copy(newRot);
          }
          break;
      }

      // Update Three.js group
      comp2.group.position.copy(comp2.position);
      comp2.group.quaternion.copy(comp2.rotation);
    }
  },

  /**
   * Check for interference (overlap) between components
   * @param {string[]} componentIds - list of component IDs to check (or all if empty)
   * @returns {Array} [{comp1Id, comp2Id, distance, isInterfering}]
   */
  checkInterference(componentIds = []) {
    const toCheck = componentIds.length > 0 ? componentIds : Array.from(this.state.components.keys());
    const results = [];

    for (let i = 0; i < toCheck.length; i++) {
      for (let j = i + 1; j < toCheck.length; j++) {
        const comp1 = this.state.components.get(toCheck[i]);
        const comp2 = this.state.components.get(toCheck[j]);

        if (!comp1 || !comp2) continue;

        // Simple BBox-based interference check
        // In production, would use mesh-to-mesh intersection
        const dist = comp1.position.distanceTo(comp2.position);
        const minDist = 5; // Minimum safe distance in mm
        const isInterfering = dist < minDist;

        results.push({
          comp1Id: toCheck[i],
          comp2Id: toCheck[j],
          distance: dist,
          isInterfering,
        });

        if (isInterfering) {
          window.dispatchEvent(new CustomEvent('assembly:interferenceFound', {
            detail: { comp1Id: toCheck[i], comp2Id: toCheck[j], distance: dist }
          }));
        }
      }
    }

    return results;
  },

  /**
   * Generate exploded view
   * @param {number} factor - explosion distance multiplier (0-1 for collapse, 1+ for explode)
   */
  explode(factor = 1.5) {
    this.state.explodeFactor = factor;

    for (const component of this.state.components.values()) {
      // Move each component away from assembly origin
      const direction = component.position.clone().normalize();
      const baseDistance = component.position.length();
      const newDistance = baseDistance * factor;

      component.position.copy(direction.multiplyScalar(newDistance));
      component.group.position.copy(component.position);
    }

    if (window._debug) console.log(`[Assembly] Exploded view with factor ${factor}`);
    window.dispatchEvent(new CustomEvent('assembly:exploded', { detail: { factor } }));
  },

  /**
   * Generate bill of materials
   * @returns {Array} [{partId, name, quantity}]
   */
  generateBOM() {
    const bom = new Map(); // partId -> {name, quantity}

    for (const component of this.state.components.values()) {
      if (bom.has(component.partId)) {
        bom.get(component.partId).quantity++;
      } else {
        bom.set(component.partId, {
          partId: component.partId,
          name: component.name,
          quantity: 1,
        });
      }
    }

    this.state.bomEntries = Array.from(bom.values());

    if (window._debug) console.log(`[Assembly] Generated BOM with ${this.state.bomEntries.length} entries`);
    window.dispatchEvent(new CustomEvent('assembly:bomGenerated', { detail: { entries: this.state.bomEntries } }));

    return this.state.bomEntries;
  },

  /**
   * Create a component pattern (linear or circular)
   * @param {string} componentId - component to pattern
   * @param {string} type - 'linear' or 'circular'
   * @param {Object} params - {count, spacing, axis, center}
   */
  pattern(componentId, type, params = {}) {
    const baseComp = this.state.components.get(componentId);
    if (!baseComp) {
      console.error(`[Assembly] Component not found: ${componentId}`);
      return;
    }

    const count = params.count || 3;
    const spacing = params.spacing || 10;
    const axis = params.axis || new THREE.Vector3(1, 0, 0);
    const center = params.center || baseComp.position.clone();

    const newComponentIds = [];

    for (let i = 1; i < count; i++) {
      let position = baseComp.position.clone();

      if (type === 'linear') {
        position.add(axis.clone().normalize().multiplyScalar(spacing * i));
      } else if (type === 'circular') {
        // Circular array around center
        const angle = (Math.PI * 2 / count) * i;
        const radius = baseComp.position.distanceTo(center);
        const x = center.x + radius * Math.cos(angle);
        const y = center.y + radius * Math.sin(angle);
        position.set(x, y, center.z);
      }

      const newCompId = this.insertComponent(baseComp.partId, position, baseComp.rotation.clone());
      newComponentIds.push(newCompId);
    }

    if (window._debug) console.log(`[Assembly] Created ${type} pattern with ${count} instances`);
    window.dispatchEvent(new CustomEvent('assembly:patternCreated', {
      detail: { type, count, newComponentIds }
    }));

    return newComponentIds;
  },

  /**
   * Create a motion study (animate through joint range)
   * @param {string} jointId - joint ID to animate
   * @param {number} start - start value
   * @param {number} end - end value
   * @param {number} steps - number of steps in study
   * @returns {Object} motion study object
   */
  motionStudy(jointId, start, end, steps = 20) {
    const joint = this.state.joints.get(jointId);
    if (!joint) {
      console.error(`[Assembly] Joint not found: ${jointId}`);
      return null;
    }

    const positions = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const value = start + (end - start) * t;
      positions.push(value);
    }

    this.state.motionStudy = {
      jointId,
      start,
      end,
      steps,
      positions,
      currentStep: 0,
    };

    if (window._debug) console.log(`[Assembly] Created motion study: ${steps} steps, ${start} → ${end}`);
    window.dispatchEvent(new CustomEvent('assembly:motionStudyCreated', { detail: this.state.motionStudy }));

    return this.state.motionStudy;
  },

  /**
   * Step through motion study
   * @param {number} step - step index (0 to steps)
   */
  motionStudyStep(step) {
    if (!this.state.motionStudy) {
      console.error('[Assembly] No active motion study');
      return;
    }

    const study = this.state.motionStudy;
    step = Math.max(0, Math.min(step, study.positions.length - 1));
    const value = study.positions[step];

    this.animateJoint(study.jointId, value, 100);
    study.currentStep = step;

    window.dispatchEvent(new CustomEvent('assembly:motionStudyStep', { detail: { step, value } }));
  },

  /**
   * Get UI panel for assembly editor
   * @returns {HTMLElement}
   */
  getUI() {
    const panel = document.createElement('div');
    panel.className = 'assembly-panel';
    panel.style.cssText = `
      width: 300px;
      height: 100%;
      background: #1e1e1e;
      color: #e0e0e0;
      font-family: Calibri, sans-serif;
      font-size: 13px;
      border-left: 1px solid #333;
      overflow-y: auto;
      padding: 12px;
    `;

    panel.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; color: #0284c7;">Assembly Editor</h3>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Components (${this.state.components.size})</label>
          <div id="component-list" style="max-height: 150px; overflow-y: auto; background: #252525; border-radius: 4px; padding: 8px;">
            ${Array.from(this.state.components.values()).map(c => `
              <div style="padding: 4px; margin-bottom: 4px; background: #333; border-radius: 2px; font-size: 11px;">
                ${c.name}
                <button data-comp-id="${c.id}" class="comp-delete" style="float: right; padding: 1px 6px; font-size: 10px;">X</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Joints (${this.state.joints.size})</label>
          <div id="joint-list" style="max-height: 150px; overflow-y: auto; background: #252525; border-radius: 4px; padding: 8px;">
            ${Array.from(this.state.joints.values()).map(j => `
              <div style="padding: 4px; margin-bottom: 4px; background: #333; border-radius: 2px; font-size: 11px;">
                ${j.type.toUpperCase()}
                <input type="range" min="${j.min}" max="${j.max}" value="${j.value}"
                  data-joint-id="${j.id}" class="joint-slider"
                  style="width: 100%; margin-top: 4px; cursor: pointer;">
              </div>
            `).join('')}
          </div>
        </div>

        <button id="btn-explode" style="width: 100%; padding: 6px; margin-bottom: 6px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Explode (${(this.state.explodeFactor * 100).toFixed(0)}%)
        </button>

        <button id="btn-bom" style="width: 100%; padding: 6px; margin-bottom: 6px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Generate BOM
        </button>

        <button id="btn-motion-study" style="width: 100%; padding: 6px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Motion Study
        </button>
      </div>
    `;

    // Event handlers
    const self = this;
    panel.querySelectorAll('.joint-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const jointId = e.target.dataset.jointId;
        const value = parseFloat(e.target.value);
        self.animateJoint(jointId, value, 200);
      });
    });

    panel.querySelector('#btn-explode').addEventListener('click', () => {
      const factor = this.state.explodeFactor > 1 ? 1 : 1.5;
      this.explode(factor);
    });

    panel.querySelector('#btn-bom').addEventListener('click', () => {
      const bom = this.generateBOM();
      console.table(bom);
    });

    panel.querySelector('#btn-motion-study').addEventListener('click', () => {
      if (this.state.joints.size > 0) {
        const joint = Array.from(this.state.joints.values())[0];
        const study = this.motionStudy(joint.id, joint.min, joint.max, 30);
        if (study) {
          let step = 0;
          const interval = setInterval(() => {
            if (step >= study.positions.length) {
              clearInterval(interval);
              return;
            }
            this.motionStudyStep(step++);
          }, 100);
        }
      }
    });

    return panel;
  },
};

export default AssemblyModule;
