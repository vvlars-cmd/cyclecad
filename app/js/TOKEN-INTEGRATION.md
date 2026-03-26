# $CYCLE Token Engine Integration Guide

## Overview

The `$CYCLE` Token Engine is a per-operation billing system for cycleCAD, inspired by the Claude API token model. Every CAD operation costs tokens, and tokens can be purchased, earned, or generated through cache hits.

## Files Created

1. **token-engine.js** (~750 lines)
   - Core billing engine with balance management
   - Double-entry ledger (debit buyer, credit creator + platform)
   - Per-operation pricing (2-100 tokens per operation)
   - Tier system (FREE/PRO/ENTERPRISE)
   - Cache discounts (10% repeat access within 24h)
   - Batch discounts (25% for 10+, 50% for 100+)
   - Escrow system for manufacturing jobs
   - Token purchase flow (Stripe placeholder)
   - Event system for real-time updates
   - All data persisted to localStorage

2. **token-dashboard.js** (~600 lines)
   - Rich UI dashboard for balance, transactions, usage analytics
   - 4 dialog systems: estimate price, purchase tokens, upgrade tier, view history
   - Real-time balance indicator in toolbar
   - Recent activity list
   - Top operations breakdown
   - Tier information cards

3. **index.html** (Modified)
   - Added token-engine.js `<script>` tag in head
   - Added import for token-dashboard.js in main script
   - Added "💰 Tokens" tab to properties panel
   - Added token balance indicator button to toolbar
   - Wired tab switching and balance updates

## API Usage

### Balance Management

```javascript
// Get current balance
const balance = window.cycleCAD.tokens.getBalance();

// Get detailed info
const info = window.cycleCAD.tokens.getBalanceInfo();
// Returns: { balance, tier, monthlyAllowance, usedThisMonth, remainingThisMonth, tierColor, creatorRoyalty }

// Add tokens (for purchases/earnings)
window.cycleCAD.tokens.addTokens(1000, 'stripe_purchase', { purchaseId: '...' });

// Spend tokens for operations
try {
  window.cycleCAD.tokens.spendTokens(10, 'model.export.step', { fileSize: 2.5 });
} catch (err) {
  console.error('Insufficient tokens:', err.message);
}
```

### Operation Pricing

```javascript
// Get price for an operation (includes cache & batch discounts)
const price = window.cycleCAD.tokens.getPriceForOperation('model.export.step', {});

// Estimate cost with optional batch size
const estimate = window.cycleCAD.tokens.estimateOperation('model.export.step', {
  batchSize: 10  // 25% discount applied
});
// Returns: { operation, basePrice, batchSize, batchDiscount, finalPrice, cached }

// Charge for operation (returns actual price paid including discounts)
const charge = window.cycleCAD.tokens.chargeForOperation('model.export.step', {}, {
  fileSize: 2.5
});
// Returns: { price, discount }
```

### Transaction History

```javascript
// Get transaction history with optional filters
const history = window.cycleCAD.tokens.getTransactionHistory({
  type: 'debit',           // 'debit' or 'credit'
  operation: 'model.export.step',
  after: '2026-03-25T00:00:00Z',
  minAmount: 5,
  limit: 50
});

// Get usage by operation (this month)
const usage = window.cycleCAD.tokens.getUsageByOperation();
// Returns: { 'model.export.stl': { count: 5, totalTokens: 10 }, ... }

// Get cost breakdown
const breakdown = window.cycleCAD.tokens.getCostBreakdown();
// Returns: [ { operation, count, totalTokens, averagePerOp, costInEuros }, ... ]

// Get monthly usage
const used = window.cycleCAD.tokens.getMonthlyUsage();
```

### Escrow System (for Manufacturing)

```javascript
// Create escrow for a fab job
const escrow = window.cycleCAD.tokens.createEscrow(500, 'job_123', 'fab_456', {
  service: 'CNC milling',
  estimatedCost: 50
});
// Returns: { escrowId, amount, status: 'held' }

// Release tokens to fab when job is delivered
window.cycleCAD.tokens.releaseEscrow('escrow_1');

// Cancel escrow and refund tokens
window.cycleCAD.tokens.cancelEscrow('escrow_1');

// Check escrow status
const status = window.cycleCAD.tokens.getEscrowStatus('escrow_1');
```

