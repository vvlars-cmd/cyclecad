# Token Engine Testing Guide

## Quick Start (5 minutes)

1. Open cycleCAD in browser: `https://cyclecad.com/app/` (or local dev server)
2. Look for **"💰 Tokens"** button in toolbar (right side, green+blue gradient)
3. Click it → Properties panel opens "Tokens" tab
4. You should see:
   - Balance: **1,000 tokens** (FREE tier allowance)
   - Tier badge: **FREE**
   - Monthly usage: **0 / 1,000**
   - Recent activity: empty
   - "Estimate Price" and "Buy Tokens" buttons

## Test Scenarios

### Scenario 1: Check Balance
```javascript
// In browser console:
window.cycleCAD.tokens.getBalance()
// Expected: 1000
```

### Scenario 2: Spend Tokens
```javascript
// Simulate exporting a STEP file
window.cycleCAD.tokens.spendTokens(10, 'model.export.step', { fileSize: 2.5 });

// Check new balance
window.cycleCAD.tokens.getBalance()
// Expected: 990

// In dashboard, "Recent Activity" should now show:
// model.export.step  -10 tokens  Balance: 990
```

### Scenario 3: View Transaction History
```javascript
window.cycleCAD.tokens.getTransactionHistory({ limit: 5 });
// Expected: Array with 1 debit entry (10 tokens spent)
```

### Scenario 4: Estimate Operation Cost
1. Click **"Estimate Price"** button in dashboard
2. Select "Export as STEP" from dropdown
3. Change "Batch Size" to 10
4. See: "Base: 10 tokens, Discount: 25%, Final: 7 tokens (€0.07)"
5. Click "Close"

### Scenario 5: Test Batch Discount
```javascript
// Batch of 1 operation: full price
const est1 = window.cycleCAD.tokens.estimateOperation('model.export.stl', { batchSize: 1 });
console.log(est1.finalPrice);  // 2 tokens

// Batch of 10: 25% discount
const est10 = window.cycleCAD.tokens.estimateOperation('model.export.stl', { batchSize: 10 });
console.log(est10.finalPrice);  // Math.ceil(2 * 0.75) = 2 tokens (no discount for this cheap op)

// Batch of 100: 50% discount
const est100 = window.cycleCAD.tokens.estimateOperation('model.export.step', { batchSize: 100 });
console.log(est100.finalPrice);  // Math.ceil(10 * 0.5) = 5 tokens
```

### Scenario 6: Test Cache Discount
```javascript
// First export: full price
const price1 = window.cycleCAD.tokens.getPriceForOperation('model.export.step', {});
console.log(price1);  // 10 tokens

// Immediate repeat: 10% of price (cache hit)
const price2 = window.cycleCAD.tokens.getPriceForOperation('model.export.step', {});
console.log(price2);  // Math.ceil(10 * 0.1) = 1 token

// Wait 24h+ or manually clear cache...
// (Testing: clear the cache in localStorage and repeat for full price)
```

### Scenario 7: Purchase Tokens
1. Click **"Buy Tokens"** button
2. See dialog with presets: 1K (€10), 5K (€50), 10K (€90)
3. Change custom amount to 2000
4. Click "Proceed to Checkout"
5. See alert: "Purchase initiated! Tokens: 2000, URL: [Stripe URL]" (demo mode)
6. Click OK

### Scenario 8: Upgrade Tier
1. Click **"Upgrade to PRO"** button in dashboard
2. See 3-column comparison (FREE, PRO*, ENTERPRISE)
3. PRO shows: €49/mo, 10,000 tokens, 80% royalty
4. Click "Upgrade" on PRO column
5. See alert: "Upgraded to PRO tier! Refreshing dashboard..."
6. Dashboard updates: balance now shows 10,000 tokens, tier badge is now "PRO"

### Scenario 9: View Tier Info
```javascript
window.cycleCAD.tokens.getTier();
// Expected (after upgrade): { tier: 'PRO', tokensPerMonth: 10000, creatorRoyalty: 0.8, ... }
```

