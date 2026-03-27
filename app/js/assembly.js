/**
 * Assembly Workspace Module — cycleCAD
 *
 * Manages assembly construction with components, mate constraints, joints, and motion.
 * Phase 6 of the cycleCAD roadmap.
 *
 * Features:
 * - Component management (add, remove, reposition)
 * - Mate constraints (flush, mate, insert, angle, tangent)
 * - Joint system (revolute, prismatic, cylindrical, ball, fixed, planar)
 * - Iterative constraint solver with convergence checking
 * - Joint animation with smooth keyframe interpolation
 * - Explode/collapse assembly views
 * - BOM generation and assembly statistics
 * - Constraint and joint visualization markers
 * - Assembly serialization (save/load)
 * - Sub-assembly grouping
 *
 * @module assembly
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/** @typedef {Object} Component - A part in the assembly */
/**
 * @property {string} id - Unique component ID
 * @property {string} name - Component name
 * @property {THREE.Mesh} mesh - Three.js mesh object
 * @property {THREE.Vector3} position - World position
 * @property {THREE.Euler} rotation - World rotation
 * @property {Array} constraints - Mate constraints involving this component
 * @property {Array} joints - Joints involving this component
 * @property {boolean} grounded - Is this component fixed (assembly origin)?
 * @property {Object} originalTransform - Saved position/rotation for explode restore
 * @property {string|null} parentSubAssembly - Sub-assembly ID if grouped
 */

/** @typedef {Object} Mate - A mate constraint between two components */
/**
 * @property {string} id - Unique mate ID
 * @property {string} type - 'flush'|'mate'|'insert'|'angle'|'tangent'
 * @property {string} comp1Id - First component ID
 * @property {string} comp2Id - Second component ID
 * @property {THREE.Vector3} face1Normal - Normal of first face
 * @property {THREE.Vector3} face1Point - Point on first face
 * @property {THREE.Vector3} face2Normal - Normal of second face
 * @property {THREE.Vector3} face2Point - Point on second face
 * @property {number} offset - Distance offset (for insert, mate)
 * @property {number} angle - Angle for angle constraints
 * @property {boolean} flip - Flip normal direction
 * @property {number} tolerance - Convergence tolerance (mm)
 */

/** @typedef {Object} Joint - A motion joint between two components */
/**
 * @property {string} id - Unique joint ID
 * @property {string} type - 'revolute'|'prismatic'|'cylindrical'|'ball'|'fixed'|'planar'
 * @property {string} comp1Id - First component (origin)
 * @property {string} comp2Id - Second component (moved)
 * @property {THREE.Vector3} axis - Joint axis direction (normalized)
 * @property {THREE.Vector3} point - Joint origin point (world)
 * @property {Object} limits - { min, max } in radians (revolute) or mm (prismatic)
 * @property {number} damping - Damping factor 0-1
 * @property {number} currentValue - Current joint position (rad or mm)
 * @property {Array} keyframes - Array of { value, transform } for saved positions
 */

/**
 * Assembly Workspace state and functions
 * @namespace Assembly
 */
