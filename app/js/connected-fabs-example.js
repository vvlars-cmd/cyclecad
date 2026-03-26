/**
 * connected-fabs-example.js
 * Quick reference examples for using the Connected Fabs module
 *
 * Run these snippets in the browser console to test the API
 */

// ============================================================================
// EXAMPLE 1: List all fabs in the network
// ============================================================================

function example_listAllFabs() {
  const fabs = window.cycleCAD.fabs.listFabs();
  console.log(`Network has ${fabs.length} fab shops:`);
  fabs.forEach(fab => {
    console.log(`  • ${fab.name} (${fab.location.city}, ${fab.location.country}) - ${fab.rating}★`);
  });
}

// Run: example_listAllFabs()


// ============================================================================
// EXAMPLE 2: Find the best fab for a CNC 5-axis job
// ============================================================================

function example_findBestFabForJob() {
  const requirements = {
    capability: 'cnc_5axis',
    material: 'aluminum',
    partSize: { x: 400, y: 300, z: 250 },
    maxLeadTime: 7,
    maxPrice: 0.20
  };

  const results = window.cycleCAD.fabs.findBestFab(requirements);

  console.log('Top 3 matching fabs:');
  results.slice(0, 3).forEach((result, idx) => {
    console.log(`  ${idx + 1}. ${result.fab.name} (score: ${result.score.toFixed(0)})`);
    console.log(`     Location: ${result.fab.location.city}, ${result.fab.location.country}`);
    console.log(`     Rating: ${result.fab.rating}★ (${result.fab.reviews} reviews)`);
    console.log(`     Distance: ${result.distance.toFixed(0)} km`);
  });

  return results[0].fab;  // Return best match
}

// Run: example_findBestFabForJob()


// ============================================================================
// EXAMPLE 3: Get a price quote
// ============================================================================

function example_getQuote() {
  // First, find a fab
  const fab = example_findBestFabForJob();

  // Get a quote
  const quote = window.cycleCAD.fabs.getQuote(fab.id, {
    capability: 'cnc_5axis',
    partSize: { x: 400, y: 300, z: 250 },
    quantity: 10,
    material: 'aluminum',
    urgency: 'standard'
  });

  console.log(`Quote from ${quote.fabName}:`);
  console.log(`  Total Cost: ${quote.totalCost}${quote.currency}`);
  console.log(`  Lead Time: ${quote.leadDays} days`);
  console.log(`  Type: ${quote.capability}`);
  console.log(`  Material: ${quote.material}`);
}

// Run: example_getQuote()


// ============================================================================
// EXAMPLE 4: Submit a manufacturing job
// ============================================================================

function example_submitJob() {
  const job = window.cycleCAD.fabs.submitJob({
    name: 'Precision Bracket Assembly',
    capability: 'cnc_5axis',
    material: 'aluminum',
    partSize: { x: 400, y: 300, z: 250 },
    quantity: 10,
    urgency: 'standard',
    description: 'High-precision aerospace bracket. Tolerance ±0.05mm. Surface finish Ra 1.6µm.',
    fabricFile: 'bracket_v2.step'
  });

  if (job.error) {
    console.error('Job submission failed:', job.error);
    return null;
  }

  console.log(`✓ Job submitted successfully!`);
  console.log(`  Job ID: ${job.id}`);
  console.log(`  Fab: ${job.fabName}`);
  console.log(`  Cost: ${job.costInTokens} tokens`);
  console.log(`  Status: ${job.status}`);
  console.log(`  Escrow ID: ${job.escrowId}`);

  return job;
}

// Run: const job = example_submitJob()


// ============================================================================
// EXAMPLE 5: Track job status
// ============================================================================

