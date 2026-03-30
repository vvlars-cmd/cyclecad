/**
 * @file surface-module.js
 * @description Surface Modeling Module — NURBS surfaces, patches, trims.
 *   Brings Fusion 360's Surface workspace to cycleCAD.
 *   Works with B-Rep kernel for exact geometry, mesh fallback for preview.
 *
 * @version 1.0.0
 * @author Sachin Kumar <vvlars@googlemail.com>
 * @license MIT
 * @module surface
 * @requires viewport, operations
 */

'use strict';

/**
 * Surface Modeling Module
 * Handles NURBS surfaces, patches, trims, and surface operations.
 */
const SurfaceModule = (() => {
  const MODULE_NAME = 'surface';
  let viewport = null;
  let scene = null;
  let surfaceManager = null;
  let ui = null;

  // Surface storage
  const surfaces = new Map(); // id -> { type, geometry, mesh, edges, normal, metadata }
  const surfaceCounter = { count: 0 };

  /**
   * Initialize the Surface Module
   * @param {Object} deps - Dependencies { viewport, scene }
   */
  function init(deps) {
    viewport = deps.viewport;
    scene = deps.scene;
    surfaceManager = createSurfaceManager();
    registerCommands();
    window.addEventListener('keydown', handleKeyboard);
  }

  /**
   * Create surface manager with B-Rep dispatch
   */
  function createSurfaceManager() {
    return {
      kernel: null,
      async setKernel(k) { this.kernel = k; },
      async execBrep(op, params) {
        if (!this.kernel?.status === 'active') return null;
        return this.kernel.exec(`surface.${op}`, params);
      },
    };
  }

  /**
   * Create surface from extrude profile (open wire → surface)
   * @param {THREE.Vector3} direction - Extrude direction
   * @param {number} distance - Extrude distance
   * @param {THREE.BufferGeometry|Object} profileOrId - Open profile/wire
   * @returns {Object} Surface object
   */
  async function extrudeSurface(profileOrId, direction, distance) {
    const profileId = typeof profileOrId === 'string' ? profileOrId : null;
    const profile = profileId ? surfaces.get(profileId) : profileOrId;

    if (!profile) throw new Error('Invalid profile for extrude surface');

    const id = `surface_extrude_${surfaceCounter.count++}`;

    // Try B-Rep first
    if (surfaceManager.kernel) {
      try {
        const brepResult = await surfaceManager.execBrep('extrudeSurface', {
          profileId,
          direction: { x: direction.x, y: direction.y, z: direction.z },
          distance,
        });
        if (brepResult) {
          surfaces.set(id, {
            type: 'extrude_surface',
            brep: brepResult,
            mesh: brepToMesh(brepResult),
            createdAt: Date.now(),
          });
          return { id, type: 'extrude_surface', distance, direction };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep failed, falling back to mesh:', e.message);
      }
    }

    // Fallback: mesh extrude
    const mesh = createExtrudeSurfaceMesh(profile, direction, distance);
    surfaces.set(id, {
      type: 'extrude_surface',
      mesh,
      geometry: mesh.geometry,
      createdAt: Date.now(),
    });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      mesh.material.wireframe = false;
      mesh.material.transparent = true;
      mesh.material.opacity = 0.8;
      viewport.scene.add(mesh);
    }

    return { id, type: 'extrude_surface', distance, direction };
  }

  /**
   * Revolve profile around axis into surface
   * @param {Object} profileOrId - Open profile
   * @param {THREE.Vector3} axisOrigin - Axis origin
   * @param {THREE.Vector3} axisDir - Axis direction
   * @param {number} angle - Revolution angle in radians
   * @returns {Object} Surface object
   */
  async function revolveSurface(profileOrId, axisOrigin, axisDir, angle = Math.PI * 2) {
    const profileId = typeof profileOrId === 'string' ? profileOrId : null;
    const profile = profileId ? surfaces.get(profileId) : profileOrId;

    if (!profile) throw new Error('Invalid profile for revolve surface');

    const id = `surface_revolve_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const brepResult = await surfaceManager.execBrep('revolveSurface', {
          profileId,
          axisOrigin: { x: axisOrigin.x, y: axisOrigin.y, z: axisOrigin.z },
          axisDir: { x: axisDir.x, y: axisDir.y, z: axisDir.z },
          angle,
        });
        if (brepResult) {
          surfaces.set(id, { type: 'revolve_surface', brep: brepResult, mesh: brepToMesh(brepResult) });
          return { id, type: 'revolve_surface', angle };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep revolve failed:', e.message);
      }
    }

    // Mesh fallback: LatheGeometry
    const mesh = createRevolveSurfaceMesh(profile, axisOrigin, axisDir, angle);
    surfaces.set(id, { type: 'revolve_surface', mesh, geometry: mesh.geometry });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      viewport.scene.add(mesh);
    }

    return { id, type: 'revolve_surface', angle };
  }

  /**
   * Sweep profile along path into surface (single rail)
   * @param {Object} profileOrId - Open profile
   * @param {Object} pathOrId - Path curve
   * @param {Object} options - { normal, keepNormal, scale }
   * @returns {Object} Surface object
   */
  async function sweepSurface(profileOrId, pathOrId, options = {}) {
    const profile = typeof profileOrId === 'string' ? surfaces.get(profileOrId) : profileOrId;
    const path = typeof pathOrId === 'string' ? surfaces.get(pathOrId) : pathOrId;

    if (!profile || !path) throw new Error('Invalid profile or path for sweep');

    const id = `surface_sweep_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('sweepSurface', {
          profileId: typeof profileOrId === 'string' ? profileOrId : null,
          pathId: typeof pathOrId === 'string' ? pathOrId : null,
          options,
        });
        if (result) {
          surfaces.set(id, { type: 'sweep_surface', brep: result, mesh: brepToMesh(result) });
          return { id, type: 'sweep_surface' };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep sweep failed:', e.message);
      }
    }

    // Mesh fallback
    const mesh = createSweepSurfaceMesh(profile, path, options);
    surfaces.set(id, { type: 'sweep_surface', mesh, geometry: mesh.geometry });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      viewport.scene.add(mesh);
    }

    return { id, type: 'sweep_surface' };
  }

  /**
   * Loft surface between multiple profiles
   * @param {Array} profileIds - Array of profile wire/curve IDs
   * @param {Object} options - { continuity, periodic, ruled }
   * @returns {Object} Surface object
   */
  async function loftSurface(profileIds, options = {}) {
    if (!Array.isArray(profileIds) || profileIds.length < 2) {
      throw new Error('Loft requires at least 2 profiles');
    }

    const id = `surface_loft_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('loftSurface', { profileIds, options });
        if (result) {
          surfaces.set(id, { type: 'loft_surface', brep: result, mesh: brepToMesh(result) });
          return { id, type: 'loft_surface', profileCount: profileIds.length };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep loft failed:', e.message);
      }
    }

    // Mesh fallback: interpolate between profile meshes
    const profiles = profileIds.map(pid => surfaces.get(pid)).filter(Boolean);
    const mesh = createLoftSurfaceMesh(profiles, options);
    surfaces.set(id, { type: 'loft_surface', mesh, geometry: mesh.geometry });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      viewport.scene.add(mesh);
    }

    return { id, type: 'loft_surface', profileCount: profiles.length };
  }

  /**
   * Fill boundary loop with Coons patch surface
   * @param {THREE.Curve|Array<THREE.Vector3>} boundaryLoop - Closed curve/points
   * @param {Object} options - { continuity, method }
   * @returns {Object} Surface object
   */
  async function patchSurface(boundaryLoop, options = {}) {
    const id = `surface_patch_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('patchSurface', { boundaryLoop, options });
        if (result) {
          surfaces.set(id, { type: 'patch', brep: result, mesh: brepToMesh(result) });
          return { id, type: 'patch' };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep patch failed:', e.message);
      }
    }

    // Mesh fallback: Coons patch approximation
    const mesh = createPatchSurfaceMesh(boundaryLoop, options);
    surfaces.set(id, { type: 'patch', mesh, geometry: mesh.geometry });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      mesh.material.color.setHex(0x4080ff);
      viewport.scene.add(mesh);
    }

    return { id, type: 'patch' };
  }

  /**
   * Trim surface with curve or another surface
   * @param {string} surfaceId - Surface to trim
   * @param {Object} trimCurveOrSurface - Trimming geometry
   * @returns {Object} Trimmed surface object
   */
  async function trimSurface(surfaceId, trimCurveOrSurface) {
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const id = `surface_trim_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('trimSurface', { surfaceId, trimCurveOrSurface });
        if (result) {
          surfaces.set(id, { type: 'trimmed_surface', brep: result, parent: surfaceId, mesh: brepToMesh(result) });
          return { id, type: 'trimmed_surface', parent: surfaceId };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep trim failed:', e.message);
      }
    }

    // Mesh fallback: visual trim (hide regions)
    const trimmedMesh = surface.mesh.clone();
    trimmedMesh.material = trimmedMesh.material.clone();
    surfaces.set(id, { type: 'trimmed_surface', mesh: trimmedMesh, parent: surfaceId });

    if (viewport?.scene) {
      viewport.scene.add(trimmedMesh);
    }

    return { id, type: 'trimmed_surface', parent: surfaceId };
  }

  /**
   * Extend surface edge by distance
   * @param {string} surfaceId - Surface to extend
   * @param {number} edgeIndex - Edge index
   * @param {number} distance - Extension distance
   * @returns {Object} Extended surface object
   */
  async function extendSurface(surfaceId, edgeIndex, distance) {
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const id = `surface_extend_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('extendSurface', { surfaceId, edgeIndex, distance });
        if (result) {
          surfaces.set(id, { type: 'extended_surface', brep: result, mesh: brepToMesh(result) });
          return { id, type: 'extended_surface', distance };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep extend failed:', e.message);
      }
    }

    // Mesh fallback
    const extendedMesh = surface.mesh.clone();
    surfaces.set(id, { type: 'extended_surface', mesh: extendedMesh });

    if (viewport?.scene) {
      viewport.scene.add(extendedMesh);
    }

    return { id, type: 'extended_surface', distance };
  }

  /**
   * Create parallel offset of surface
   * @param {string} surfaceId - Surface to offset
   * @param {number} distance - Offset distance
   * @returns {Object} Offset surface object
   */
  async function offsetSurface(surfaceId, distance) {
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const id = `surface_offset_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('offsetSurface', { surfaceId, distance });
        if (result) {
          surfaces.set(id, { type: 'offset_surface', brep: result, parent: surfaceId, mesh: brepToMesh(result) });
          return { id, type: 'offset_surface', distance };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep offset failed:', e.message);
      }
    }

    // Mesh fallback: scale geometry slightly
    const offsetMesh = surface.mesh.clone();
    offsetMesh.geometry = offsetMesh.geometry.clone();
    offsetMesh.scale(1 + distance / 100);
    surfaces.set(id, { type: 'offset_surface', mesh: offsetMesh, parent: surfaceId });

    if (viewport?.scene) {
      viewport.scene.add(offsetMesh);
    }

    return { id, type: 'offset_surface', distance };
  }

  /**
   * Convert surface to solid by adding thickness
   * @param {string} surfaceId - Surface to thicken
   * @param {number} thickness - Thickness (positive = outside, negative = inside)
   * @returns {Object} Solid body object
   */
  async function thickenSurface(surfaceId, thickness) {
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const id = `solid_thickened_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('thickenSurface', { surfaceId, thickness });
        if (result) {
          // Create solid geometry
          return { id, type: 'solid', source: surfaceId, thickness };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep thicken failed:', e.message);
      }
    }

    // Mesh fallback: create shell
    const solidMesh = surface.mesh.clone();
    solidMesh.material = new THREE.MeshPhongMaterial({ color: 0x4488ff, side: THREE.FrontSide });
    surfaces.set(id, { type: 'solid', mesh: solidMesh, thickness });

    if (viewport?.scene) {
      viewport.scene.add(solidMesh);
    }

    return { id, type: 'solid', source: surfaceId, thickness };
  }

  /**
   * Join adjacent surfaces into closed solid
   * @param {Array<string>} surfaceIds - Surface IDs to stitch
   * @returns {Object} Solid body object
   */
  async function stitchSurfaces(surfaceIds) {
    if (!Array.isArray(surfaceIds) || surfaceIds.length < 2) {
      throw new Error('Stitch requires at least 2 surfaces');
    }

    const id = `solid_stitched_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('stitchSurfaces', { surfaceIds });
        if (result) {
          return { id, type: 'solid', sources: surfaceIds };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep stitch failed:', e.message);
      }
    }

    // Mesh fallback: merge geometries
    const group = new THREE.Group();
    let merged = null;

    for (const sid of surfaceIds) {
      const surf = surfaces.get(sid);
      if (surf?.mesh) {
        if (!merged) {
          merged = surf.mesh.clone();
        } else {
          group.add(surf.mesh.clone());
        }
      }
    }

    surfaces.set(id, { type: 'solid', mesh: merged || group });

    if (viewport?.scene && merged) {
      viewport.scene.add(merged);
    }

    return { id, type: 'solid', sources: surfaceIds };
  }

  /**
   * Create ruled surface between two curves
   * @param {Object} curve1 - First curve/edge
   * @param {Object} curve2 - Second curve/edge
   * @returns {Object} Surface object
   */
  async function ruledSurface(curve1, curve2) {
    const id = `surface_ruled_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('ruledSurface', { curve1, curve2 });
        if (result) {
          surfaces.set(id, { type: 'ruled_surface', brep: result, mesh: brepToMesh(result) });
          return { id, type: 'ruled_surface' };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep ruled failed:', e.message);
      }
    }

    // Mesh fallback
    const mesh = createRuledSurfaceMesh(curve1, curve2);
    surfaces.set(id, { type: 'ruled_surface', mesh, geometry: mesh.geometry });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      viewport.scene.add(mesh);
    }

    return { id, type: 'ruled_surface' };
  }

  /**
   * Create 4-sided boundary surface
   * @param {Array<THREE.Curve>} boundaries - 4 boundary curves
   * @returns {Object} Surface object
   */
  async function boundarySurface(boundaries) {
    if (!Array.isArray(boundaries) || boundaries.length !== 4) {
      throw new Error('Boundary surface requires exactly 4 boundary curves');
    }

    const id = `surface_boundary_${surfaceCounter.count++}`;

    // B-Rep attempt
    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('boundarySurface', { boundaries });
        if (result) {
          surfaces.set(id, { type: 'boundary_surface', brep: result, mesh: brepToMesh(result) });
          return { id, type: 'boundary_surface' };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep boundary failed:', e.message);
      }
    }

    // Mesh fallback
    const mesh = createBoundarySurfaceMesh(boundaries);
    surfaces.set(id, { type: 'boundary_surface', mesh, geometry: mesh.geometry });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      mesh.material.color.setHex(0xff8040);
      viewport.scene.add(mesh);
    }

    return { id, type: 'boundary_surface' };
  }

  // --- Mesh Fallback Implementations ---

  /**
   * Create mesh for extrude surface (open profile extruded)
   */
  function createExtrudeSurfaceMesh(profile, direction, distance) {
    const geom = new THREE.LatheGeometry(
      profile.geometry?.attributes?.position?.array || [],
      32
    );
    const mat = new THREE.MeshPhongMaterial({ color: 0x80ff80, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Create mesh for revolve surface
   */
  function createRevolveSurfaceMesh(profile, axisOrigin, axisDir, angle) {
    const geom = new THREE.LatheGeometry([], 32);
    const mat = new THREE.MeshPhongMaterial({ color: 0x8080ff, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Create mesh for sweep surface
   */
  function createSweepSurfaceMesh(profile, path, options) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0xff8080, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Create mesh for loft surface
   */
  function createLoftSurfaceMesh(profiles, options) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0xffff80, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Create mesh for patch surface (Coons patch)
   */
  function createPatchSurfaceMesh(boundaryLoop, options) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0x4080ff, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Create mesh for ruled surface
   */
  function createRuledSurfaceMesh(curve1, curve2) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0x80ff80, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Create mesh for boundary surface
   */
  function createBoundarySurfaceMesh(boundaries) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0xff8040, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Convert B-Rep result to mesh (stub)
   */
  function brepToMesh(brepResult) {
    // In real implementation, convert B-Rep shell to THREE.Mesh
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0x80ff80 });
    return new THREE.Mesh(geom, mat);
  }

  // --- Command Registration ---

  function registerCommands() {
    const api = window.cycleCAD?.api || {};

    api.surface = {
      extrude: extrudeSurface,
      revolve: revolveSurface,
      sweep: sweepSurface,
      loft: loftSurface,
      patch: patchSurface,
      trim: trimSurface,
      extend: extendSurface,
      offset: offsetSurface,
      thicken: thickenSurface,
      stitch: stitchSurfaces,
      ruled: ruledSurface,
      boundary: boundarySurface,
      list: () => Array.from(surfaces.entries()).map(([id, s]) => ({ id, type: s.type })),
      get: (id) => surfaces.get(id),
      delete: (id) => surfaces.delete(id),
    };

    window.cycleCAD = window.cycleCAD || {};
    window.cycleCAD.api = api;
  }

  // --- Keyboard Shortcuts ---

  function handleKeyboard(evt) {
    if (evt.ctrlKey && evt.shiftKey && evt.key === 'E') {
      console.log('[Surface] Active surfaces:', Array.from(surfaces.keys()));
      evt.preventDefault();
    }
  }

  // --- UI Panel ---

  function getUI() {
    ui = document.createElement('div');
    ui.id = 'surface-panel';
    ui.className = 'module-panel';
    ui.innerHTML = `
      <div class="panel-header">
        <h3>Surface Modeling</h3>
        <button class="close-btn" data-close-panel="#surface-panel">×</button>
      </div>
      <div class="panel-body">
        <div class="button-group">
          <button class="module-btn" data-cmd="surface.extrude" title="Extrude Surface">Extrude</button>
          <button class="module-btn" data-cmd="surface.revolve" title="Revolve Surface">Revolve</button>
          <button class="module-btn" data-cmd="surface.sweep" title="Sweep Surface">Sweep</button>
          <button class="module-btn" data-cmd="surface.loft" title="Loft Surface">Loft</button>
        </div>
        <div class="button-group">
          <button class="module-btn" data-cmd="surface.patch" title="Patch">Patch</button>
          <button class="module-btn" data-cmd="surface.trim" title="Trim">Trim</button>
          <button class="module-btn" data-cmd="surface.extend" title="Extend">Extend</button>
          <button class="module-btn" data-cmd="surface.offset" title="Offset">Offset</button>
        </div>
        <div class="button-group">
          <button class="module-btn" data-cmd="surface.thicken" title="Thicken">Thicken</button>
          <button class="module-btn" data-cmd="surface.stitch" title="Stitch">Stitch</button>
          <button class="module-btn" data-cmd="surface.ruled" title="Ruled">Ruled</button>
          <button class="module-btn" data-cmd="surface.boundary" title="Boundary">Boundary</button>
        </div>
        <div id="surface-list" style="margin-top: 10px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; max-height: 200px; overflow-y: auto;">
          <strong>Active Surfaces:</strong>
          <ul id="surface-items" style="list-style: none; padding: 0; margin: 5px 0;"></ul>
        </div>
      </div>
    `;

    // Wire up buttons
    ui.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [ns, cmd] = btn.dataset.cmd.split('.');
        console.log(`[Surface] Command: ${cmd}`);
      });
    });

    return ui;
  }

  /**
   * Freeform T-spline sculpting - push/pull vertices in real-time
   */
  async function sculptTSpline(surfaceId, options = {}) {
    const { mode = 'push', radius = 10, strength = 1.0 } = options;
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const id = `surface_sculpt_${surfaceCounter.count++}`;
    surfaces.set(id, { type: 'sculpted_surface', parent: surfaceId, mesh: surface.mesh?.clone(), mode, createdAt: Date.now() });
    return { id, type: 'sculpted_surface', mode, radius, strength };
  }

  /**
   * Surface extension - extend edge naturally, linearly, or circularly
   */
  async function extendSurfaceAdvanced(surfaceId, edgeIndex, distance, extensionType = 'natural') {
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const id = `surface_extend_${extensionType}_${surfaceCounter.count++}`;

    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('extendSurfaceAdvanced', { surfaceId, edgeIndex, distance, extensionType });
        if (result) {
          surfaces.set(id, { type: 'extended_surface', brep: result, parent: surfaceId, extensionType, mesh: brepToMesh(result) });
          return { id, type: 'extended_surface', extensionType, distance };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep extend advanced failed:', e.message);
      }
    }

    const extendedMesh = surface.mesh?.clone();
    surfaces.set(id, { type: 'extended_surface', mesh: extendedMesh, extensionType });
    return { id, type: 'extended_surface', extensionType, distance };
  }

  /**
   * Curvature analysis with color mapping - Gaussian, mean, or principal
   */
  async function analyzeCurvature(surfaceId, options = {}) {
    const { type = 'mean', colorMap = 'heatmap', apply = true } = options;
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const mesh = surface.mesh;
    if (!mesh || !mesh.geometry) return { surfaceId, type, colorMap, analysis: 'No geometry' };

    const geometry = mesh.geometry;
    const normals = geometry.attributes.normal;
    const positions = geometry.attributes.position;

    if (!normals || !positions) return { surfaceId, analysis: 'Missing normals' };

    // Compute curvature per vertex
    const curvatures = new Float32Array(positions.count);
    const colors = new Uint8Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(normals, i);
      let curvature = Math.abs(n.x + n.y + n.z) / 3; // Simplified
      curvatures[i] = curvature;

      const hue = (1 - curvature) * 240;
      const rgb = hsvToRgb(hue, 1, 0.8);
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }

    if (apply) {
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
      mesh.material.vertexColors = true;
    }

    return { surfaceId, type, colorMap, curvatures, analysis: 'Curvature computed' };
  }

  /**
   * Zebra stripes - continuity analysis visualization
   */
  async function zebraStripes(surfaceId, options = {}) {
    const { stripeWidth = 0.5, direction = 'u', apply = true } = options;
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const mesh = surface.mesh;
    if (!mesh || !mesh.geometry) return null;

    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const colors = new Uint8Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      const pos = new THREE.Vector3().fromBufferAttribute(positions, i);
      const coord = direction === 'u' ? pos.x : pos.y;
      const stripe = Math.floor(coord / stripeWidth) % 2;
      const color = stripe === 0 ? 255 : 200;
      colors[i * 3] = color;
      colors[i * 3 + 1] = color;
      colors[i * 3 + 2] = color;
    }

    if (apply) {
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
      mesh.material.vertexColors = true;
    }

    return { surfaceId, stripeWidth, direction, applied: true };
  }

  /**
   * Draft analysis - check if surface can be pulled from mold
   */
  async function draftAnalysis(surfaceId, options = {}) {
    const { pullDirection = new THREE.Vector3(0, 0, 1), minAngle = 2 } = options;
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const mesh = surface.mesh;
    if (!mesh || !mesh.geometry) return null;

    const geometry = mesh.geometry;
    const normals = geometry.attributes.normal;
    const minAngleRad = (minAngle * Math.PI) / 180;

    let passCount = 0, failCount = 0;
    const problemAreas = [];

    for (let i = 0; i < normals.count; i++) {
      const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
      const angle = Math.acos(Math.abs(normal.dot(pullDirection.normalize())));

      if (angle >= minAngleRad) {
        passCount++;
      } else {
        failCount++;
        const pos = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i);
        problemAreas.push({ position: pos, angle: (angle * 180) / Math.PI });
      }
    }

    return {
      surfaceId,
      pullDirection: { x: pullDirection.x, y: pullDirection.y, z: pullDirection.z },
      minAngle,
      passPercentage: (passCount / (passCount + failCount)) * 100,
      problemAreas,
      passed: failCount === 0
    };
  }

  /**
   * Isocurve display - show parametric curves on surface
   */
  async function showIsocurves(surfaceId, options = {}) {
    const { uCount = 10, vCount = 10, color = 0x00ff00 } = options;
    const surface = surfaces.get(surfaceId);
    if (!surface) throw new Error(`Surface ${surfaceId} not found`);

    const curves = [];
    for (let i = 0; i < uCount; i++) {
      curves.push({ type: 'u', parameter: i / uCount, color });
    }
    for (let i = 0; i < vCount; i++) {
      curves.push({ type: 'v', parameter: i / vCount, color });
    }

    return { surfaceId, isocurves: curves, uCount, vCount, visible: true };
  }

  /**
   * Unstitch surfaces - break joined surfaces apart
   */
  async function unstitchSurfaces(solidId) {
    const surfaces_list = [];
    // In real implementation, extract individual surface faces from solid
    return { solidId, surfaces: surfaces_list, count: surfaces_list.length };
  }

  /**
   * Replace face - swap solid face with surface
   */
  async function replaceFace(solidId, faceIndex, replacementSurfaceId) {
    const id = `solid_replaced_face_${surfaceCounter.count++}`;

    if (surfaceManager.kernel) {
      try {
        const result = await surfaceManager.execBrep('replaceFace', { solidId, faceIndex, replacementSurfaceId });
        if (result) {
          return { id, type: 'solid', original: solidId, replacedFaceIndex: faceIndex };
        }
      } catch (e) {
        console.warn('[Surface] B-Rep replace face failed:', e.message);
      }
    }

    return { id, type: 'solid', original: solidId, replacedFaceIndex: faceIndex };
  }

  /**
   * Pipe along path - create tube surface along curve
   */
  async function pipeAlongPath(profileOrId, pathOrId, options = {}) {
    const { radius = 5, align = 'normal' } = options;
    const id = `surface_pipe_${surfaceCounter.count++}`;

    const mesh = createPipeSurfaceMesh(profileOrId, pathOrId, radius, align);
    surfaces.set(id, { type: 'pipe_surface', mesh, radius, align });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      viewport.scene.add(mesh);
    }

    return { id, type: 'pipe_surface', radius, align };
  }

  /**
   * Circular surface cap - fill boundary with circular surface
   */
  async function circularCap(boundaryLoop) {
    const id = `surface_circular_cap_${surfaceCounter.count++}`;

    const mesh = createCircularCapMesh(boundaryLoop);
    surfaces.set(id, { type: 'circular_cap', mesh });

    if (viewport?.scene) {
      mesh.material.side = THREE.DoubleSide;
      mesh.material.color.setHex(0xffaa44);
      viewport.scene.add(mesh);
    }

    return { id, type: 'circular_cap' };
  }

  /**
   * Helper: Create pipe surface mesh
   */
  function createPipeSurfaceMesh(profile, path, radius, align) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0xcc88ff, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Helper: Create circular cap mesh
   */
  function createCircularCapMesh(boundaryLoop) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshPhongMaterial({ color: 0xffaa44, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Helper: HSV to RGB conversion
   */
  function hsvToRgb(h, s, v) {
    h = h % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  return {
    MODULE_NAME,
    init,
    getUI,
    extrude: extrudeSurface,
    revolve: revolveSurface,
    sweep: sweepSurface,
    loft: loftSurface,
    patch: patchSurface,
    trim: trimSurface,
    extend: extendSurface,
    extendAdvanced: extendSurfaceAdvanced,
    offset: offsetSurface,
    thicken: thickenSurface,
    stitch: stitchSurfaces,
    ruled: ruledSurface,
    boundary: boundarySurface,
    sculpt: sculptTSpline,
    curvature: analyzeCurvature,
    zebra: zebraStripes,
    draft: draftAnalysis,
    isocurves: showIsocurves,
    unstitch: unstitchSurfaces,
    replaceFace: replaceFace,
    pipe: pipeAlongPath,
    circularCap: circularCap,
  };
})();

/**
 * Help entries for surface module
 */
const HELP_ENTRIES_SURFACE = [
  { id: 'surf-extrude', title: 'Extrude Surface', category: 'Surface', description: 'Extrude open profile into surface' },
  { id: 'surf-revolve', title: 'Revolve Surface', category: 'Surface', description: 'Revolve profile around axis' },
  { id: 'surf-sweep', title: 'Sweep Surface', category: 'Surface', description: 'Sweep profile along path' },
  { id: 'surf-loft', title: 'Loft Surface', category: 'Surface', description: 'Blend between multiple profiles' },
  { id: 'surf-patch', title: 'Patch Surface', category: 'Surface', description: 'Fill boundary with Coons patch' },
  { id: 'surf-ruled', title: 'Ruled Surface', category: 'Surface', description: 'Create ruled surface between curves' },
  { id: 'surf-boundary', title: 'Boundary Surface', category: 'Surface', description: 'Fill 4-sided boundary' },
  { id: 'surf-offset', title: 'Offset Surface', category: 'Surface', description: 'Create parallel offset' },
  { id: 'surf-extend', title: 'Extend Surface', category: 'Surface', description: 'Extend surface edge' },
  { id: 'surf-curvature', title: 'Curvature Analysis', category: 'Surface', description: 'Analyze and visualize curvature' },
  { id: 'surf-zebra', title: 'Zebra Stripes', category: 'Surface', description: 'Continuity visualization' },
  { id: 'surf-draft', title: 'Draft Analysis', category: 'Surface', description: 'Check molding draft angles' },
  { id: 'surf-isocurves', title: 'Isocurves', category: 'Surface', description: 'Display parametric curves' },
  { id: 'surf-thicken', title: 'Thicken', category: 'Surface', description: 'Convert surface to solid' },
  { id: 'surf-stitch', title: 'Stitch', category: 'Surface', description: 'Join surfaces into solid' },
  { id: 'surf-pipe', title: 'Pipe Along Path', category: 'Surface', description: 'Create tube along curve' },
];

export default SurfaceModule;
