/**
 * advanced-ops.js
 *
 * Advanced 3D modeling operations for cycleCAD:
 * - Sweep: extrude profile along path
 * - Loft: interpolate between profiles
 * - Sheet Metal: bend, flange, tab, slot, unfold
 * - Utilities: spring, thread
 *
 * Uses Three.js r170 ES Modules
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/**
 * Create a Frenet frame at a point along a curve
 * @param {THREE.Vector3} tangent - tangent direction
 * @param {THREE.Vector3} [prevNormal] - previous normal (for continuous frame rotation)
 * @returns {object} {tangent, normal, binormal}
 */
function computeFrenetFrame(tangent, prevNormal = null) {
  const N = new THREE.Vector3();

  if (prevNormal) {
    N.copy(prevNormal);
  } else {
    // Find a vector not parallel to tangent
    if (Math.abs(tangent.x) < 0.9) {
      N.set(1, 0, 0);
    } else {
      N.set(0, 1, 0);
    }
  }

  // Gram-Schmidt: make N perpendicular to tangent
  N.sub(tangent.clone().multiplyScalar(tangent.dot(N)));
  N.normalize();

  // Binormal
  const B = tangent.clone().cross(N).normalize();

  // Recalculate N for orthonormal basis
  N.copy(B).cross(tangent).normalize();

  return { tangent: tangent.normalize(), normal: N, binormal: B };
}

/**
 * Sweep a 2D profile along a 3D path
 * @param {Array<{x:number, y:number}>} profile - 2D profile points (in XY plane)
 * @param {Array<{x:number, y:number, z:number}>|THREE.Curve3} path - 3D path
 * @param {object} options - {segments: 64, closed: false, twist: 0, scale: 1.0, material: Material}
 * @returns {THREE.Mesh} swept mesh
 */
export function createSweep(profile, path, options = {}) {
  const {
    segments = 64,
    closed = false,
    twist = 0,  // degrees per unit length
    scale = 1.0,
    material = null
  } = options;

  // Ensure profile is array of Vector2
  const profileVecs = profile.map(p => new THREE.Vector2(p.x, p.y));

  // Ensure path is array of Vector3
  let pathPoints;
  if (path instanceof THREE.Curve3 || (path.getPointAt && typeof path.getPointAt === 'function')) {
    pathPoints = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      pathPoints.push(path.getPointAt(t));
    }
  } else {
    pathPoints = path.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  const vertices = [];
  const faces = [];
  const profileSegments = profileVecs.length;

  // Compute path length for twist calculation
  let totalPathLength = 0;
  const segmentLengths = [0];
  for (let i = 1; i < pathPoints.length; i++) {
    const segLen = pathPoints[i].distanceTo(pathPoints[i-1]);
    totalPathLength += segLen;
    segmentLengths.push(totalPathLength);
  }

  // Build frames along path and create vertices
  let prevNormal = null;
  for (let i = 0; i < pathPoints.length; i++) {
    const pathPoint = pathPoints[i];

    // Compute tangent
    let tangent = new THREE.Vector3();
    if (i === 0) {
      tangent.subVectors(pathPoints[1], pathPoints[0]);
    } else if (i === pathPoints.length - 1) {
      tangent.subVectors(pathPoints[i], pathPoints[i-1]);
    } else {
      tangent.subVectors(pathPoints[i+1], pathPoints[i-1]).multiplyScalar(0.5);
    }
    tangent.normalize();

    // Compute Frenet frame
    const frame = computeFrenetFrame(tangent, prevNormal);
    prevNormal = frame.normal;

    // Twist rotation
    const twistAngle = (twist / 360) * segmentLengths[i];
    const twistQuat = new THREE.Quaternion();
    twistQuat.setFromAxisAngle(frame.tangent, twistAngle);

    // Scale interpolation
    const scaleT = i / (pathPoints.length - 1);
    const currentScale = 1.0 + (scale - 1.0) * scaleT;

    // Create profile vertices at this path point
    for (let j = 0; j < profileSegments; j++) {
      const profilePt = profileVecs[j];

      // Apply twist
      let pt2D = profilePt.clone();
      const rotZ = new THREE.Vector2(
        Math.cos(twistAngle) * pt2D.x - Math.sin(twistAngle) * pt2D.y,
        Math.sin(twistAngle) * pt2D.x + Math.cos(twistAngle) * pt2D.y
      );
      pt2D = rotZ;

      // Apply scale
      pt2D.multiplyScalar(currentScale);

      // Convert 2D to 3D using Frenet frame
      const pt3D = pathPoint.clone();
      pt3D.addScaledVector(frame.normal, pt2D.x);
      pt3D.addScaledVector(frame.binormal, pt2D.y);

      vertices.push(pt3D.x, pt3D.y, pt3D.z);
    }
  }

  // Create faces
  for (let i = 0; i < pathPoints.length - 1; i++) {
    for (let j = 0; j < profileSegments; j++) {
      const nextJ = (j + 1) % profileSegments;

      const v0 = i * profileSegments + j;
      const v1 = i * profileSegments + nextJ;
      const v2 = (i + 1) * profileSegments + j;
      const v3 = (i + 1) * profileSegments + nextJ;

      // Two triangles per quad
      faces.push(v0, v2, v1);
      faces.push(v1, v2, v3);
    }
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces), 1));
  geometry.computeVertexNormals();

  const finalMaterial = material || new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.6,
    roughness: 0.4
  });

  return new THREE.Mesh(geometry, finalMaterial);
}

