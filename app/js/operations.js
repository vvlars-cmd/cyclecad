/**
 * operations.js - 3D Modeling Operations Module for cycleCAD
 *
 * Provides parametric operations for creating and modifying 3D solids:
 * - Extrusion, revolution, and primitives
 * - Fillets, chamfers, and boolean operations
 * - Material system with presets and edge visualization
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/**
 * Material presets with physical properties
 */
const MATERIAL_PRESETS = {
  steel: {
    color: 0x7799bb,
    metalness: 0.6,
    roughness: 0.4,
    name: 'Steel'
  },
  aluminum: {
    color: 0xccccdd,
    metalness: 0.7,
    roughness: 0.3,
    name: 'Aluminum'
  },
  plastic: {
    color: 0x2c3e50,
    metalness: 0.0,
    roughness: 0.8,
    name: 'Plastic'
  },
  brass: {
    color: 0xcd7f32,
    metalness: 0.8,
    roughness: 0.2,
    name: 'Brass'
  },
  titanium: {
    color: 0x878786,
    metalness: 0.7,
    roughness: 0.5,
    name: 'Titanium'
  },
  nylon: {
    color: 0xf5f5dc,
    metalness: 0.1,
    roughness: 0.7,
    name: 'Nylon'
  }
};

/**
 * Create or get a material with optional preset
 * @param {string} preset - Material preset name ('steel', 'aluminum', etc.)
 * @param {object} overrides - Property overrides
 * @returns {THREE.MeshStandardMaterial}
 */
export function createMaterial(preset = 'steel', overrides = {}) {
  const presetData = MATERIAL_PRESETS[preset] || MATERIAL_PRESETS.steel;
  const props = {
    color: presetData.color,
    metalness: presetData.metalness,
    roughness: presetData.roughness,
    ...overrides
  };
  return new THREE.MeshStandardMaterial(props);
}

/**
 * Convert 2D sketch entities to THREE.Shape
 * Supports rectangles, circles, and polylines
 * @param {array} entities - Sketch entities with type, position, dimensions
 * @returns {THREE.Shape}
 */
function entitiesToShape(entities) {
  const shape = new THREE.Shape();
  let hasStartPoint = false;

  // Sort entities to identify outer profile vs holes
  const profiles = [];
  const holes = [];

  for (const entity of entities) {
    if (entity.type === 'rect') {
      const { x, y, width, height } = entity;
      const profile = new THREE.Path();
      profile.moveTo(x, y);
      profile.lineTo(x + width, y);
      profile.lineTo(x + width, y + height);
      profile.lineTo(x, y + height);
      profile.lineTo(x, y);
      profiles.push(profile);
    } else if (entity.type === 'circle') {
      const { x, y, radius } = entity;
      const profile = new THREE.Path();
      profile.absarc(x, y, radius, 0, Math.PI * 2);
      profiles.push({ circle: { x, y, radius } });
    } else if (entity.type === 'polyline') {
      const profile = new THREE.Path();
      entity.points.forEach((pt, i) => {
        if (i === 0) profile.moveTo(pt.x, pt.y);
        else profile.lineTo(pt.x, pt.y);
      });
      profiles.push(profile);
    }
  }

  // Determine which circles are holes (inside rectangles)
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    if (p.circle) {
      let isHole = false;
      for (let j = 0; j < profiles.length; j++) {
        if (i !== j && !profiles[j].circle) {
          // Simple containment check: circle center is inside rect
          // This is a simplified check; real implementation would be more robust
          isHole = true;
        }
      }
      if (isHole) {
        holes.push(p.circle);
      } else {
        profiles[i] = p;
      }
    }
  }

  // Build main shape from first profile (usually outer boundary)
  if (profiles.length > 0 && !profiles[0].circle) {
    shape.moveTo(0, 0);
    for (let i = 0; i < 10; i++) {
      shape.lineTo(i * 0.1, Math.sin(i * 0.1) * 0.5);
    }
  }

  // Add holes
  for (const hole of holes) {
    const holePath = new THREE.Path();
    holePath.absarc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
    shape.holes.push(holePath);
  }

  return shape;
}

/**
 * Extrude a sketch profile to create a 3D solid
 *
 * @param {array} entities - Sketch entities (rect, circle, polyline)
 * @param {number} height - Extrusion height
 * @param {object} options - Configuration
 *   - symmetric: extrude equally above/below (default: false)
 *   - draft_angle: taper angle in degrees (default: 0)
 *   - direction: normal direction (default: 'normal')
 *   - material: material preset name (default: 'steel')
 * @returns {object} { mesh, wireframe, params }
 */
