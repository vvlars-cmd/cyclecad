# Admin Dashboard Guide

> The dashboard at `/apps/admin/` runs the suite for operators — token
> issuance, ledger audit, identity, widget pricing, marketplace approvals.

## 1. Getting in

The dashboard requires an **admin key** in `localStorage`:

```js
localStorage.cyclecad.adminKey = 'rk_dev_local';     // dev default
```

Or click *Set admin key…* in the dashboard header. In production the
meter container reads `ADMIN_KEY` from env — set it before deploy.

Without an admin key, the dashboard loads but every privileged widget
shows a friendly "set the admin key" warning instead of failing.

## 2. Layout

```
┌─ Suite bar ───── CYCLECAD SUITE · admin · [PROD] · 🔑 ∞ $CYCLE ──── nav ──┐
├───────────────────┬───────────────────────────────────────────────────────┤
│  Sidebar           │  Workbench                                            │
│  Operations        │  ┌───────────────────────────────────────────────┐    │
│   • Overview       │  │ Breadcrumb · Title                            │    │
│   • Realtime       │  │ ┌───────────────────────────────────────────┐ │    │
│   • Health         │  │ │ Active widget mounts here                 │ │    │
│   • Ops            │  │ └───────────────────────────────────────────┘ │    │
│  $CYCLE Token      │  └───────────────────────────────────────────────┘    │
│   • Balances       │                                                       │
│   • Audit          │                                                       │
│   • Payments       │                                                       │
│  Identity          │                                                       │
│   • Users          │                                                       │
│   • API keys       │                                                       │
│   • Tenants        │                                                       │
│   • Compliance     │                                                       │
│  Widgets           │                                                       │
│   • Registry       │                                                       │
│   • Stats          │                                                       │
│   • Workflows      │                                                       │
│   • Agents         │                                                       │
│   • Marketplace    │                                                       │
│  Storage           │                                                       │
│   • Files          │                                                       │
│   • Repo           │                                                       │
├───────────────────┴───────────────────────────────────────────────────────┤
│ Footer: meter · db · chain · actor                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

The footer is the operator's first stop:

```
meter: up      ← Fastify reachable
db:    up      ← Postgres reachable
chain: OK · 1234 rows  ← hash chain integrity (red if mismatched)
actor: admin_root      ← who you're authenticated as
```

If `chain` flips to red, **stop everything** and open the *Audit* widget.

## 3. The 18 admin widgets

### Operations

#### admin-overview

Default view. KPI cards (Tx · 24h · Actors · 24h · $CYCLE spent · Admin
bypass) + 30-row recent ledger table. Polls every 30s when *Refresh*
auto-poll is on. Real implementation — no scaffold.

#### admin-realtime

Tail of meter calls + errors. Live WebSocket to the meter container.
Useful during incident response — watch which widgets are misbehaving.

#### admin-health

Service status (meter / postgres / redis / minio), error log, restart
button (Phase 3 — currently displays only).

#### admin-ops

Backups, feature flags, kill-switch. The big-red-button widget.

### $CYCLE Token

#### admin-tokens — operator workbench

The workhorse. Three sections:

1. **Lookup** — type any actor, click *LOOKUP*. KPI cards repaint with
   their balance, calls in last 30 days, total spent.
2. **Issue credit** — actor + amount + source (manual / plan / stripe /
   usdc / refund) → POST `/api/meter/recharge`. New balance shown
   instantly.
3. **Refund tx** — paste a `tx_id`, give a reason, click *REFUND* →
   POST `/api/meter/refund`. The ledger row gets `refunded_at`
   stamped.

#### admin-audit — hash-chained ledger viewer

Two buttons:

- **VERIFY CHAIN** → walks every ledger row, recomputes
  `sha256(prev || actor || widget || method || cost || ts || params_hash)`,
  compares to `hash`. Banner goes green if perfect, red with mismatch
  IDs otherwise.
- **REFRESH LEDGER** → fetches the most recent 50 rows.

Filter by actor in the box on the right.

The hash preview column shows the first 12 hex chars; hover to see the
full hash; click to copy.

#### admin-payments

Stripe webhooks + payouts. Stubbed until Phase 10. Currently shows the
last 50 `credits` rows where `source IN ('stripe','usdc')`.

### Identity & Access

#### admin-users

List / invite / role-assign / disable users. Reads `users` table.
Phase 3 wires in real OAuth.

#### admin-api-keys

Generate API keys (calls `POST /api/auth/keys`). Keys shown **once** —
copy them immediately. Phase 3 upgrades from sha256 to Argon2.

#### admin-tenants

Multi-tenant orgs. Each tenant has its own balance, ledger view, plan.
SaaS feature — self-host runs single-tenant.

#### admin-compliance

GDPR data export / erasure, SOC-2 evidence pack. Stubbed bins for now.

### Widgets & Workflows

#### admin-widget-registry

Per-widget pricing editor — `cost`, `tokensIn` / `tokensOut`,
`modelTier`, `creator`, `royaltyPct`. Writes to `widgets` and
`widget_owners` tables.

#### admin-widget-stats

P50 / P95 / P99 latency per widget, error rates, top callers. Aggregates
from `ledger` rows.

#### admin-workflows

Workflow run history — success rate, average $CYCLE spent, last failure.

#### admin-agents

MCP tool calls + AI Copilot conversations. Useful for debugging agent
behaviour ("why did Copilot pick this widget?").

#### admin-marketplace

Pending listings, reviews, royalty payouts. Approves/rejects new widgets
submitted by external creators.

### Storage & Repo

#### admin-files

S3 / MinIO browser per tenant. Useful when a customer reports "my model
won't load" — find their upload and inspect it.

#### admin-repo

Git log, last deploy, rollback button (Docker-only).

## 4. The $CYCLE balance pill

The pill in the suite bar is the same `token-balance` widget that
appears in the cycleCAD status bar. As an admin you see `🔑 ∞`. Click it
to open the *admin-tokens* widget directly.

## 5. Common workflows

### 5.1 Issue $CYCLE to a customer

1. Navigate to *$CYCLE Token → Balances*.
2. Type their actor name (usually the email local-part) → *LOOKUP*.
3. In *issue credit* enter amount + source = `stripe`.
4. Add a *reference* — Stripe charge ID or invoice number.
5. Click *ISSUE*. KPI cards repaint with the new balance.

### 5.2 Investigate a complaint

1. *Audit* → enter their actor in the filter → *REFRESH LEDGER*.
2. Find the suspicious row, copy `tx_id`.
3. Switch to *Balances* → paste the `tx_id` in *refund tx* with a reason.
4. Document in *admin-compliance* (Phase 3 ticket linkage).

### 5.3 Verify chain integrity (run weekly)

1. *Audit* → *VERIFY CHAIN*.
2. If `mismatched > 0`:
   - Don't restart anything — preserve the broken state.
   - Export `/api/meter/ledger?limit=10000` to disk.
   - Open `admin-realtime` and screenshot.
   - File an incident ticket — see [`docs/RUNBOOK.md`](RUNBOOK.md).

### 5.4 Onboard a new widget creator

1. Generate an API key for them — *Identity → API keys*.
2. Set their royalty share — *Widgets → Registry* → find the widget,
   set `creator` to their actor name, `royaltyPct` to negotiated value
   (default 70%).
3. Approve their listing — *Widgets → Marketplace*.

### 5.5 Set per-tier rates (Claude-style)

1. *Widgets → Registry*.
2. The rates table at the top edits `model_rates`:
   - haiku: rate_in / rate_out
   - sonnet: rate_in / rate_out
   - opus: rate_in / rate_out
3. *Save* — triggers `UPDATE` on `model_rates` rows.
4. Subsequent calls use the new rates immediately (no cache, no restart).

## 6. Backups

```bash
# Daily backup (cron'd in production):
docker compose exec postgres pg_dump -U cyclecad cyclecad > /backups/$(date +%F).sql

# Verify the chain on the backup:
docker compose -f docker-compose.test.yml run \
   --rm meter sh -c 'PG=postgres-test psql … -f /backups/2026-04-26.sql && \
                     curl -s http://localhost:8787/api/meter/audit/verify | jq'
```

## 7. Disaster recovery

Hash chain is corrupted on prod:

1. Stop the meter container — `docker compose stop meter`.
2. Find the last good backup (chain verifies).
3. Restore: `psql … < /backups/last-good.sql`.
4. Replay any `ledger.jsonl` rows the file fallback wrote since.
5. Restart meter — `docker compose start meter`.

The file fallback at `/data/ledger.jsonl` is the safety net if Postgres
goes down briefly. Each file row has the full chain context; replay
preserves integrity.

## 8. Escalation paths

| Issue | Who |
|---|---|
| Customer billing dispute | Founder (vvlars@googlemail.com) |
| Chain integrity broken | Founder + on-call eng |
| Production outage | On-call rotation (Phase 8) |
| GDPR data request | Compliance widget + Founder |
| Marketplace dispute | Marketplace widget thread |