/**
 * Loft between multiple 2D profiles at different 3D positions
 * @param {Array<{points: Array<{x,y}>, position: {x,y,z}, rotation: {x,y,z}, scale: number}>} profiles
 * @param {object} options - {segments: 32, closed: false, material: Material}
 * @returns {THREE.Mesh}
 */
export function createLoft(profiles, options = {}) {
  const {
    segments = 32,
    closed = false,
    material = null
  } = options;

  if (profiles.length < 2) {
    throw new Error('Loft requires at least 2 profiles');
  }

  // Find max profile length
  const maxLength = Math.max(...profiles.map(p => p.points.length));

  // Resample all profiles to same length using spline interpolation
  const resampledProfiles = profiles.map((profile, idx) => {
    const origPoints = profile.points.map(p => new THREE.Vector2(p.x, p.y));

    if (origPoints.length === maxLength) {
      return {
        points: origPoints,
        position: new THREE.Vector3(profile.position.x, profile.position.y, profile.position.z),
        rotation: new THREE.Euler(profile.rotation?.x || 0, profile.rotation?.y || 0, profile.rotation?.z || 0),
        scale: profile.scale || 1.0
      };
    }

    // Linear resampling for simplicity
    const resampled = [];
    for (let i = 0; i < maxLength; i++) {
      const t = i / (maxLength - 1);
      const srcT = t * (origPoints.length - 1);
      const srcIdx = Math.floor(srcT);
      const blend = srcT - srcIdx;

      if (srcIdx >= origPoints.length - 1) {
        resampled.push(origPoints[origPoints.length - 1].clone());
      } else {
        const p0 = origPoints[srcIdx];
        const p1 = origPoints[srcIdx + 1];
        resampled.push(p0.clone().lerp(p1, blend));
      }
    }

    return {
      points: resampled,
      position: new THREE.Vector3(profile.position.x, profile.position.y, profile.position.z),
      rotation: new THREE.Euler(profile.rotation?.x || 0, profile.rotation?.y || 0, profile.rotation?.z || 0),
      scale: profile.scale || 1.0
    };
  });

  const vertices = [];
  const faces = [];

  // Create vertices for each profile
  for (let profileIdx = 0; profileIdx < resampledProfiles.length; profileIdx++) {
    const prof = resampledProfiles[profileIdx];
    const rotMat = new THREE.Matrix4().makeRotationFromEuler(prof.rotation);

    for (let pointIdx = 0; pointIdx < prof.points.length; pointIdx++) {
      const pt2D = prof.points[pointIdx];

      // Scale
      const scaled = pt2D.clone().multiplyScalar(prof.scale);

      // Rotate
      const pt3D = new THREE.Vector3(scaled.x, scaled.y, 0);
      pt3D.applyMatrix4(rotMat);

      // Translate
      pt3D.add(prof.position);

      vertices.push(pt3D.x, pt3D.y, pt3D.z);
    }
  }

  // Create faces between profiles (linear interpolation)
  for (let profileIdx = 0; profileIdx < resampledProfiles.length - 1; profileIdx++) {
    const pointCount = resampledProfiles[profileIdx].points.length;

    for (let pointIdx = 0; pointIdx < pointCount; pointIdx++) {
      const nextPoint = (pointIdx + 1) % pointCount;

      const v0 = profileIdx * pointCount + pointIdx;
      const v1 = profileIdx * pointCount + nextPoint;
      const v2 = (profileIdx + 1) * pointCount + pointIdx;
      const v3 = (profileIdx + 1) * pointCount + nextPoint;

      // Two triangles per quad
      faces.push(v0, v2, v1);
      faces.push(v1, v2, v3);
    }
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces), 1));
  geometry.computeVertexNormals();

  const finalMaterial = material || new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    metalness: 0.5,
    roughness: 0.5,
    side: THREE.DoubleSide
  });

  return new THREE.Mesh(geometry, finalMaterial);
}