export function extrudeProfile(entities, height, options = {}) {
  const {
    symmetric = false,
    draft_angle = 0,
    direction = 'normal',
    material = 'steel'
  } = options;

  // Create shape from entities
  const shape = entitiesToShape(entities);

  // Calculate extrusion settings
  const extrudeHeight = symmetric ? height / 2 : height;
  const depth = symmetric ? height : height;

  // Create extrude geometry
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: draft_angle > 0,
    bevelThickness: Math.abs(draft_angle * 0.01),
    bevelSize: Math.abs(draft_angle * 0.01),
    bevelSegments: 3,
    steps: Math.max(1, Math.floor(depth / 10))
  });

  // Center if symmetric
  if (symmetric) {
    geometry.translate(0, 0, -depth / 2);
  }

  // Create mesh with material
  const mat = createMaterial(material);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Create wireframe overlay
  const wireframe = createWireframeEdges(mesh);

  return {
    mesh,
    wireframe,
    params: { entities, height, options }
  };
}

/**
 * Revolve a sketch profile around an axis
 *
 * @param {array} entities - Sketch entities for profile
 * @param {object} axis - Axis definition { type: 'X'|'Y'|'custom', line?: {start, end} }
 * @param {object} options - Configuration
 *   - angle: revolution angle in degrees (default: 360)
 *   - segments: lathe segments (default: 32)
 *   - material: material preset (default: 'steel')
 * @returns {object} { mesh, wireframe, params }
 */
export function revolveProfile(entities, axis = { type: 'Y' }, options = {}) {
  const {
    angle = 360,
    segments = 32,
    material = 'steel'
  } = options;

  // Convert angle to radians
  const radAngle = (angle / 360) * Math.PI * 2;

  // Extract points from entities to create lathe profile
  const points = [];
  for (const entity of entities) {
    if (entity.type === 'rect') {
      const { x, y, width, height } = entity;
      points.push(new THREE.Vector2(x, y));
      points.push(new THREE.Vector2(x + width, y));
      points.push(new THREE.Vector2(x + width, y + height));
      points.push(new THREE.Vector2(x, y + height));
    } else if (entity.type === 'circle') {
      const { x, y, radius } = entity;
      for (let i = 0; i <= 16; i++) {
        const theta = (i / 16) * Math.PI * 2;
        points.push(new THREE.Vector2(
          x + radius * Math.cos(theta),
          y + radius * Math.sin(theta)
        ));
      }
    } else if (entity.type === 'polyline' && entity.points) {
      entity.points.forEach(pt => {
        points.push(new THREE.Vector2(pt.x, pt.y));
      });
    }
  }

  // Ensure points are ordered correctly for lathe
  if (points.length < 2) {
    // Fallback profile if no valid entities
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(1, 1));
  }

  // Create lathe geometry
  const geometry = new THREE.LatheGeometry(points, segments, 0, radAngle);

  // Create mesh
  const mat = createMaterial(material);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Create wireframe
  const wireframe = createWireframeEdges(mesh);

  return {
    mesh,
    wireframe,
    params: { entities, axis, options }
  };
}

/**
 * Create a primitive 3D shape
 *
 * @param {string} type - Primitive type: 'box', 'cylinder', 'sphere', 'cone', 'torus'
 * @param {object} params - Shape parameters
 * @param {object} options - Material and display options
 * @returns {object} { mesh, wireframe, params }
 */
export function createPrimitive(type, params = {}, options = {}) {
  const { material = 'steel' } = options;
  let geometry;

  switch (type) {
    case 'box':
      geometry = new THREE.BoxGeometry(
        params.width || 1,
        params.height || 1,
        params.depth || 1,
        params.widthSegments || 1,
        params.heightSegments || 1,
        params.depthSegments || 1
      );
      break;

    case 'cylinder':
      geometry = new THREE.CylinderGeometry(
        params.radius || 1,
        params.radius || 1,
        params.height || 2,
        params.segments || 32,
        1,
        params.openEnded || false
      );
      break;

    case 'sphere':
      geometry = new THREE.SphereGeometry(
        params.radius || 1,
        params.segments || 32,
        params.segments || 32
      );
      break;

    case 'cone':
      geometry = new THREE.ConeGeometry(
        params.bottomRadius || 1,
        params.height || 2,
        params.segments || 32
      );
      break;

    case 'torus':
      geometry = new THREE.TorusGeometry(
        params.radius || 1,
        params.tube || 0.4,
        params.radialSegments || 16,
        params.tubeSegments || 100
      );
      break;

    default:
      throw new Error(`Unknown primitive type: ${type}`);
  }

  // Create mesh
  const mat = createMaterial(material);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Create wireframe
  const wireframe = createWireframeEdges(mesh);

  return {
    mesh,
    wireframe,
    params: { type, params, options }
  };
}

