/**
 * Stock/Workpiece Manager
 * Manages stock material (rectangular, cylindrical, custom mesh) with 3D visualization
 * Registers on window.cycleCAD.stock
 *
 * Usage:
 *   window.cycleCAD.stock.setStock({ type: 'rectangular', x: 100, y: 100, z: 50, material: 'aluminum' })
 *   const stock = window.cycleCAD.stock.getStock()
 *   window.cycleCAD.stock.updateVisualization()
 */

(function() {
  'use strict';

  // Material database (density in g/cm³)
  const MATERIALS = {
    'aluminum': { name: 'Aluminum', density: 2.70, color: '#C0C0C0' },
    'steel': { name: 'Steel', density: 7.85, color: '#555555' },
    'stainless': { name: 'Stainless Steel', density: 8.0, color: '#808080' },
    'brass': { name: 'Brass', density: 8.53, color: '#D4AF37' },
    'copper': { name: 'Copper', density: 8.96, color: '#B87333' },
    'titanium': { name: 'Titanium', density: 4.51, color: '#E7DECD' },
    'cast-iron': { name: 'Cast Iron', density: 7.2, color: '#3C3C3C' },
    'plastic': { name: 'Plastic (ABS)', density: 1.05, color: '#E8E8E8' },
    'wood': { name: 'Wood', density: 0.75, color: '#8B4513' },
    'foam': { name: 'Foam', density: 0.25, color: '#FFFACD' }
  };

  // Default stock
  let currentStock = {
    type: 'rectangular',
    x: 100,
    y: 100,
    z: 50,
    material: 'aluminum',
    origin: { x: 0, y: 0, z: 0 },
    rotated: false,
    indexed: false,
    indexCount: 1,
    indexAxis: 'Z'
  };

  // Three.js visualization objects
  let stockGroup = null;
  let stockMesh = null;
  let boundingBox = null;

  /**
   * Stock manager API
   */
  const stockAPI = {
    /**
     * Set stock configuration
     */
    setStock(config) {
      currentStock = {
        ...currentStock,
        ...config
      };

      // Validate
      if (!MATERIALS[currentStock.material]) {
        console.warn(`Material "${currentStock.material}" not found. Using aluminum.`);
        currentStock.material = 'aluminum';
      }

      if (currentStock.type === 'rectangular') {
        if (currentStock.x <= 0 || currentStock.y <= 0 || currentStock.z <= 0) {
          console.warn('Stock dimensions must be positive.');
          return false;
        }
      } else if (currentStock.type === 'cylindrical') {
        if (currentStock.diameter <= 0 || currentStock.height <= 0) {
          console.warn('Stock diameter and height must be positive.');
          return false;
        }
      }

      return true;
    },

    /**
     * Get current stock
     */
    getStock() {
      return { ...currentStock };
    },

    /**
     * Get stock dimensions object
     */
    getDimensions() {
      if (currentStock.type === 'rectangular') {
        return {
          x: currentStock.x,
          y: currentStock.y,
          z: currentStock.z
        };
      } else if (currentStock.type === 'cylindrical') {
        return {
          diameter: currentStock.diameter,
          radius: currentStock.diameter / 2,
          height: currentStock.height
        };
      }
      return null;
    },

    /**
     * Calculate stock volume (mm³)
     */
    calculateVolume() {
      if (currentStock.type === 'rectangular') {
        return currentStock.x * currentStock.y * currentStock.z;
      } else if (currentStock.type === 'cylindrical') {
        const radius = currentStock.diameter / 2;
        return Math.PI * radius * radius * currentStock.height;
      }
      return 0;
    },

    /**
     * Calculate stock weight (grams)
     */
    calculateWeight() {
      const volumeMm3 = this.calculateVolume();
      const volumeCm3 = volumeMm3 / 1000; // Convert mm³ to cm³
      const density = MATERIALS[currentStock.material].density;
      return volumeCm3 * density;
    },

    /**
     * Get material info
     */
    getMaterial(materialId) {
      return MATERIALS[materialId] || null;
    },

    /**
     * List all materials
     */
    listMaterials() {
      return Object.keys(MATERIALS).map(id => ({
        id,
        ...MATERIALS[id]
      }));
    },

    /**
     * Set material
     */
    setMaterial(materialId) {
      if (!MATERIALS[materialId]) {
        console.warn(`Material "${materialId}" not found.`);
        return false;
      }

      currentStock.material = materialId;
      return true;
    },

    /**
     * Auto-size stock from part bounding box
     * Requires window._scene to be set (Three.js scene)
     */
    autoSizeFromPart(offset = { x: 10, y: 10, z: 5 }) {
      if (!window._scene) {
        console.warn('Three.js scene not available.');
        return false;
      }

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      // Iterate through all meshes in scene
      window._scene.traverse(obj => {
        if (obj.isMesh && obj.geometry) {
          obj.geometry.computeBoundingBox();
          const bb = obj.geometry.boundingBox;

          minX = Math.min(minX, bb.min.x);
          maxX = Math.max(maxX, bb.max.x);
          minY = Math.min(minY, bb.min.y);
          maxY = Math.max(maxY, bb.max.y);
          minZ = Math.min(minZ, bb.min.z);
          maxZ = Math.max(maxZ, bb.max.z);
        }
      });

      if (minX === Infinity) {
        console.warn('No geometry found in scene.');
        return false;
      }

      const width = maxX - minX + offset.x;
      const depth = maxY - minY + offset.y;
      const height = maxZ - minZ + offset.z;

      currentStock.type = 'rectangular';
      currentStock.x = width;
      currentStock.y = depth;
      currentStock.z = height;
      currentStock.origin = {
        x: minX - offset.x / 2,
        y: minY - offset.y / 2,
        z: minZ - offset.z / 2
      };

      return true;
    },

    /**
     * Enable indexed stock (rotary axis)
     */
    setIndexed(enabled, count = 1, axis = 'Z') {
      currentStock.indexed = enabled;
      currentStock.indexCount = count;
      currentStock.indexAxis = axis;
      return true;
    },

    /**
     * Update Three.js visualization
     * Requires window._scene and window._renderer to be set
     */
    updateVisualization() {
      if (!window._scene || !window._renderer) {
        console.warn('Three.js scene or renderer not available.');
        return false;
      }

      // Remove old stock group if it exists
      if (stockGroup) {
        window._scene.remove(stockGroup);
      }

      // Create new group
      stockGroup = new window.THREE.Group();
      stockGroup.name = 'StockWireframe';

      const matColor = MATERIALS[currentStock.material].color;

      if (currentStock.type === 'rectangular') {
        // Create wireframe box
        const geom = new window.THREE.BoxGeometry(
          currentStock.x,
          currentStock.y,
          currentStock.z
        );

        const matWireframe = new window.THREE.LineBasicMaterial({
          color: matColor,
          linewidth: 2
        });

        const wireframe = new window.THREE.LineSegments(
          new window.THREE.EdgesGeometry(geom),
          matWireframe
        );

        wireframe.position.set(
          currentStock.origin.x + currentStock.x / 2,
          currentStock.origin.y + currentStock.y / 2,
          currentStock.origin.z + currentStock.z / 2
        );

        stockGroup.add(wireframe);

        // Optional: add semi-transparent box mesh
        const matMesh = new window.THREE.MeshBasicMaterial({
          color: matColor,
          transparent: true,
          opacity: 0.1,
          depthWrite: false
        });

        stockMesh = new window.THREE.Mesh(geom, matMesh);
        stockMesh.position.copy(wireframe.position);
        stockGroup.add(stockMesh);

      } else if (currentStock.type === 'cylindrical') {
        // Create wireframe cylinder
        const geom = new window.THREE.CylinderGeometry(
          currentStock.diameter / 2,
          currentStock.diameter / 2,
          currentStock.height,
          32
        );

        const matWireframe = new window.THREE.LineBasicMaterial({
          color: matColor,
          linewidth: 2
        });

        const wireframe = new window.THREE.LineSegments(
          new window.THREE.EdgesGeometry(geom),
          matWireframe
        );

        wireframe.position.set(
          currentStock.origin.x,
          currentStock.origin.y + currentStock.height / 2,
          currentStock.origin.z
        );

        stockGroup.add(wireframe);

        // Semi-transparent cylinder
        const matMesh = new window.THREE.MeshBasicMaterial({
          color: matColor,
          transparent: true,
          opacity: 0.1,
          depthWrite: false
        });

        stockMesh = new window.THREE.Mesh(geom, matMesh);
        stockMesh.position.copy(wireframe.position);
        stockGroup.add(stockMesh);
      }

      window._scene.add(stockGroup);
      return true;
    },

    /**
     * Hide stock visualization
     */
    hideVisualization() {
      if (stockGroup) {
        stockGroup.visible = false;
      }
    },

    /**
     * Show stock visualization
     */
    showVisualization() {
      if (stockGroup) {
        stockGroup.visible = true;
      } else {
        this.updateVisualization();
      }
    },

    /**
     * Get stock info panel HTML
     */
    getInfoHTML() {
      const volume = this.calculateVolume();
      const weight = this.calculateWeight();
      const matInfo = MATERIALS[currentStock.material];

      let dimStr = '';
      if (currentStock.type === 'rectangular') {
        dimStr = `${currentStock.x.toFixed(1)} × ${currentStock.y.toFixed(1)} × ${currentStock.z.toFixed(1)} mm`;
      } else if (currentStock.type === 'cylindrical') {
        dimStr = `Ø${currentStock.diameter.toFixed(1)} × ${currentStock.height.toFixed(1)} mm`;
      }

      return `
        <div style="font-size: 12px; line-height: 1.6;">
          <strong>Stock Type:</strong> ${currentStock.type.charAt(0).toUpperCase() + currentStock.type.slice(1)}<br/>
          <strong>Dimensions:</strong> ${dimStr}<br/>
          <strong>Material:</strong> ${matInfo.name}<br/>
          <strong>Volume:</strong> ${volume.toFixed(0)} mm³<br/>
          <strong>Weight:</strong> ${weight.toFixed(1)} g<br/>
          ${currentStock.indexed ? `<strong>Indexed:</strong> ${currentStock.indexCount} positions (${currentStock.indexAxis})<br/>` : ''}
        </div>
      `;
    },

    /**
     * Compare stock vs part (how much material to remove)
     */
    compareWithPart() {
      if (!window._scene) {
        console.warn('Three.js scene not available.');
        return null;
      }

      let partVolume = 0;
      let partBounds = {
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        minZ: Infinity, maxZ: -Infinity
      };

      window._scene.traverse(obj => {
        if (obj.isMesh && obj.geometry && obj !== stockMesh) {
          obj.geometry.computeBoundingBox();
          const bb = obj.geometry.boundingBox;

          // Rough volume estimate from bounding box
          const w = bb.max.x - bb.min.x;
          const h = bb.max.y - bb.min.y;
          const d = bb.max.z - bb.min.z;
          partVolume += w * h * d;

          partBounds.minX = Math.min(partBounds.minX, bb.min.x);
          partBounds.maxX = Math.max(partBounds.maxX, bb.max.x);
          partBounds.minY = Math.min(partBounds.minY, bb.min.y);
          partBounds.maxY = Math.max(partBounds.maxY, bb.max.y);
          partBounds.minZ = Math.min(partBounds.minZ, bb.min.z);
          partBounds.maxZ = Math.max(partBounds.maxZ, bb.max.z);
        }
      });

      const stockVolume = this.calculateVolume();
      const removalVolume = stockVolume - partVolume;
      const removalPercent = (removalVolume / stockVolume * 100).toFixed(1);

      return {
        stockVolume: stockVolume,
        partVolume: partVolume,
        removalVolume: removalVolume,
        removalPercent: removalPercent,
        partBounds: partBounds
      };
    },

    /**
     * Clip toolpaths to stock bounds
     */
    clipToStock(toolpaths) {
      if (!toolpaths || !Array.isArray(toolpaths)) return [];

      const dims = this.getDimensions();
      const origin = currentStock.origin;

      return toolpaths.map(point => {
        let clipped = { ...point };

        if (currentStock.type === 'rectangular') {
          clipped.x = Math.max(origin.x, Math.min(point.x, origin.x + dims.x));
          clipped.y = Math.max(origin.y, Math.min(point.y, origin.y + dims.y));
          clipped.z = Math.max(origin.z, Math.min(point.z, origin.z + dims.z));
        } else if (currentStock.type === 'cylindrical') {
          const cx = origin.x;
          const cy = origin.y;
          const rad = Math.sqrt((point.x - cx) ** 2 + (point.y - cy) ** 2);

          if (rad > dims.radius) {
            const angle = Math.atan2(point.y - cy, point.x - cx);
            clipped.x = cx + Math.cos(angle) * dims.radius;
            clipped.y = cy + Math.sin(angle) * dims.radius;
          }

          clipped.z = Math.max(origin.y, Math.min(point.z, origin.y + dims.height));
        }

        return clipped;
      });
    },

    /**
     * Export stock config as JSON
     */
    exportConfig() {
      return JSON.stringify(currentStock, null, 2);
    },

    /**
     * Import stock config from JSON
     */
    importConfig(jsonString) {
      try {
        const config = JSON.parse(jsonString);
        return this.setStock(config);
      } catch (err) {
        console.error('Failed to import stock config:', err);
        return false;
      }
    }
  };

  // Register on window.cycleCAD
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.stock = stockAPI;

  console.log('[cycleCAD.stock] Module loaded. Stock manager ready.');
})();