/**
 * Bend a flat plate along a line by a given angle
 * @param {THREE.Mesh} mesh - flat plate mesh
 * @param {{start: {x,y,z}, end: {x,y,z}}} bendLine - bend axis
 * @param {number} angle - bend angle in degrees
 * @param {number} radius - inner bend radius
 * @param {object} options - {kFactor: 0.44, segments: 16, material: Material}
 * @returns {THREE.Mesh} bent mesh
 */
export function createBend(mesh, bendLine, angle, radius, options = {}) {
  const {
    kFactor = 0.44,
    segments = 16,
    material = null
  } = options;

  const bendStart = new THREE.Vector3(bendLine.start.x, bendLine.start.y, bendLine.start.z);
  const bendEnd = new THREE.Vector3(bendLine.end.x, bendLine.end.y, bendLine.end.z);
  const bendAxis = bendEnd.clone().sub(bendStart).normalize();

  // Get original geometry
  const geometry = mesh.geometry.clone();
  const positions = geometry.attributes.position.array;
  const newPositions = new Float32Array(positions.length);
  newPositions.set(positions);

  const angleRad = (angle / 360) * Math.PI * 2;
  const bendRadius = radius + kFactor * geometry.boundingBox.getSize(new THREE.Vector3()).z;

  // Transform vertices
  for (let i = 0; i < positions.length; i += 3) {
    const vertex = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);

    // Project vertex onto bend line
    const toVertex = vertex.clone().sub(bendStart);
    const projDist = toVertex.dot(bendAxis);
    const projPoint = bendStart.clone().addScaledVector(bendAxis, projDist);

    // Distance from bend line
    const distFromLine = vertex.distanceTo(projPoint);

    // Perpendicular direction (in plane perpendicular to bend axis)
    const perpDir = vertex.clone().sub(projPoint);
    if (perpDir.length() > 0.001) {
      perpDir.normalize();

      // Apply bend: rotate around bend line
      const bendQuat = new THREE.Quaternion();
      bendQuat.setFromAxisAngle(bendAxis, angleRad * (distFromLine / (bendRadius + geometry.boundingBox.getSize(new THREE.Vector3()).z)));

      const offset = perpDir.multiplyScalar(bendRadius);
      offset.applyQuaternion(bendQuat);
      offset.addScaledVector(bendAxis, projDist);

      const newVertex = projPoint.clone().add(offset);
      newPositions[i] = newVertex.x;
      newPositions[i+1] = newVertex.y;
      newPositions[i+2] = newVertex.z;
    }
  }

  geometry.attributes.position.array = newPositions;
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();

  const finalMaterial = material || new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.6,
    roughness: 0.4
  });

  return new THREE.Mesh(geometry, finalMaterial);
}

