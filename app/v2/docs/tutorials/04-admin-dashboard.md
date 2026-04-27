# Tutorial 4 — The admin dashboard (15 minutes)

> Run the suite as an operator. Issue credit, audit, manage widget
> creators, handle a "broken chain" incident.

## Prerequisites

Full Docker stack running:

```bash
make up
make health
```

Admin key set:

```js
localStorage.cyclecad.adminKey = 'rk_dev_local';
```

Open `http://localhost:8080/apps/admin/`.

## Step 1 · The footer is the operator's first stop

```
meter: up    db: up    chain: OK · 5 rows    actor: admin_root
```

Anything red here is the only thing you should be looking at. Right now
it's all green — proceed.

## Step 2 · Tour the sidebar

Five sections, 18 widgets. Click each once to see its surface:

- *Operations* — Overview · Realtime · Health · Ops
- *$CYCLE Token* — Balances · Audit · Payments
- *Identity* — Users · API keys · Tenants · Compliance
- *Widgets* — Registry · Stats · Workflows · Agents · Marketplace
- *Storage* — Files · Repo

Some show real KPI cards (Overview), some are still scaffolds (anything
returning a `{ runs: N }` JSON blob from a *RUN* button). Stage 3 fleshes
them out one by one.

## Step 3 · Issue credit to a customer

Scenario: alice@cyclewash.de bought the Pro plan via Stripe. The webhook
isn't wired yet (Phase 10), so we issue manually.

1. *$CYCLE Token → Balances*.
2. *actor* = `alice@cyclewash.de` → *LOOKUP*.
3. *issue credit* — amount `100000` (Pro monthly), source `stripe`,
   reference `ch_xxxxxxxxxxxx` → *ISSUE*.
4. The KPI repaints to 100,000.
5. Done — alice can now run widgets that cost money.

Document it in your CRM:

```
[ALICE@CYCLEWASH.DE]  +100,000 $CYCLE  pro plan  Stripe ch_xxxxxxxxxxxx
```

## Step 4 · Refund a complaint

Bob says "I clicked AI Render by accident". Find the tx:

1. *$CYCLE Token → Audit*.
2. Filter actor: `bob` → *REFRESH LEDGER*.
3. Find the `ai-render.run` row. Copy `tx_id` (full one — hover the
   short hash to see the long form).
4. *Balances* → paste in *refund tx*, reason `accidental click` →
   *REFUND*.

The ledger row now has `refunded_at` stamped. Audit chain still verifies
green — refund is a column update, not a new row.

## Step 5 · Investigate a chain mismatch (drill)

Simulate the worst-case scenario:

```bash
docker compose exec postgres psql -U cyclecad cyclecad \
  -c "UPDATE ledger SET cost = cost + 1 WHERE id = 3;"
```

In the dashboard, *Audit* → *VERIFY CHAIN*:

```
✗ chain BROKEN · 1/N mismatched · #3
```

Footer also flips red:

```
chain: mismatched 1/N
```

Real-life response (do this even on a drill):

1. **Don't restart anything.** Preserve state.
2. Screenshot the dashboard. Save the timestamp.
3. Export the ledger:
   ```bash
   curl -H "x-admin-key: rk_dev_local" \
     'http://localhost:8080/api/meter/ledger?limit=10000' \
     > /tmp/ledger-broken-$(date -u +%FT%TZ).json
   ```
4. Find the most recent backup that verifies clean (run `audit/verify`
   on a restore).
5. Replay any new rows from `/data/ledger.jsonl` (file fallback) since
   that backup.
6. File the post-mortem in *admin-compliance*.

To clean up the drill:

```bash
docker compose exec postgres psql -U cyclecad cyclecad \
  -c "UPDATE ledger SET cost = cost - 1 WHERE id = 3;"
```

Wait — that won't fix the hash either, because we still need to
recompute. The honest answer in production is: "you can't fix a broken
chain by editing rows; you restore from backup". For the drill, just
`make down && make up` to reseed.

## Step 6 · Add a widget creator

1. *Widgets → Registry*.
2. Find `ai-render` in the list.
3. *creator* = `sachin`, *royaltyPct* = `70`.
4. *Save*.

Every subsequent `ai-render` call records `creator_payout = 70% of cost`.
At end-of-month a payout job (Phase 10) drains the running total to
sachin's bank/wallet.

## Step 7 · Generate an API key for an external tool

Scenario: the customer wants to call cycleCAD widgets from their own
script.

1. *Identity → API keys*.
2. *Generate* — label `acme-ci`, scopes `widgets:call`.
3. **Copy the key now** — it's shown once.
4. Hand it over via your secure channel (1Password, Bitwarden share).

The customer's script:

```bash
curl -X POST http://customer.host/api/meter/charge \
  -H "x-api-key: cyclecad_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "content-type: application/json" \
  -d '{ "widget": "ai-render", "actor": "acme-ci",
        "tokensIn": 1, "tokensOut": 100, "modelTier": "opus" }'
```

The meter records it like any other call.

## Step 8 · Restart a service

If `meter` shows down in the footer:

```bash
docker compose restart meter
docker compose logs -f meter            # watch
```

The schema migration runs on every boot. If a column is missing, the
boot will print the SQL error in the log.

## Step 9 · Schedule the chain verifier

Cron'd weekly:

```bash
# Add to /etc/cron.weekly/cyclecad-audit
#!/bin/sh
RESULT=$(curl -s -H "x-admin-key: $ADMIN_KEY" \
  http://localhost:8080/api/meter/audit/verify | jq -r '.mismatched')
[ "$RESULT" -gt 0 ] && \
  echo "cycleCAD chain mismatched: $RESULT" | \
  mail -s "[ALERT] cyclecad chain" sachin@cycleCAD.local
```

## What you learned

- The dashboard is the operator's single pane of glass.
- Chain audit is the cheapest disaster-recovery tripwire — runs in
  milliseconds, catches everything from db tampering to bad migrations.
- Issuing credit is one form, three fields. Stripe wiring will do this
  automatically at Phase 10; today it's manual.
- Refunds are column updates; they do not break the chain.
- Creator royalties are recorded per-call, drained per-month.
- Backups + chain verify is the disaster recovery plan. Test it.

## Next

- [`docs/RUNBOOK.md`](../RUNBOOK.md) — full incident response runbook
  (Phase 8).
- [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) — production hardening.
