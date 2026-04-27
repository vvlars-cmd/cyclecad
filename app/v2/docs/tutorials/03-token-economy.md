# Tutorial 3 — The $CYCLE token economy (15 minutes)

> Bring up the full Docker stack, generate some traffic, watch the
> ledger fill up, verify the chain, and issue some credit.

## Step 1 · Start the stack

```bash
make up                     # docker compose up -d --build
make health                 # wait for all green
```

Open *two* tabs:

- http://localhost:8080/apps/cyclecad/
- http://localhost:8080/apps/admin/

## Step 2 · Set the admin key

In the admin tab → *Set admin key…* → `rk_dev_local`. Reload.

The footer should show:

```
meter: up    db: up    chain: OK · 0 rows    actor: admin_root
```

## Step 3 · Generate some traffic in cycleCAD

Run the same workflow from Tutorial 1, but watch the admin tab:

1. cycleCAD: build a sketch + extrude.
2. cycleCAD: open AI Copilot, ask for "an M8 hex nut".
3. Switch to admin tab.
4. *Operations → Overview*. Click *REFRESH*.
5. The KPI cards repaint:
   - **Tx · 24h** = 5 or so
   - **Actors · 24h** = 1 (you)
   - **$CYCLE spent** = small (admin bypass on first window)
   - **Admin bypass** = the same number

Below: the recent ledger shows the rows, including their `widget.method`.

## Step 4 · Inspect a single charge

Pick any row → copy `tx_id`. Switch to *$CYCLE Token → Balances*. Paste
into the *refund tx* field with reason `tutorial test` → *REFUND*. The
JSON output shows `{ ok: true }`. The original ledger row now has
`refunded_at` stamped (visible in *Audit*).

## Step 5 · Verify the chain

*$CYCLE Token → Audit* → *VERIFY CHAIN*. Banner:

```
✓ chain OK · 5 rows · 0 mismatched
```

This is the cryptographic proof that no one has tampered with the
ledger between charges. Try this experiment to see it in action:

```bash
# In another terminal — manually break a row:
docker compose exec postgres psql -U cyclecad cyclecad \
  -c "UPDATE ledger SET cost = cost + 10 WHERE id = 1;"
```

Refresh *Audit*. Banner flips red:

```
✗ chain BROKEN · 1/5 mismatched · #1
```

The hash for row #1 no longer matches `sha256(prev_hash || actor || …
|| cost || …)`. Restore the cost (or just `make down && make up`) and
the chain comes back green.

## Step 6 · Issue credit

Switch to a non-admin actor (let's pretend "alice"):

1. *Balances* → in *actor*, type `alice` → *LOOKUP*.
2. Balance: `0`. Calls 30d: `0`.
3. In *issue credit*: amount `5000`, source `manual` → *ISSUE*.
4. The JSON output shows `{ ok: true, balance: 5000 }`.
5. Re-run *LOOKUP* — KPI repaints with 5,000.

## Step 7 · See the cost formula in action

cycleCAD tab → *Tools → AI Engineering Analyst* → run the bolted-joint
analysis. This is an `opus`-tier widget (heavy compute = high rate).

Switch to admin → *Audit* → *REFRESH LEDGER*. The new row shows:

```
widget.method  ai-engineering-analyst.init
tokens_in      ~12
tokens_out     ~600        (full report tokens)
model_tier     opus
rate_in        5.0
rate_out       25.0
cost           ~15060
cache_hit      false
batch_size     1
```

Run the same analysis again. The new row:

```
cache_hit     true
cost          ~13554       (10% off)
```

That's the prompt-cache discount. Run it 10 more times in a script:

```js
for (let i = 0; i < 12; i++) await fetch('/api/meter/charge', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    widget: 'ai-engineering-analyst', method: 'run',
    tokensIn: 12, tokensOut: 600, modelTier: 'opus',
    batchSize: 12, actor: 'alice', params: { test: true },
  }),
});
```

The next row shows `batch_size: 12 · cost: ~7530` — 50% off because
batch ≥ 10.

## Step 8 · Add a creator royalty

In the meter container:

```bash
docker compose exec postgres psql -U cyclecad cyclecad <<SQL
INSERT INTO widget_owners (widget, creator, royalty_pct)
VALUES ('ai-engineering-analyst', 'sachin', 70)
ON CONFLICT (widget) DO UPDATE
  SET creator = EXCLUDED.creator, royalty_pct = EXCLUDED.royalty_pct;
SQL
```

Now run the analysis again. The ledger row shows `creator: sachin · creator_payout: ~10500` (70% of cost). Sachin earned 10,500 $CYCLE from
that one call.

Check earnings:

```bash
curl -H "x-admin-key: rk_dev_local" \
  'http://localhost:8080/api/meter/earnings?creator=sachin' | jq
# { "ok": true, "creator": "sachin", "earned": 10500, "calls": 1 }
```

## Step 9 · See the plans + rates

```bash
curl -s http://localhost:8080/api/meter/plans | jq
curl -s http://localhost:8080/api/meter/rates | jq
```

The rates table is editable from the admin dashboard's
*Widgets → Registry* panel. Change them; the next charge uses the new
rates immediately.

## What you learned

| Concept | Where it lives |
|---|---|
| Per-call cost = `tokensIn × rate_in + tokensOut × rate_out` | `server/meter/index.js` |
| 10% prompt-cache discount | `cache_hits` table + 24h check |
| 25% / 50% batch discount | `batchSize` parameter |
| Hash-chained audit | `prev_hash` + `hash` in `ledger` |
| 70/30 creator royalty | `widget_owners.royalty_pct` |
| Admin bypass | `bypass = true` rows, cost = 0 |
| Free localStorage fallback | `meter.js` when `/api/meter` is unreachable |

## Going further

- [`docs/TOKEN-ENGINE.md`](../TOKEN-ENGINE.md) — full reference.
- [`docs/ADMIN-GUIDE.md`](../ADMIN-GUIDE.md) — operator workflows.
- Run `02-build-a-widget.md` and add a `creator` to your widget. Earn
  $CYCLE every time someone runs it.