/**
 * Add a flange to an edge of a mesh
 * @param {THREE.Mesh} mesh - base mesh
 * @param {{start: {x,y,z}, end: {x,y,z}}} edge - edge to flange
 * @param {number} length - flange length
 * @param {number} angle - flange angle (90 default)
 * @param {object} options - {segments: 8, material: Material}
 * @returns {THREE.Mesh} mesh with flange
 */
export function createFlange(mesh, edge, length, angle = 90, options = {}) {
  const { segments = 8, material = null } = options;

  const edgeStart = new THREE.Vector3(edge.start.x, edge.start.y, edge.start.z);
  const edgeEnd = new THREE.Vector3(edge.end.x, edge.end.y, edge.end.z);
  const edgeDir = edgeEnd.clone().sub(edgeStart).normalize();
  const edgeLen = edgeEnd.distanceTo(edgeStart);

  // Find perpendicular direction (guess: prefer Z if edge not parallel to Z)
  let perpDir = new THREE.Vector3(0, 0, 1);
  if (Math.abs(edgeDir.dot(perpDir)) > 0.9) {
    perpDir = new THREE.Vector3(1, 0, 0);
  }
  perpDir.cross(edgeDir).normalize();

  // Create flange geometry
  const vertices = [];
  const faces = [];

  // Bottom edge (on mesh)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = edgeStart.clone().addScaledVector(edgeDir, edgeLen * t);
    vertices.push(pt.x, pt.y, pt.z);
  }

  // Top edge (flange edge)
  const angleRad = (angle / 360) * Math.PI * 2;
  const flangeDir = perpDir.clone().applyAxisAngle(edgeDir, angleRad).multiplyScalar(length);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = edgeStart.clone().addScaledVector(edgeDir, edgeLen * t).add(flangeDir);
    vertices.push(pt.x, pt.y, pt.z);
  }

  // Create quad faces
  for (let i = 0; i < segments; i++) {
    const v0 = i;
    const v1 = i + 1;
    const v2 = (segments + 1) + i;
    const v3 = (segments + 1) + i + 1;

    faces.push(v0, v2, v1);
    faces.push(v1, v2, v3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces), 1));
  geometry.computeVertexNormals();

  const finalMaterial = material || new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.6,
    roughness: 0.4
  });

  const flangeMesh = new THREE.Mesh(geometry, finalMaterial);

  // Merge with original
  const group = new THREE.Group();
  group.add(mesh);
  group.add(flangeMesh);

  return group;
}

/**
 * Add a tab for assembly to an edge
 * @param {THREE.Mesh} mesh - base mesh
 * @param {{start: {x,y,z}, end: {x,y,z}}} edge - edge to add tab to
 * @param {number} width - tab width
 * @param {number} depth - tab depth (protrusion)
 * @param {object} options - {segments: 4, material: Material}
 * @returns {THREE.Mesh}
 */