function example_trackJob(jobId) {
  const job = window.cycleCAD.fabs.getJob(jobId);

  if (!job) {
    console.error('Job not found');
    return;
  }

  console.log(`Job: ${job.name} (${job.id})`);
  console.log(`Status: ${job.status}`);
  console.log(`Fab: ${job.fabName}`);
  console.log(`Created: ${new Date(job.createdAt).toLocaleString()}`);

  if (job.acceptedAt) {
    console.log(`Accepted: ${new Date(job.acceptedAt).toLocaleString()}`);
  }

  if (job.completedAt) {
    console.log(`Completed: ${new Date(job.completedAt).toLocaleString()}`);
  }

  console.log('\nWebhook events:');
  const events = window.cycleCAD.fabs.getWebhookLog(jobId);
  events.forEach(evt => {
    console.log(`  • ${evt.event}: ${new Date(evt.timestamp).toLocaleString()}`);
  });
}

// Run: example_trackJob('job_1')


// ============================================================================
// EXAMPLE 6: Simulate a job lifecycle
// ============================================================================

function example_simulateJobLifecycle() {
  // Submit a job
  const job = example_submitJob();
  if (!job) return;

  console.log(`\n--- Simulating job lifecycle for ${job.id} ---\n`);

  // Fab accepts the job
  console.log('[1] Fab accepts job...');
  window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.accepted', {
    acceptedAt: new Date().toISOString(),
    estimatedDelivery: '2026-04-15'
  });

  // Wait a bit, then fab starts
  setTimeout(() => {
    console.log('[2] Fab starts manufacturing...');
    window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.started', {
      toolpath: 'part_001.nc',
      machineId: 'cnc_5_axis_01'
    });
  }, 1000);

  // QC passes
  setTimeout(() => {
    console.log('[3] Quality check passed...');
    window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.qc_passed', {
      toleranceCheck: 'PASS',
      surfaceFinish: 'Ra 1.6µm',
      inspector: 'Hans Müller'
    });
  }, 2000);

  // Job ships
  setTimeout(() => {
    console.log('[4] Job shipped...');
    window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.shipped', {
      trackingNumber: 'DHL1234567890',
      carrier: 'DHL',
      estimatedDelivery: '2026-04-18'
    });
  }, 3000);

  // Job delivered
  setTimeout(() => {
    console.log('[5] Job delivered!');
    window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.delivered', {
      signedBy: 'John Doe',
      condition: 'EXCELLENT'
    });

    // Show final status
    setTimeout(() => {
      example_trackJob(job.id);
    }, 500);
  }, 4000);
}

// Run: example_simulateJobLifecycle()


// ============================================================================
// EXAMPLE 7: Rate a completed job
// ============================================================================

function example_rateJob(jobId) {
  const job = window.cycleCAD.fabs.rateJob(
    jobId,
    5,  // 5-star rating
    'Excellent quality! Parts match spec perfectly. Will work with this fab again.'
  );

  console.log(`✓ Job rated!`);
  console.log(`Rating: ${job.rating}★`);
  console.log(`Review: ${job.review}`);

  // Check updated fab rating
  const fab = window.cycleCAD.fabs.getFab(job.fabId);
  console.log(`\nFab rating updated: ${fab.rating.toFixed(2)}★ (${fab.reviews} reviews)`);
}

// Run: example_rateJob('job_1')


// ============================================================================
// EXAMPLE 8: Listen for events
// ============================================================================

function example_setupEventListeners() {
  // Listen for new jobs
  window.cycleCAD.fabs.on('job-submitted', (data) => {
    console.log(`📤 New job submitted: ${data.jobId} to ${data.fabName}`);
    console.log(`   Cost: ${data.costInTokens} tokens`);
  });

  // Listen for status changes
  window.cycleCAD.fabs.on('job-status-changed', (data) => {
    console.log(`🔄 Job ${data.jobId}: ${data.oldStatus} → ${data.newStatus}`);
    console.log(`   Event: ${data.event}`);
  });

  // Listen for new fabs
  window.cycleCAD.fabs.on('fab-registered', (data) => {
    console.log(`🏭 New fab joined network: ${data.name}`);
  });

  // Listen for job completion
  window.cycleCAD.fabs.on('job-status-changed', (data) => {
    if (data.newStatus === 'DELIVERED') {
      console.log(`🎉 Job ${data.jobId} delivered!`);
    }
  });

  console.log('✓ Event listeners set up. Now submit a job and watch the console.');
}