### Tier Management

```javascript
// Set user tier
window.cycleCAD.tokens.setTier('PRO');  // 'FREE', 'PRO', or 'ENTERPRISE'

// Get tier info
const tier = window.cycleCAD.tokens.getTier();
// Returns: { tier, tokensPerMonth, creatorRoyalty, color, balance, monthlyTokens }
```

### Token Purchases

```javascript
// Initiate token purchase (opens Stripe checkout in real app)
const session = window.cycleCAD.tokens.purchaseTokens(1000, 'stripe');
// Returns: { id, type, tokens, euros, method, status, stripeCheckoutUrl, metadata }

// Crypto purchase
const cryptoSession = window.cycleCAD.tokens.purchaseWithCrypto(10, 'USDC');

// Complete purchase after payment confirmation
window.cycleCAD.tokens.completePurchase('purchase_123', 1000);
```

### Events

```javascript
// Subscribe to token events
window.cycleCAD.tokens.on('token-spent', (data) => {
  console.log('Spent', data.amount, 'tokens on', data.operation);
});

window.cycleCAD.tokens.on('token-added', (data) => {
  console.log('Added', data.amount, 'tokens from', data.source);
});

window.cycleCAD.tokens.on('month-reset', (data) => {
  console.log('Monthly allowance reset:', data.balance, 'tokens');
});

window.cycleCAD.tokens.on('tier-changed', (data) => {
  console.log('Upgraded from', data.oldTier, 'to', data.newTier);
});

window.cycleCAD.tokens.on('escrow-created', (data) => {
  console.log('Escrow created:', data.escrowId);
});

// Unsubscribe
window.cycleCAD.tokens.off('token-spent', listener);
```

### Debug & Export

```javascript
// Export token data as JSON
const data = window.cycleCAD.tokens.exportDataAsJSON();

// Clear all token data (requires confirmation)
window.cycleCAD.tokens.clearAllData();
```

## Operation Pricing Table

All prices in tokens (100 tokens = €1):

### Model Operations
- Export as STL: 2 tokens
- Export as STEP: 10 tokens
- Export as glTF: 3 tokens
- Export as OBJ: 2 tokens
- Export as JSON: 1 token
- Export as DXF: 5 tokens
- Download mesh (read-only): 50 tokens
- Download parametric: 200 tokens
- Download with full IP: 1,000 tokens

### AI Operations
- Part identifier: 5 tokens
- Design review: 15 tokens
- Material suggestion: 3 tokens
- Fastener suggestion: 4 tokens
- Generative design: 50 tokens

### CAM Operations
- Slice for 3D print: 20 tokens
- CNC toolpath: 75 tokens
- Laser path: 30 tokens
- Foam cutting: 25 tokens

### Manufacturing
- Submit fab job (escrow): 100 tokens
- Request quote: 10 tokens
- List vendors: 5 tokens

### Analysis
- Thermal analysis: 20 tokens
- Stress analysis: 30 tokens
- Clearance check: 15 tokens
- Weight estimation: 2 tokens
- Cost analysis: 5 tokens

### Marketplace & Collaboration
- Publish design: 0 tokens (free)
- List design: 0 tokens (free)
- Download design: 25 tokens
- Share link: 0 tokens (free)
- Comments: 0 tokens (free)
- Collaboration workspace: 50 tokens/month

## Tier System

### FREE Tier
- 1,000 tokens/month
- 70% creator royalty
- Basic exports
- Community support

### PRO Tier (€49/month)
- 10,000 tokens/month
- 80% creator royalty
- STEP import/export
- AI design review
- Priority support

### ENTERPRISE Tier (€299/month)
- 100,000 tokens/month
- 90% creator royalty
- Unlimited STEP
- Advanced analytics
- SLA & support
- Custom integrations

## Discounts

### Cache Discount
- First access: full price
- Repeat access within 24h: 10% of original price
- Cached operations tracked in localStorage

### Batch Discount
- Single operation: full price
- Batch of 10+ operations: 25% discount
- Batch of 100+ operations: 50% discount

## Double-Entry Ledger

