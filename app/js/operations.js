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
  if (!entities || entities.length === 0) {
    throw new Error('No sketch entities to convert');
  }

  // Separate entities by type
  const rects = [];
  const circles = [];
  const lines = [];
  const arcs = [];
  const polylines = [];

  for (const entity of entities) {
    switch (entity.type) {
      case 'rect':
      case 'rectangle':
        rects.push(entity);
        break;
      case 'circle':
        circles.push(entity);
        break;
      case 'line':
        lines.push(entity);
        break;
      case 'arc':
        arcs.push(entity);
        break;
      case 'polyline':
        polylines.push(entity);
        break;
    }
  }

  // Build shapes from each entity type
  const shapes = [];

  // Rectangles → closed shape
  for (const r of rects) {
    const s = new THREE.Shape();
    const x = r.x || 0;
    const y = r.y || 0;
    const w = r.width || 10;
    const h = r.height || 10;
    s.moveTo(x, y);
    s.lineTo(x + w, y);
    s.lineTo(x + w, y + h);
    s.lineTo(x, y + h);
    s.closePath();
    shapes.push({ shape: s, area: Math.abs(w * h), type: 'rect' });
  }

  // Circles → closed shape
  for (const c of circles) {
    const s = new THREE.Shape();
    const cx = c.x || c.center?.x || 0;
    const cy = c.y || c.center?.y || 0;
    const r = c.radius || 10;
    s.absarc(cx, cy, r, 0, Math.PI * 2, false);
    shapes.push({ shape: s, area: Math.PI * r * r, type: 'circle' });
  }

  // Polylines → closed shape (if closed or has enough points)
  for (const p of polylines) {
    if (p.points && p.points.length >= 3) {
      const s = new THREE.Shape();
      s.moveTo(p.points[0].x, p.points[0].y);
      for (let i = 1; i < p.points.length; i++) {
        s.lineTo(p.points[i].x, p.points[i].y);
      }
      s.closePath();
      // Approximate area using shoelace formula
      let area = 0;
      const pts = p.points;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y;
        area -= pts[j].x * pts[i].y;
      }
      shapes.push({ shape: s, area: Math.abs(area / 2), type: 'polyline' });
    }
  }

  // Lines → try to build closed path if they form a loop
  if (lines.length >= 3) {
    const s = new THREE.Shape();
    // Start from first line's start point
    const firstLine = lines[0];
    const sx = firstLine.start?.x || firstLine.x1 || 0;
    const sy = firstLine.start?.y || firstLine.y1 || 0;
    s.moveTo(sx, sy);

    for (const line of lines) {
      const ex = line.end?.x || line.x2 || 0;
      const ey = line.end?.y || line.y2 || 0;
      s.lineTo(ex, ey);
    }
    s.closePath();
    shapes.push({ shape: s, area: 1, type: 'lines' });
  }

  // If no shapes could be built, create a default 20mm square
  if (shapes.length === 0) {
    const s = new THREE.Shape();
    s.moveTo(-10, -10);
    s.lineTo(10, -10);
    s.lineTo(10, 10);
    s.lineTo(-10, 10);
    s.closePath();
    shapes.push({ shape: s, area: 400, type: 'default' });
  }

  // Sort by area — largest is the outer profile, smaller ones are holes
  shapes.sort((a, b) => b.area - a.area);

  // Largest shape is the outer boundary
  const mainShape = shapes[0].shape;

  // Any smaller shapes become holes in the main shape
  for (let i = 1; i < shapes.length; i++) {
    const holePts = shapes[i].shape.getPoints(32);
    const holePath = new THREE.Path();
    holePts.forEach((pt, idx) => {
      if (idx === 0) holePath.moveTo(pt.x, pt.y);
      else holePath.lineTo(pt.x, pt.y);
    });
    holePath.closePath();
    mainShape.holes.push(holePath);
  }

  return mainShape;
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
 * Creates rounded edges using torus geometry positioned at edge midpoints
 *
 * @param {THREE.Mesh} mesh - Source mesh
 * @param {array} edgeIndices - Edge indices (pairs of vertex indices) or 'all' for all edges
 * @param {number} radius - Fillet radius
 * @returns {THREE.Group} Group containing original mesh and fillet geometry
 */