export function createTab(mesh, edge, width, depth, options = {}) {
  const { segments = 4, material = null } = options;

  const edgeStart = new THREE.Vector3(edge.start.x, edge.start.y, edge.start.z);
  const edgeEnd = new THREE.Vector3(edge.end.x, edge.end.y, edge.end.z);
  const edgeDir = edgeEnd.clone().sub(edgeStart).normalize();

  const perpDir = new THREE.Vector3(0, 0, 1);
  if (Math.abs(edgeDir.dot(perpDir)) > 0.9) {
    perpDir.set(1, 0, 0);
  }
  perpDir.cross(edgeDir).normalize();

  const vertices = [];
  const faces = [];

  // Tab base (on edge)
  const halfWidth = width / 2;
  const pt0 = edgeStart.clone().addScaledVector(perpDir, -halfWidth);
  const pt1 = edgeStart.clone().addScaledVector(perpDir, halfWidth);
  const pt2 = edgeEnd.clone().addScaledVector(perpDir, halfWidth);
  const pt3 = edgeEnd.clone().addScaledVector(perpDir, -halfWidth);

  vertices.push(pt0.x, pt0.y, pt0.z);
  vertices.push(pt1.x, pt1.y, pt1.z);
  vertices.push(pt2.x, pt2.y, pt2.z);
  vertices.push(pt3.x, pt3.y, pt3.z);

  // Tab protrusion
  const depthDir = perpDir.clone().cross(edgeDir);
  const pt4 = pt0.clone().addScaledVector(depthDir, depth);
  const pt5 = pt1.clone().addScaledVector(depthDir, depth);
  const pt6 = pt2.clone().addScaledVector(depthDir, depth);
  const pt7 = pt3.clone().addScaledVector(depthDir, depth);

  vertices.push(pt4.x, pt4.y, pt4.z);
  vertices.push(pt5.x, pt5.y, pt5.z);
  vertices.push(pt6.x, pt6.y, pt6.z);
  vertices.push(pt7.x, pt7.y, pt7.z);

  // Base quad
  faces.push(0, 1, 2);
  faces.push(0, 2, 3);

  // Side faces
  faces.push(0, 4, 5, 1);  // Left
  faces.push(1, 5, 6, 2);  // Top
  faces.push(2, 6, 7, 3);  // Right
  faces.push(3, 7, 4, 0);  // Bottom

  // Protrusion face
  faces.push(4, 7, 6, 5);

  // Convert quads to triangles
  const triangles = [];
  for (const face of faces) {
    if (Array.isArray(face)) {
      for (let i = 0; i < face.length - 2; i++) {
        triangles.push(face[0], face[i+1], face[i+2]);
      }
    } else {
      triangles.push(face);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(triangles), 1));
  geometry.computeVertexNormals();

  const finalMaterial = material || new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.6,
    roughness: 0.4
  });

  return new THREE.Mesh(geometry, finalMaterial);
}

/**
 * Cut a slot in a mesh at a given position
 * @param {THREE.Mesh} mesh - base mesh
 * @param {{x:number, y:number, z:number}} position - slot center
 * @param {number} width - slot width
 * @param {number} depth - slot depth
 * @param {object} options - {length: 10, axis: 'x', material: Material}
 * @returns {THREE.Mesh} modified mesh
 */
export function createSlot(mesh, position, width, depth, options = {}) {
  const { length = 10, axis = 'x', material = null } = options;

  // For now, create visual slot representation
  // Full boolean operation would require CSG library

  const slotGeom = new THREE.BoxGeometry(
    axis === 'x' ? length : width,
    axis === 'y' ? length : depth,
    axis === 'z' ? length : width
  );

  const slotPos = new THREE.Vector3(position.x, position.y, position.z);

  const slotMat = material || new THREE.MeshStandardMaterial({
    color: 0x333333,
    metalness: 0.2,
    roughness: 0.8
  });

  const slotMesh = new THREE.Mesh(slotGeom, slotMat);
  slotMesh.position.copy(slotPos);

  // Return group for now (real implementation would use CSG)
  const group = new THREE.Group();
  group.add(mesh);
  group.add(slotMesh);

  return group;
}

/**
 * Compute flat pattern from bent sheet metal
 * @param {THREE.Mesh} mesh - bent sheet mesh
 * @param {Array<{bendLine: {start, end}, angle: number, radius: number}>} bends - bend definitions
 * @param {object} options - {kFactor: 0.44, material: Material}
 * @returns {{flatMesh: THREE.Mesh, bendLines: THREE.LineSegments}}
 */
