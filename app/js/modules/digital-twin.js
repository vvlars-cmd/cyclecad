/**
 * @fileoverview Digital Twin Live Data Module for cycleCAD
 * Real-time sensor data integration, 3D visualization, predictive analytics
 * Supports MQTT, REST API, WebSocket, and simulated sensor data
 * @version 1.0.0
 */

window.CycleCAD = window.CycleCAD || {};

/**
 * Digital Twin module - connects IoT sensors to 3D CAD model
 * @namespace CycleCAD.DigitalTwin
 */
window.CycleCAD.DigitalTwin = (() => {
  'use strict';

  // ============================================================================
  // SENSOR DATA SYSTEM
  // ============================================================================

  const SENSOR_TYPES = {
    TEMPERATURE: 'temperature',
    VIBRATION: 'vibration',
    PRESSURE: 'pressure',
    FORCE: 'force',
    DISPLACEMENT: 'displacement',
    RPM: 'rpm',
    FLOW_RATE: 'flow_rate',
    HUMIDITY: 'humidity',
    CURRENT: 'current',
    VOLTAGE: 'voltage'
  };

  const SENSOR_UNITS = {
    temperature: '°C',
    vibration: 'mm/s',
    pressure: 'bar',
    force: 'N',
    displacement: 'mm',
    rpm: 'RPM',
    flow_rate: 'L/min',
    humidity: '%RH',
    current: 'A',
    voltage: 'V'
  };

  const SENSOR_RANGES = {
    temperature: { min: -40, max: 120, safe: 80 },
    vibration: { min: 0, max: 50, safe: 20 },
    pressure: { min: 0, max: 10, safe: 8 },
    force: { min: 0, max: 1000, safe: 800 },
    displacement: { min: 0, max: 100, safe: 80 },
    rpm: { min: 0, max: 5000, safe: 4000 },
    flow_rate: { min: 0, max: 100, safe: 80 },
    humidity: { min: 0, max: 100, safe: 70 },
    current: { min: 0, max: 50, safe: 40 },
    voltage: { min: 0, max: 500, safe: 400 }
  };

  // Internal state
  const state = {
    sensors: new Map(), // id -> sensor object
    monitoringActive: false,
    dataBuffer: new Map(), // sensor id -> array of { timestamp, value }
    alertLog: [],
    dataSource: 'demo', // 'mqtt', 'rest', 'websocket', 'demo'
    refreshRate: 500, // ms
    mqttClient: null,
    wsConnection: null,
    pollIntervals: new Map(),
    activeAlerts: new Map(), // sensor id -> { severity, firstSeen, acknowledged }
    heatmapOverlay: null,
    scene: null,
    camera: null,
    colorLegend: null
  };

  /**
   * Create a new sensor
   * @param {string} id - Unique sensor ID
   * @param {string} name - Display name
   * @param {string} type - Sensor type (from SENSOR_TYPES)
   * @param {THREE.Vector3} position - 3D position on model
   * @param {string} partId - Feature/part ID this sensor is attached to
   * @param {number} min - Minimum threshold for warnings
   * @param {number} max - Maximum threshold for alerts
   * @returns {Object} Sensor object
   */
  function createSensor(id, name, type, position, partId, min, max) {
    const sensor = {
      id,
      name,
      type,
      unit: SENSOR_UNITS[type] || '',
      position: position.clone ? position.clone() : new THREE.Vector3(...position),
      partId,
      value: 0,
      min: min !== undefined ? min : SENSOR_RANGES[type].safe * 0.8,
      max: max !== undefined ? max : SENSOR_RANGES[type].safe * 1.2,
      history: [],
      alertThresholds: {
        warning: (SENSOR_RANGES[type].min + SENSOR_RANGES[type].max) * 0.7,
        critical: (SENSOR_RANGES[type].min + SENSOR_RANGES[type].max) * 0.9
      },
      lastUpdate: null,
      trend: 0, // -1, 0, 1 for down, stable, up
      anomalyScore: 0,
      displayLabel: null, // THREE.Sprite or canvas element
      heatmapMesh: null
    };
    state.sensors.set(id, sensor);
    state.dataBuffer.set(id, []);
    return sensor;
  }

  /**
   * Update sensor reading and trigger alerts
   * @param {string} sensorId
   * @param {number} value
   */
  function updateSensorValue(sensorId, value) {
    const sensor = state.sensors.get(sensorId);
    if (!sensor) return;

    const timestamp = Date.now();
    sensor.value = value;
    sensor.lastUpdate = timestamp;

    // Add to history (keep last 1000 readings)
    const buffer = state.dataBuffer.get(sensorId) || [];
    buffer.push({ timestamp, value });
    if (buffer.length > 1000) buffer.shift();
    state.dataBuffer.set(sensorId, buffer);

    // Calculate trend
    if (buffer.length >= 2) {
      const recent = buffer.slice(-5);
      const avg = recent.reduce((a, b) => a + b.value, 0) / recent.length;
      const prevAvg = buffer.length >= 10
        ? buffer.slice(-10, -5).reduce((a, b) => a + b.value, 0) / 5
        : buffer[0].value;
      sensor.trend = avg > prevAvg ? 1 : (avg < prevAvg ? -1 : 0);
    }

    // Anomaly detection (>3 sigma)
    if (buffer.length >= 10) {
      const recent = buffer.slice(-10).map(r => r.value);
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
      const stddev = Math.sqrt(variance);
      sensor.anomalyScore = Math.abs((value - mean) / (stddev || 1));
    }

    // Check thresholds
    checkAlerts(sensorId, value);
    updateVisualization(sensorId);
  }

  /**
   * Check alert thresholds with hysteresis
   */
  function checkAlerts(sensorId, value) {
    const sensor = state.sensors.get(sensorId);
    const currentAlert = state.activeAlerts.get(sensorId);

    let severity = null;
    if (value >= sensor.alertThresholds.critical) {
      severity = 'critical';
    } else if (value >= sensor.alertThresholds.warning) {
      severity = 'warning';
    }

    if (severity && !currentAlert) {
      // New alert
      const alertEntry = {
        sensorId,
        sensorName: sensor.name,
        severity,
        value,
        firstSeen: Date.now(),
        acknowledged: false,
        recovered: null
      };
      state.activeAlerts.set(sensorId, alertEntry);
      state.alertLog.push(alertEntry);
      triggerAlertActions(sensorId, severity);
    } else if (!severity && currentAlert) {
      // Alert recovered
      currentAlert.recovered = Date.now();
      state.activeAlerts.delete(sensorId);
    }
  }

  /**
   * Trigger visual/audio alerts
   */
  function triggerAlertActions(sensorId, severity) {
    const sensor = state.sensors.get(sensorId);
    if (!sensor) return;

    // Visual: flash the heatmap overlay
    if (state.heatmapOverlay) {
      state.heatmapOverlay.style.animation = severity === 'critical'
        ? 'pulse-critical 0.5s infinite'
        : 'pulse-warning 0.5s infinite';
    }

    // Audio: beep
    playAlertSound(severity);

    // Toast notification
    showToastNotification(
      `${sensor.name}: ${sensor.value.toFixed(2)} ${sensor.unit}`,
      severity
    );
  }

  /**
   * Simple alert sound
   */
  function playAlertSound(severity) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const freq = severity === 'critical' ? 800 : 600;
      const duration = severity === 'critical' ? 0.2 : 0.15;
      osc.frequency.value = freq;
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Audio context not available
    }
  }

  /**
   * Show toast notification
   */
  function showToastNotification(message, severity = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: ${severity === 'critical' ? '#dc2626' : severity === 'warning' ? '#ea580c' : '#3b82f6'};
      color: white; padding: 12px 16px; border-radius: 4px;
      font-size: 14px; z-index: 10000; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ============================================================================
  // DATA SOURCES
  // ============================================================================

  /**
   * Simulated sensor data with realistic noise
   */
  function generateSimulatedData(sensor) {
    const range = SENSOR_RANGES[sensor.type];
    const baseValue = range.min + (range.max - range.min) * 0.5;

    // Sine wave with noise
    const time = Date.now() / 1000;
    const frequency = 0.05;
    const amplitude = (range.max - range.min) * 0.15;
    const noise = (Math.random() - 0.5) * (range.max - range.min) * 0.05;

    return baseValue + amplitude * Math.sin(frequency * time) + noise;
  }

  /**
   * Connect to MQTT broker via WebSocket bridge
   */
  function connectMQTT(brokerUrl) {
    try {
      state.wsConnection = new WebSocket(brokerUrl);
      state.wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.sensorId && state.sensors.has(data.sensorId)) {
          updateSensorValue(data.sensorId, data.value);
        }
      };
      state.dataSource = 'mqtt';
    } catch (e) {
      console.error('MQTT connection failed:', e);
      state.dataSource = 'demo';
    }
  }

  /**
   * Connect via REST API polling
   */
  function connectREST(apiUrl) {
    state.dataSource = 'rest';

    for (const [sensorId, sensor] of state.sensors) {
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`${apiUrl}/sensors/${sensorId}/value`);
          const data = await response.json();
          updateSensorValue(sensorId, data.value);
        } catch (e) {
          console.error(`REST poll failed for ${sensorId}:`, e);
        }
      }, state.refreshRate);
      state.pollIntervals.set(sensorId, pollInterval);
    }
  }

  /**
   * Connect via WebSocket for real-time push
   */
  function connectWebSocket(wsUrl) {
    try {
      state.wsConnection = new WebSocket(wsUrl);
      state.wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.sensorId) {
          updateSensorValue(data.sensorId, data.value);
        }
      };
      state.dataSource = 'websocket';
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      state.dataSource = 'demo';
    }
  }

  // ============================================================================
  // 3D VISUALIZATION
  // ============================================================================

  /**
   * Apply heatmap overlay to mesh based on sensor values
   */
  function updateHeatmapOverlay() {
    if (!state.scene) return;

    // Find meshes and apply color gradient based on sensor proximity
    const meshes = [];
    state.scene.traverse(obj => {
      if (obj.isMesh && !obj.isHelper) meshes.push(obj);
    });

    if (meshes.length === 0) return;

    meshes.forEach(mesh => {
      if (!mesh.geometry.attributes.color) {
        mesh.geometry.setAttribute('color', new THREE.BufferAttribute(
          new Float32Array(mesh.geometry.attributes.position.count * 3),
          3
        ));
      }

      const colors = mesh.geometry.attributes.color;
      const positions = mesh.geometry.attributes.position;
      const colorArray = colors.array;

      for (let i = 0; i < positions.count; i++) {
        const px = positions.getX(i);
        const py = positions.getY(i);
        const pz = positions.getZ(i);
        const vertPos = new THREE.Vector3(px, py, pz);

        let closestValue = 0;
        let closestDist = Infinity;

        // Find nearest sensor
        for (const sensor of state.sensors.values()) {
          const dist = vertPos.distanceTo(sensor.position);
          if (dist < closestDist) {
            closestDist = dist;
            closestValue = sensor.value;
          }
        }

        // Map value to color (blue=cold, red=hot)
        const range = SENSOR_RANGES.temperature || { min: 0, max: 100 };
        const normalized = Math.max(0, Math.min(1, (closestValue - range.min) / (range.max - range.min)));

        // Interpolate blue -> cyan -> green -> yellow -> red
        let r, g, b;
        if (normalized < 0.25) {
          // Blue to cyan
          r = 0; g = normalized * 4; b = 1;
        } else if (normalized < 0.5) {
          // Cyan to green
          r = 0; g = 1; b = 1 - (normalized - 0.25) * 4;
        } else if (normalized < 0.75) {
          // Green to yellow
          r = (normalized - 0.5) * 4; g = 1; b = 0;
        } else {
          // Yellow to red
          r = 1; g = 1 - (normalized - 0.75) * 4; b = 0;
        }

        colorArray[i * 3] = r;
        colorArray[i * 3 + 1] = g;
        colorArray[i * 3 + 2] = b;
      }

      colors.needsUpdate = true;
      mesh.material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.3
      });
    });
  }

  /**
   * Update sensor visualization for individual sensor
   */
  function updateVisualization(sensorId) {
    const sensor = state.sensors.get(sensorId);
    if (!sensor || !state.scene) return;

    // Update floating label
    if (!sensor.displayLabel) {
      sensor.displayLabel = createFloatingLabel(sensor);
      state.scene.add(sensor.displayLabel);
    }

    // Update heatmap
    updateHeatmapOverlay();

    // Alert indicator (pulsing red sphere)
    const alert = state.activeAlerts.get(sensorId);
    if (alert && !sensor.alertIndicator) {
      const geom = new THREE.SphereGeometry(0.5, 8, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: alert.severity === 'critical' ? 0xff0000 : 0xffaa00,
        emissive: alert.severity === 'critical' ? 0xff0000 : 0xffaa00,
        emissiveIntensity: 0.8
      });
      sensor.alertIndicator = new THREE.Mesh(geom, mat);
      sensor.alertIndicator.position.copy(sensor.position);
      sensor.alertIndicator.scale.set(0.3, 0.3, 0.3);
      state.scene.add(sensor.alertIndicator);
    }
  }

  /**
   * Create floating 3D label for sensor
   */
  function createFloatingLabel(sensor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, 256, 128);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(sensor.name, 128, 30);

    ctx.font = '20px Arial';
    ctx.fillStyle = '#00ff00';
    const valueText = `${sensor.value.toFixed(2)} ${sensor.unit}`;
    ctx.fillText(valueText, 128, 70);

    ctx.font = '12px Arial';
    ctx.fillStyle = '#cccccc';
    const trend = sensor.trend > 0 ? '↑' : (sensor.trend < 0 ? '↓' : '→');
    ctx.fillText(trend, 128, 110);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const label = new THREE.Sprite(material);
    label.scale.set(2, 1, 1);
    label.position.copy(sensor.position).add(new THREE.Vector3(0, 1, 0));

    return label;
  }

  /**
   * Add flow visualization (animated particles)
   */
  function addFlowVisualization(sensorId, pathPoints) {
    const sensor = state.sensors.get(sensorId);
    if (!sensor || !state.scene || sensor.type !== SENSOR_TYPES.FLOW_RATE) return;

    // Create particle system along path
    const particleCount = Math.ceil(sensor.value / 5);
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const t = (i / particleCount);
      const point = getPointAlongPath(pathPoints, t);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x0088ff, size: 0.1 });

    if (sensor.flowParticles) state.scene.remove(sensor.flowParticles);
    sensor.flowParticles = new THREE.Points(geom, mat);
    state.scene.add(sensor.flowParticles);
  }

  function getPointAlongPath(pathPoints, t) {
    const segmentIndex = Math.floor(t * (pathPoints.length - 1));
    const nextIndex = Math.min(segmentIndex + 1, pathPoints.length - 1);
    const localT = t * (pathPoints.length - 1) - segmentIndex;

    const p1 = pathPoints[segmentIndex];
    const p2 = pathPoints[nextIndex];
    return p1.clone().lerp(p2, localT);
  }

  /**
   * Vibration animation - shake mesh proportionally
   */
  function updateVibrationAnimation() {
    for (const [sensorId, sensor] of state.sensors) {
      if (sensor.type !== SENSOR_TYPES.VIBRATION) continue;

      // Find mesh associated with sensor's partId
      if (!sensor.heatmapMesh && state.scene) {
        state.scene.traverse(obj => {
          if (obj.isMesh && obj.userData.partId === sensor.partId) {
            sensor.heatmapMesh = obj;
          }
        });
      }

      if (sensor.heatmapMesh) {
        const magnitude = sensor.value / SENSOR_RANGES.vibration.max;
        const shake = 0.01 * magnitude;

        sensor.heatmapMesh.position.x += (Math.random() - 0.5) * shake;
        sensor.heatmapMesh.position.y += (Math.random() - 0.5) * shake;
        sensor.heatmapMesh.position.z += (Math.random() - 0.5) * shake;
      }
    }
  }

  // ============================================================================
  // PREDICTIVE ANALYTICS
  // ============================================================================

  /**
   * Linear extrapolation - when will sensor hit critical?
   */
  function estimateTimeToThreshold(sensorId) {
    const sensor = state.sensors.get(sensorId);
    const buffer = state.dataBuffer.get(sensorId);

    if (!sensor || buffer.length < 10) return null;

    const recent = buffer.slice(-10);
    const times = recent.map(r => r.timestamp);
    const values = recent.map(r => r.value);

    // Linear regression
    const n = times.length;
    const sumT = times.reduce((a, b) => a + b, 0);
    const sumV = values.reduce((a, b) => a + b, 0);
    const sumTT = times.reduce((a, t) => a + t * t, 0);
    const sumTV = times.reduce((a, t, i) => a + t * values[i], 0);

    const slope = (n * sumTV - sumT * sumV) / (n * sumTT - sumT * sumT);
    const intercept = (sumV - slope * sumT) / n;

    if (slope <= 0) return null; // Not increasing

    const threshold = sensor.alertThresholds.critical;
    const timeToThreshold = (threshold - intercept) / slope;
    const secondsToThreshold = (timeToThreshold - Date.now()) / 1000;

    return secondsToThreshold > 0 ? secondsToThreshold : null;
  }

  /**
   * Estimate remaining useful life (RUL) based on degradation
   */
  function estimateRUL(sensorId, operatingHours) {
    const sensor = state.sensors.get(sensorId);
    const buffer = state.dataBuffer.get(sensorId);

    if (!sensor || buffer.length < 50) return null;

    const oldestTime = buffer[0].timestamp;
    const newestTime = buffer[buffer.length - 1].timestamp;
    const timeDelta = (newestTime - oldestTime) / (1000 * 3600); // hours

    const oldestValue = buffer[0].value;
    const newestValue = buffer[buffer.length - 1].value;
    const degradationRate = (newestValue - oldestValue) / timeDelta;

    if (degradationRate <= 0) return null;

    const threshold = sensor.alertThresholds.critical;
    const hoursToThreshold = (threshold - newestValue) / degradationRate;

    return {
      estimatedHours: hoursToThreshold,
      recommendedMaintenance: Math.ceil(hoursToThreshold * 0.8),
      confidence: Math.min(buffer.length / 100, 1) // 0-1
    };
  }

  /**
   * Anomaly detection
   */
  function detectAnomalies(sensorId) {
    const sensor = state.sensors.get(sensorId);
    const buffer = state.dataBuffer.get(sensorId);

    if (!sensor || buffer.length < 20) return [];

    const recent = buffer.slice(-20).map(r => r.value);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
    const stddev = Math.sqrt(variance);

    const anomalies = [];
    for (let i = 0; i < buffer.length; i++) {
      const zScore = Math.abs((buffer[i].value - mean) / (stddev || 1));
      if (zScore > 3) {
        anomalies.push({
          timestamp: buffer[i].timestamp,
          value: buffer[i].value,
          zScore
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate maintenance report
   */
  function generateMaintenanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      sensors: [],
      summary: {
        healthy: 0,
        warning: 0,
        critical: 0,
        anomalies: 0
      }
    };

    for (const [sensorId, sensor] of state.sensors) {
      const rul = estimateRUL(sensorId, 0);
      const timeToThreshold = estimateTimeToThreshold(sensorId);
      const anomalies = detectAnomalies(sensorId);

      const sensorReport = {
        id: sensorId,
        name: sensor.name,
        type: sensor.type,
        currentValue: sensor.value,
        trend: sensor.trend,
        rul,
        timeToThreshold,
        anomalyCount: anomalies.length,
        status: state.activeAlerts.has(sensorId)
          ? state.activeAlerts.get(sensorId).severity
          : 'healthy'
      };

      report.sensors.push(sensorReport);

      if (sensorReport.status === 'healthy') report.summary.healthy++;
      else if (sensorReport.status === 'warning') report.summary.warning++;
      else if (sensorReport.status === 'critical') report.summary.critical++;
      report.summary.anomalies += anomalies.length;
    }

    return report;
  }

  // ============================================================================
  // DASHBOARD UI
  // ============================================================================

  /**
   * Get UI panel HTML
   */
  function getUI() {
    const alertCount = state.activeAlerts.size;
    const report = generateMaintenanceReport();

    return `
      <div class="digital-twin-panel" style="display: flex; flex-direction: column; height: 100%; background: var(--bg-secondary); color: var(--text-primary);">
        <style>
          .digital-twin-panel {
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
          }
          .dt-tabs {
            display: flex; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary);
          }
          .dt-tab {
            flex: 1; padding: 10px; cursor: pointer; text-align: center; border: none;
            background: var(--bg-tertiary); color: var(--text-secondary); font-size: 12px;
          }
          .dt-tab.active {
            border-bottom: 2px solid var(--accent-color); color: var(--accent-color); background: var(--bg-secondary);
          }
          .dt-content {
            flex: 1; overflow-y: auto; padding: 10px; display: none;
          }
          .dt-content.active {
            display: block;
          }
          .dt-status-bar {
            padding: 8px 10px; background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color);
            display: flex; justify-content: space-between; align-items: center;
          }
          .dt-status-badge {
            display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;
          }
          .dt-status-badge.online { background: #10b981; color: white; }
          .dt-status-badge.offline { background: #ef4444; color: white; }
          .dt-sensor-card {
            background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px;
            padding: 10px; margin-bottom: 8px; cursor: pointer;
          }
          .dt-sensor-card:hover {
            background: var(--bg-quaternary);
          }
          .dt-sensor-header {
            display: flex; justify-content: space-between; margin-bottom: 6px;
          }
          .dt-sensor-name {
            font-weight: bold; color: var(--text-primary);
          }
          .dt-sensor-value {
            font-size: 14px; font-weight: bold; font-family: 'Monaco', monospace;
          }
          .dt-sensor-trend {
            font-size: 12px; margin-left: 4px;
          }
          .dt-gauge {
            width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(#10b981 0%, #f59e0b 70%, #ef4444 100%);
            display: flex; align-items: center; justify-content: center; margin: 10px auto;
            font-weight: bold; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          }
          .dt-sparkline {
            height: 30px; margin-top: 6px;
          }
          .dt-alert-item {
            background: var(--bg-tertiary); border-left: 3px solid #ef4444; padding: 8px;
            margin-bottom: 6px; border-radius: 2px;
          }
          .dt-alert-item.warning {
            border-left-color: #f59e0b;
          }
          .dt-control-group {
            display: flex; gap: 8px; margin-bottom: 10px;
          }
          .dt-button {
            padding: 6px 12px; background: var(--accent-color); color: white; border: none;
            border-radius: 3px; cursor: pointer; font-size: 12px; flex: 1;
          }
          .dt-button:hover {
            opacity: 0.9;
          }
          .dt-select {
            padding: 4px 8px; background: var(--bg-tertiary); color: var(--text-primary);
            border: 1px solid var(--border-color); border-radius: 2px; font-size: 12px;
          }
          @keyframes pulse-critical {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes pulse-warning {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 0.6; }
          }
        </style>

        <div class="dt-status-bar">
          <span>Digital Twin</span>
          <span class="dt-status-badge ${state.monitoringActive ? 'online' : 'offline'}">
            ${state.monitoringActive ? 'MONITORING' : 'OFFLINE'}
          </span>
        </div>

        <div class="dt-tabs">
          <button class="dt-tab active" onclick="CycleCAD.DigitalTwin.switchTab('live')">Live</button>
          <button class="dt-tab" onclick="CycleCAD.DigitalTwin.switchTab('dashboard')">Dashboard</button>
          <button class="dt-tab" onclick="CycleCAD.DigitalTwin.switchTab('alerts')">Alerts <span style="color: #ef4444;">(${alertCount})</span></button>
          <button class="dt-tab" onclick="CycleCAD.DigitalTwin.switchTab('analytics')">Analytics</button>
          <button class="dt-tab" onclick="CycleCAD.DigitalTwin.switchTab('config')">Config</button>
        </div>

        <!-- LIVE TAB -->
        <div class="dt-content active" id="dt-live-tab" style="overflow-y: auto;">
          <div class="dt-control-group">
            <button class="dt-button" onclick="CycleCAD.DigitalTwin.startMonitoring()">Start</button>
            <button class="dt-button" onclick="CycleCAD.DigitalTwin.stopMonitoring()">Stop</button>
          </div>
          <div style="margin-bottom: 8px;">
            <label>Data Source:</label>
            <select class="dt-select" onchange="CycleCAD.DigitalTwin.setDataSource(this.value)">
              <option value="demo">Demo (Simulated)</option>
              <option value="rest">REST API</option>
              <option value="websocket">WebSocket</option>
              <option value="mqtt">MQTT</option>
            </select>
          </div>
          <div style="margin-bottom: 8px;">
            <label>Refresh Rate:</label>
            <select class="dt-select" onchange="CycleCAD.DigitalTwin.setRefreshRate(parseInt(this.value))">
              <option value="100">100ms</option>
              <option value="500" selected>500ms</option>
              <option value="1000">1s</option>
              <option value="5000">5s</option>
            </select>
          </div>
          <div id="dt-sensor-list"></div>
        </div>

        <!-- DASHBOARD TAB -->
        <div class="dt-content" id="dt-dashboard-tab">
          <div id="dt-gauge-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;"></div>
        </div>

        <!-- ALERTS TAB -->
        <div class="dt-content" id="dt-alerts-tab">
          <div style="margin-bottom: 10px;">
            <strong>Active Alerts (${alertCount})</strong>
          </div>
          <div id="dt-active-alerts"></div>
          <div style="margin: 10px 0; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <strong>Alert History</strong>
          </div>
          <div id="dt-alert-history" style="max-height: 300px; overflow-y: auto;"></div>
        </div>

        <!-- ANALYTICS TAB -->
        <div class="dt-content" id="dt-analytics-tab">
          <div id="dt-analytics-summary" style="margin-bottom: 15px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
              <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 3px; text-align: center;">
                <div style="font-size: 20px; font-weight: bold; color: #10b981;">${report.summary.healthy}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">Healthy</div>
              </div>
              <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 3px; text-align: center;">
                <div style="font-size: 20px; font-weight: bold; color: #ef4444;">${report.summary.critical}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">Critical</div>
              </div>
            </div>
          </div>
          <div id="dt-rul-list"></div>
          <button class="dt-button" onclick="CycleCAD.DigitalTwin.exportAnalytics()" style="margin-top: 10px;">Export Report (JSON)</button>
        </div>

        <!-- CONFIG TAB -->
        <div class="dt-content" id="dt-config-tab">
          <div style="margin-bottom: 10px;">
            <h4>Add New Sensor</h4>
            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 3px;">
              <input type="text" placeholder="Sensor ID" id="dt-sensor-id" class="dt-select" style="width: 100%; margin-bottom: 6px;">
              <input type="text" placeholder="Name" id="dt-sensor-name" class="dt-select" style="width: 100%; margin-bottom: 6px;">
              <select id="dt-sensor-type" class="dt-select" style="width: 100%; margin-bottom: 6px;">
                <option value="temperature">Temperature</option>
                <option value="vibration">Vibration</option>
                <option value="pressure">Pressure</option>
                <option value="force">Force</option>
              </select>
              <button class="dt-button" onclick="CycleCAD.DigitalTwin.addSensorUI()" style="margin-top: 8px;">Add Sensor</button>
            </div>
          </div>
          <div>
            <h4>Active Sensors (${state.sensors.size})</h4>
            <div id="dt-sensor-list-config"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Update live sensor list
   */
  function updateSensorList() {
    const container = document.getElementById('dt-sensor-list');
    if (!container) return;

    let html = '';
    for (const [sensorId, sensor] of state.sensors) {
      const trend = sensor.trend > 0 ? '↑' : (sensor.trend < 0 ? '↓' : '→');
      const alert = state.activeAlerts.get(sensorId);
      const statusColor = !alert ? '#10b981' : (alert.severity === 'critical' ? '#ef4444' : '#f59e0b');

      html += `
        <div class="dt-sensor-card" style="border-left: 3px solid ${statusColor};">
          <div class="dt-sensor-header">
            <span class="dt-sensor-name">${sensor.name}</span>
            <span class="dt-sensor-value">${sensor.value.toFixed(2)} ${sensor.unit}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
            <span>${sensor.type}</span>
            <span class="dt-sensor-trend">${trend}</span>
          </div>
          <svg class="dt-sparkline" id="sparkline-${sensorId}"></svg>
        </div>
      `;
    }
    container.innerHTML = html || '<div style="color: var(--text-secondary);">No sensors configured</div>';

    // Draw sparklines
    drawSparklines();
  }

  /**
   * Draw mini sparkline charts
   */
  function drawSparklines() {
    for (const [sensorId, sensor] of state.sensors) {
      const svg = document.getElementById(`sparkline-${sensorId}`);
      if (!svg) continue;

      const buffer = state.dataBuffer.get(sensorId) || [];
      if (buffer.length < 2) continue;

      const width = 100;
      const height = 30;
      const recent = buffer.slice(-50);

      const minVal = Math.min(...recent.map(r => r.value));
      const maxVal = Math.max(...recent.map(r => r.value));
      const range = maxVal - minVal || 1;

      let pathData = '';
      recent.forEach((point, i) => {
        const x = (i / (recent.length - 1)) * width;
        const y = height - ((point.value - minVal) / range) * height;
        pathData += `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      });

      svg.innerHTML = `
        <polyline points="${pathData.replace(/^M /, '').split('L').map((p, i) => {
          const [x, y] = p.trim().split(' ');
          return `${x},${y}`;
        }).join(' ')}"
        style="fill: none; stroke: var(--accent-color); stroke-width: 1.5;" vector-effect="non-scaling-stroke" />
      `;
    }
  }

  /**
   * Switch tab visibility
   */
  function switchTab(tabName) {
    // Hide all
    document.querySelectorAll('.dt-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.dt-tab').forEach(el => el.classList.remove('active'));

    // Show selected
    const contentEl = document.getElementById(`dt-${tabName}-tab`);
    if (contentEl) {
      contentEl.classList.add('active');
      event.target.classList.add('active');

      // Lazy render
      if (tabName === 'dashboard') renderDashboard();
      if (tabName === 'alerts') renderAlerts();
      if (tabName === 'analytics') renderAnalytics();
      if (tabName === 'config') renderConfig();
    }
  }

  function renderDashboard() {
    const grid = document.getElementById('dt-gauge-grid');
    if (!grid) return;

    let html = '';
    for (const [sensorId, sensor] of state.sensors) {
      const normalized = (sensor.value - SENSOR_RANGES[sensor.type].min) /
                         (SENSOR_RANGES[sensor.type].max - SENSOR_RANGES[sensor.type].min);
      const angle = normalized * 180;

      html += `
        <div style="text-align: center;">
          <div class="dt-gauge" style="background: conic-gradient(#10b981 0deg, #f59e0b 126deg, #ef4444 180deg);">
            ${sensor.value.toFixed(1)}<br><span style="font-size: 10px;">${sensor.unit}</span>
          </div>
          <div style="font-size: 12px; font-weight: bold;">${sensor.name}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">${sensor.type}</div>
        </div>
      `;
    }
    grid.innerHTML = html;
  }

  function renderAlerts() {
    const activeDiv = document.getElementById('dt-active-alerts');
    const historyDiv = document.getElementById('dt-alert-history');

    let activeHtml = '';
    for (const [sensorId, alert] of state.activeAlerts) {
      const duration = ((Date.now() - alert.firstSeen) / 1000 / 60).toFixed(1);
      activeHtml += `
        <div class="dt-alert-item ${alert.severity}">
          <div style="font-weight: bold;">${alert.sensorName}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">
            ${alert.value.toFixed(2)} - ${duration} minutes ago
          </div>
        </div>
      `;
    }
    activeDiv.innerHTML = activeHtml || '<div style="color: var(--text-secondary);">No active alerts</div>';

    let historyHtml = '';
    state.alertLog.slice(-10).reverse().forEach(alert => {
      const duration = alert.recovered
        ? ((alert.recovered - alert.firstSeen) / 1000 / 60).toFixed(1)
        : 'ongoing';
      historyHtml += `
        <div class="dt-alert-item ${alert.severity}" style="font-size: 11px;">
          <div>${alert.sensorName}</div>
          <div style="color: var(--text-secondary);">${duration} min (${new Date(alert.firstSeen).toLocaleTimeString()})</div>
        </div>
      `;
    });
    historyDiv.innerHTML = historyHtml;
  }

  function renderAnalytics() {
    const rulDiv = document.getElementById('dt-rul-list');

    let html = '';
    for (const [sensorId, sensor] of state.sensors) {
      const rul = estimateRUL(sensorId, 0);
      const timeToThreshold = estimateTimeToThreshold(sensorId);

      html += `
        <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 3px; margin-bottom: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">${sensor.name}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">
            ${rul ? `RUL: ${rul.estimatedHours.toFixed(1)}h (${(rul.confidence * 100).toFixed(0)}% confidence)` : 'Insufficient data'}
          </div>
          ${timeToThreshold ? `<div style="font-size: 11px; color: #ef4444;">Critical threshold in ${(timeToThreshold / 3600).toFixed(1)}h</div>` : ''}
        </div>
      `;
    }
    rulDiv.innerHTML = html;
  }

  function renderConfig() {
    const configDiv = document.getElementById('dt-sensor-list-config');
    let html = '';
    for (const [sensorId, sensor] of state.sensors) {
      html += `
        <div style="background: var(--bg-tertiary); padding: 6px; border-radius: 3px; margin-bottom: 6px; font-size: 12px;">
          <div><strong>${sensor.name}</strong></div>
          <div style="color: var(--text-secondary);">${sensor.id} • ${sensor.type}</div>
          <button class="dt-button" style="margin-top: 4px; padding: 3px 8px;" onclick="CycleCAD.DigitalTwin.removeSensor('${sensorId}')">Remove</button>
        </div>
      `;
    }
    configDiv.innerHTML = html;
  }

  function addSensorUI() {
    const id = document.getElementById('dt-sensor-id').value;
    const name = document.getElementById('dt-sensor-name').value;
    const type = document.getElementById('dt-sensor-type').value;

    if (!id || !name) {
      alert('Please fill in all fields');
      return;
    }

    createSensor(id, name, type, new THREE.Vector3(0, 0, 0), 'root');
    updateSensorList();
    document.getElementById('dt-sensor-id').value = '';
    document.getElementById('dt-sensor-name').value = '';
  }

  function removeSensor(sensorId) {
    state.sensors.delete(sensorId);
    state.dataBuffer.delete(sensorId);
    state.activeAlerts.delete(sensorId);
    updateSensorList();
  }

  function exportAnalytics() {
    const report = generateMaintenanceReport();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital-twin-report-${Date.now()}.json`;
    a.click();
  }

  // ============================================================================
  // MONITORING LOOP
  // ============================================================================

  function startMonitoring() {
    if (state.monitoringActive) return;
    state.monitoringActive = true;

    const monitorLoop = setInterval(() => {
      if (!state.monitoringActive) {
        clearInterval(monitorLoop);
        return;
      }

      // Update all sensors
      for (const [sensorId, sensor] of state.sensors) {
        let value;
        if (state.dataSource === 'demo') {
          value = generateSimulatedData(sensor);
        }
        // For MQTT/REST/WebSocket, data updates come via callbacks
        if (value !== undefined) {
          updateSensorValue(sensorId, value);
        }
      }

      // Update animations
      updateVibrationAnimation();
      updateHeatmapOverlay();

      // Refresh UI
      updateSensorList();
    }, state.refreshRate);

    state.monitoringActive = true;
  }

  function stopMonitoring() {
    state.monitoringActive = false;

    // Stop REST polling
    for (const interval of state.pollIntervals.values()) {
      clearInterval(interval);
    }
    state.pollIntervals.clear();
  }

  function setDataSource(source) {
    state.dataSource = source;
    if (source === 'rest') connectREST('http://localhost:3000/api');
    else if (source === 'websocket') connectWebSocket('ws://localhost:3001');
    else if (source === 'mqtt') connectMQTT('ws://localhost:9001');
  }

  function setRefreshRate(ms) {
    state.refreshRate = ms;
    if (state.monitoringActive) {
      stopMonitoring();
      startMonitoring();
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    init(scene, camera) {
      state.scene = scene;
      state.camera = camera;

      // Create example cycleWASH sensors
      createSensor('temp-motor', 'Motor Temperature', 'temperature', new THREE.Vector3(2, 1, 0), 'motor', 70, 90);
      createSensor('vibr-brush', 'Brush Vibration', 'vibration', new THREE.Vector3(-2, 0, 1), 'brush', 10, 25);
      createSensor('press-water', 'Water Pressure', 'pressure', new THREE.Vector3(0, 2, -1), 'pump', 6, 9);
      createSensor('current-motor', 'Motor Current', 'current', new THREE.Vector3(1, 1, 1), 'motor', 30, 45);
    },

    getUI,
    execute(command, params) {
      if (command === 'update') {
        updateSensorValue(params.sensorId, params.value);
      } else if (command === 'addSensor') {
        return createSensor(params.id, params.name, params.type, params.position, params.partId, params.min, params.max);
      } else if (command === 'getReport') {
        return generateMaintenanceReport();
      }
    },

    connectSensor(sensorId, position, partId) {
      const sensor = state.sensors.get(sensorId);
      if (sensor) {
        sensor.position.copy(position);
        sensor.partId = partId;
        updateVisualization(sensorId);
      }
    },

    addOverlay(type) {
      if (type === 'heatmap') {
        updateHeatmapOverlay();
      }
    },

    startMonitoring,
    stopMonitoring,
    setDataSource,
    setRefreshRate,
    switchTab,
    updateSensorList,
    addSensorUI,
    removeSensor,
    exportAnalytics,

    // Internal state access (debug)
    _state: () => state
  };
})();