### Scenario 10: Transaction History Export
1. Click **"View full history"** link at bottom of dashboard
2. Modal opens with table: Date | Operation | Type | Amount | Balance
3. Shows all transactions (debit/credit) in reverse chronological order
4. Click **"Export CSV"** button
5. Downloads: `cyclecad-tokens-2026-03-26.csv`
6. Open in Excel/Sheets to verify columns and data

### Scenario 11: Create Escrow (Manufacturing)
```javascript
// Create escrow for a CNC job
const escrow = window.cycleCAD.tokens.createEscrow(
  500,                    // 500 tokens held
  'job_fab_123',          // Job ID
  'fab_shop_456',         // Fab shop ID
  { service: 'CNC milling', est_cost: '$50' }
);
console.log(escrow);
// Expected: { escrowId: 'escrow_1', amount: 500, status: 'held' }

// Check balance decreased
window.cycleCAD.tokens.getBalance();
// Expected: 990 - 500 = 490 (if on PRO tier after previous test)

// Get escrow status
window.cycleCAD.tokens.getEscrowStatus('escrow_1');

// Release escrow when job delivered
window.cycleCAD.tokens.releaseEscrow('escrow_1');
// (In real system, this credits the fab shop's account)

// Check transaction history shows escrow_hold and escrow_release
window.cycleCAD.tokens.getTransactionHistory({ limit: 10 });
```

### Scenario 12: Cancel Escrow
```javascript
const escrow = window.cycleCAD.tokens.createEscrow(100, 'job2', 'fab2', {});
const balanceBefore = window.cycleCAD.tokens.getBalance();

window.cycleCAD.tokens.cancelEscrow(escrow.escrowId);

const balanceAfter = window.cycleCAD.tokens.getBalance();
// Expected: balanceAfter = balanceBefore (tokens refunded)
```

### Scenario 13: Test Monthly Allowance Reset
```javascript
// Current tier
console.log(window.cycleCAD.tokens.getTier());

// Spend some tokens
window.cycleCAD.tokens.spendTokens(5, 'test');

// Check monthly usage
console.log(window.cycleCAD.tokens.getMonthlyUsage());  // 5

// (Normally this resets on month boundary automatically)
// To simulate: manually set month_start to last month in localStorage
// localStorage.setItem('cyclecad_month_start', new Date('2026-02-01').toISOString());

// Then call getBalance() which triggers refresh:
window.cycleCAD.tokens.getBalance();
// Console should show: "[Token Engine] Month reset: balance restored to [tier tokens]"
```

### Scenario 14: Cost Breakdown
```javascript
// Do several operations (spend tokens on different ones)
window.cycleCAD.tokens.spendTokens(2, 'model.export.stl');
window.cycleCAD.tokens.spendTokens(10, 'model.export.step');
window.cycleCAD.tokens.spendTokens(15, 'ai.design_review');

// View breakdown
const breakdown = window.cycleCAD.tokens.getCostBreakdown();
console.table(breakdown);
// Expected columns: operation, count, totalTokens, averagePerOp, costInEuros
```

### Scenario 15: Usage by Operation
```javascript
const usage = window.cycleCAD.tokens.getUsageByOperation();
console.table(usage);
// Expected: { 'model.export.stl': { count: 1, totalTokens: 2 }, ... }
```

### Scenario 16: Event Subscriptions
```javascript
// Listen to token spent
window.cycleCAD.tokens.on('token-spent', (data) => {
  console.log(`💸 Spent ${data.amount} tokens on ${data.operation}`);
});

// Listen to tokens added
window.cycleCAD.tokens.on('token-added', (data) => {
  console.log(`💰 Added ${data.amount} tokens from ${data.source}`);
});

// Now trigger events
window.cycleCAD.tokens.spendTokens(5, 'test');
// Console: "💸 Spent 5 tokens on test"

window.cycleCAD.tokens.addTokens(100, 'bonus');
// Console: "💰 Added 100 tokens from bonus"
```

