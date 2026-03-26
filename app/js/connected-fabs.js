/**
 * connected-fabs.js — Connected Fab Shop Network for cycleCAD
 *
 * Implements the "CAD → CAM → Connected Fabs" pipeline from architecture slide 10.
 * Connects designs directly to distributed manufacturing partners for:
 * - CNC machining (3/5-axis milling, turning)
 * - 3D printing (FDM, SLA, SLS)
 * - Laser cutting
 * - Sheet metal (bending, welding)
 * - PCB manufacturing
 * - Injection molding
 *
 * The module manages:
 * - Fab shop registry with capabilities, pricing, locations
 * - Smart routing (find best fab for part requirements)
 * - Job submission with token escrow
 * - Webhook simulation for manufacturing status updates
 * - Job history and tracking
 * - UI panel with 4 tabs (Browse Fabs, Submit Job, My Jobs, Fab Dashboard)
 *
 * Storage: localStorage key 'cyclecad_fab_registry' + 'cyclecad_fab_jobs'
 * Integration: Uses window.cycleCAD.tokens for escrow, fires custom events
 */

(function() {
  'use strict';

  // ============================================================================
  // Constants
  // ============================================================================

  const STORAGE_KEYS = {
    registry: 'cyclecad_fab_registry',
    jobs: 'cyclecad_fab_jobs',
    jobCounter: 'cyclecad_job_counter',
  };

  const JOB_STATES = {
    DRAFT: { label: 'Draft', color: '#a0a0a0', icon: '◯' },
    SUBMITTED: { label: 'Submitted', color: '#58a6ff', icon: '📤' },
    ACCEPTED: { label: 'Accepted', color: '#3fb950', icon: '✓' },
    IN_PROGRESS: { label: 'In Progress', color: '#d29922', icon: '⚙' },
    QC: { label: 'Quality Check', color: '#d29922', icon: '✔' },
    SHIPPED: { label: 'Shipped', color: '#58a6ff', icon: '📦' },
    DELIVERED: { label: 'Delivered', color: '#3fb950', icon: '🏁' },
    COMPLETED: { label: 'Completed', color: '#3fb950', icon: '✓' },
    CANCELLED: { label: 'Cancelled', color: '#f85149', icon: '✕' },
  };

  const MANUFACTURING_TYPES = {
    '3d_print_fdm': { label: '3D Print (FDM)', cost: 25, unit: 'tokens' },
    '3d_print_sla': { label: '3D Print (SLA)', cost: 35, unit: 'tokens' },
    '3d_print_sls': { label: '3D Print (SLS)', cost: 30, unit: 'tokens' },
    'laser_cut': { label: 'Laser Cut', cost: 15, unit: 'tokens' },
    'cnc_3axis': { label: 'CNC 3-Axis', cost: 60, unit: 'tokens' },
    'cnc_5axis': { label: 'CNC 5-Axis', cost: 100, unit: 'tokens' },
    'cnc_lathe': { label: 'CNC Lathe (Turning)', cost: 40, unit: 'tokens' },
    'injection_mold': { label: 'Injection Mold', cost: 250, unit: 'tokens' },
    'sheet_metal': { label: 'Sheet Metal', cost: 45, unit: 'tokens' },
    'pcb_mfg': { label: 'PCB Manufacturing', cost: 50, unit: 'tokens' },
    'waterjet_cut': { label: 'Waterjet Cut', cost: 50, unit: 'tokens' },
    'bending': { label: 'Sheet Bending', cost: 35, unit: 'tokens' },
  };

  // ============================================================================
  // Demo Fab Data
  // ============================================================================

  const DEMO_FABS = [
    {
      id: 'fab_001',
      name: 'Berlin CNC Works',
      location: { city: 'Berlin', country: 'DE', lat: 52.52, lng: 13.41 },
      capabilities: ['cnc_3axis', 'cnc_5axis', 'laser_cut', 'waterjet_cut'],
      materials: ['aluminum', 'steel', 'brass', 'acetal', 'nylon', 'titanium'],
      maxPartSize: { x: 500, y: 500, z: 300 },
      pricing: {
        cnc_3axis: 0.08,      // € per mm³
        cnc_5axis: 0.15,
        laser_cut: 0.03,      // € per mm
        waterjet_cut: 0.12,
      },
      leadTime: { standard: 5, express: 2 },
      rating: 4.7,
      reviews: 142,
      certifications: ['ISO 9001', 'AS9100', 'DIN 65151'],
      status: 'active',
      webhookUrl: 'https://api.berlincnc.de/webhook',
      apiKey: null,
      description: 'High-precision CNC machining with 40 years experience in automotive',
    },
    {
      id: 'fab_002',
      name: 'Munich Additive',
      location: { city: 'Munich', country: 'DE', lat: 48.14, lng: 11.58 },
      capabilities: ['3d_print_fdm', '3d_print_sla', '3d_print_sls'],
      materials: ['pla', 'petg', 'abs', 'nylon', 'resin_standard', 'resin_tough', 'resin_flex'],
      maxPartSize: { x: 300, y: 300, z: 400 },
      pricing: {
        '3d_print_fdm': 0.02,
        '3d_print_sla': 0.05,
        '3d_print_sls': 0.08,
      },
      leadTime: { standard: 3, express: 1 },
      rating: 4.8,
      reviews: 356,
      certifications: ['ISO 13485'],
      status: 'active',
      webhookUrl: 'https://api.munich-additive.de/webhook',
      apiKey: null,
      description: 'Expert in functional 3D printed parts. Medical and industrial focus.',
    },
    {
      id: 'fab_003',
      name: 'Rotterdam Metal',
      location: { city: 'Rotterdam', country: 'NL', lat: 51.92, lng: 4.47 },
      capabilities: ['cnc_3axis', 'cnc_lathe', 'bending', 'sheet_metal', 'waterjet_cut'],
      materials: ['steel', 'aluminum', 'copper', 'brass', 'stainless_steel'],
      maxPartSize: { x: 1000, y: 800, z: 500 },
      pricing: {
        cnc_3axis: 0.07,
        cnc_lathe: 0.06,
        bending: 0.04,
        sheet_metal: 0.05,
        waterjet_cut: 0.10,
      },
      leadTime: { standard: 4, express: 2 },
      rating: 4.5,
      reviews: 89,
      certifications: ['ISO 9001', 'ISO 14001'],
      status: 'active',
      webhookUrl: 'https://api.rotterdam-metal.nl/webhook',
      apiKey: null,
      description: 'Full-service metal fabrication. Specializes in large assemblies and sheet metal.',
    },
    {
      id: 'fab_004',
      name: 'Lyon Precision',
      location: { city: 'Lyon', country: 'FR', lat: 45.76, lng: 4.84 },
      capabilities: ['cnc_5axis', 'cnc_lathe', 'laser_cut'],
      materials: ['aluminum', 'titanium', 'steel', 'inconel', 'carbon_fiber'],
      maxPartSize: { x: 400, y: 400, z: 250 },
      pricing: {
        cnc_5axis: 0.16,
        cnc_lathe: 0.07,
        laser_cut: 0.04,
      },
      leadTime: { standard: 6, express: 3 },
      rating: 4.9,
      reviews: 234,
      certifications: ['ISO 9001', 'AS9100', 'NADCAP'],
      status: 'active',
      webhookUrl: 'https://api.lyon-precision.fr/webhook',
      apiKey: null,
      description: 'Aerospace-grade precision. 5-axis work on exotic materials.',
    },
    {
      id: 'fab_005',
      name: 'Milano Rapid',
      location: { city: 'Milan', country: 'IT', lat: 45.46, lng: 9.19 },
      capabilities: ['3d_print_sla', '3d_print_sls', 'injection_mold'],
      materials: ['resin_standard', 'resin_tough', 'nylon_sls', 'thermoplastic_polyurethane'],
      maxPartSize: { x: 250, y: 250, z: 300 },
      pricing: {
        '3d_print_sla': 0.06,
        '3d_print_sls': 0.09,
        injection_mold: 0.25,
      },
      leadTime: { standard: 2, express: 1 },
      rating: 4.6,
      reviews: 178,
      certifications: ['ISO 9001', 'IATF 16949'],
      status: 'active',
      webhookUrl: 'https://api.milano-rapid.it/webhook',
      apiKey: null,
      description: 'Rapid prototyping and low-volume injection molding. Fashion tech partner.',
    },
    {
      id: 'fab_006',
      name: 'Barcelona Sheet',
      location: { city: 'Barcelona', country: 'ES', lat: 41.39, lng: 2.17 },
      capabilities: ['laser_cut', 'bending', 'sheet_metal', 'waterjet_cut'],
      materials: ['steel', 'aluminum', 'acrylic', 'wood', 'cardboard', 'leather'],
      maxPartSize: { x: 2000, y: 1000, z: 50 },
      pricing: {
        laser_cut: 0.02,
        bending: 0.03,
        sheet_metal: 0.04,
        waterjet_cut: 0.08,
      },
      leadTime: { standard: 3, express: 1 },
      rating: 4.4,
      reviews: 125,
      certifications: ['ISO 9001'],
      status: 'active',
      webhookUrl: 'https://api.barcelona-sheet.es/webhook',
      apiKey: null,
      description: 'Large-format sheet cutting and bending. Industrial design partner.',
    },
    {
      id: 'fab_007',
      name: 'Prague PCB',
      location: { city: 'Prague', country: 'CZ', lat: 50.08, lng: 14.44 },
      capabilities: ['pcb_mfg'],
      materials: ['fr4', 'cem1', 'polyimide', 'ceramic'],
      maxPartSize: { x: 500, y: 500, z: 8 },
      pricing: {
        pcb_mfg: 0.15,        // € per cm² for single-sided prototype
      },
      leadTime: { standard: 7, express: 3 },
      rating: 4.3,
      reviews: 67,
      certifications: ['ISO 9001', 'IPC-A-600'],
      status: 'active',
      webhookUrl: 'https://api.prague-pcb.cz/webhook',
      apiKey: null,
      description: 'PCB design, manufacturing, and assembly. IoT and wearables focus.',
    },
    {
      id: 'fab_008',
      name: 'Vienna Mold',
      location: { city: 'Vienna', country: 'AT', lat: 48.21, lng: 16.37 },
      capabilities: ['injection_mold', 'bending'],
      materials: ['abs', 'polycarbonate', 'nylon', 'polypropylene', 'pps'],
      maxPartSize: { x: 400, y: 300, z: 200 },
      pricing: {
        injection_mold: 0.28,
      },
      leadTime: { standard: 14, express: 7 },
      rating: 4.7,
      reviews: 98,
      certifications: ['ISO 9001', 'IATF 16949', 'ISO 50001'],
      status: 'active',
      webhookUrl: 'https://api.vienna-mold.at/webhook',
      apiKey: null,
      description: 'Injection molding & blow molding. Consumer products and automotive.',
    },
  ];

  // ============================================================================
  // State
  // ============================================================================

  let fabRegistry = [];
  let jobs = {};
  let jobCounter = 0;
  let eventListeners = {};

  // ============================================================================
  // Initialization
  // ============================================================================

  function init() {
    loadRegistry();
    loadJobs();
    if (fabRegistry.length === 0) {
      // First run — populate with demo fabs
      DEMO_FABS.forEach(fab => registerFab(fab));
    }
    console.log(`[Connected Fabs] Initialized. ${fabRegistry.length} fabs, ${Object.keys(jobs).length} jobs.`);
  }

  // ============================================================================
  // Fab Registry Management
  // ============================================================================

  /**
   * Register a new fab shop
   */
  function registerFab(fabData) {
    const fab = {
      ...fabData,
      id: fabData.id || 'fab_' + Date.now(),
      createdAt: fabData.createdAt || new Date().toISOString(),
      lastActive: fabData.lastActive || new Date().toISOString(),
      jobsCompleted: fabData.jobsCompleted || 0,
    };

    const existing = fabRegistry.findIndex(f => f.id === fab.id);
    if (existing >= 0) {
      fabRegistry[existing] = fab;
    } else {
      fabRegistry.push(fab);
    }

    saveRegistry();
    emit('fab-registered', { fabId: fab.id, name: fab.name });
    return fab;
  }

  /**
   * Get all fabs, optionally filtered
   */
  function listFabs(filters = {}) {
    let results = fabRegistry;

    if (filters.capability) {
      results = results.filter(fab =>
        fab.capabilities.includes(filters.capability)
      );
    }

    if (filters.material) {
      results = results.filter(fab =>
        fab.materials.includes(filters.material)
      );
    }

    if (filters.country) {
      results = results.filter(fab =>
        fab.location.country === filters.country
      );
    }

    if (filters.minRating) {
      results = results.filter(fab =>
        fab.rating >= filters.minRating
      );
    }

    if (filters.status) {
      results = results.filter(fab =>
        fab.status === filters.status
      );
    }

    return results;
  }

  /**
   * Get a specific fab by ID
   */
  function getFab(fabId) {
    return fabRegistry.find(f => f.id === fabId) || null;
  }

  /**
   * Update fab info
   */
  function updateFab(fabId, updates) {
    const fab = getFab(fabId);
    if (!fab) return null;

    Object.assign(fab, updates, {
      lastActive: new Date().toISOString(),
    });

    saveRegistry();
    emit('fab-updated', { fabId, updates });
    return fab;
  }

  /**
   * Remove a fab from registry
   */
  function removeFab(fabId) {
    fabRegistry = fabRegistry.filter(f => f.id !== fabId);
    saveRegistry();
    emit('fab-removed', { fabId });
  }

  // ============================================================================
  // Smart Routing & Matching
  // ============================================================================

  /**
   * Find the best fab(s) for a manufacturing job
   * Considers: capability match, size fit, material, price, lead time, rating, distance
   */
  function findBestFab(requirements) {
    const {
      capability,      // string: 'cnc_3axis', '3d_print_fdm', etc.
      material,        // string: 'steel', 'aluminum', etc.
      partSize,        // { x, y, z } in mm
      quantity,        // number of parts
      maxPrice,        // optional budget in € per unit
      maxLeadTime,     // optional max days for standard
      userLocation,    // optional { lat, lng } for distance calc
    } = requirements;

    let candidates = fabRegistry.filter(fab =>
      fab.status === 'active' &&
      fab.capabilities.includes(capability)
    );

    // Filter by material
    if (material) {
      candidates = candidates.filter(fab =>
        fab.materials.includes(material)
      );
    }

    // Filter by size fit
    if (partSize) {
      candidates = candidates.filter(fab =>
        fab.maxPartSize.x >= partSize.x &&
        fab.maxPartSize.y >= partSize.y &&
        fab.maxPartSize.z >= partSize.z
      );
    }

    // Score and rank candidates
    const scored = candidates.map(fab => {
      let score = 100;

      // Material match bonus
      if (material && fab.materials.includes(material)) {
        score += 20;
      }

      // Rating bonus
      score += fab.rating * 5;

      // Lead time bonus (prefer faster)
      if (maxLeadTime) {
        if (fab.leadTime.standard <= maxLeadTime) {
          score += 30;
        }
      }

      // Price consideration (lower is better)
      const basePrice = fab.pricing[capability] || 0.1;
      if (maxPrice && basePrice <= maxPrice) {
        score += 15;
      }

      // Distance penalty (if location provided)
      let distance = 0;
      if (userLocation && fab.location.lat && fab.location.lng) {
        distance = haversineDistance(
          userLocation.lat, userLocation.lng,
          fab.location.lat, fab.location.lng
        );
        score -= (distance / 100);  // 100 km = 1 point penalty
      }

      return { fab, score, distance };
    });

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Get a quote from a specific fab
   */
  function getQuote(fabId, jobData) {
    const fab = getFab(fabId);
    if (!fab) return null;

    const {
      capability,
      partSize,      // { x, y, z }
      quantity,
      material,
      urgency,       // 'standard' or 'express'
    } = jobData;

    if (!fab.capabilities.includes(capability)) {
      return { error: 'Fab does not have this capability' };
    }

    const basePrice = fab.pricing[capability] || 0.1;
    let totalCost = basePrice;

    // Estimate based on geometry
    if (partSize) {
      const volume = (partSize.x * partSize.y * partSize.z) / 1000;  // cm³
      totalCost = basePrice * volume * quantity;
    }

    // Urgency surcharge
    const leadTime = urgency === 'express' ? fab.leadTime.express : fab.leadTime.standard;
    const expedite = urgency === 'express' ? 1.3 : 1.0;

    totalCost *= expedite;

    return {
      fabId,
      fabName: fab.name,
      basePrice,
      quantity,
      totalCost: Math.round(totalCost * 100) / 100,
      currency: '€',
      leadDays: leadTime,
      material,
      capability: MANUFACTURING_TYPES[capability]?.label || capability,
    };
  }

  // ============================================================================
  // Job Management
  // ============================================================================

  /**
   * Submit a job for manufacturing
   * Creates job, routes to best fab, holds tokens in escrow
   */
  function submitJob(jobData) {
    const {
      name,              // string: 'Part name'
      capability,        // string: manufacturing type
      material,          // string
      partSize,          // { x, y, z }
      quantity,          // number
      description,       // string
      urgency,           // 'standard' or 'express'
      userLocation,      // optional { lat, lng } for routing
      fabricFile,        // optional: imported CAD file reference
    } = jobData;

    // Find best fab
    const fabResults = findBestFab({
      capability,
      material,
      partSize,
      quantity,
      userLocation,
    });

    if (fabResults.length === 0) {
      return { error: 'No fabs available for this job' };
    }

    const selectedFab = fabResults[0].fab;
    const quote = getQuote(selectedFab.id, jobData);

    // Create job record
    jobCounter++;
    const jobId = 'job_' + jobCounter;
    const job = {
      id: jobId,
      name,
      description,
      status: 'SUBMITTED',
      capability,
      material,
      partSize,
      quantity,
      urgency,
      fabricFile,
      fabId: selectedFab.id,
      fabName: selectedFab.name,
      quote,
      costInTokens: Math.round(MANUFACTURING_TYPES[capability]?.cost || 50),
      escrowId: null,
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      acceptedAt: null,
      completedAt: null,
      notes: [],
      webhookEvents: [],
    };

    // Create token escrow if token engine available
    if (window.cycleCAD && window.cycleCAD.tokens && window.cycleCAD.tokens.createEscrow) {
      try {
        const escrow = window.cycleCAD.tokens.createEscrow(
          job.costInTokens,
          jobId,
          selectedFab.id,
          { jobName: name, manufacturingType: capability }
        );
        job.escrowId = escrow.id;
      } catch (e) {
        console.warn('[Connected Fabs] Token escrow failed:', e.message);
      }
    }

    jobs[jobId] = job;
    saveJobs();
    saveJobCounter();

    emit('job-submitted', {
      jobId,
      fabId: selectedFab.id,
      fabName: selectedFab.name,
      costInTokens: job.costInTokens,
    });

    return job;
  }

  /**
   * Get a job by ID
   */
  function getJob(jobId) {
    return jobs[jobId] || null;
  }

  /**
   * List jobs with optional filters
   */
  function listJobs(filters = {}) {
    let results = Object.values(jobs);

    if (filters.status) {
      results = results.filter(j => j.status === filters.status);
    }

    if (filters.fabId) {
      results = results.filter(j => j.fabId === filters.fabId);
    }

    if (filters.material) {
      results = results.filter(j => j.material === filters.material);
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return results;
  }

  /**
   * Cancel a job and release escrow
   */
  function cancelJob(jobId) {
    const job = getJob(jobId);
    if (!job) return null;

    const previousStatus = job.status;
    job.status = 'CANCELLED';
    job.completedAt = new Date().toISOString();

    // Release escrow if exists
    if (job.escrowId && window.cycleCAD && window.cycleCAD.tokens) {
      try {
        window.cycleCAD.tokens.cancelEscrow(job.escrowId);
      } catch (e) {
        console.warn('[Connected Fabs] Escrow cancel failed:', e.message);
      }
    }

    saveJobs();
    emit('job-cancelled', { jobId, previousStatus });

    return job;
  }

  /**
   * Rate a completed job
   */
  function rateJob(jobId, rating, review = '') {
    const job = getJob(jobId);
    if (!job) return null;

    job.rating = Math.max(1, Math.min(5, rating));
    job.review = review;
    job.ratedAt = new Date().toISOString();

    // Update fab ratings
    const fab = getFab(job.fabId);
    if (fab) {
      const oldRating = fab.rating;
      const totalReviews = fab.reviews || 0;
      fab.rating = (oldRating * totalReviews + rating) / (totalReviews + 1);
      fab.reviews = totalReviews + 1;
      saveRegistry();
    }

    saveJobs();
    emit('job-rated', { jobId, rating, review });

    return job;
  }

  // ============================================================================
  // Webhook System (Fab Status Updates)
  // ============================================================================

  /**
   * Simulate a webhook event from a fab
   * In production, fabs would POST to your webhook endpoint
   */
  function simulateWebhook(fabId, jobId, event, data = {}) {
    const job = getJob(jobId);
    if (!job) return { error: 'Job not found' };

    const fab = getFab(fabId);
    if (!fab) return { error: 'Fab not found' };

    if (job.fabId !== fabId) {
      return { error: 'Job is not assigned to this fab' };
    }

    // Validate event type
    const validEvents = ['job.accepted', 'job.started', 'job.qc_passed', 'job.shipped', 'job.delivered'];
    if (!validEvents.includes(event)) {
      return { error: `Unknown event: ${event}` };
    }

    // Update job status based on event
    const eventToStatus = {
      'job.accepted': 'ACCEPTED',
      'job.started': 'IN_PROGRESS',
      'job.qc_passed': 'QC',
      'job.shipped': 'SHIPPED',
      'job.delivered': 'DELIVERED',
    };

    const newStatus = eventToStatus[event];
    job.status = newStatus;

    if (event === 'job.accepted' && !job.acceptedAt) {
      job.acceptedAt = new Date().toISOString();
    }

    if (event === 'job.delivered' && !job.completedAt) {
      job.completedAt = new Date().toISOString();
      fab.jobsCompleted = (fab.jobsCompleted || 0) + 1;
    }

    // Record webhook event
    job.webhookEvents.push({
      event,
      timestamp: new Date().toISOString(),
      data,
      fabName: fab.name,
    });

    saveJobs();
    saveRegistry();

    emit('job-status-changed', {
      jobId,
      oldStatus: job.status,
      newStatus,
      event,
    });

    console.log(`[Connected Fabs] Webhook: ${event} for job ${jobId}`);

    return { ok: true, event, status: newStatus };
  }

  /**
   * Get all webhook events for a job
   */
  function getWebhookLog(jobId) {
    const job = getJob(jobId);
    if (!job) return [];
    return job.webhookEvents || [];
  }

  // ============================================================================
  // UI Panel
  // ============================================================================

  /**
   * Generate HTML for Connected Fabs panel
   */
  function getPanelHTML() {
    return `
      <div id="connected-fabs-panel" style="
        display: none;
        position: fixed;
        right: 0;
        top: 48px;
        width: 600px;
        height: calc(100% - 48px);
        background: var(--bg-secondary);
        border-left: 1px solid var(--border-color);
        flex-direction: column;
        z-index: 200;
        box-shadow: var(--shadow-lg);
      ">
        <!-- Tab Navigation -->
        <div style="
          display: flex;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-tertiary);
        ">
          <button data-tab="fabs" class="fab-tab-btn" style="
            flex: 1;
            padding: 8px;
            border: none;
            background: none;
            color: var(--accent-blue);
            cursor: pointer;
            font-weight: 500;
            border-bottom: 2px solid var(--accent-blue);
          ">🏭 Browse Fabs</button>
          <button data-tab="submit" class="fab-tab-btn" style="
            flex: 1;
            padding: 8px;
            border: none;
            background: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-weight: 500;
          ">📤 Submit Job</button>
          <button data-tab="jobs" class="fab-tab-btn" style="
            flex: 1;
            padding: 8px;
            border: none;
            background: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-weight: 500;
          ">📋 My Jobs</button>
          <button data-tab="dashboard" class="fab-tab-btn" style="
            flex: 1;
            padding: 8px;
            border: none;
            background: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-weight: 500;
          ">⚙ Dashboard</button>
        </div>

        <!-- Content Area -->
        <div id="fab-panel-content" style="
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        "></div>
      </div>
    `;
  }

  /**
   * Render Browse Fabs tab
   */
  function renderBrowseFabs() {
    const html = `
      <div>
        <h3 style="margin-bottom: 12px; color: var(--accent-blue);">Connected Fab Network</h3>

        <div style="margin-bottom: 16px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px;">
          <input type="text" id="fab-search" placeholder="Search by name or location..." style="
            width: 100%;
            padding: 6px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            border-radius: 3px;
            font-size: 12px;
          ">
        </div>

        <div id="fab-list" style="display: flex; flex-direction: column; gap: 8px;">
          ${fabRegistry.map(fab => `
            <div style="
              padding: 12px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              border-radius: 4px;
              cursor: pointer;
              transition: all 150ms;
            " onmouseover="this.style.background='var(--bg-primary)'" onmouseout="this.style.background='var(--bg-tertiary)'">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>${fab.name}</strong>
                <span style="color: #DB2777; font-weight: bold;">★ ${fab.rating.toFixed(1)}</span>
              </div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                📍 ${fab.location.city}, ${fab.location.country}
                • ${fab.reviews} reviews
                • Lead: ${fab.leadTime.standard}d / ${fab.leadTime.express}d express
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                ${fab.capabilities.map(c => `<span style="
                  display: inline-block;
                  padding: 2px 6px;
                  background: var(--accent-blue-dark);
                  border-radius: 2px;
                  margin-right: 4px;
                ">${MANUFACTURING_TYPES[c]?.label || c}</span>`).join('')}
              </div>
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 6px;">
                Materials: ${fab.materials.join(', ')}
              </div>
              <div style="margin-top: 8px;">
                <button onclick="window.cycleCAD.fabs._showFabDetails('${fab.id}')" style="
                  padding: 4px 8px;
                  background: var(--accent-blue);
                  color: white;
                  border: none;
                  border-radius: 2px;
                  cursor: pointer;
                  font-size: 11px;
                ">View Details</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return html;
  }

  /**
   * Render Submit Job tab
   */
  function renderSubmitJob() {
    const capabilities = Object.entries(MANUFACTURING_TYPES).map(([k, v]) => k);
    const html = `
      <div>
        <h3 style="margin-bottom: 12px; color: var(--accent-blue);">Submit Manufacturing Job</h3>

        <form id="fab-submit-form" style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Part Name</label>
            <input type="text" name="name" placeholder="e.g., Bracket Assembly" style="
              width: 100%;
              padding: 6px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              color: var(--text-primary);
              border-radius: 3px;
              font-size: 12px;
            ">
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Manufacturing Type</label>
            <select name="capability" style="
              width: 100%;
              padding: 6px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              color: var(--text-primary);
              border-radius: 3px;
              font-size: 12px;
            ">
              <option value="">Select...</option>
              ${capabilities.map(c => `
                <option value="${c}">${MANUFACTURING_TYPES[c]?.label || c}</option>
              `).join('')}
            </select>
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Material</label>
            <input type="text" name="material" placeholder="e.g., aluminum 6061" style="
              width: 100%;
              padding: 6px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              color: var(--text-primary);
              border-radius: 3px;
              font-size: 12px;
            ">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Width (mm)</label>
              <input type="number" name="width" placeholder="100" style="
                width: 100%;
                padding: 6px;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                border-radius: 3px;
                font-size: 12px;
              ">
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Height (mm)</label>
              <input type="number" name="height" placeholder="80" style="
                width: 100%;
                padding: 6px;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                border-radius: 3px;
                font-size: 12px;
              ">
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Depth (mm)</label>
              <input type="number" name="depth" placeholder="50" style="
                width: 100%;
                padding: 6px;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                border-radius: 3px;
                font-size: 12px;
              ">
            </div>
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Quantity</label>
            <input type="number" name="quantity" value="1" min="1" style="
              width: 100%;
              padding: 6px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              color: var(--text-primary);
              border-radius: 3px;
              font-size: 12px;
            ">
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Urgency</label>
            <select name="urgency" style="
              width: 100%;
              padding: 6px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              color: var(--text-primary);
              border-radius: 3px;
              font-size: 12px;
            ">
              <option value="standard">Standard (best price)</option>
              <option value="express">Express (+30% cost)</option>
            </select>
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--text-secondary);">Description</label>
            <textarea name="description" placeholder="Special requirements, finish, tolerance..." style="
              width: 100%;
              padding: 6px;
              background: var(--bg-tertiary);
              border: 1px solid var(--border-color);
              color: var(--text-primary);
              border-radius: 3px;
              font-size: 12px;
              min-height: 60px;
              resize: vertical;
            "></textarea>
          </div>

          <button type="submit" style="
            padding: 8px;
            background: #DB2777;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-weight: 500;
          ">Submit Job</button>
        </form>

        <div id="fab-submit-result" style="margin-top: 12px; display: none;"></div>
      </div>
    `;
    return html;
  }

  /**
   * Render My Jobs tab
   */
  function renderMyJobs() {
    const jobList = listJobs();
    const html = `
      <div>
        <h3 style="margin-bottom: 12px; color: var(--accent-blue);">My Manufacturing Jobs</h3>

        ${jobList.length === 0 ? `
          <div style="padding: 16px; text-align: center; color: var(--text-muted);">
            No jobs submitted yet. Start by creating a new job above.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${jobList.map(job => `
              <div style="
                padding: 12px;
                background: var(--bg-tertiary);
                border-left: 4px solid ${JOB_STATES[job.status]?.color || '#999'};
                border-radius: 3px;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong>${job.name}</strong>
                  <span style="
                    padding: 2px 6px;
                    background: ${JOB_STATES[job.status]?.color || '#999'};
                    color: white;
                    border-radius: 2px;
                    font-size: 11px;
                  ">${JOB_STATES[job.status]?.label || job.status}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                  📍 ${job.fabName} • ${MANUFACTURING_TYPES[job.capability]?.label || job.capability}
                  <br>
                  💰 ${job.costInTokens} tokens • Qty: ${job.quantity}
                </div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 6px;">
                  Created: ${new Date(job.createdAt).toLocaleDateString()}
                  ${job.acceptedAt ? `<br>Accepted: ${new Date(job.acceptedAt).toLocaleDateString()}` : ''}
                </div>
                <div style="margin-top: 8px; display: flex; gap: 4px;">
                  <button onclick="window.cycleCAD.fabs._showJobDetails('${job.id}')" style="
                    padding: 4px 8px;
                    background: var(--accent-blue);
                    color: white;
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 11px;
                  ">Details</button>
                  ${job.status === 'SUBMITTED' ? `
                    <button onclick="window.cycleCAD.fabs.cancelJob('${job.id}'); location.reload();" style="
                      padding: 4px 8px;
                      background: var(--accent-red);
                      color: white;
                      border: none;
                      border-radius: 2px;
                      cursor: pointer;
                      font-size: 11px;
                    ">Cancel</button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
    return html;
  }

  /**
   * Render Fab Dashboard tab (for fab owners)
   */
  function renderDashboard() {
    const completedCount = Object.values(jobs).filter(j => j.status === 'COMPLETED').length;
    const inProgressCount = Object.values(jobs).filter(j => j.status === 'IN_PROGRESS').length;
    const totalTokens = Object.values(jobs).reduce((sum, j) => sum + (j.costInTokens || 0), 0);

    const html = `
      <div>
        <h3 style="margin-bottom: 12px; color: var(--accent-blue);">Manufacturing Dashboard</h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
          <div style="
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            text-align: center;
          ">
            <div style="font-size: 24px; font-weight: bold; color: var(--accent-blue);">${Object.keys(jobs).length}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Total Jobs</div>
          </div>
          <div style="
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            text-align: center;
          ">
            <div style="font-size: 24px; font-weight: bold; color: #DB2777;">${inProgressCount}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">In Progress</div>
          </div>
          <div style="
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            text-align: center;
          ">
            <div style="font-size: 24px; font-weight: bold; color: var(--accent-green);">${completedCount}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Completed</div>
          </div>
          <div style="
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            text-align: center;
          ">
            <div style="font-size: 24px; font-weight: bold; color: var(--accent-blue);">${totalTokens}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Tokens Generated</div>
          </div>
        </div>

        <h4 style="margin-bottom: 8px; color: var(--text-secondary);">Network Stats</h4>
        <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 4px; font-size: 12px;">
          <div>🏭 Active Fabs: ${fabRegistry.filter(f => f.status === 'active').length}</div>
          <div>📍 Countries: ${new Set(fabRegistry.map(f => f.location.country)).size}</div>
          <div>⭐ Avg Rating: ${(fabRegistry.reduce((sum, f) => sum + f.rating, 0) / fabRegistry.length).toFixed(2)}</div>
          <div>📦 Completed Jobs: ${completedCount}</div>
        </div>
      </div>
    `;
    return html;
  }

  /**
   * Attach tab click handlers and form submission
   */
  function setupPanelHandlers() {
    const tabButtons = document.querySelectorAll('.fab-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        switchTab(tab);
      });
    });

    // Form submission
    const form = document.getElementById('fab-submit-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const jobData = {
          name: formData.get('name'),
          capability: formData.get('capability'),
          material: formData.get('material'),
          partSize: {
            x: parseInt(formData.get('width')) || 100,
            y: parseInt(formData.get('height')) || 100,
            z: parseInt(formData.get('depth')) || 50,
          },
          quantity: parseInt(formData.get('quantity')) || 1,
          urgency: formData.get('urgency'),
          description: formData.get('description'),
        };

        const job = submitJob(jobData);
        if (job.error) {
          alert('Error: ' + job.error);
        } else {
          const resultDiv = document.getElementById('fab-submit-result');
          resultDiv.innerHTML = `
            <div style="
              padding: 12px;
              background: var(--accent-green);
              color: white;
              border-radius: 4px;
            ">
              ✓ Job ${job.id} submitted to ${job.fabName}!
              <br>
              <small>Cost: ${job.costInTokens} tokens • Lead: ${job.quote.leadDays} days</small>
            </div>
          `;
          resultDiv.style.display = 'block';
          form.reset();
          setTimeout(() => { resultDiv.style.display = 'none'; }, 3000);
        }
      });
    }
  }

  /**
   * Switch tab content
   */
  function switchTab(tabName) {
    const contentDiv = document.getElementById('fab-panel-content');
    const tabButtons = document.querySelectorAll('.fab-tab-btn');

    tabButtons.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.style.color = 'var(--accent-blue)';
        btn.style.borderBottom = '2px solid var(--accent-blue)';
      } else {
        btn.style.color = 'var(--text-secondary)';
        btn.style.borderBottom = 'none';
      }
    });

    let html = '';
    switch (tabName) {
      case 'fabs':
        html = renderBrowseFabs();
        break;
      case 'submit':
        html = renderSubmitJob();
        break;
      case 'jobs':
        html = renderMyJobs();
        break;
      case 'dashboard':
        html = renderDashboard();
        break;
    }

    contentDiv.innerHTML = html;
    setupPanelHandlers();
  }

  /**
   * Toggle panel visibility
   */
  function togglePanel() {
    const panel = document.getElementById('connected-fabs-panel');
    if (!panel) return;

    if (panel.style.display === 'none' || panel.style.display === '') {
      panel.style.display = 'flex';
      switchTab('fabs');  // Default to Browse tab
    } else {
      panel.style.display = 'none';
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  function loadRegistry() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.registry);
      if (data) {
        fabRegistry = JSON.parse(data);
      }
    } catch (e) {
      console.error('[Connected Fabs] Error loading registry:', e);
    }
  }

  function saveRegistry() {
    try {
      localStorage.setItem(STORAGE_KEYS.registry, JSON.stringify(fabRegistry));
    } catch (e) {
      console.error('[Connected Fabs] Error saving registry:', e);
    }
  }

  function loadJobs() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.jobs);
      if (data) {
        jobs = JSON.parse(data);
      }
      const counter = localStorage.getItem(STORAGE_KEYS.jobCounter);
      if (counter) {
        jobCounter = parseInt(counter);
      }
    } catch (e) {
      console.error('[Connected Fabs] Error loading jobs:', e);
    }
  }

  function saveJobs() {
    try {
      localStorage.setItem(STORAGE_KEYS.jobs, JSON.stringify(jobs));
    } catch (e) {
      console.error('[Connected Fabs] Error saving jobs:', e);
    }
  }

  function saveJobCounter() {
    try {
      localStorage.setItem(STORAGE_KEYS.jobCounter, jobCounter.toString());
    } catch (e) {
      console.error('[Connected Fabs] Error saving job counter:', e);
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Haversine distance formula (km)
   */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;  // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Event system
   */
  function on(event, listener) {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(listener);
  }

  function off(event, listener) {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter(l => l !== listener);
    }
  }

  function emit(event, data) {
    if (eventListeners[event]) {
      eventListeners[event].forEach(listener => {
        try {
          listener(data);
        } catch (e) {
          console.error(`[Connected Fabs] Event listener error (${event}):`, e);
        }
      });
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  // Initialize on load
  init();

  // Expose API on window.cycleCAD
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.fabs = {
    // Fab management
    registerFab,
    listFabs,
    getFab,
    updateFab,
    removeFab,

    // Routing & quoting
    findBestFab,
    getQuote,

    // Job management
    submitJob,
    getJob,
    listJobs,
    cancelJob,
    rateJob,

    // Webhooks
    simulateWebhook,
    getWebhookLog,

    // UI
    togglePanel,
    getPanelHTML,
    switchTab,

    // Events
    on,
    off,

    // Internal (for debug)
    _showFabDetails: (fabId) => {
      const fab = getFab(fabId);
      console.log('[Connected Fabs] Fab Details:', fab);
      alert(`${fab.name}\n\nRating: ${fab.rating}/5 (${fab.reviews} reviews)\nCertifications: ${fab.certifications.join(', ')}\nLocation: ${fab.location.city}, ${fab.location.country}`);
    },
    _showJobDetails: (jobId) => {
      const job = getJob(jobId);
      console.log('[Connected Fabs] Job Details:', job);
      alert(`${job.name} (${job.id})\n\nStatus: ${job.status}\nFab: ${job.fabName}\nCost: ${job.costInTokens} tokens\nCreated: ${new Date(job.createdAt).toLocaleString()}`);
    },
  };

  console.log('[Connected Fabs] Module loaded. Type window.cycleCAD.fabs to access API.');

})();
