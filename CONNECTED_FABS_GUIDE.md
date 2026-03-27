# Connected Fabs Module Guide

## Overview
The Connected Fabs module (`app/js/connected-fabs.js`) implements the "CAD → CAM → Connected Fabs" pipeline from the architecture slide 10. It connects cycleCAD designs to a distributed network of manufacturing partners worldwide.

**Module size:** 1,449 lines
**Key features:** Fab registry, smart routing, job submission, token escrow, webhook simulation
**Storage:** localStorage (`cyclecad_fab_registry`, `cyclecad_fab_jobs`)
**Integration:** Hooks into `window.cycleCAD.tokens` for escrow management

---

## Quick Start

### 1. Load the Module
Add to `app/index.html` in the `<head>` after other module scripts:

```html
<script src="js/connected-fabs.js"></script>
```

### 2. Access the API
```javascript
// List all fabs
window.cycleCAD.fabs.listFabs();

// Find best fab for a job
const results = window.cycleCAD.fabs.findBestFab({
  capability: 'cnc_5axis',
  material: 'aluminum',
  partSize: { x: 500, y: 400, z: 200 },
  maxLeadTime: 5
});

// Submit a manufacturing job
const job = window.cycleCAD.fabs.submitJob({
  name: 'Bracket Assembly',
  capability: 'cnc_3axis',
  material: 'steel',
  partSize: { x: 150, y: 100, z: 75 },
  quantity: 10,
  urgency: 'standard',
  description: 'High-precision bracket for automotive'
});

// Toggle UI panel
window.cycleCAD.fabs.togglePanel();
```

---

## API Reference

### Fab Management

#### `registerFab(fabData)`
Register a new fab shop in the network.

```javascript
const fab = window.cycleCAD.fabs.registerFab({
  name: 'My CNC Shop',
  location: { city: 'Berlin', country: 'DE', lat: 52.52, lng: 13.41 },
  capabilities: ['cnc_3axis', 'cnc_5axis'],
  materials: ['aluminum', 'steel'],
  maxPartSize: { x: 500, y: 500, z: 300 },
  pricing: { cnc_3axis: 0.08, cnc_5axis: 0.15 },
  leadTime: { standard: 5, express: 2 },
  rating: 4.8,
  reviews: 100,
  certifications: ['ISO 9001'],
  description: 'Precision CNC machining'
});
```

#### `listFabs(filters?)`
Get all fabs with optional filtering.

```javascript
// Get all fabs
window.cycleCAD.fabs.listFabs();

// Filter by capability
window.cycleCAD.fabs.listFabs({ capability: '3d_print_fdm' });

// Filter by multiple criteria
window.cycleCAD.fabs.listFabs({
  capability: 'cnc_5axis',
  country: 'DE',
  minRating: 4.5,
  material: 'titanium'
});
```

#### `getFab(fabId)`
Get a specific fab by ID.

```javascript
const fab = window.cycleCAD.fabs.getFab('fab_001');
console.log(fab.name, fab.rating, fab.capabilities);
```

#### `updateFab(fabId, updates)`
Update fab information.

```javascript
window.cycleCAD.fabs.updateFab('fab_001', {
  rating: 4.9,
  reviews: 150,
  leadTime: { standard: 4, express: 1 }
});
```

#### `removeFab(fabId)`
Deregister a fab from the network.

```javascript
window.cycleCAD.fabs.removeFab('fab_001');
```

---

### Smart Routing & Quoting

#### `findBestFab(requirements)`
Find the best fab(s) for a manufacturing job. Returns ranked list with scoring.

**Scoring factors:**
- Capability match (required)
- Material availability
- Part size fit
- Price competitiveness
- Lead time
- Rating/reviews
- Distance (if user location provided)

```javascript
const results = window.cycleCAD.fabs.findBestFab({
  capability: 'cnc_5axis',           // REQUIRED
  material: 'titanium',              // optional
  partSize: { x: 400, y: 300, z: 250 },  // optional
  quantity: 5,                       // optional
  maxPrice: 0.20,                    // optional € per unit
  maxLeadTime: 10,                   // optional days
  userLocation: { lat: 48.14, lng: 11.58 }  // optional for distance
});

// Returns: [{ fab, score, distance }, { fab, score, distance }, ...]
// fab = best match, score = ranking score, distance = km from user
```

#### `getQuote(fabId, jobData)`
Get a price quote from a specific fab.

```javascript
const quote = window.cycleCAD.fabs.getQuote('fab_001', {
  capability: 'cnc_5axis',
  partSize: { x: 400, y: 300, z: 250 },
  quantity: 10,
  material: 'aluminum',
  urgency: 'express'  // standard | express
});

// Returns:
// {
//   fabId: 'fab_001',
//   fabName: 'Lyon Precision',
//   basePrice: 0.16,
//   totalCost: 24.96,
//   currency: '€',
//   leadDays: 3,
//   material: 'aluminum',
//   capability: 'CNC 5-Axis'
// }
```

