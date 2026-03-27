# $CYCLE Token Engine — Build Complete ✓

## What Was Built

A complete per-operation billing system for cycleCAD inspired by the Claude API token model. Users earn tokens through purchases and marketplace sales, spend them on CAD operations, and see real-time balance updates.

## Files Created

### 1. `app/js/token-engine.js` (750 lines)
The core engine handling:
- **Balance Management**: Get/add/spend tokens with localStorage persistence
- **Operation Pricing**: 30+ operations priced from 1-1000 tokens
- **Double-Entry Ledger**: Every spend debits user, credits creator (70-90%) + platform (10-30%)
- **Tier System**: FREE (1K/mo), PRO (10K/mo, €49), ENTERPRISE (100K/mo, €299)
- **Discounts**:
  - Cache: 10% for repeat operations within 24h
  - Batch: 25% for 10+ operations, 50% for 100+
- **Escrow System**: Hold tokens for manufacturing jobs, release on delivery
- **Purchase Flow**: Stripe checkout placeholder + crypto payments (Polygon/USDC)
- **Event System**: Listen to token-spent, token-added, month-reset, tier-changed, escrow events
- **Transaction History**: Query with filters (type, operation, date, amount)

**API:**
```javascript
// Core
window.cycleCAD.tokens.getBalance()           // 1000
window.cycleCAD.tokens.addTokens(100, 'purchase')
window.cycleCAD.tokens.spendTokens(10, 'model.export.step')
window.cycleCAD.tokens.chargeForOperation('export.step', {}, metadata)

// Operations
window.cycleCAD.tokens.getPriceForOperation(op, params)
window.cycleCAD.tokens.estimateOperation(op, { batchSize: 10 })

// History
window.cycleCAD.tokens.getTransactionHistory({ limit: 50 })
window.cycleCAD.tokens.getMonthlyUsage()
window.cycleCAD.tokens.getUsageByOperation()
window.cycleCAD.tokens.getCostBreakdown()

// Escrow
window.cycleCAD.tokens.createEscrow(100, jobId, fabId)
window.cycleCAD.tokens.releaseEscrow(escrowId)
window.cycleCAD.tokens.cancelEscrow(escrowId)

// Tier
window.cycleCAD.tokens.setTier('PRO')
window.cycleCAD.tokens.getTier()

// Purchase
window.cycleCAD.tokens.purchaseTokens(1000, 'stripe')
window.cycleCAD.tokens.purchaseWithCrypto(10, 'USDC')
window.cycleCAD.tokens.completePurchase(sessionId, amount)

// Events
window.cycleCAD.tokens.on('token-spent', listener)
window.cycleCAD.tokens.off('token-spent', listener)
```

### 2. `app/js/token-dashboard.js` (600 lines)
Rich UI dashboard with:
- **Balance Card**: Shows current balance, tier badge, monthly usage progress
- **Quick Actions**: "Estimate Price" and "Buy Tokens" buttons
- **Tier Info**: Monthly allowance, creator royalty %, upgrade button
- **Recent Activity**: Last 5 transactions with type/amount/balance
- **Top Operations**: Most-used operations this month
- **4 Dialog Systems**:
  1. **Estimate Price Dialog**: Pick operation + batch size → see final cost with discounts
  2. **Purchase Dialog**: Preset packages or custom amount → Stripe checkout link
  3. **Upgrade Dialog**: Compare FREE/PRO/ENTERPRISE with features & pricing
  4. **History Modal**: Full transaction table + CSV export
- **Real-time Updates**: Dashboard refreshes on every token event

### 3. `app/index.html` (Modified)
Integrated token engine into the UI:
- `<script src="./js/token-engine.js"></script>` in `<head>` — loads early
- `import { initTokenDashboard }` in main script
- Added **"💰 Tokens"** tab to right panel (next to Properties/Chat/Guide)
- Added **token balance indicator** button to toolbar (shows "1K Tokens", updates in real-time)
- Wired tab switching and event listeners
- Tab button has gradient background (blue → green) to stand out

### 4. `app/js/TOKEN-INTEGRATION.md` (Comprehensive guide)
Full documentation including:
- All API examples with code snippets
- Operation pricing table (30+ operations)
- Tier system details
- Discount mechanics explained
- Double-entry ledger example
- localStorage keys reference
- Architecture diagram
- Testing commands
- Next steps for enhancements

## UI Components

### Right Panel (Properties)
New "💰 Tokens" tab showing:
```
┌─────────────────────────────────┐
│ Balance: 1,000 tokens           │ ← Blue badge showing current balance
│ FREE tier                       │
├─────────────────────────────────┤
│ [Estimate Price] [Buy Tokens]   │ ← Quick action buttons
├─────────────────────────────────┤
│ TIER INFO                       │
│ 1,000 tokens/month              │
│ 70% creator royalty             │
│ [Upgrade to PRO €49/mo]         │
├─────────────────────────────────┤
│ RECENT ACTIVITY                 │
│ export.stl        -2 tokens     │ ← Last 5 transactions
│ export.stl        -2 tokens     │
│ stripe_purchase   +1,000 tokens │
├─────────────────────────────────┤
│ TOP OPERATIONS (This Month)     │
│ model.export.stl  10 tokens, 5x │
├─────────────────────────────────┤
│        [View full history]      │
└─────────────────────────────────┘
```