export function fillet(mesh, edgeIndices = 'all', radius = 0.1) {
  const group = new THREE.Group();
  group.add(mesh);

  // Get geometry
  const geometry = mesh.geometry;
  const positionAttr = geometry.attributes.position;

  if (!positionAttr) return group;

  const positions = positionAttr.array;
  const indices = geometry.index ? geometry.index.array : null;

  // Extract unique edges from geometry
  const edges = extractEdgesFromGeometry(positions, indices);

  // Filter to requested edges
  let activeEdges = edges;
  if (edgeIndices !== 'all' && Array.isArray(edgeIndices)) {
    activeEdges = edgeIndices.map(idx => edges[idx]).filter(e => e);
  }

  // Create rounded geometry for each edge
  for (const edge of activeEdges) {
    // Calculate edge midpoint and direction
    const p1 = new THREE.Vector3(
      positions[edge.v1 * 3],
      positions[edge.v1 * 3 + 1],
      positions[edge.v1 * 3 + 2]
    );
    const p2 = new THREE.Vector3(
      positions[edge.v2 * 3],
      positions[edge.v2 * 3 + 1],
      positions[edge.v2 * 3 + 2]
    );

    const midpoint = p1.clone().add(p2).multiplyScalar(0.5);
    const edgeDir = p2.clone().sub(p1).normalize();

    // Create torus geometry for rounded edge
    const torusGeom = new THREE.TorusGeometry(
      radius,
      radius * 0.25,
      8,
      24
    );

    // Rotate torus to align with edge direction
    const quaternion = new THREE.Quaternion();
    const upVector = new THREE.Vector3(0, 1, 0);
    if (Math.abs(edgeDir.dot(upVector)) > 0.9) {
      upVector.set(1, 0, 0);
    }
    quaternion.setFromUnitVectors(upVector, edgeDir);
    torusGeom.applyQuaternion(quaternion);
    torusGeom.translate(midpoint.x, midpoint.y, midpoint.z);

    const torusMesh = new THREE.Mesh(torusGeom, mesh.material.clone());
    group.add(torusMesh);
  }

  // Store parameters for rebuilding
  group.userData = {
    operation: 'fillet',
    edgeIndices,
    radius,
    source: mesh
  };

  return group;
}

/**
 * Apply a chamfer (beveled edge) to mesh edges
 * Creates angled cut geometry at selected edges
 *
 * @param {THREE.Mesh} mesh - Source mesh
 * @param {array} edgeIndices - Edge indices (pairs of vertex indices) or 'all'
 * @param {number} distance - Chamfer distance/size
 * @returns {THREE.Group} Group with original mesh and chamfer geometry
 */