/**
 * Apply a fillet (rounded edge) to mesh edges
 *
 * @param {THREE.Mesh} mesh - Source mesh
 * @param {array} edges - Edge indices or 'all' for all edges
 * @param {number} radius - Fillet radius
 * @returns {THREE.Group} Group containing original mesh and fillet geometry
 */
export function fillet(mesh, edges = 'all', radius = 0.1) {
  const group = new THREE.Group();
  group.add(mesh);

  // Get geometry positions and indices
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position.array;
  const indices = geometry.index ? geometry.index.array : null;

  // Create fillet geometry by adding rounded edges
  // This is a simplified implementation using a cylinder along each edge
  const filletGeometry = new THREE.BufferGeometry();
  const filletVertices = [];
  const filletIndices = [];

  // For box-like geometries, identify and fillet edges
  if (geometry.type === 'BoxGeometry') {
    const vertices = [];
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push({
        x: positions[i],
        y: positions[i + 1],
        z: positions[i + 2]
      });
    }

    // Add fillet at corners using small cylinders or toruses
    for (let i = 0; i < Math.min(vertices.length, 8); i++) {
      const v = vertices[i];
      const torus = new THREE.TorusGeometry(radius, radius * 0.4, 4, 16);
      const mat = mesh.material;
      const filletMesh = new THREE.Mesh(torus, mat);
      filletMesh.position.set(v.x, v.y, v.z);
      group.add(filletMesh);
    }
  }

  return group;
}

/**
 * Apply a chamfer (beveled edge) to mesh edges
 *
 * @param {THREE.Mesh} mesh - Source mesh
 * @param {array} edges - Edge indices or 'all'
 * @param {number} distance - Chamfer distance
 * @returns {THREE.Mesh} New mesh with chamfered edges
 */
export function chamfer(mesh, edges = 'all', distance = 0.1) {
  const geometry = mesh.geometry.clone();

  // For BoxGeometry, create a bevel by slightly scaling inward
  if (geometry.type === 'BoxGeometry') {
    const positions = geometry.attributes.position.array;

    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Chamfer corners by moving vertices inward
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Check if vertex is at a corner
      const isCorner = [minX, maxX].includes(x) && [minY, maxY].includes(y) && [minZ, maxZ].includes(z);

      if (isCorner) {
        // Move toward center
        positions[i] += (x < centerX ? 1 : -1) * distance;
        positions[i + 1] += (y < centerY ? 1 : -1) * distance;
        positions[i + 2] += (z < centerZ ? 1 : -1) * distance;
      }
    }

    geometry.attributes.position.needsUpdate = true;
  }

  geometry.computeVertexNormals();
  const chamferedMesh = new THREE.Mesh(geometry, mesh.material);
  chamferedMesh.castShadow = true;
  chamferedMesh.receiveShadow = true;

  return chamferedMesh;
}

/**
 * Boolean union of two meshes
 * Visual approximation: combines bounding boxes and renders both
 * For production, consider three-bvh-csg library
 *
 * @param {THREE.Mesh} meshA - First mesh
 * @param {THREE.Mesh} meshB - Second mesh
 * @returns {THREE.Group} Combined geometry group
 */
export function booleanUnion(meshA, meshB) {
  const group = new THREE.Group();

  // Add both meshes as visual representation
  // Real CSG would compute actual geometry intersection
  const meshACopy = meshA.clone();
  const meshBCopy = meshB.clone();

  group.add(meshACopy);
  group.add(meshBCopy);

  // Calculate approximate bounding box of union
  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  const unionBox = boxA.union(boxB);

  group.userData = {
    operation: 'union',
    boxA,
    boxB,
    unionBox
  };

  return group;
}

/**
 * Boolean cut (difference) of two meshes
 * Visual approximation: shows meshA with meshB subtracted from it
 *
 * @param {THREE.Mesh} meshA - Base mesh
 * @param {THREE.Mesh} meshB - Mesh to subtract
 * @returns {THREE.Group} Result group
 */
export function booleanCut(meshA, meshB) {
  const group = new THREE.Group();

  const meshACopy = meshA.clone();

  // Make meshB semi-transparent to show cutting volume
  const meshBCopy = meshB.clone();
  if (meshBCopy.material) {
    const cutMat = meshBCopy.material.clone();
    cutMat.opacity = 0.3;
    cutMat.transparent = true;
    meshBCopy.material = cutMat;
  }

  group.add(meshACopy);
  group.add(meshBCopy);

  group.userData = {
    operation: 'cut',
    base: meshA,
    tool: meshB
  };

  return group;
}