export function unfoldSheetMetal(mesh, bends, options = {}) {
  const { kFactor = 0.44, material = null } = options;

  const flatGeom = mesh.geometry.clone();
  const flatPositions = flatGeom.attributes.position.array.slice();

  // Simple unfolding: translate back by calculated arc length
  let cumulativeOffset = 0;
  for (const bend of bends) {
    const thickness = mesh.geometry.boundingBox?.getSize(new THREE.Vector3()).z || 1;
    const bendRadius = bend.radius + kFactor * thickness;
    const angleRad = (bend.angle / 360) * Math.PI * 2;
    const arcLen = bendRadius * angleRad;
    cumulativeOffset += arcLen;
  }

  // Offset all vertices along primary axis
  for (let i = 0; i < flatPositions.length; i += 3) {
    flatPositions[i] -= cumulativeOffset;
  }

  flatGeom.attributes.position.array = flatPositions;
  flatGeom.attributes.position.needsUpdate = true;
  flatGeom.computeVertexNormals();

  const flatMaterial = material || new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    metalness: 0.4,
    roughness: 0.6
  });

  const flatMesh = new THREE.Mesh(flatGeom, flatMaterial);

  // Create bend lines
  const bendLineVertices = [];
  let offset = 0;
  for (const bend of bends) {
    const thickness = mesh.geometry.boundingBox?.getSize(new THREE.Vector3()).z || 1;
    const bendRadius = bend.radius + kFactor * thickness;
    const angleRad = (bend.angle / 360) * Math.PI * 2;
    const arcLen = bendRadius * angleRad;

    // Bend line at current offset
    const start = new THREE.Vector3(offset, -1, 0);
    const end = new THREE.Vector3(offset, 1, 0);
    bendLineVertices.push(start.x, start.y, start.z, end.x, end.y, end.z);

    offset += arcLen;
  }

  const bendLineGeom = new THREE.BufferGeometry();
  bendLineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bendLineVertices), 3));

  const bendLineMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
  const bendLines = new THREE.LineSegments(bendLineGeom, bendLineMat);

  return { flatMesh, bendLines };
}

/**
 * Create a helical spring using sweep
 * @param {number} radius - outer radius
 * @param {number} wireRadius - wire/thread radius
 * @param {number} height - spring height
 * @param {number} turns - number of turns
 * @param {object} options - {material: Material}
 * @returns {THREE.Mesh}
 */
export function createSpring(radius, wireRadius, height, turns, options = {}) {
  const { material = null } = options;

  // Create helix path
  const segments = Math.max(64, turns * 16);
  const pathPoints = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * turns * Math.PI * 2;
    const z = t * height;
    pathPoints.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: z
    });
  }

  // Wire cross-section (circle)
  const wireSegments = 16;
  const profile = [];
  for (let i = 0; i < wireSegments; i++) {
    const angle = (i / wireSegments) * Math.PI * 2;
    profile.push({
      x: Math.cos(angle) * wireRadius,
      y: Math.sin(angle) * wireRadius
    });
  }

  // Use sweep to create spring
  return createSweep(profile, pathPoints, {
    segments: segments,
    closed: true,
    material: material || new THREE.MeshStandardMaterial({
      color: 0xddaa00,
      metalness: 0.8,
      roughness: 0.3
    })
  });
}

/**
 * Create a screw thread geometry
 * @param {number} outerRadius - outer radius
 * @param {number} innerRadius - inner radius (core)
 * @param {number} pitch - thread pitch (distance per turn)
 * @param {number} length - thread length
 * @param {object} options - {turns: 4, material: Material}
 * @returns {THREE.Mesh}
 */
export function createThread(outerRadius, innerRadius, pitch, length, options = {}) {
  const { turns = 4, material = null } = options;

  const pathPoints = [];
  const segments = Math.max(64, turns * 16);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * turns * Math.PI * 2;
    const z = t * length;
    pathPoints.push({
      x: 0,
      y: 0,
      z: z
    });
  }

  // Thread profile (triangular cross-section)
  const profile = [];
  const threadDepth = (outerRadius - innerRadius) / 2;
  const halfPitch = pitch / 2;

  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const r = innerRadius + Math.sin(angle * turns * Math.PI * 2) * threadDepth;
    profile.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r
    });
  }

  // Create helix path
  const helixPath = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * turns * Math.PI * 2;
    const z = t * length;
    helixPath.push({
      x: Math.cos(angle) * outerRadius,
      y: Math.sin(angle) * outerRadius,
      z: z
    });
  }

  return createSweep(profile, helixPath, {
    segments: segments,
    closed: true,
    twist: (turns * 360) / length,
    material: material || new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.7,
      roughness: 0.4
    })
  });
}

export default {
  createSweep,
  createLoft,
  createBend,
  createFlange,
  createTab,
  createSlot,
  unfoldSheetMetal,
  createSpring,
  createThread
};