export function chamfer(mesh, edgeIndices = 'all', distance = 0.1) {
  const group = new THREE.Group();
  group.add(mesh);

  const geometry = mesh.geometry;
  const positionAttr = geometry.attributes.position;

  if (!positionAttr) return group;

  const positions = positionAttr.array;
  const indices = geometry.index ? geometry.index.array : null;

  // Extract unique edges
  const edges = extractEdgesFromGeometry(positions, indices);

  // Filter edges
  let activeEdges = edges;
  if (edgeIndices !== 'all' && Array.isArray(edgeIndices)) {
    activeEdges = edgeIndices.map(idx => edges[idx]).filter(e => e);
  }

  // Create beveled geometry for each edge
  for (const edge of activeEdges) {
    const p1 = new THREE.Vector3(
      positions[edge.v1 * 3],
      positions[edge.v1 * 3 + 1],
      positions[edge.v1 * 3 + 2]
    );
    const p2 = new THREE.Vector3(
      positions[edge.v2 * 3],
      positions[edge.v2 * 3 + 1],
      positions[edge.v2 * 3 + 2]
    );

    const edgeDir = p2.clone().sub(p1).normalize();
    const edgeLen = p1.distanceTo(p2);

    // Create angled cut (cone-like shape)
    const coneGeom = new THREE.ConeGeometry(distance, edgeLen, 4, 2);

    // Rotate to align with edge
    const quaternion = new THREE.Quaternion();
    const upVector = new THREE.Vector3(0, 1, 0);
    if (Math.abs(edgeDir.dot(upVector)) > 0.9) {
      upVector.set(1, 0, 0);
    }
    quaternion.setFromUnitVectors(upVector, edgeDir);
    coneGeom.applyQuaternion(quaternion);

    const midpoint = p1.clone().add(p2).multiplyScalar(0.5);
    coneGeom.translate(midpoint.x, midpoint.y, midpoint.z);

    const coneMesh = new THREE.Mesh(coneGeom, mesh.material.clone());
    group.add(coneMesh);
  }

  // Store parameters
  group.userData = {
    operation: 'chamfer',
    edgeIndices,
    distance,
    source: mesh
  };

  return group;
}

/**
 * Boolean union of two meshes
 * Merges geometries and combines into single mesh
 *
 * @param {THREE.Mesh} meshA - First mesh
 * @param {THREE.Mesh} meshB - Second mesh
 * @returns {THREE.Mesh|THREE.Group} Combined geometry or group with operation metadata
 */
export function booleanUnion(meshA, meshB) {
  try {
    // Clone geometries to avoid modifying originals
    const geomA = meshA.geometry.clone();
    const geomB = meshB.geometry.clone();

    // Transform geometry B to world space of A
    const matrixB = meshB.matrixWorld;
    geomB.applyMatrix4(matrixB);

    // Merge geometries using BufferGeometryUtils
    // Fallback: combine as group if merge not available
    const mergedGeom = mergeGeometries([geomA, geomB]);

    if (mergedGeom) {
      mergedGeom.computeVertexNormals();
      const unionMesh = new THREE.Mesh(mergedGeom, meshA.material.clone());
      unionMesh.castShadow = true;
      unionMesh.receiveShadow = true;

      unionMesh.userData = {
        operation: 'union',
        source: [meshA, meshB]
      };

      return unionMesh;
    }
  } catch (e) {
    console.warn('Geometry merge failed, using visual approximation:', e);
  }

  // Fallback: return combined group with metadata
  const group = new THREE.Group();
  const meshACopy = meshA.clone();
  const meshBCopy = meshB.clone();

  group.add(meshACopy);
  group.add(meshBCopy);

  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  const unionBox = boxA.union(boxB);

  group.userData = {
    operation: 'union',
    source: [meshA, meshB],
    unionBox
  };

  return group;
}

/**
 * Boolean cut (difference) of two meshes
 * Visually approximates by showing base with cutting volume indicated
 * Use cutting geometry (meshB) as reference for intersection visualization
 *
 * @param {THREE.Mesh} meshA - Base mesh
 * @param {THREE.Mesh} meshB - Mesh to subtract (cutting tool)
 * @returns {THREE.Group} Result group with base and cut indicator
 */