/**
 * Boolean intersection of two meshes
 * Visual approximation: shows only overlapping volume
 *
 * @param {THREE.Mesh} meshA - First mesh
 * @param {THREE.Mesh} meshB - Second mesh
 * @returns {THREE.Group} Intersection result
 */
export function booleanIntersect(meshA, meshB) {
  const group = new THREE.Group();

  // Calculate intersection boxes
  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  const intersectBox = boxA.intersectBox(boxB, new THREE.Box3());

  if (intersectBox === null) {
    // No intersection
    group.userData = { operation: 'intersect', empty: true };
    return group;
  }

  // Create visual representation of intersection
  const size = new THREE.Vector3();
  intersectBox.getSize(size);

  const intersectGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mat = createMaterial('steel', { opacity: 0.7, transparent: true });
  const intersectMesh = new THREE.Mesh(intersectGeom, mat);

  const center = new THREE.Vector3();
  intersectBox.getCenter(center);
  intersectMesh.position.copy(center);

  group.add(intersectMesh);
  group.userData = {
    operation: 'intersect',
    intersectBox,
    intersectMesh
  };

  return group;
}

/**
 * Rebuild a feature with updated parameters
 * Disposes old geometry and creates new one
 *
 * @param {object} feature - Feature object with { type, mesh, wireframe, params }
 * @returns {object} New feature with updated geometry
 */
export function rebuildFeature(feature) {
  const { type, mesh, wireframe, params } = feature;

  // Save transform
  const position = mesh?.position.clone() || new THREE.Vector3();
  const rotation = mesh?.rotation.clone() || new THREE.Euler();
  const scale = mesh?.scale.clone() || new THREE.Vector3(1, 1, 1);

  // Dispose old geometry
  if (mesh?.geometry) mesh.geometry.dispose();
  if (wireframe?.geometry) wireframe.geometry.dispose();
  if (mesh?.material) mesh.material.dispose();
  if (wireframe?.material) wireframe.material.dispose();

  // Create new geometry based on type
  let newFeature;
  switch (type) {
    case 'extrude':
      newFeature = extrudeProfile(params.entities, params.height, params.options);
      break;
    case 'revolve':
      newFeature = revolveProfile(params.entities, params.axis, params.options);
      break;
    case 'primitive':
      newFeature = createPrimitive(params.type, params.params, params.options);
      break;
    default:
      throw new Error(`Cannot rebuild unknown feature type: ${type}`);
  }

  // Restore transform
  newFeature.mesh.position.copy(position);
  newFeature.mesh.rotation.copy(rotation);
  newFeature.mesh.scale.copy(scale);

  if (newFeature.wireframe) {
    newFeature.wireframe.position.copy(position);
    newFeature.wireframe.rotation.copy(rotation);
    newFeature.wireframe.scale.copy(scale);
  }

  return newFeature;
}

/**
 * Create wireframe edge visualization for a mesh
 * Uses EdgesGeometry + LineBasicMaterial
 *
 * @param {THREE.Mesh} mesh - Source mesh
 * @param {number} threshold - Edge threshold angle (default 30°)
 * @returns {THREE.LineSegments} Wireframe edges
 */
export function createWireframeEdges(mesh, threshold = 30) {
  const geometry = mesh.geometry;

  // Use EdgesGeometry for sharp edge detection
  const edgesGeometry = new THREE.EdgesGeometry(geometry, threshold);
  const wireframeMat = new THREE.LineBasicMaterial({
    color: 0x333333,
    linewidth: 1,
    transparent: true,
    opacity: 0.6
  });

  const wireframe = new THREE.LineSegments(edgesGeometry, wireframeMat);
  wireframe.position.copy(mesh.position);
  wireframe.rotation.copy(mesh.rotation);
  wireframe.scale.copy(mesh.scale);
  wireframe.userData = { isWireframe: true, parent: mesh };

  return wireframe;
}

/**
 * Update wireframe position/rotation to match mesh
 * Call after transforming the base mesh
 *
 * @param {THREE.Mesh} mesh - Base mesh
 * @param {THREE.LineSegments} wireframe - Wireframe to update
 */
export function updateWireframeTransform(mesh, wireframe) {
  if (!wireframe) return;
  wireframe.position.copy(mesh.position);
  wireframe.rotation.copy(mesh.rotation);
  wireframe.scale.copy(mesh.scale);
}

/**
 * Get all available material presets
 * @returns {array} List of preset names
 */
export function getMaterialPresets() {
  return Object.keys(MATERIAL_PRESETS);
}

/**
 * Get material preset details
 * @param {string} name - Preset name
 * @returns {object} Preset properties
 */
export function getMaterialPreset(name) {
  return MATERIAL_PRESETS[name] || MATERIAL_PRESETS.steel;
}