const Assembly = {
  // Assembly state
  components: new Map(),        // id → Component
  mates: new Map(),              // id → Mate
  joints: new Map(),             // id → Joint
  subAssemblies: new Map(),      // id → { name, componentIds }
  constraintMarkers: [],         // THREE.Object3D
  jointAxisMarkers: [],          // THREE.Object3D

  // Scene integration
  assemblyGroup: null,           // THREE.Group for all assembly meshes
  scene: null,                   // Reference to Three.js scene
  ground: null,                  // ID of grounded component

  // Configuration
  solverMaxIterations: 50,
  solverTolerance: 0.01,         // mm
  constraintColor: 0x00ff00,     // Green for mates
  jointColor: 0xffff00,          // Yellow for joints

  // Tracking
  componentIdCounter: 0,
  mateIdCounter: 0,
  jointIdCounter: 0,
  subAssemblyIdCounter: 0,

  /**
   * Initialize assembly workspace
   * @param {THREE.Scene} scene - Three.js scene to attach to
   * @returns {THREE.Group} assembly group for rendering
   */
  initAssembly(scene) {
    this.scene = scene;
    this.assemblyGroup = new THREE.Group();
    this.assemblyGroup.name = 'Assembly';
    scene.add(this.assemblyGroup);
    console.log('[Assembly] Workspace initialized');
    return this.assemblyGroup;
  },

  /**
   * Add a component (part) to the assembly
   * @param {THREE.Mesh} mesh - The part mesh
   * @param {string} name - Display name
   * @param {Object} options - { position: Vector3, rotation: Euler, grounded: boolean }
   * @returns {string} component ID
   */
  addComponent(mesh, name, options = {}) {
    const id = `comp_${this.componentIdCounter++}`;

    const component = {
      id,
      name,
      mesh: mesh.clone(),
      position: options.position ? options.position.clone() : new THREE.Vector3(),
      rotation: options.rotation ? options.rotation.clone() : new THREE.Euler(),
      constraints: [],
      joints: [],
      grounded: options.grounded || false,
      originalTransform: {
        position: options.position ? options.position.clone() : new THREE.Vector3(),
        rotation: options.rotation ? options.rotation.clone() : new THREE.Euler(),
      },
      parentSubAssembly: null,
    };

    // Apply transform to mesh
    component.mesh.position.copy(component.position);
    component.mesh.rotation.copy(component.rotation);
    this.assemblyGroup.add(component.mesh);

    this.components.set(id, component);
    console.log(`[Assembly] Added component: ${name} (${id})`);
    return id;
  },

  /**
   * Remove a component from the assembly
   * @param {string} componentId - ID of component to remove
   * @returns {boolean} success
   */
  removeComponent(componentId) {
    const component = this.components.get(componentId);
    if (!component) return false;

    // Remove associated mates and joints
    component.constraints.forEach(mateId => this.removeMate(mateId));
    component.joints.forEach(jointId => this.removeJoint(jointId));

    // Remove mesh from scene
    this.assemblyGroup.remove(component.mesh);
    this.components.delete(componentId);

    console.log(`[Assembly] Removed component: ${component.name}`);
    return true;
  },

  /**
   * Reposition a component
   * @param {string} componentId - Component ID
   * @param {THREE.Vector3} position - New position
   * @param {THREE.Euler} rotation - New rotation
   */
  moveComponent(componentId, position, rotation) {
    const component = this.components.get(componentId);
    if (!component) return;

    if (position) {
      component.position.copy(position);
      component.mesh.position.copy(position);
    }
    if (rotation) {
      component.rotation.copy(rotation);
      component.mesh.rotation.copy(rotation);
    }
  },

  /**
   * Ground a component (fix it as assembly origin)
   * @param {string} componentId - Component ID to ground
   */
  groundComponent(componentId) {
    const component = this.components.get(componentId);
    if (!component) return;

    // Unground previous ground
    if (this.ground) {
      const groundComp = this.components.get(this.ground);
      if (groundComp) groundComp.grounded = false;
    }

    component.grounded = true;
    this.ground = componentId;
    console.log(`[Assembly] Grounded component: ${component.name}`);
  },

  /**
   * Get component data
   * @param {string} componentId - Component ID
   * @returns {Component|null}
   */
  getComponent(componentId) {
    return this.components.get(componentId) || null;
  },

  /**
   * Get all components
   * @returns {Component[]}
   */
  getAllComponents() {
    return Array.from(this.components.values());
  },

  /**
   * Add a mate constraint between two components
   * @param {string} type - 'flush'|'mate'|'insert'|'angle'|'tangent'
   * @param {string} comp1Id - First component ID
   * @param {string} comp2Id - Second component ID
   * @param {Object} params - { face1, face2, offset, angle, flip, tolerance }
   * @returns {string} mate ID
   */
  addMate(type, comp1Id, comp2Id, params = {}) {
    const comp1 = this.components.get(comp1Id);
    const comp2 = this.components.get(comp2Id);
    if (!comp1 || !comp2) return null;

    const id = `mate_${this.mateIdCounter++}`;

    const mate = {
      id,
      type,
      comp1Id,
      comp2Id,
      face1Normal: params.face1Normal ? params.face1Normal.clone().normalize() : new THREE.Vector3(0, 0, 1),
      face1Point: params.face1Point ? params.face1Point.clone() : new THREE.Vector3(),
      face2Normal: params.face2Normal ? params.face2Normal.clone().normalize() : new THREE.Vector3(0, 0, -1),
      face2Point: params.face2Point ? params.face2Point.clone() : new THREE.Vector3(),
      offset: params.offset || 0,
      angle: params.angle || 0,
      flip: params.flip || false,
      tolerance: params.tolerance || this.solverTolerance,
    };

    // Apply flip if requested
    if (mate.flip) {
      mate.face2Normal.multiplyScalar(-1);
    }

    this.mates.set(id, mate);
    comp1.constraints.push(id);
    comp2.constraints.push(id);

    console.log(`[Assembly] Added ${type} mate between ${comp1.name} and ${comp2.name}`);
    return id;
  },

  /**
   * Remove a mate constraint
   * @param {string} mateId - Mate ID
   * @returns {boolean} success
   */
  removeMate(mateId) {
    const mate = this.mates.get(mateId);
    if (!mate) return false;

    const comp1 = this.components.get(mate.comp1Id);
    const comp2 = this.components.get(mate.comp2Id);

    if (comp1) comp1.constraints = comp1.constraints.filter(id => id !== mateId);
    if (comp2) comp2.constraints = comp2.constraints.filter(id => id !== mateId);

    this.mates.delete(mateId);
    return true;
  },

  /**
   * Solve all mate constraints iteratively
   * Uses Gauss-Seidel-style relaxation: fix grounded, move others to satisfy constraints
   * @returns {Object} { converged: boolean, iterations: number, error: number }
   */
  solveMates() {
    let converged = false;
    let iteration = 0;
    let maxError = Infinity;

    while (iteration < this.solverMaxIterations && !converged) {
      maxError = 0;

      // For each mate constraint
      for (const mate of this.mates.values()) {
        const comp1 = this.components.get(mate.comp1Id);
        const comp2 = this.components.get(mate.comp2Id);
        if (!comp1 || !comp2) continue;

        // Skip if both grounded
        if (comp1.grounded && comp2.grounded) continue;

        // Determine which to move
        const moveComp = comp1.grounded ? comp2 : comp1;
        const fixComp = comp1.grounded ? comp1 : comp2;
        const moveMate = comp1.grounded ? mate : this._flipMate(mate);
        const fixMate = comp1.grounded ? mate : this._flipMate(mate);

        // Calculate correction
        const correction = this._calculateMateCorrection(moveMate, fixMate, moveComp, fixComp);
        maxError = Math.max(maxError, correction.distance);

        // Apply correction
        if (correction.distance > moveComp.constraints.length * 0.001) { // Only apply if error is significant
          moveComp.position.add(correction.translation);
          const targetRotation = new THREE.Quaternion().setFromAxisAngle(
            correction.rotationAxis,
            correction.rotationAngle
          );
          const q = new THREE.Quaternion().setFromEuler(moveComp.rotation);
          q.multiplyQuaternions(targetRotation, q);
          moveComp.rotation.setFromQuaternion(q);
        }
      }

      // Update mesh transforms
      for (const comp of this.components.values()) {
        if (!comp.grounded) {
          comp.mesh.position.copy(comp.position);
          comp.mesh.rotation.copy(comp.rotation);
        }
      }

      iteration++;
      converged = maxError < this.solverTolerance;
    }

    const result = {
      converged,
      iterations: iteration,
      error: maxError,
    };
    console.log(`[Assembly] Constraint solve: ${result.converged ? 'converged' : 'max iterations'} (${result.iterations}/${this.solverMaxIterations}, error=${result.error.toFixed(3)}mm)`);
    return result;
  },

  /**
   * Internal: Calculate mate constraint correction
   * @private
   */
  _calculateMateCorrection(mate, fixMate, moveComp, fixComp) {
    const correction = {
      translation: new THREE.Vector3(),
      rotationAxis: new THREE.Vector3(0, 0, 1),
      rotationAngle: 0,
      distance: 0,
    };

    // Transform face points to world space
    const face1Point = mate.face1Point.clone().applyEuler(moveComp.rotation).add(moveComp.position);
    const face2Point = fixMate.face2Point.clone().applyEuler(fixComp.rotation).add(fixComp.position);
    const face1Normal = mate.face1Normal.clone().applyEuler(moveComp.rotation).normalize();
    const face2Normal = fixMate.face2Normal.clone().applyEuler(fixComp.rotation).normalize();

    const gap = face2Point.clone().sub(face1Point);
    const distance = gap.length();
    correction.distance = distance;

    // Constraint type specific logic
    switch (mate.type) {
      case 'flush':
        // Align normals, bring into contact
        correction.translation.copy(gap);
        correction.rotationAxis.crossVectors(face1Normal, face2Normal).normalize();
        correction.rotationAngle = Math.acos(Math.min(1, Math.max(-1, face1Normal.dot(face2Normal)))) * 0.1;
        break;

      case 'mate':
        // Align normals opposite, bring into contact
        const oppNormal = face2Normal.clone().multiplyScalar(-1);
        correction.translation.copy(gap);
        correction.rotationAxis.crossVectors(face1Normal, oppNormal).normalize();
        correction.rotationAngle = Math.acos(Math.min(1, Math.max(-1, face1Normal.dot(oppNormal)))) * 0.1;
        break;

      case 'insert':
        // Coaxial + flush (axes aligned, faces touching)
        correction.translation.copy(gap);
        correction.rotationAxis.crossVectors(face1Normal, face2Normal).normalize();
        correction.rotationAngle = Math.acos(Math.min(1, Math.max(-1, face1Normal.dot(face2Normal)))) * 0.1;
        break;

      case 'angle':
        // Maintain specified angle between normals
        const targetAngle = mate.angle;
        const currentAngle = Math.acos(Math.min(1, Math.max(-1, face1Normal.dot(face2Normal))));
        const angleDiff = currentAngle - targetAngle;
        correction.translation.copy(gap.multiplyScalar(0.5));
        correction.rotationAxis.crossVectors(face1Normal, face2Normal).normalize();
        correction.rotationAngle = angleDiff * 0.05;
        break;

      case 'tangent':
        // Face tangent to cylinder (distance = cylinder radius)
        correction.translation.copy(gap.multiplyScalar(0.5));
        correction.rotationAxis.copy(face1Normal);
        correction.rotationAngle = 0;
        break;
    }

    // Damping
    correction.translation.multiplyScalar(0.3);
    correction.rotationAngle *= 0.3;

    return correction;
  },

  /**
   * Internal: Flip mate constraint (swap comp1/comp2)
   * @private
   */
  _flipMate(mate) {
    return {
      ...mate,
      face1Point: mate.face2Point.clone(),
      face1Normal: mate.face2Normal.clone(),
      face2Point: mate.face1Point.clone(),
      face2Normal: mate.face1Normal.clone(),
    };
  },

  /**
   * Add a motion joint between two components
   * @param {string} type - 'revolute'|'prismatic'|'cylindrical'|'ball'|'fixed'|'planar'
   * @param {string} comp1Id - First component (origin)
   * @param {string} comp2Id - Second component (moved)
   * @param {Object} params - { axis, point, limits: { min, max }, damping }
   * @returns {string} joint ID
   */
  addJoint(type, comp1Id, comp2Id, params = {}) {
    const comp1 = this.components.get(comp1Id);
    const comp2 = this.components.get(comp2Id);
    if (!comp1 || !comp2) return null;

    const id = `joint_${this.jointIdCounter++}`;

    const joint = {
      id,
      type,
      comp1Id,
      comp2Id,
      axis: params.axis ? params.axis.clone().normalize() : new THREE.Vector3(0, 0, 1),
      point: params.point ? params.point.clone() : new THREE.Vector3(),
      limits: {
        min: params.limits?.min ?? (type === 'revolute' || type === 'cylindrical' ? -Math.PI : -100),
        max: params.limits?.max ?? (type === 'revolute' || type === 'cylindrical' ? Math.PI : 100),
      },
      damping: params.damping ?? 0.8,
      currentValue: 0,
      keyframes: [],
    };

    this.joints.set(id, joint);
    comp1.joints.push(id);
    comp2.joints.push(id);

    console.log(`[Assembly] Added ${type} joint between ${comp1.name} and ${comp2.name}`);
    return id;
  },

  /**
   * Remove a joint
   * @param {string} jointId - Joint ID
   * @returns {boolean} success
   */
  removeJoint(jointId) {
    const joint = this.joints.get(jointId);
    if (!joint) return false;

    const comp1 = this.components.get(joint.comp1Id);
    const comp2 = this.components.get(joint.comp2Id);

    if (comp1) comp1.joints = comp1.joints.filter(id => id !== jointId);
    if (comp2) comp2.joints = comp2.joints.filter(id => id !== jointId);

    this.joints.delete(jointId);
    return true;
  },

  /**
   * Get current joint position/angle
   * @param {string} jointId - Joint ID
   * @returns {number} current value (radians or mm)
   */
  getJointValue(jointId) {
    const joint = this.joints.get(jointId);
    return joint?.currentValue ?? 0;
  },

  /**
   * Animate a joint to a target position over duration
   * Uses requestAnimationFrame for smooth keyframe interpolation
   * @param {string} jointId - Joint ID
   * @param {number} targetValue - Target value (radians or mm)
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise} resolves when animation completes
   */
  animateJoint(jointId, targetValue, duration = 500) {
    return new Promise((resolve) => {
      const joint = this.joints.get(jointId);
      if (!joint) {
        resolve();
        return;
      }

      const comp2 = this.components.get(joint.comp2Id);
      if (!comp2) {
        resolve();
        return;
      }

      // Clamp to limits
      const clampedTarget = Math.max(joint.limits.min, Math.min(joint.limits.max, targetValue));

      // Save initial state
      const startValue = joint.currentValue;
      const startPosition = comp2.position.clone();
      const startRotation = comp2.rotation.clone();
      const startTime = Date.now();

      // Animation loop
      const animationStep = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Easing: ease-out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        // Interpolate joint value
        joint.currentValue = startValue + (clampedTarget - startValue) * easeProgress;

        // Apply joint transformation
        this._applyJointTransform(joint, comp2, startPosition, startRotation);

        if (progress < 1) {
          requestAnimationFrame(animationStep);
        } else {
          joint.currentValue = clampedTarget;
          this._applyJointTransform(joint, comp2, startPosition, startRotation);
          resolve();
        }
      };

      requestAnimationFrame(animationStep);
    });
  },

  /**
   * Internal: Apply joint transformation to component
   * @private
   */
  _applyJointTransform(joint, component, initialPosition, initialRotation) {
    const transform = new THREE.Matrix4();
    const translation = new THREE.Matrix4().makeTranslation(joint.point.x, joint.point.y, joint.point.z);
    const invTranslation = new THREE.Matrix4().makeTranslation(-joint.point.x, -joint.point.y, -joint.point.z);

    switch (joint.type) {
      case 'revolute':
      case 'cylindrical':
        {
          const rotation = new THREE.Matrix4().makeRotationAxis(joint.axis, joint.currentValue);
          transform.multiplyMatrices(translation, rotation);
          transform.multiplyMatrices(transform, invTranslation);
        }
        break;

      case 'prismatic':
        {
          const translation2 = new THREE.Matrix4().makeTranslation(
            joint.axis.x * joint.currentValue,
            joint.axis.y * joint.currentValue,
            joint.axis.z * joint.currentValue
          );
          transform.copy(translation2);
        }
        break;

      case 'ball':
        // Simplified: only rotation around Z
        {
          const rotation = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), joint.currentValue);
          transform.multiplyMatrices(translation, rotation);
          transform.multiplyMatrices(transform, invTranslation);
        }
        break;

      case 'planar':
        {
          const translation2 = new THREE.Matrix4().makeTranslation(
            joint.axis.x * joint.currentValue,
            joint.axis.y * joint.currentValue,
            0
          );
          transform.copy(translation2);
        }
        break;

      case 'fixed':
        break;
    }

    // Apply to initial position/rotation
    const pos = initialPosition.clone().applyMatrix4(transform);
    component.position.copy(pos);
    component.mesh.position.copy(pos);

    const rot = new THREE.Quaternion().setFromEuler(initialRotation);
    const rotMatrix = new THREE.Matrix4().makeRotationFromQuaternion(rot);
    rotMatrix.multiply(transform);
    const resultRot = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    component.rotation.setFromQuaternion(resultRot);
    component.mesh.rotation.setFromQuaternion(resultRot);
  },

  /**
   * Explode assembly view (move parts outward)
   * @param {number} factor - Explode distance factor (0-1, 1 = extreme)
   */
  explodeAssembly(factor) {
    if (!this.ground) return;

    const groundComp = this.components.get(this.ground);
    const center = groundComp.position.clone();

    for (const comp of this.components.values()) {
      if (comp.grounded) continue;

      // Save original transform
      comp.originalTransform.position.copy(comp.position);
      comp.originalTransform.rotation.copy(comp.rotation);

      // Move outward from center
      const direction = comp.position.clone().sub(center).normalize();
      const distance = comp.position.clone().sub(center).length();
      const explodeDistance = distance * factor * 5;

      comp.position.copy(center).addScaledVector(direction, distance + explodeDistance);
      comp.mesh.position.copy(comp.position);
    }

    console.log(`[Assembly] Exploded by factor ${factor}`);
  },

  /**
   * Collapse assembly to original state
   */
  collapseAssembly() {
    for (const comp of this.components.values()) {
      comp.position.copy(comp.originalTransform.position);
      comp.rotation.copy(comp.originalTransform.rotation);
      comp.mesh.position.copy(comp.position);
      comp.mesh.rotation.copy(comp.rotation);
    }

    console.log('[Assembly] Collapsed to assembled state');
  },

  /**
   * Generate bill of materials
   * @returns {Array} BOM entries: { id, name, quantity, volume, mass }
   */
  getAssemblyBOM() {
    const bom = [];
    const nameMap = new Map();

    for (const comp of this.components.values()) {
      const key = comp.name;
      if (nameMap.has(key)) {
        nameMap.get(key).quantity++;
      } else {
        // Estimate volume from mesh bounding box
        const bbox = new THREE.Box3().setFromObject(comp.mesh);
        const size = bbox.getSize(new THREE.Vector3());
        const volume = size.x * size.y * size.z;

        nameMap.set(key, {
          name: key,
          quantity: 1,
          volume: volume.toFixed(2),
          components: [comp.id],
        });
      }
    }

    // Convert to array
    let index = 0;
    for (const [name, entry] of nameMap.entries()) {
      bom.push({
        id: index++,
        name: entry.name,
        quantity: entry.quantity,
        volume: entry.volume,
        components: entry.components,
      });
    }

    return bom;
  },

  /**
   * Serialize assembly to JSON
   * @returns {Object} assembly state JSON
   */
  saveAssembly() {
    const data = {
      components: [],
      mates: [],
      joints: [],
      subAssemblies: [],
      ground: this.ground,
      timestamp: new Date().toISOString(),
    };

    // Serialize components
    for (const comp of this.components.values()) {
      data.components.push({
        id: comp.id,
        name: comp.name,
        position: { x: comp.position.x, y: comp.position.y, z: comp.position.z },
        rotation: { x: comp.rotation.x, y: comp.rotation.y, z: comp.rotation.z },
        grounded: comp.grounded,
      });
    }

    // Serialize mates
    for (const mate of this.mates.values()) {
      data.mates.push({
        id: mate.id,
        type: mate.type,
        comp1Id: mate.comp1Id,
        comp2Id: mate.comp2Id,
        face1Normal: { x: mate.face1Normal.x, y: mate.face1Normal.y, z: mate.face1Normal.z },
        face1Point: { x: mate.face1Point.x, y: mate.face1Point.y, z: mate.face1Point.z },
        face2Normal: { x: mate.face2Normal.x, y: mate.face2Normal.y, z: mate.face2Normal.z },
        face2Point: { x: mate.face2Point.x, y: mate.face2Point.y, z: mate.face2Point.z },
        offset: mate.offset,
        angle: mate.angle,
        flip: mate.flip,
      });
    }

    // Serialize joints
    for (const joint of this.joints.values()) {
      data.joints.push({
        id: joint.id,
        type: joint.type,
        comp1Id: joint.comp1Id,
        comp2Id: joint.comp2Id,
        axis: { x: joint.axis.x, y: joint.axis.y, z: joint.axis.z },
        point: { x: joint.point.x, y: joint.point.y, z: joint.point.z },
        limits: joint.limits,
        damping: joint.damping,
        currentValue: joint.currentValue,
      });
    }

    // Serialize sub-assemblies
    for (const [id, subAsm] of this.subAssemblies.entries()) {
      data.subAssemblies.push({
        id,
        name: subAsm.name,
        componentIds: subAsm.componentIds,
      });
    }

    return data;
  },

  /**
   * Restore assembly from JSON
   * Requires mesh references to be added back manually
   * @param {Object} json - Assembly state JSON from saveAssembly()
   */
  loadAssembly(json) {
    this.components.clear();
    this.mates.clear();
    this.joints.clear();
    this.subAssemblies.clear();
    this.ground = json.ground;

    // Restore components (mesh data not preserved; need to re-add)
    for (const compData of json.components) {
      const comp = {
        id: compData.id,
        name: compData.name,
        mesh: null, // Must be set externally
        position: new THREE.Vector3(compData.position.x, compData.position.y, compData.position.z),
        rotation: new THREE.Euler(compData.rotation.x, compData.rotation.y, compData.rotation.z),
        constraints: [],
        joints: [],
        grounded: compData.grounded,
        originalTransform: {
          position: new THREE.Vector3(compData.position.x, compData.position.y, compData.position.z),
          rotation: new THREE.Euler(compData.rotation.x, compData.rotation.y, compData.rotation.z),
        },
        parentSubAssembly: null,
      };
      this.components.set(compData.id, comp);
      this.componentIdCounter = Math.max(this.componentIdCounter, parseInt(compData.id.split('_')[1]) + 1);
    }

    // Restore mates
    for (const mateData of json.mates) {
      const mate = {
        id: mateData.id,
        type: mateData.type,
        comp1Id: mateData.comp1Id,
        comp2Id: mateData.comp2Id,
        face1Normal: new THREE.Vector3(mateData.face1Normal.x, mateData.face1Normal.y, mateData.face1Normal.z),
        face1Point: new THREE.Vector3(mateData.face1Point.x, mateData.face1Point.y, mateData.face1Point.z),
        face2Normal: new THREE.Vector3(mateData.face2Normal.x, mateData.face2Normal.y, mateData.face2Normal.z),
        face2Point: new THREE.Vector3(mateData.face2Point.x, mateData.face2Point.y, mateData.face2Point.z),
        offset: mateData.offset,
        angle: mateData.angle,
        flip: mateData.flip,
        tolerance: this.solverTolerance,
      };
      this.mates.set(mateData.id, mate);

      const comp1 = this.components.get(mateData.comp1Id);
      const comp2 = this.components.get(mateData.comp2Id);
      if (comp1) comp1.constraints.push(mateData.id);
      if (comp2) comp2.constraints.push(mateData.id);

      this.mateIdCounter = Math.max(this.mateIdCounter, parseInt(mateData.id.split('_')[1]) + 1);
    }

    // Restore joints
    for (const jointData of json.joints) {
      const joint = {
        id: jointData.id,
        type: jointData.type,
        comp1Id: jointData.comp1Id,
        comp2Id: jointData.comp2Id,
        axis: new THREE.Vector3(jointData.axis.x, jointData.axis.y, jointData.axis.z),
        point: new THREE.Vector3(jointData.point.x, jointData.point.y, jointData.point.z),
        limits: jointData.limits,
        damping: jointData.damping,
        currentValue: jointData.currentValue,
        keyframes: [],
      };
      this.joints.set(jointData.id, joint);

      const comp1 = this.components.get(jointData.comp1Id);
      const comp2 = this.components.get(jointData.comp2Id);
      if (comp1) comp1.joints.push(jointData.id);
      if (comp2) comp2.joints.push(jointData.id);

      this.jointIdCounter = Math.max(this.jointIdCounter, parseInt(jointData.id.split('_')[1]) + 1);
    }

    // Restore sub-assemblies
    for (const subAsmData of json.subAssemblies) {
      this.subAssemblies.set(subAsmData.id, {
        name: subAsmData.name,
        componentIds: subAsmData.componentIds,
      });
      this.subAssemblyIdCounter = Math.max(this.subAssemblyIdCounter, parseInt(subAsmData.id.split('_')[1]) + 1);
    }

    console.log(`[Assembly] Loaded assembly: ${json.components.length} components, ${json.mates.length} mates, ${json.joints.length} joints`);
  },

  /**
   * Get assembly statistics
   * @returns {Object} { componentCount, mateCount, jointCount, groundedId, dof }
   */
  getAssemblyStats() {
    // DOF = 6 * (n-1) - constraints
    // Each fixed component reduces DOF by 6
    // Each mate removes up to 5 DOF (varies by type)
    const numComponents = this.components.size;
    const numMates = this.mates.size;
    const numJoints = this.joints.size;

    // Simplified DOF calculation
    let baseDOF = 6 * Math.max(0, numComponents - 1);
    let constrainedDOF = numMates * 3 + numJoints * 0; // Mates remove ~3 DOF each, joints are prescribed
    const dof = baseDOF - constrainedDOF;

    return {
      componentCount: numComponents,
      mateCount: numMates,
      jointCount: numJoints,
      groundedId: this.ground,
      dof: Math.max(0, dof),
    };
  },

  /**
   * Show/hide constraint visualization markers
   * @param {boolean} visible - Show markers?
   */
  showConstraintMarkers(visible) {
    if (visible) {
      // Clear existing markers
      this.constraintMarkers.forEach(marker => this.assemblyGroup.remove(marker));
      this.constraintMarkers = [];

      // Create markers for each mate
      for (const mate of this.mates.values()) {
        const comp1 = this.components.get(mate.comp1Id);
        const comp2 = this.components.get(mate.comp2Id);
        if (!comp1 || !comp2) continue;

        // Line connecting constraint points
        const pos1 = mate.face1Point.clone().applyEuler(comp1.rotation).add(comp1.position);
        const pos2 = mate.face2Point.clone().applyEuler(comp2.rotation).add(comp2.position);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
          pos1.x, pos1.y, pos1.z,
          pos2.x, pos2.y, pos2.z,
        ]), 3));

        const material = new THREE.LineBasicMaterial({ color: this.constraintColor, linewidth: 2 });
        const line = new THREE.Line(geometry, material);
        this.assemblyGroup.add(line);
        this.constraintMarkers.push(line);
      }

      console.log(`[Assembly] Showing ${this.constraintMarkers.length} constraint markers`);
    } else {
      this.constraintMarkers.forEach(marker => this.assemblyGroup.remove(marker));
      this.constraintMarkers = [];
      console.log('[Assembly] Hiding constraint markers');
    }
  },

  /**
   * Highlight a component with color
   * @param {string} componentId - Component ID
   * @param {number} color - THREE.js color hex
   */
  highlightComponent(componentId, color = 0xffff00) {
    const comp = this.components.get(componentId);
    if (!comp) return;

    // Store original material
    if (!comp._originalMaterial) {
      comp._originalMaterial = comp.mesh.material;
    }

    // Apply highlight material
    const highlightMaterial = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    comp.mesh.material = highlightMaterial;
  },

  /**
   * Clear component highlight
   * @param {string} componentId - Component ID
   */
  clearHighlight(componentId) {
    const comp = this.components.get(componentId);
    if (!comp || !comp._originalMaterial) return;

    comp.mesh.material = comp._originalMaterial;
  },

  /**
   * Show/hide joint axis visualization
   * @param {boolean} visible - Show axes?
   */
  showJointAxes(visible) {
    if (visible) {
      this.jointAxisMarkers.forEach(marker => this.assemblyGroup.remove(marker));
      this.jointAxisMarkers = [];

      // Create axis arrows for each joint
      for (const joint of this.joints.values()) {
        const origin = joint.point.clone();
        const direction = joint.axis.clone();

        // Arrow geometry
        const arrowLength = 50;
        const arrowHelper = new THREE.ArrowHelper(direction, origin, arrowLength, this.jointColor);
        this.assemblyGroup.add(arrowHelper);
        this.jointAxisMarkers.push(arrowHelper);
      }

      console.log(`[Assembly] Showing ${this.jointAxisMarkers.length} joint axes`);
    } else {
      this.jointAxisMarkers.forEach(marker => this.assemblyGroup.remove(marker));
      this.jointAxisMarkers = [];
      console.log('[Assembly] Hiding joint axes');
    }
  },

  /**
   * Get assembly tree (for hierarchical display)
   * @returns {Object} tree structure: { id, name, type, children, components }
   */
  getAssemblyTree() {
    const tree = {
      id: 'root',
      name: 'Assembly',
      type: 'assembly',
      children: [],
      stats: this.getAssemblyStats(),
    };

    // Add sub-assemblies
    for (const [subId, subAsm] of this.subAssemblies.entries()) {
      const subNode = {
        id: subId,
        name: subAsm.name,
        type: 'subAssembly',
        children: [],
      };

      // Add components in sub-assembly
      for (const compId of subAsm.componentIds) {
        const comp = this.components.get(compId);
        if (comp) {
          subNode.children.push({
            id: compId,
            name: comp.name,
            type: 'component',
            grounded: comp.grounded,
            constraintCount: comp.constraints.length,
            jointCount: comp.joints.length,
          });
        }
      }

      tree.children.push(subNode);
    }

    // Add ungrouped components
    const ungroupedNode = {
      id: 'ungrouped',
      name: 'Components',
      type: 'group',
      children: [],
    };

    for (const comp of this.components.values()) {
      if (!comp.parentSubAssembly) {
        ungroupedNode.children.push({
          id: comp.id,
          name: comp.name,
          type: 'component',
          grounded: comp.grounded,
          constraintCount: comp.constraints.length,
          jointCount: comp.joints.length,
        });
      }
    }

    if (ungroupedNode.children.length > 0) {
      tree.children.push(ungroupedNode);
    }

    return tree;
  },

  /**
   * Create a sub-assembly from a group of components
   * @param {string} name - Sub-assembly name
   * @param {string[]} componentIds - Component IDs to group
   * @returns {string} sub-assembly ID
   */
  createSubAssembly(name, componentIds) {
    const id = `subasm_${this.subAssemblyIdCounter++}`;

    const subAsm = {
      name,
      componentIds,
    };

    this.subAssemblies.set(id, subAsm);

    // Mark components as belonging to sub-assembly
    for (const compId of componentIds) {
      const comp = this.components.get(compId);
      if (comp) {
        comp.parentSubAssembly = id;
      }
    }

    console.log(`[Assembly] Created sub-assembly: ${name} with ${componentIds.length} components`);
    return id;
  },
};

export default Assembly;