export function booleanCut(meshA, meshB) {
  const group = new THREE.Group();

  const meshACopy = meshA.clone();
  group.add(meshACopy);

  // Create visual indicator of cutting volume
  const meshBCopy = meshB.clone();
  if (meshBCopy.material) {
    const cutIndicatorMat = meshBCopy.material.clone();
    cutIndicatorMat.opacity = 0.25;
    cutIndicatorMat.transparent = true;
    cutIndicatorMat.depthWrite = false;
    cutIndicatorMat.side = THREE.DoubleSide;
    meshBCopy.material = cutIndicatorMat;
  }

  // Add wireframe to show cutting geometry clearly
  const wireframe = createWireframeEdges(meshBCopy);
  wireframe.material.color.setHex(0xff6b6b); // Red to indicate cut
  group.add(meshBCopy);
  group.add(wireframe);

  // Calculate intersection bounds for reference
  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  const intersectBox = new THREE.Box3();
  boxA.intersectBox(boxB, intersectBox);

  group.userData = {
    operation: 'cut',
    base: meshA,
    tool: meshB,
    intersectBox: intersectBox.isEmpty() ? null : intersectBox
  };

  return group;
}

/**
 * Boolean intersection of two meshes
 * Visual approximation: shows only overlapping volume bounds
 *
 * @param {THREE.Mesh} meshA - First mesh
 * @param {THREE.Mesh} meshB - Second mesh
 * @returns {THREE.Group} Intersection result with visual representation
 */