---

### Job Management

#### `submitJob(jobData)`
Submit a manufacturing job. Automatically routes to best fab and creates token escrow.

```javascript
const job = window.cycleCAD.fabs.submitJob({
  name: 'Bracket Assembly',
  capability: 'cnc_3axis',
  material: 'steel',
  partSize: { x: 150, y: 100, z: 75 },
  quantity: 10,
  urgency: 'standard',              // standard | express
  description: 'Precision bracket',
  userLocation: { lat: 48.2, lng: 16.4 },  // optional for routing
  fabricFile: 'assembly_v2.step'    // optional reference
});

// Job lifecycle: DRAFT → SUBMITTED → ACCEPTED → IN_PROGRESS → QC → SHIPPED → DELIVERED → COMPLETED

// Returns job object with cost in tokens and escrow ID
```

#### `getJob(jobId)`
Get job details.

```javascript
const job = window.cycleCAD.fabs.getJob('job_1');
console.log(job.status, job.fabName, job.costInTokens);
```

#### `listJobs(filters?)`
List all jobs with optional filtering.

```javascript
// Get all jobs
window.cycleCAD.fabs.listJobs();

// Filter by status
window.cycleCAD.fabs.listJobs({ status: 'IN_PROGRESS' });

// Filter by fab
window.cycleCAD.fabs.listJobs({ fabId: 'fab_001' });

// Filter by material
window.cycleCAD.fabs.listJobs({ material: 'aluminum' });
```

#### `cancelJob(jobId)`
Cancel a submitted job and release token escrow.

```javascript
const job = window.cycleCAD.fabs.cancelJob('job_1');
// Only works if job is still in SUBMITTED state
```

#### `rateJob(jobId, rating, review?)`
Rate a completed job and update fab ratings.

```javascript
window.cycleCAD.fabs.rateJob('job_1', 5, 'Excellent quality! Exactly as specified.');

// Rating updates fab's overall rating
// Fab rating = (oldRating * oldReviewCount + newRating) / (oldReviewCount + 1)
```

---

### Webhook System

#### `simulateWebhook(fabId, jobId, event, data?)`
Simulate a webhook event from a fab (status update). In production, fabs POST to your webhook endpoint.

**Valid events:**
- `job.accepted` → Status: ACCEPTED
- `job.started` → Status: IN_PROGRESS
- `job.qc_passed` → Status: QC
- `job.shipped` → Status: SHIPPED
- `job.delivered` → Status: DELIVERED

```javascript
// Fab accepts the job
window.cycleCAD.fabs.simulateWebhook('fab_001', 'job_1', 'job.accepted', {
  acceptedAt: new Date().toISOString(),
  estimatedDelivery: '2026-04-15'
});

// Fab starts manufacturing
window.cycleCAD.fabs.simulateWebhook('fab_001', 'job_1', 'job.started', {
  toolpath: 'part_001.nc',
  machineId: 'cnc_5'
});

// Quality check passes
window.cycleCAD.fabs.simulateWebhook('fab_001', 'job_1', 'job.qc_passed', {
  toleranceCheck: 'PASS',
  surfaceFinish: 'Ra 1.6µm'
});

// Job ships
window.cycleCAD.fabs.simulateWebhook('fab_001', 'job_1', 'job.shipped', {
  trackingNumber: 'DHL123456789',
  carrier: 'DHL',
  estimatedDelivery: '2026-04-18'
});

// Job delivered
window.cycleCAD.fabs.simulateWebhook('fab_001', 'job_1', 'job.delivered', {
  signedBy: 'John Doe',
  condition: 'GOOD'
});
```

#### `getWebhookLog(jobId)`
Get all webhook events for a job (audit trail).

```javascript
const events = window.cycleCAD.fabs.getWebhookLog('job_1');
// Returns: [
//   { event: 'job.accepted', timestamp: '2026-03-27T...', data: {...}, fabName: '...' },
//   { event: 'job.started', timestamp: '2026-03-28T...', data: {...}, fabName: '...' },
//   ...
// ]
```

---

### UI Panel

#### `togglePanel()`
Show/hide the Connected Fabs UI panel. Panel has 4 tabs:
1. **Browse Fabs** — Search and filter fab network
2. **Submit Job** — Create new manufacturing job
3. **My Jobs** — Track submitted jobs
4. **Dashboard** — Network stats and job analytics

```javascript
window.cycleCAD.fabs.togglePanel();
```

#### `switchTab(tabName)`
Programmatically switch panels.