### Toolbar Token Button
Shows live balance:
- "1K Tokens" (GREEN with gradient background) — clickable to open Tokens tab
- Updates in real-time as tokens are spent/added
- Uses short format: "5M" for 5,000,000, "1K" for 1,000

### Dialogs (Triggered by dashboard buttons)

**Estimate Price Dialog:**
```
Estimate Operation Cost
├─ Operation dropdown (30+ options)
├─ Batch Size input
└─ Summary:
   Base: 10 tokens
   Discount: 25% (batch of 10+)
   Final: 7 tokens (€0.07)
```

**Purchase Tokens Dialog:**
```
Purchase Tokens
├─ Preset packages:
│  ├─ 1,000 tokens (€10)
│  ├─ 5,000 tokens (€50) ← Save €0.50
│  └─ 10,000 tokens (€90) ← Save €10
├─ Custom amount input
└─ [Proceed to Checkout]
```

**Upgrade Tier Dialog:**
```
Three columns (FREE, PRO*, ENTERPRISE):
├─ Price & tokens/month
├─ 70%/80%/90% creator royalty
├─ Feature list (checkmarks)
└─ [Current] [Upgrade] [Upgrade]
```

**History Modal:**
```
Token Transaction History
├─ Table: Date | Operation | Type | Amount | Balance
├─ Last 100 transactions, newest first
└─ [Export CSV]
```

## Key Features

1. **Zero Upfront Cost** — FREE tier has 1,000 tokens/month, no payment required
2. **Pay-as-you-go** — Buy tokens in €1 increments (100 tokens = €1)
3. **Creator Economics** — 70-90% of spending goes back to part creators (double-entry ledger)
4. **Marketplace Ready** — Escrow system holds tokens until manufacturing delivery
5. **Smart Discounts** — Cache hits (10% repeat), batch operations (25-50% off)
6. **Monthly Allowance** — Auto-resets on month boundary with tier tokens
7. **Real-time Dashboard** — See balance, recent activity, usage trends instantly
8. **Persistent Data** — All transactions stored in localStorage (survives page reload)
9. **Event System** — Subscribe to token changes for custom integrations
10. **Admin-Friendly** — Export transaction history as CSV for accounting

## Operation Pricing (Sample)

| Operation | Cost | Tier Benefit |
|-----------|------|--------------|
| Export STL | 2 | FREE |
| Export STEP | 10 | PRO only |
| AI Design Review | 15 | PRO/ENTERPRISE |
| CNC Toolpath | 75 | Speed priority |
| 3D Print Slice | 20 | Queue priority |

**Total FREE Allowance:** 1,000 tokens/month = enough for ~100 STL exports or ~66 design reviews

## localStorage Keys

- `cyclecad_token_balance` — current balance (integer)
- `cyclecad_token_ledger` — transaction array (JSON)
- `cyclecad_token_cache` — cached operations (JSON object with timestamps)
- `cyclecad_token_escrow` — active escrows (JSON object)
- `cyclecad_user_tier` — 'FREE' | 'PRO' | 'ENTERPRISE'
- `cyclecad_month_start` — month start date for auto-reset

## Testing in Console

```javascript
// View balance
console.log(window.cycleCAD.tokens.getBalance());  // 1000

// Spend tokens (simulated operation)
window.cycleCAD.tokens.spendTokens(10, 'model.export.step');

// View transaction history
console.log(window.cycleCAD.tokens.getTransactionHistory({ limit: 5 }));

// Get usage breakdown
console.log(window.cycleCAD.tokens.getCostBreakdown());

// Upgrade to PRO
window.cycleCAD.tokens.setTier('PRO');

// View current tier
console.log(window.cycleCAD.tokens.getTier());

// Subscribe to events
window.cycleCAD.tokens.on('token-spent', (data) => {
  console.log('Just spent:', data.amount, 'on', data.operation);
});
```

## Integration Points (Ready for)

1. **Agent API**: Call `chargeForOperation()` before executing operations via JSON-RPC
2. **Export Functions**: Wrap STL/STEP/DXF export in token charge flow
3. **AI Operations**: Charge for Gemini Vision, design review, suggestions
4. **Marketplace**: Debit buyer, credit seller in double-entry ledger
5. **Stripe**: Replace `purchaseTokens()` placeholder with real checkout
6. **Analytics**: Use transaction history for usage reports

## Files Modified Summary

| File | Changes | Lines |
|------|---------|-------|
| token-engine.js | NEW | 750 |
| token-dashboard.js | NEW | 600 |
| TOKEN-INTEGRATION.md | NEW | 350 |
| index.html | 4 edits | +60 |

**Total LOC:** ~1,700 lines of new code + documentation

## Next Phase

When Sachin is ready to integrate with actual operations:

1. Wrap `exportSTL()`, `exportGLTF()`, etc. with `chargeForOperation()` calls
2. Add cost estimation prompts before expensive operations (e.g., "This will cost 75 tokens. Continue?")
3. Connect Stripe API key for real payments
4. Build "Tokens Earnings" dashboard for creators
5. Add monthly billing emails
6. Create "Cost Report" showing token spend by operation type

---

**Status**: ✅ Complete and ready to test
**Access**: Click "💰 Tokens" button in toolbar or tab in Properties panel
**No setup required** — token-engine.js initializes automatically with FREE tier (1,000 tokens/month)