export function booleanIntersect(meshA, meshB) {
  const group = new THREE.Group();

  // Calculate intersection boxes
  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  const intersectBox = new THREE.Box3();
  boxA.intersectBox(boxB, intersectBox);

  if (intersectBox.isEmpty()) {
    // No intersection
    group.userData = { operation: 'intersect', empty: true };
    return group;
  }

  // Create visual representation of intersection volume
  const size = new THREE.Vector3();
  intersectBox.getSize(size);

  const intersectGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mat = createMaterial('steel', {
    opacity: 0.5,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const intersectMesh = new THREE.Mesh(intersectGeom, mat);

  const center = new THREE.Vector3();
  intersectBox.getCenter(center);
  intersectMesh.position.copy(center);

  // Add wireframe for clarity
  const wireframe = createWireframeEdges(intersectMesh);
  wireframe.material.color.setHex(0x4ecdc4);

  group.add(intersectMesh);
  group.add(wireframe);

  group.userData = {
    operation: 'intersect',
    intersectBox,
    source: [meshA, meshB]
  };

  return group;
}

/**
 * Rebuild a feature with updated parameters
 * Disposes old geometry and creates new one
 *
 * @param {object} feature - Feature object with { type, mesh, wireframe, params }
 * @returns {object|THREE.Group} New feature with updated geometry
 */
export function rebuildFeature(feature) {
  const { type, mesh, wireframe, params } = feature;

  // Save transform
  const position = mesh?.position.clone() || new THREE.Vector3();
  const rotation = mesh?.rotation.clone() || new THREE.Euler();
  const scale = mesh?.scale.clone() || new THREE.Vector3(1, 1, 1);

  // Dispose old geometry and materials
  disposeGeometry(mesh);
  disposeGeometry(wireframe);

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
    case 'shell':
      newFeature = createShell(params.source, params.thickness, params.options);
      break;
    case 'pattern':
      newFeature = createPattern(params.source, params.type, params.count, params.spacing, params.options);
      break;
    case 'fillet':
      newFeature = fillet(params.source, params.edgeIndices, params.radius);
      break;
    case 'chamfer':
      newFeature = chamfer(params.source, params.edgeIndices, params.distance);
      break;
    default:
      throw new Error(`Cannot rebuild unknown feature type: ${type}`);
  }

  // Restore transform if mesh present
  if (newFeature.mesh) {
    newFeature.mesh.position.copy(position);
    newFeature.mesh.rotation.copy(rotation);
    newFeature.mesh.scale.copy(scale);

    if (newFeature.wireframe) {
      newFeature.wireframe.position.copy(position);
      newFeature.wireframe.rotation.copy(rotation);
      newFeature.wireframe.scale.copy(scale);
    }
  } else if (newFeature instanceof THREE.Group) {
    // For group-based features (shell, pattern, boolean, etc.)
    newFeature.position.copy(position);
    newFeature.rotation.copy(rotation);
    newFeature.scale.copy(scale);
  }

  return newFeature;
}

/**
 * Create a hollow shell from a mesh
 * Approximation: creates scaled-down inner copy and combines with original
 *
 * @param {THREE.Mesh} mesh - Source mesh
 * @param {number} thickness - Wall thickness
 * @param {object} options - Configuration
 *   - material: material preset (default: 'steel')
 * @returns {THREE.Group} Group with shell geometry
 */
export function createShell(mesh, thickness = 0.1, options = {}) {
  const { material = 'steel' } = options;
  const group = new THREE.Group();

  // Outer mesh (original)
  const outerMesh = mesh.clone();
  group.add(outerMesh);

  // Inner mesh (scaled down by thickness ratio)
  const innerMesh = mesh.clone();
  const geometry = innerMesh.geometry.clone();

  // Calculate scale factor based on bounding box
  const bbox = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scaleFactor = (maxDim - thickness * 2) / maxDim;

  geometry.scale(scaleFactor, scaleFactor, scaleFactor);
  geometry.translate(0, 0, 0); // Center scaled geometry

  // Make inner mesh transparent to show hollowness
  const innerMaterial = createMaterial(material, {
    opacity: 0.3,
    transparent: true,
    side: THREE.BackSide
  });
  innerMesh.geometry = geometry;
  innerMesh.material = innerMaterial;

  group.add(innerMesh);

  group.userData = {
    operation: 'shell',
    thickness,
    source: mesh,
    scaleFactor
  };

  return group;
}

/**
 * Create a rectangular or circular pattern of cloned geometry
 *
 * @param {THREE.Mesh} mesh - Source mesh to pattern
 * @param {string} type - 'rect' for rectangular, 'circular' for polar pattern
 * @param {number} count - Number of copies (total with original)
 * @param {number} spacing - Spacing distance between copies
 * @param {object} options - Configuration
 *   - axis: 'X', 'Y', 'Z' for direction (default: 'Z')
 *   - material: material preset (default: 'steel')
 * @returns {THREE.Group} Group with all pattern copies
 */
export function createPattern(mesh, type = 'rect', count = 3, spacing = 1, options = {}) {
  const { axis = 'Z', material = 'steel' } = options;
  const group = new THREE.Group();

  if (type === 'rect') {
    // Rectangular pattern (1D or 2D array)
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    let idx = 0;
    for (let row = 0; row < rows && idx < count; row++) {
      for (let col = 0; col < cols && idx < count; col++) {
        const copy = mesh.clone();

        // Calculate offset based on axis
        let offsetX = 0, offsetY = 0, offsetZ = 0;
        if (axis === 'X') offsetX = col * spacing - ((cols - 1) * spacing) / 2;
        else if (axis === 'Y') offsetY = row * spacing - ((rows - 1) * spacing) / 2;
        else offsetZ = idx * spacing - ((count - 1) * spacing) / 2;

        copy.position.add(new THREE.Vector3(offsetX, offsetY, offsetZ));
        group.add(copy);
        idx++;
      }
    }
  } else if (type === 'circular') {
    // Circular pattern around axis
    const angleStep = (Math.PI * 2) / count;
    const radius = spacing;

    for (let i = 0; i < count; i++) {
      const copy = mesh.clone();
      const angle = i * angleStep;

      let x = 0, y = 0, z = 0;
      if (axis === 'Z') {
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
      } else if (axis === 'X') {
        y = radius * Math.cos(angle);
        z = radius * Math.sin(angle);
      } else if (axis === 'Y') {
        x = radius * Math.cos(angle);
        z = radius * Math.sin(angle);
      }

      copy.position.add(new THREE.Vector3(x, y, z));

      // Rotate to face outward
      const rotAxis = new THREE.Vector3();
      if (axis === 'Z') rotAxis.set(0, 0, 1);
      else if (axis === 'X') rotAxis.set(1, 0, 0);
      else rotAxis.set(0, 1, 0);

      copy.rotateOnWorldAxis(rotAxis, angle);
      group.add(copy);
    }
  }

  group.userData = {
    operation: 'pattern',
    type,
    count,
    spacing,
    axis,
    source: mesh
  };

  return group;
}

/**
 * Extract edges from geometry vertices and indices
 * Returns array of edge objects with v1, v2 vertex indices
 *
 * @param {Float32Array} positions - Position attribute array
 * @param {Uint16Array|Uint32Array} indices - Index array
 * @returns {array} Array of edge objects
 */
export function extractEdgesFromGeometry(positions, indices) {
  const edges = [];
  const edgeSet = new Set();

  if (indices) {
    // Use indices to find edges
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      // Add three edges of triangle
      addEdge(a, b, edges, edgeSet);
      addEdge(b, c, edges, edgeSet);
      addEdge(c, a, edges, edgeSet);
    }
  } else {
    // Use position array directly (assume triangles)
    for (let i = 0; i < positions.length; i += 9) {
      addEdge(i / 3, (i + 3) / 3, edges, edgeSet);
      addEdge((i + 3) / 3, (i + 6) / 3, edges, edgeSet);
      addEdge((i + 6) / 3, i / 3, edges, edgeSet);
    }
  }

  return edges;
}