Every transaction creates entries for:
1. **Debit**: Charged to the user
2. **Credit**: Split between creator (70-90%) and platform (10-30%)

For example, exporting a STEP file (10 tokens):
- User debited 10 tokens
- Creator credited 8 tokens (80% on PRO tier)
- Platform credited 2 tokens (20% fee)

## localStorage Keys

- `cyclecad_token_balance` — current token balance
- `cyclecad_token_ledger` — transaction history (JSON array)
- `cyclecad_token_cache` — cached operations (JSON object)
- `cyclecad_token_escrow` — active escrows (JSON object)
- `cyclecad_user_tier` — current tier ('FREE', 'PRO', 'ENTERPRISE')
- `cyclecad_month_start` — month start date for allowance reset

## Integration Checklist

- [x] token-engine.js created and initialized in head
- [x] token-dashboard.js created and imported
- [x] Token tab added to properties panel (right side)
- [x] Token balance button added to toolbar
- [x] Token balance indicator updates in real-time
- [x] All UI dialogs created (estimate, purchase, upgrade, history)
- [x] Event system wired to dashboard updates
- [x] localStorage persistence implemented
- [x] Monthly allowance reset logic
- [x] Cache discount system

## Next Steps (Optional Enhancements)

1. **Stripe Integration**: Connect purchaseTokens() to real Stripe checkout
2. **Crypto Payments**: Implement purchaseWithCrypto() with Polygon/USDC
3. **Creator Dashboard**: Show royalty earnings and payout history
4. **Cost Estimation**: Show cost before operations (prompt before spending)
5. **Cost Breakdown**: Pie chart showing token spend by operation type
6. **Invoice Export**: Generate PDF invoices for purchases
7. **Team Billing**: Support shared team tokens pool
8. **Usage Alerts**: Notify when approaching monthly limit
9. **Subscription Management**: Add cancel/pause subscription flows
10. **Analytics Dashboard**: Historical usage trends and projections

## Testing

To test the token engine in browser console:

```javascript
// Check balance
console.log(window.cycleCAD.tokens.getBalance());

// Spend tokens
window.cycleCAD.tokens.spendTokens(5, 'test.operation', { test: true });

// View history
console.log(window.cycleCAD.tokens.getTransactionHistory({ limit: 10 }));

// Upgrade tier
window.cycleCAD.tokens.setTier('PRO');

// View tier info
console.log(window.cycleCAD.tokens.getTier());
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  cycleCAD Browser App                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Agent API / User Actions                              │ │
│  │  (trigger operations)                                  │ │
│  └─────────────────┬──────────────────────────────────────┘ │
│                    │                                         │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │  Token Engine (token-engine.js)                         │ │
│  │  - Balance tracking                                    │ │
│  │  - Operation pricing                                  │ │
│  │  - Ledger management                                  │ │
│  │  - Tier system                                        │ │
│  │  - Event emissions                                    │ │
│  └─────────────────┬──────────────────────────────────────┘ │
│                    │                                         │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │  Token Dashboard UI (token-dashboard.js)                │ │
│  │  - Balance card                                        │ │
│  │  - Transaction list                                   │ │
│  │  - Usage analytics                                    │ │
│  │  - Purchase dialogs                                   │ │
│  │  - Tier upgrade flows                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                    │                                         │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │  localStorage (Persistence)                             │ │
│  │  - cyclecad_token_balance                              │ │
│  │  - cyclecad_token_ledger                               │ │
│  │  - cyclecad_token_cache                                │ │
│  │  - cyclecad_token_escrow                               │ │
│  │  - cyclecad_user_tier                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Files Modified

1. `/app/index.html`
   - Added `<script src="./js/token-engine.js"></script>` in head
   - Added `import { initTokenDashboard } from './js/token-dashboard.js';`
   - Added "💰 Tokens" tab button to properties panel
   - Added token balance indicator button to toolbar
   - Added token dashboard initialization and event wiring
   - Updated tab switching logic to include tokens tab

## Questions?

For API questions, inspect `window.cycleCAD.tokens` directly or check the source in token-engine.js.

The token system is **opt-in**: if you don't call the API, tokens aren't spent. Only operations that explicitly call `chargeForOperation()` will incur costs.