### Scenario 17: Export Data
```javascript
const allData = window.cycleCAD.tokens.exportDataAsJSON();
console.log(JSON.stringify(allData, null, 2));
// Shows: balance, tier, monthStart, ledger (all transactions), escrow, cache
```

### Scenario 18: UI Button Updates
1. Do a transaction (spend tokens)
2. Watch toolbar button label change:
   - After spending 10 tokens (balance 990): Label should update to "990 Tokens"
   - After adding 1000 tokens: Label should show "1.99K Tokens"
3. Click button → should open Tokens tab
4. Check tab content updates with new balance

### Scenario 19: Persistent Data
1. Perform several transactions
2. Refresh the page (F5)
3. Check toolbar: balance should be preserved
4. Open Tokens tab: balance, tier, activity should all be the same
5. Open DevTools → Application → localStorage → verify keys exist:
   - `cyclecad_token_balance`
   - `cyclecad_token_ledger`
   - `cyclecad_user_tier`

### Scenario 20: Multiple Tier Upgrades
```javascript
// Start: FREE
console.log(window.cycleCAD.tokens.getTier().tier);  // FREE

// Upgrade to PRO
window.cycleCAD.tokens.setTier('PRO');
console.log(window.cycleCAD.tokens.getTier().tier);  // PRO
// Balance reset to 10,000

// Upgrade to ENTERPRISE
window.cycleCAD.tokens.setTier('ENTERPRISE');
console.log(window.cycleCAD.tokens.getTier().tier);  // ENTERPRISE
// Balance reset to 100,000

// Back to FREE
window.cycleCAD.tokens.setTier('FREE');
console.log(window.cycleCAD.tokens.getTier().tier);  // FREE
// Balance reset to 1,000
```

## Debugging Tips

### Check Internal State
```javascript
// View all localStorage token data
{
  balance: localStorage.getItem('cyclecad_token_balance'),
  ledger_entries: JSON.parse(localStorage.getItem('cyclecad_token_ledger')).length,
  tier: localStorage.getItem('cyclecad_user_tier'),
  month_start: localStorage.getItem('cyclecad_month_start')
}
```

### Clear All Data (Hard Reset)
```javascript
// WARNING: This deletes all token history
window.cycleCAD.tokens.clearAllData();
// Page will refresh, all token data gone, back to FREE with 1,000 tokens
```

### Check if Module is Loaded
```javascript
typeof window.cycleCAD?.tokens?.getBalance;
// Expected: 'function' (if loaded)

// If undefined, check console for errors:
// "[Token Engine] $CYCLE initialized..."
```

### Performance Testing
```javascript
// How fast is the API?
console.time('chargeForOperation');
window.cycleCAD.tokens.chargeForOperation('model.export.step', {});
console.timeEnd('chargeForOperation');
// Expected: < 5ms
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Token button missing | Script not loaded | Hard refresh (Ctrl+Shift+R) |
| Tokens tab empty | initTokenDashboard() not called | Check browser console for errors |
| Balance not persisting | localStorage disabled | Check incognito/private mode |
| No events firing | Event listeners not attached | Check console: `window.cycleCAD.tokens.on` |
| Operations not charging | Agent API not integrated yet | Manual test: call `chargeForOperation()` |
| Math errors on escrow | Negative balance check | ensure balance ≥ amount before `createEscrow()` |

## Success Criteria

All tests pass when:
- ✅ Token balance displays and updates in real-time
- ✅ Spending tokens decreases balance
- ✅ Adding tokens increases balance
- ✅ Operations show in Recent Activity within 1 second
- ✅ Discount calculations are correct (cache 10%, batch 25-50%)
- ✅ Tiers upgrade properly (balance resets to tier allowance)
- ✅ Escrow creates, releases, and cancels without errors
- ✅ All data persists across page reloads
- ✅ CSV export contains all transactions
- ✅ Event listeners fire on every operation

---

**Estimated Testing Time**: 30 minutes for all 20 scenarios
**Report Issues**: Check browser console (F12) for errors, paste into GitHub issue