```javascript
window.cycleCAD.fabs.switchTab('fabs');      // Browse Fabs
window.cycleCAD.fabs.switchTab('submit');    // Submit Job
window.cycleCAD.fabs.switchTab('jobs');      // My Jobs
window.cycleCAD.fabs.switchTab('dashboard'); // Dashboard
```

---

### Events

#### `on(event, listener)`
Listen for module events.

**Events:**
- `fab-registered` — New fab added to network
- `fab-updated` — Fab info updated
- `fab-removed` — Fab removed from network
- `job-submitted` — New job created
- `job-status-changed` — Job status updated (webhook event)
- `job-cancelled` — Job cancelled
- `job-rated` — Job rated

```javascript
// Listen for new jobs
window.cycleCAD.fabs.on('job-submitted', (data) => {
  console.log(`Job ${data.jobId} submitted to ${data.fabName}`);
  console.log(`Cost: ${data.costInTokens} tokens`);
});

// Listen for status changes
window.cycleCAD.fabs.on('job-status-changed', (data) => {
  console.log(`Job ${data.jobId}: ${data.oldStatus} → ${data.newStatus}`);
  notifyUser(`Job update: ${data.event}`);
});

// Listen for new fabs joining network
window.cycleCAD.fabs.on('fab-registered', (data) => {
  console.log(`New fab added: ${data.name}`);
});
```

#### `off(event, listener)`
Remove an event listener.

```javascript
const handler = (data) => console.log(data);
window.cycleCAD.fabs.on('job-submitted', handler);
window.cycleCAD.fabs.off('job-submitted', handler);  // Stop listening
```

---

## Manufacturing Types

Supported manufacturing processes with token costs:

| Type | Code | Cost (tokens) | Unit |
|------|------|---------------|------|
| 3D Print (FDM) | `3d_print_fdm` | 25 | per job |
| 3D Print (SLA) | `3d_print_sla` | 35 | per job |
| 3D Print (SLS) | `3d_print_sls` | 30 | per job |
| Laser Cut | `laser_cut` | 15 | per job |
| CNC 3-Axis | `cnc_3axis` | 60 | per job |
| CNC 5-Axis | `cnc_5axis` | 100 | per job |
| CNC Lathe | `cnc_lathe` | 40 | per job |
| Injection Mold | `injection_mold` | 250 | per job |
| Sheet Metal | `sheet_metal` | 45 | per job |
| PCB Manufacturing | `pcb_mfg` | 50 | per job |
| Waterjet Cut | `waterjet_cut` | 50 | per job |
| Sheet Bending | `bending` | 35 | per job |

---

## Demo Fabs

The module pre-loads 8 real-world demo fab shops:

1. **Berlin CNC Works** (DE) — CNC 3/5-axis, laser, 4.7★
2. **Munich Additive** (DE) — FDM/SLA/SLS 3D print, 4.8★
3. **Rotterdam Metal** (NL) — CNC, lathe, sheet metal, 4.5★
4. **Lyon Precision** (FR) — CNC 5-axis, aerospace, 4.9★
5. **Milano Rapid** (IT) — SLA/SLS, injection mold, 4.6★
6. **Barcelona Sheet** (ES) — Laser, bending, waterjet, 4.4★
7. **Prague PCB** (CZ) — PCB manufacturing, 4.3★
8. **Vienna Mold** (AT) — Injection molding, 4.7★

---

## Integration with Token Engine

The Connected Fabs module integrates with `window.cycleCAD.tokens` for escrow management:

```javascript
// When a job is submitted:
// 1. Calculate cost in tokens based on manufacturing type
// 2. Create token escrow via tokens.createEscrow()
// 3. Store escrowId in job record
// 4. On job completion, release escrow: tokens.releaseEscrow()
// 5. On job cancellation, cancel escrow: tokens.cancelEscrow()

// Example:
const escrow = window.cycleCAD.tokens.createEscrow(
  100,                // tokens to hold
  'job_1',            // jobId
  'fab_001',          // fabId
  { jobName: 'Bracket', manufacturingType: 'cnc_5axis' }
);

// Later, when job completes:
window.cycleCAD.tokens.releaseEscrow(escrow.id);
```

---

## Storage & Persistence

All data persists in localStorage:

- **`cyclecad_fab_registry`** — Array of fab objects
- **`cyclecad_fab_jobs`** — Object of { jobId: job }
- **`cyclecad_job_counter`** — Auto-incrementing job ID counter

To reset:
```javascript
localStorage.removeItem('cyclecad_fab_registry');
localStorage.removeItem('cyclecad_fab_jobs');
localStorage.removeItem('cyclecad_job_counter');
```

---

## Example Workflow

### 1. User designs a part in cycleCAD
```javascript
// User creates a bracket in the 3D viewport
```