// Run: example_setupEventListeners()


// ============================================================================
// EXAMPLE 9: Open the UI panel
// ============================================================================

function example_openPanel() {
  window.cycleCAD.fabs.togglePanel();
  console.log('Connected Fabs panel opened');
}

// Run: example_openPanel()


// ============================================================================
// EXAMPLE 10: Search fabs with filters
// ============================================================================

function example_searchFabs() {
  // Find 3D printing fabs in Germany
  const fabs = window.cycleCAD.fabs.listFabs({
    capability: '3d_print_sla',
    country: 'DE',
    minRating: 4.5
  });

  console.log(`Found ${fabs.length} matching fabs:`);
  fabs.forEach(fab => {
    console.log(`  • ${fab.name}`);
    console.log(`    Rating: ${fab.rating}★`);
    console.log(`    Materials: ${fab.materials.join(', ')}`);
    console.log(`    Lead time: ${fab.leadTime.standard} days (${fab.leadTime.express}d express)`);
  });
}

// Run: example_searchFabs()


// ============================================================================
// EXAMPLE 11: Export jobs as JSON
// ============================================================================

function example_exportJobs() {
  const jobs = window.cycleCAD.fabs.listJobs();
  const json = JSON.stringify(jobs, null, 2);
  console.log('Jobs export:', json);

  // Download as file
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cyclecad-jobs.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Run: example_exportJobs()


// ============================================================================
// EXAMPLE 12: Advanced routing with user location
// ============================================================================

function example_advancedRouting() {
  // Find fabs with user location (for distance-based routing)
  const results = window.cycleCAD.fabs.findBestFab({
    capability: 'cnc_3axis',
    material: 'steel',
    partSize: { x: 200, y: 150, z: 100 },
    quantity: 50,
    maxLeadTime: 5,
    userLocation: {
      lat: 48.21,    // Vienna
      lng: 16.37
    }
  });

  console.log('Routed by proximity to Vienna:');
  results.slice(0, 5).forEach((result, idx) => {
    console.log(`  ${idx + 1}. ${result.fab.name}`);
    console.log(`     Score: ${result.score.toFixed(0)}`);
    console.log(`     Distance: ${result.distance.toFixed(0)} km`);
  });
}

// Run: example_advancedRouting()


// ============================================================================
// TEST SUITE: Run all examples
// ============================================================================

function example_runAllTests() {
  console.clear();
  console.log('='.repeat(70));
  console.log('CONNECTED FABS MODULE — TEST SUITE');
  console.log('='.repeat(70));

  console.log('\n[TEST 1] List all fabs');
  example_listAllFabs();

  console.log('\n[TEST 2] Find best fab');
  example_findBestFabForJob();

  console.log('\n[TEST 3] Get quote');
  example_getQuote();

  console.log('\n[TEST 4] Submit job');
  const job = example_submitJob();

  if (job) {
    console.log('\n[TEST 5] Simulate lifecycle (15 seconds)');
    example_simulateJobLifecycle();

    setTimeout(() => {
      console.log('\n[TEST 6] Track job');
      example_trackJob(job.id);

      console.log('\n[TEST 7] Rate job');
      example_rateJob(job.id);
    }, 5000);
  }

  console.log('\n[TEST 8] Setup event listeners');
  example_setupEventListeners();

  console.log('\n[TEST 9] Search with filters');
  example_searchFabs();

  console.log('\n' + '='.repeat(70));
  console.log('Tests complete!');
  console.log('='.repeat(70));
}

// Run: example_runAllTests()
