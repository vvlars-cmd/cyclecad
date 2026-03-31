/**
 * Photo-to-CAD Reverse Engineering Module
 * Converts photographs of parts into parametric 3D CAD models
 *
 * Features:
 * - Image input: drag-drop, camera, clipboard
 * - Edge detection: Sobel + Canny + contour tracing
 * - Geometry reconstruction: 2D contours → 3D primitives
 * - Interactive refinement: overlay, sliders, reference dimensions
 * - AI enhancement: Gemini Flash Vision API integration
 * - UI panel with side-by-side photo + 3D preview
 */

(function() {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    originalImage: null,
    processedImage: null,
    canvas: null,
    ctx: null,
    detectedFeatures: {
      lines: [],
      circles: [],
      arcs: [],
      corners: [],
      rectangles: [],
      contours: []
    },
    selectedFeatures: new Set(),
    referenceDimension: { pixels: 0, mm: 0, scale: 0 },
    edgeSensitivity: 0.5,
    threeDPreview: null,
    threeDScene: null,
    threeDRenderer: null,
    aiMetadata: null
  };

  // ============================================================================
  // SECTION 1: IMAGE INPUT SYSTEM (~200 lines)
  // ============================================================================

  /**
   * Initialize image input handlers
   */
  function initImageInput() {
    const dropZone = document.getElementById('photo-cad-drop-zone');
    if (!dropZone) return;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);

    // File input change
    const fileInput = document.getElementById('photo-cad-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
    }

    // Camera button
    const cameraBtn = document.getElementById('photo-cad-camera-btn');
    if (cameraBtn) {
      cameraBtn.addEventListener('click', startCameraCapture);
    }

    // Paste from clipboard
    document.addEventListener('paste', handlePaste);
  }

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function highlight(e) {
    const dropZone = document.getElementById('photo-cad-drop-zone');
    if (dropZone) dropZone.classList.add('highlight');
  }

  function unhighlight(e) {
    const dropZone = document.getElementById('photo-cad-drop-zone');
    if (dropZone) dropZone.classList.remove('highlight');
  }

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }

  function handleFileSelect(file) {
    if (!file || !file.type.match('image.*')) {
      alert('Please select an image file (JPEG, PNG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items || [];
    for (let item of items) {
      if (item.type.match('image.*')) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => loadImage(ev.target.result);
        reader.readAsDataURL(blob);
        break;
      }
    }
  }

  /**
   * Load image and preprocess
   * @param {string} dataUrl - Data URL of image
   */
  function loadImage(dataUrl) {
    const img = new Image();
    img.onload = () => {
      // Resize to max 1024px while maintaining aspect ratio
      const maxSize = 1024;
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const width = Math.floor(img.width * scale);
      const height = Math.floor(img.height * scale);

      // Create canvas and draw image
      state.canvas = document.createElement('canvas');
      state.canvas.width = width;
      state.canvas.height = height;
      state.ctx = state.canvas.getContext('2d');
      state.ctx.drawImage(img, 0, 0, width, height);

      // Normalize brightness/contrast
      normalizeImage();

      state.originalImage = dataUrl;
      state.processedImage = state.canvas.toDataURL('image/png');

      // Update UI
      updateImagePreview();

      // Auto-detect edges
      detectEdges();
    };
    img.src = dataUrl;
  }

  /**
   * Normalize brightness and contrast
   */
  function normalizeImage() {
    const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
    const data = imageData.data;

    // Get brightness histogram
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      histogram[Math.floor(brightness)]++;
    }

    // Find min/max brightness
    let minBright = 0, maxBright = 255;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        minBright = i;
        break;
      }
    }
    for (let i = 255; i >= 0; i--) {
      if (histogram[i] > 0) {
        maxBright = i;
        break;
      }
    }

    // Stretch contrast
    const brightnessRange = maxBright - minBright;
    if (brightnessRange > 0) {
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const normalized = ((brightness - minBright) / brightnessRange) * 255;
        data[i] = data[i + 1] = data[i + 2] = Math.floor(normalized);
      }
    }

    state.ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Start camera capture via getUserMedia
   */
  async function startCameraCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Create capture dialog
      const dialog = document.createElement('div');
      dialog.className = 'photo-cad-camera-dialog';
      dialog.innerHTML = `
        <div class="photo-cad-camera-modal">
          <video id="photo-cad-preview" style="width:100%;max-width:100%;border-radius:8px;"></video>
          <div style="display:flex;gap:10px;margin-top:15px;">
            <button id="photo-cad-capture-btn" class="photo-cad-btn-primary">Capture</button>
            <button id="photo-cad-cancel-capture-btn" class="photo-cad-btn-secondary">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      const preview = document.getElementById('photo-cad-preview');
      preview.srcObject = stream;

      document.getElementById('photo-cad-capture-btn').onclick = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        loadImage(canvas.toDataURL('image/jpeg'));
        stream.getTracks().forEach(t => t.stop());
        dialog.remove();
      };

      document.getElementById('photo-cad-cancel-capture-btn').onclick = () => {
        stream.getTracks().forEach(t => t.stop());
        dialog.remove();
      };
    } catch (err) {
      console.error('Camera error:', err);
      alert('Camera access denied or not available');
    }
  }

  /**
   * Update image preview in UI
   */
  function updateImagePreview() {
    const preview = document.getElementById('photo-cad-image-preview');
    if (preview) {
      preview.innerHTML = `<img src="${state.processedImage}" style="max-width:100%;max-height:300px;border-radius:4px;">`;
    }
  }

  // ============================================================================
  // SECTION 2: EDGE DETECTION & CONTOUR EXTRACTION (~400 lines)
  // ============================================================================

  /**
   * Detect edges using Sobel operator + Canny-style thinning
   */
  function detectEdges() {
    if (!state.canvas) return;

    const width = state.canvas.width;
    const height = state.canvas.height;
    const imageData = state.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Convert to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      grayscale[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
    }

    // Sobel edge detection
    const edges = sobelEdgeDetection(grayscale, width, height);

    // Non-maximum suppression (edge thinning)
    const thinned = nonMaximumSuppression(edges, width, height);

    // Threshold based on sensitivity
    const threshold = (1 - state.edgeSensitivity) * 255;
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < thinned.length; i++) {
      binary[i] = thinned[i] > threshold ? 255 : 0;
    }

    // Extract contours
    extractContours(binary, width, height);

    // Detect primitives
    detectPrimitives();

    // Update preview
    displayDetectedEdges(binary, width, height);

    // Send to AI if API key available
    if (window.GEMINI_API_KEY) {
      enhanceWithAI();
    }
  }

  /**
   * Sobel edge detection
   * @param {Uint8Array} gray - Grayscale image
   * @param {number} width
   * @param {number} height
   * @returns {Uint8Array} Edge magnitude
   */
  function sobelEdgeDetection(gray, width, height) {
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    const edges = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const pixel = gray[(y + dy) * width + (x + dx)];
            gx += sobelX[dy + 1][dx + 1] * pixel;
            gy += sobelY[dy + 1][dx + 1] * pixel;
          }
        }

        edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    return edges;
  }

  /**
   * Non-maximum suppression for edge thinning
   * @param {Uint8Array} edges
   * @param {number} width
   * @param {number} height
   * @returns {Uint8Array} Thinned edges
   */
  function nonMaximumSuppression(edges, width, height) {
    const thinned = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const center = edges[idx];

        // Check 8 neighbors
        let isMaximum = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (edges[(y + dy) * width + (x + dx)] > center) {
              isMaximum = false;
              break;
            }
          }
          if (!isMaximum) break;
        }

        thinned[idx] = isMaximum ? center : 0;
      }
    }

    return thinned;
  }

  /**
   * Extract contours using Moore-Neighbor tracing
   * @param {Uint8Array} binary - Binary edge image
   * @param {number} width
   * @param {number} height
   */
  function extractContours(binary, width, height) {
    const visited = new Uint8Array(width * height);
    const contours = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (binary[idx] > 128 && !visited[idx]) {
          const contour = traceContour(binary, visited, x, y, width, height);
          if (contour.length > 4) {
            contours.push(contour);
          }
        }
      }
    }

    state.detectedFeatures.contours = contours;
  }

  /**
   * Trace a single contour using Moore-Neighbor algorithm
   * @param {Uint8Array} binary
   * @param {Uint8Array} visited
   * @param {number} startX
   * @param {number} startY
   * @param {number} width
   * @param {number} height
   * @returns {Array<{x, y}>} Contour points
   */
  function traceContour(binary, visited, startX, startY, width, height) {
    const contour = [];
    let x = startX, y = startY;
    let dir = 0; // 0=right, 1=down-right, 2=down, etc.
    const dirs = [[1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1], [0,-1], [1,-1]];

    const maxIterations = width * height;
    let iterations = 0;

    do {
      visited[y * width + x] = 1;
      contour.push({x, y});

      // Find next edge pixel
      let found = false;
      for (let i = 0; i < 8; i++) {
        const nextDir = (dir + i) % 8;
        const nx = x + dirs[nextDir][0];
        const ny = y + dirs[nextDir][1];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (binary[ny * width + nx] > 128) {
            x = nx;
            y = ny;
            dir = nextDir;
            found = true;
            break;
          }
        }
      }

      if (!found) break;
    } while ((x !== startX || y !== startY) && iterations++ < maxIterations);

    return contour;
  }

  /**
   * Detect primitives: circles, lines, rectangles, arcs
   */
  function detectPrimitives() {
    const contours = state.detectedFeatures.contours;
    state.detectedFeatures.circles = [];
    state.detectedFeatures.lines = [];
    state.detectedFeatures.rectangles = [];
    state.detectedFeatures.arcs = [];

    contours.forEach((contour, idx) => {
      // Detect if contour is a circle
      const circle = detectCircle(contour);
      if (circle && circle.confidence > 0.7) {
        state.detectedFeatures.circles.push({...circle, id: `circle-${idx}`, contourIdx: idx});
      }

      // Detect if contour is a rectangle
      const rect = detectRectangle(contour);
      if (rect && rect.confidence > 0.7) {
        state.detectedFeatures.rectangles.push({...rect, id: `rect-${idx}`, contourIdx: idx});
      }

      // Fit line segments
      const lines = detectLineSegments(contour);
      if (lines.length > 0) {
        state.detectedFeatures.lines.push(...lines.map((l, i) => ({...l, id: `line-${idx}-${i}`, contourIdx: idx})));
      }
    });
  }

  /**
   * Detect circle in contour using Hough circle transform (simplified)
   * @param {Array<{x, y}>} contour
   * @returns {{x, y, radius, confidence} | null}
   */
  function detectCircle(contour) {
    if (contour.length < 8) return null;

    // Fit circle using least squares
    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0, sumX3 = 0, sumY3 = 0, sumX2Y = 0, sumXY2 = 0;
    const n = contour.length;

    contour.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
      sumXY += p.x * p.y;
      sumX3 += p.x * p.x * p.x;
      sumY3 += p.y * p.y * p.y;
      sumX2Y += p.x * p.x * p.y;
      sumXY2 += p.x * p.y * p.y;
    });

    const A = n * sumX2 - sumX * sumX;
    const B = n * sumXY - sumX * sumY;
    const C = n * sumY2 - sumY * sumY;
    const D = 0.5 * (n * (sumX3 + sumXY2) - sumX * (sumX2 + sumY2));
    const E = 0.5 * (n * (sumX2Y + sumY3) - sumY * (sumX2 + sumY2));

    const denom = A * C - B * B;
    if (Math.abs(denom) < 1e-10) return null;

    const cx = (D * C - B * E) / denom;
    const cy = (A * E - B * D) / denom;

    // Calculate radius and confidence
    let radiusSum = 0;
    contour.forEach(p => {
      radiusSum += Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    });
    const radius = radiusSum / n;

    // Confidence based on deviation
    let deviation = 0;
    contour.forEach(p => {
      const r = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      deviation += Math.abs(r - radius);
    });
    const avgDeviation = deviation / n;
    const confidence = Math.max(0, 1 - (avgDeviation / radius));

    return {x: cx, y: cy, radius, confidence};
  }

  /**
   * Detect rectangle in contour
   * @param {Array<{x, y}>} contour
   * @returns {{x, y, width, height, angle, confidence} | null}
   */
  function detectRectangle(contour) {
    if (contour.length < 8) return null;

    // Get convex hull corners
    const hull = convexHull(contour);
    if (hull.length < 4) return null;

    // Find if 4 corners form rectangle
    const corners = hull.slice(0, Math.min(4, hull.length));
    if (corners.length !== 4) return null;

    // Check if corners form rectangle (angles close to 90 degrees)
    let sumAngle = 0;
    for (let i = 0; i < 4; i++) {
      const p0 = corners[i];
      const p1 = corners[(i + 1) % 4];
      const p2 = corners[(i + 2) % 4];

      const v1 = {x: p1.x - p0.x, y: p1.y - p0.y};
      const v2 = {x: p2.x - p1.x, y: p2.y - p1.y};
      const dot = v1.x * v2.x + v1.y * v2.y;
      const angle = Math.acos(dot / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)));
      sumAngle += Math.abs(angle - Math.PI / 2);
    }

    const angleDeviation = sumAngle / 4;
    const confidence = Math.max(0, 1 - angleDeviation);

    if (confidence > 0.7) {
      const minX = Math.min(...corners.map(p => p.x));
      const maxX = Math.max(...corners.map(p => p.x));
      const minY = Math.min(...corners.map(p => p.y));
      const maxY = Math.max(...corners.map(p => p.y));

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        angle: 0,
        confidence
      };
    }

    return null;
  }

  /**
   * Detect line segments in contour
   * @param {Array<{x, y}>} contour
   * @returns {Array<{x1, y1, x2, y2}>}
   */
  function detectLineSegments(contour) {
    const lines = [];
    if (contour.length < 4) return lines;

    // Simple line fitting using endpoints and key points
    const first = contour[0];
    const last = contour[contour.length - 1];

    // Fit line through contour
    let sumX = 0, sumY = 0, sumX2 = 0, sumXY = 0;
    contour.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumX2 += p.x * p.x;
      sumXY += p.x * p.y;
    });

    const n = contour.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    lines.push({
      x1: first.x,
      y1: slope * first.x + intercept,
      x2: last.x,
      y2: slope * last.x + intercept
    });

    return lines;
  }

  /**
   * Simple convex hull using Graham scan
   * @param {Array<{x, y}>} points
   * @returns {Array<{x, y}>} Hull points
   */
  function convexHull(points) {
    if (points.length <= 3) return points;

    // Find starting point (lowest y, then leftmost x)
    let start = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[start].y ||
          (points[i].y === points[start].y && points[i].x < points[start].x)) {
        start = i;
      }
    }

    const sorted = points.slice().sort((a, b) => {
      const angle1 = Math.atan2(a.y - points[start].y, a.x - points[start].x);
      const angle2 = Math.atan2(b.y - points[start].y, b.x - points[start].x);
      return angle1 - angle2;
    });

    const hull = [];
    for (const p of sorted) {
      while (hull.length >= 2) {
        const o = hull[hull.length - 2];
        const a = hull[hull.length - 1];
        const cross = (a.x - o.x) * (p.y - o.y) - (a.y - o.y) * (p.x - o.x);
        if (cross <= 0) break;
        hull.pop();
      }
      hull.push(p);
    }

    return hull;
  }

  /**
   * Display detected edges on canvas
   * @param {Uint8Array} binary
   * @param {number} width
   * @param {number} height
   */
  function displayDetectedEdges(binary, width, height) {
    const canvas = document.getElementById('photo-cad-edges-canvas');
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // White background, black edges
    for (let i = 0; i < binary.length; i++) {
      const idx = i * 4;
      const val = binary[i];
      data[idx] = data[idx + 1] = data[idx + 2] = val;
      data[idx + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw detected features
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;

    state.detectedFeatures.circles.forEach(circle => {
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.strokeStyle = '#FF0000';
    state.detectedFeatures.rectangles.forEach(rect => {
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    });

    ctx.strokeStyle = '#0000FF';
    state.detectedFeatures.lines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    });
  }

  // ============================================================================
  // SECTION 3: GEOMETRY RECONSTRUCTION (~400 lines)
  // ============================================================================

  /**
   * Reconstruct 3D geometry from detected features
   */
  function reconstruct3D() {
    const features = Array.from(state.selectedFeatures);
    if (features.length === 0) {
      alert('Please select features to reconstruct');
      return;
    }

    // Create base geometry
    let baseGeometry = null;
    const baseFeature = features.find(f => f.startsWith('rect-'));

    if (baseFeature) {
      const rect = state.detectedFeatures.rectangles.find(r => r.id === baseFeature);
      if (rect) {
        baseGeometry = createBox(rect.width, rect.height, 20);
      }
    } else {
      const circle = state.detectedFeatures.circles[0];
      if (circle) {
        baseGeometry = createCylinder(circle.radius, circle.radius * 0.5, 20);
      }
    }

    if (!baseGeometry) {
      baseGeometry = createBox(100, 100, 20);
    }

    // Apply features
    features.forEach(featureId => {
      if (featureId.startsWith('circle-')) {
        const circle = state.detectedFeatures.circles.find(c => c.id === featureId);
        if (circle) {
          // Add hole
          const hole = createCylinder(circle.radius, 30, 16);
          // Boolean union would go here (stub for now)
        }
      }
    });

    // Update 3D preview
    update3DPreview(baseGeometry);
  }

  /**
   * Create box geometry
   * @param {number} width
   * @param {number} height
   * @param {number} depth
   * @returns {THREE.BufferGeometry}
   */
  function createBox(width, height, depth) {
    return new THREE.BoxGeometry(width, height, depth);
  }

  /**
   * Create cylinder geometry
   * @param {number} radius
   * @param {number} height
   * @param {number} segments
   * @returns {THREE.BufferGeometry}
   */
  function createCylinder(radius, height, segments = 16) {
    return new THREE.CylinderGeometry(radius, radius, height, segments);
  }

  /**
   * Create revolved geometry from profile
   * @param {Array<{x, y}>} profile - 2D profile curve
   * @returns {THREE.BufferGeometry}
   */
  function createRevolved(profile) {
    const curve = new THREE.LineCurve3(
      new THREE.Vector3(-profile[0].x, profile[0].y, 0),
      new THREE.Vector3(-profile[profile.length - 1].x, profile[profile.length - 1].y, 0)
    );

    const geometry = new THREE.LatheGeometry(
      profile.map(p => new THREE.Vector3(p.x, p.y, 0)),
      16
    );

    return geometry;
  }

  /**
   * Update 3D preview
   * @param {THREE.BufferGeometry} geometry
   */
  function update3DPreview(geometry) {
    const preview = document.getElementById('photo-cad-3d-preview');
    if (!preview) return;

    // Clear existing
    if (state.threeDRenderer) {
      preview.innerHTML = '';
    }

    // Create scene
    const width = preview.clientWidth;
    const height = preview.clientHeight;

    state.threeDScene = new THREE.Scene();
    state.threeDScene.background = new THREE.Color(0x1a1a1a);

    state.threeDRenderer = new THREE.WebGLRenderer({antialias: true});
    state.threeDRenderer.setSize(width, height);
    state.threeDRenderer.setPixelRatio(window.devicePixelRatio);
    preview.appendChild(state.threeDRenderer.domElement);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(150, 100, 150);
    camera.lookAt(0, 0, 0);

    // Lighting
    const light1 = new THREE.DirectionalLight(0xffffff, 0.8);
    light1.position.set(1, 1, 1);
    state.threeDScene.add(light1);

    const light2 = new THREE.AmbientLight(0x666666);
    state.threeDScene.add(light2);

    // Add geometry
    const material = new THREE.MeshPhongMaterial({color: 0x4a90e2});
    const mesh = new THREE.Mesh(geometry, material);
    state.threeDScene.add(mesh);

    // Edges
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color: 0xffffff}));
    state.threeDScene.add(line);

    // Render
    const animate = () => {
      requestAnimationFrame(animate);
      mesh.rotation.x += 0.005;
      mesh.rotation.y += 0.008;
      state.threeDRenderer.render(state.threeDScene, camera);
    };
    animate();

    // Handle resize
    window.addEventListener('resize', () => {
      const w = preview.clientWidth;
      const h = preview.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      state.threeDRenderer.setSize(w, h);
    });
  }

  /**
   * Detect symmetry in contour for revolve operations
   * @param {Array<{x, y}>} contour
   * @returns {boolean} True if symmetric
   */
  function detectSymmetry(contour) {
    if (contour.length < 4) return false;

    const mid = Math.floor(contour.length / 2);
    let symmetricCount = 0;

    for (let i = 0; i < mid; i++) {
      const p1 = contour[i];
      const p2 = contour[contour.length - 1 - i];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (dist < 10) symmetricCount++;
    }

    return (symmetricCount / mid) > 0.7;
  }

  // ============================================================================
  // SECTION 4: INTERACTIVE REFINEMENT (~300 lines)
  // ============================================================================

  /**
   * Toggle feature selection
   * @param {string} featureId
   */
  function toggleFeature(featureId) {
    if (state.selectedFeatures.has(featureId)) {
      state.selectedFeatures.delete(featureId);
    } else {
      state.selectedFeatures.add(featureId);
    }
    updateFeatureList();
  }

  /**
   * Update feature list UI
   */
  function updateFeatureList() {
    const list = document.getElementById('photo-cad-feature-list');
    if (!list) return;

    list.innerHTML = '';

    const allFeatures = [
      ...state.detectedFeatures.circles.map(c => ({...c, type: 'circle'})),
      ...state.detectedFeatures.rectangles.map(r => ({...r, type: 'rectangle'})),
      ...state.detectedFeatures.lines.map(l => ({...l, type: 'line'}))
    ];

    allFeatures.forEach(feature => {
      const item = document.createElement('div');
      item.className = 'photo-cad-feature-item';
      item.innerHTML = `
        <input type="checkbox" id="feat-${feature.id}" ${state.selectedFeatures.has(feature.id) ? 'checked' : ''}>
        <label for="feat-${feature.id}" class="photo-cad-feature-label">
          <span class="photo-cad-feature-type">${feature.type}</span>
          ${feature.type === 'circle' ? `r=${Math.round(feature.radius)}px` : ''}
          ${feature.type === 'rectangle' ? `${Math.round(feature.width)}×${Math.round(feature.height)}px` : ''}
        </label>
      `;
      item.querySelector('input').addEventListener('change', () => toggleFeature(feature.id));
      list.appendChild(item);
    });
  }

  /**
   * Set reference dimension
   * Point 1 and point 2 are clicked in canvas, then real dimension entered
   */
  function setReferenceDimension() {
    const pixelInput = document.getElementById('photo-cad-ref-pixels');
    const mmInput = document.getElementById('photo-cad-ref-mm');

    if (!pixelInput || !mmInput) return;

    const pixels = parseFloat(pixelInput.value);
    const mm = parseFloat(mmInput.value);

    if (!isNaN(pixels) && !isNaN(mm) && pixels > 0 && mm > 0) {
      state.referenceDimension = {pixels, mm, scale: mm / pixels};
      alert(`Scale set: 1 pixel = ${(state.referenceDimension.scale).toFixed(4)} mm`);
    } else {
      alert('Please enter valid pixel and mm values');
    }
  }

  /**
   * Adjust edge detection sensitivity
   * @param {number} value 0-1
   */
  function setEdgeSensitivity(value) {
    state.edgeSensitivity = value;
    detectEdges();
  }

  // ============================================================================
  // SECTION 5: AI ENHANCEMENT (~200 lines)
  // ============================================================================

  /**
   * Enhance detection with Gemini Flash Vision API
   */
  async function enhanceWithAI() {
    if (!state.originalImage || !window.GEMINI_API_KEY) return;

    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=' + window.GEMINI_API_KEY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: 'Analyze this CAD part image. Identify: 1) Part type (e.g., "cylindrical shaft", "rectangular plate"), 2) Estimated dimensions (width, height, depth in relative units), 3) Key features (holes, fillets, threads, etc.), 4) Likely material (metal, plastic, composite). Respond in JSON format: {partType, estimatedDimensions: {w, h, d}, features: [], material}'
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: state.originalImage.split(',')[1]
                }
              }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = data.candidates[0]?.content.parts[0]?.text || '';

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          state.aiMetadata = JSON.parse(jsonMatch[0]);
          updateAIMetadata();
        }
      } catch (e) {
        console.log('AI metadata parsing failed:', e);
      }
    } catch (err) {
      console.error('AI enhancement error:', err);
    }
  }

  /**
   * Update UI with AI metadata
   */
  function updateAIMetadata() {
    const panel = document.getElementById('photo-cad-ai-metadata');
    if (!panel || !state.aiMetadata) return;

    panel.innerHTML = `
      <div class="photo-cad-ai-section">
        <strong>Part Type:</strong> ${state.aiMetadata.partType || 'Unknown'}<br>
        <strong>Material:</strong> ${state.aiMetadata.material || 'Unknown'}<br>
        <strong>Features:</strong> ${(state.aiMetadata.features || []).join(', ') || 'None detected'}
      </div>
    `;
  }

  // ============================================================================
  // SECTION 6: UI PANEL (~200 lines)
  // ============================================================================

  /**
   * Initialize module
   */
  function init() {
    initImageInput();
    setupUIEventListeners();
  }

  /**
   * Setup event listeners
   */
  function setupUIEventListeners() {
    const sensitivitySlider = document.getElementById('photo-cad-sensitivity');
    if (sensitivitySlider) {
      sensitivitySlider.addEventListener('input', (e) => setEdgeSensitivity(parseFloat(e.target.value)));
    }

    const refBtn = document.getElementById('photo-cad-set-ref-btn');
    if (refBtn) {
      refBtn.addEventListener('click', setReferenceDimension);
    }

    const reconstructBtn = document.getElementById('photo-cad-reconstruct-btn');
    if (reconstructBtn) {
      reconstructBtn.addEventListener('click', reconstruct3D);
    }

    const exportBtn = document.getElementById('photo-cad-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportModel);
    }
  }

  /**
   * Get UI panel HTML
   * @returns {HTMLElement}
   */
  function getUI() {
    const panel = document.createElement('div');
    panel.className = 'photo-cad-panel';
    panel.innerHTML = `
      <div class="photo-cad-header">
        <h3>Photo-to-CAD</h3>
        <p style="font-size:0.85rem;color:var(--text-secondary);">Convert photos to 3D models</p>
      </div>

      <div class="photo-cad-section">
        <h4>1. Upload Image</h4>
        <div id="photo-cad-drop-zone" class="photo-cad-drop-zone">
          <p>Drag image or click to browse</p>
          <input id="photo-cad-file-input" type="file" accept="image/*" style="display:none;">
        </div>
        <button id="photo-cad-camera-btn" class="photo-cad-btn-secondary" style="width:100%;margin-top:10px;">
          📷 Camera Capture
        </button>
      </div>

      <div class="photo-cad-section">
        <h4>2. Edge Detection</h4>
        <label>Sensitivity:
          <input id="photo-cad-sensitivity" type="range" min="0" max="1" step="0.1" value="0.5" style="width:100%;">
        </label>
        <div id="photo-cad-image-preview" style="margin-top:10px;"></div>
        <canvas id="photo-cad-edges-canvas" style="width:100%;max-width:100%;margin-top:10px;border-radius:4px;display:none;"></canvas>
      </div>

      <div class="photo-cad-section">
        <h4>3. Detected Features</h4>
        <div id="photo-cad-feature-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);padding:8px;border-radius:4px;"></div>
      </div>

      <div class="photo-cad-section">
        <h4>4. Reference Dimension</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>
            <label>Pixels:</label>
            <input id="photo-cad-ref-pixels" type="number" placeholder="0" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;">
          </div>
          <div>
            <label>mm:</label>
            <input id="photo-cad-ref-mm" type="number" placeholder="0" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;">
          </div>
        </div>
        <button id="photo-cad-set-ref-btn" class="photo-cad-btn-secondary" style="width:100%;margin-top:8px;">Set Scale</button>
      </div>

      <div class="photo-cad-section">
        <h4>5. AI Analysis</h4>
        <div id="photo-cad-ai-metadata" style="font-size:0.9rem;padding:8px;background:var(--bg-secondary);border-radius:4px;"></div>
      </div>

      <div class="photo-cad-section">
        <h4>3D Preview</h4>
        <div id="photo-cad-3d-preview" style="width:100%;height:300px;border:1px solid var(--border);border-radius:4px;background:var(--bg-secondary);"></div>
      </div>

      <div class="photo-cad-section">
        <button id="photo-cad-reconstruct-btn" class="photo-cad-btn-primary" style="width:100%;">Reconstruct 3D</button>
        <button id="photo-cad-export-btn" class="photo-cad-btn-secondary" style="width:100%;margin-top:8px;">Export Model</button>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .photo-cad-panel {
        padding: 15px;
        font-size: 0.9rem;
      }

      .photo-cad-header {
        border-bottom: 1px solid var(--border);
        padding-bottom: 10px;
        margin-bottom: 15px;
      }

      .photo-cad-header h3 {
        margin: 0 0 5px 0;
        font-size: 1.1rem;
      }

      .photo-cad-section {
        margin-bottom: 15px;
      }

      .photo-cad-section h4 {
        margin: 0 0 10px 0;
        font-size: 0.95rem;
        font-weight: 600;
      }

      .photo-cad-drop-zone {
        border: 2px dashed var(--border);
        border-radius: 8px;
        padding: 30px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        background: var(--bg-secondary);
      }

      .photo-cad-drop-zone:hover {
        border-color: var(--accent);
        background: var(--bg-secondary);
      }

      .photo-cad-drop-zone.highlight {
        border-color: var(--accent);
        background: rgba(74, 144, 226, 0.1);
      }

      .photo-cad-feature-item {
        display: flex;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid var(--border);
      }

      .photo-cad-feature-item:last-child {
        border-bottom: none;
      }

      .photo-cad-feature-item input {
        margin-right: 8px;
      }

      .photo-cad-feature-label {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        cursor: pointer;
      }

      .photo-cad-feature-type {
        display: inline-block;
        padding: 2px 6px;
        background: var(--accent);
        color: white;
        border-radius: 3px;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .photo-cad-btn-primary {
        width: 100%;
        padding: 10px;
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s;
      }

      .photo-cad-btn-primary:hover {
        opacity: 0.9;
      }

      .photo-cad-btn-secondary {
        width: 100%;
        padding: 8px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .photo-cad-btn-secondary:hover {
        border-color: var(--accent);
      }

      .photo-cad-ai-section {
        line-height: 1.5;
      }
    `;
    document.head.appendChild(style);

    return panel;
  }

  /**
   * Execute command
   * @param {string} command
   * @param {*} params
   */
  function execute(command, params) {
    switch (command) {
      case 'processImage':
        loadImage(params.dataUrl);
        break;
      case 'detectEdges':
        detectEdges();
        break;
      case 'toggleFeature':
        toggleFeature(params.featureId);
        break;
      case 'reconstruct':
        reconstruct3D();
        break;
      case 'setReference':
        state.referenceDimension = params;
        break;
      case 'exportModel':
        exportModel();
        break;
      default:
        console.warn('Unknown command:', command);
    }
  }

  /**
   * Export model as JSON or STL
   */
  function exportModel() {
    if (!state.threeDScene) {
      alert('Please reconstruct 3D model first');
      return;
    }

    // Export as glTF
    const data = JSON.stringify({
      metadata: state.aiMetadata,
      referenceDimension: state.referenceDimension,
      detectedFeatures: state.detectedFeatures,
      selectedFeatures: Array.from(state.selectedFeatures)
    });

    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.CycleCAD = window.CycleCAD || {};
  window.CycleCAD.PhotoToCAD = {
    init,
    getUI,
    execute,
    processImage: loadImage,
    detectEdges,
    reconstruct3D,
    state: () => state
  };

  console.log('Photo-to-CAD module loaded');
})();