### 2. User exports as STL and submits job
```javascript
const job = window.cycleCAD.fabs.submitJob({
  name: 'Bracket Assembly',
  capability: 'cnc_5axis',
  material: 'aluminum',
  partSize: { x: 200, y: 150, z: 100 },
  quantity: 10,
  urgency: 'standard',
  description: 'High-precision aerospace bracket'
});

console.log(`Job ${job.id} cost: ${job.costInTokens} tokens`);
console.log(`Routed to: ${job.fabName}`);
console.log(`Lead time: ${job.quote.leadDays} days`);
```

### 3. User tracks job in My Jobs tab
```javascript
window.cycleCAD.fabs.switchTab('jobs');
// Shows job in SUBMITTED state
```

### 4. Fab accepts job (webhook event)
```javascript
// In real system, fab would POST to webhook
// For demo, we simulate:
window.cycleCAD.fabs.simulateWebhook('fab_004', job.id, 'job.accepted', {
  acceptedAt: new Date().toISOString()
});

// Job now shows as ACCEPTED
// Listen for status change:
window.cycleCAD.fabs.on('job-status-changed', (data) => {
  console.log(`Status: ${data.newStatus}`);
  updateUI();
});
```

### 5. Fab manufactures part (multiple webhooks)
```javascript
// job.started
window.cycleCAD.fabs.simulateWebhook('fab_004', job.id, 'job.started');

// job.qc_passed
window.cycleCAD.fabs.simulateWebhook('fab_004', job.id, 'job.qc_passed', {
  toleranceCheck: 'PASS'
});

// job.shipped
window.cycleCAD.fabs.simulateWebhook('fab_004', job.id, 'job.shipped', {
  trackingNumber: 'DHL12345'
});
```

### 6. Job delivered
```javascript
window.cycleCAD.fabs.simulateWebhook('fab_004', job.id, 'job.delivered');

// User rates the fab
window.cycleCAD.fabs.rateJob(job.id, 5, 'Perfect quality! Exactly as specified.');

// Token escrow is released and fab gets paid
window.cycleCAD.tokens.releaseEscrow(job.escrowId);
```

---

## Architecture Notes

### Design Principles
1. **Agent-First** — All operations return structured JSON (no DOM dependencies)
2. **Token-Aware** — Every job holds tokens in escrow until completion
3. **Decentralized** — Fabs are just data; no central server required
4. **Observable** — Full event system for UI synchronization
5. **Persistent** — All state survives page reload

### Scoring Algorithm
The `findBestFab()` function ranks candidates on:
- Capability match (required)
- Material availability (+20 points)
- Rating (+5 per star)
- Lead time match (+30 if within maxLeadTime)
- Price competitiveness (+15 if under maxPrice)
- Distance penalty (-1 per 100km from user)

Higher score = better match.

### Job State Machine
```
DRAFT ──submit──> SUBMITTED ──webhook: job.accepted──> ACCEPTED
                                ││
                                ├──webhook: job.started──> IN_PROGRESS
                                ├──webhook: job.qc_passed──> QC
                                ├──webhook: job.shipped──> SHIPPED
                                ├──webhook: job.delivered──> DELIVERED
                                └──complete──> COMPLETED

SUBMITTED ──user cancel──> CANCELLED
```

---

## Testing

```javascript
// List all fabs
console.log(window.cycleCAD.fabs.listFabs());

// Submit a test job
const job = window.cycleCAD.fabs.submitJob({
  name: 'Test Part',
  capability: 'cnc_3axis',
  material: 'aluminum',
  partSize: { x: 100, y: 100, z: 50 },
  quantity: 1,
  urgency: 'standard'
});

// Simulate full lifecycle
window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.accepted');
window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.started');
window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.qc_passed');
window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.shipped');
window.cycleCAD.fabs.simulateWebhook(job.fabId, job.id, 'job.delivered');

// View job details
console.log(window.cycleCAD.fabs.getJob(job.id));

// View webhook log
console.log(window.cycleCAD.fabs.getWebhookLog(job.id));
```

---

## Future Enhancements

1. **Real Webhook Integration** — POST to external fab APIs
2. **Payment Integration** — Stripe/crypto for token redemption
3. **Capacity Planning** — Fab load balancing and scheduling
4. **Quality Tracking** — Post-delivery QC metrics
5. **Vendor Management** — Custom pricing tiers, SLAs
6. **Analytics Dashboard** — Cost trends, delivery times, fab ratings
7. **API Gateway** — REST/GraphQL interface for external agents
8. **Multi-user Collaboration** — Shared job tracking across teams

---

## License & Attribution

Part of cycleCAD — Agent-First OS for Manufacturing
(c) 2026 Sachin Kumar / cycleWASH
Open Source