/**
 * Add an edge to the edge list, avoiding duplicates
 *
 * @param {number} v1 - First vertex index
 * @param {number} v2 - Second vertex index
 * @param {array} edges - Edges array
 * @param {Set} edgeSet - Set for deduplication
 */
function addEdge(v1, v2, edges, edgeSet) {
  const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
  if (!edgeSet.has(key)) {
    edgeSet.add(key);
    edges.push({ v1: Math.min(v1, v2), v2: Math.max(v1, v2) });
  }
}

/**
 * Merge multiple geometries into a single BufferGeometry
 * Combines vertices and faces from all input geometries
 *
 * @param {array} geometries - Array of THREE.BufferGeometry objects
 * @returns {THREE.BufferGeometry|null} Merged geometry or null if merge fails
 */
export function mergeGeometries(geometries) {
  if (!geometries || geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0];

  try {
    const mergedGeometry = new THREE.BufferGeometry();
    let vertexOffset = 0;
    const vertices = [];
    const indices = [];
    const normals = [];

    for (const geometry of geometries) {
      const posAttr = geometry.attributes.position;
      if (!posAttr) continue;

      const positions = posAttr.array;
      const geomIndices = geometry.index?.array || null;

      // Add vertices
      for (let i = 0; i < positions.length; i += 3) {
        vertices.push(positions[i], positions[i + 1], positions[i + 2]);
      }

      // Add indices with offset
      if (geomIndices) {
        for (let i = 0; i < geomIndices.length; i++) {
          indices.push(geomIndices[i] + vertexOffset);
        }
      } else {
        for (let i = 0; i < positions.length / 3; i++) {
          indices.push(i + vertexOffset);
        }
      }

      vertexOffset += positions.length / 3;
    }

    mergedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    if (indices.length > 0) {
      const IndexType = vertices.length / 3 > 65535 ? Uint32Array : Uint16Array;
      mergedGeometry.setIndex(new THREE.BufferAttribute(new IndexType(indices), 1));
    }

    return mergedGeometry;
  } catch (e) {
    console.error('Geometry merge error:', e);
    return null;
  }
}

/**
 * Dispose geometry and material resources safely
 *
 * @param {THREE.Object3D} object - Object to dispose
 */
export function disposeGeometry(object) {
  if (!object) return;

  if (object.geometry) {
    object.geometry.dispose();
  }

  if (object.material) {
    if (Array.isArray(object.material)) {
      object.material.forEach(m => m.dispose());
    } else {
      object.material.dispose();
    }
  }

  if (object.children) {
    object.children.forEach(child => disposeGeometry(child));
  }
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

// Export new operations are already exported above
// Export helper functions are already exported above
