# $CYCLE Token Engine — Claude-Style Billing

> The cycleCAD Suite meters every widget call the way Anthropic meters
> Claude: **input tokens × rate_in + output tokens × rate_out**, with a
> tiered model selector, prompt-caching discount, and a batch discount —
> plus one feature Claude doesn't have: a **two-way creator royalty flow**.

## 1. The Claude analogy

| Claude API | $CYCLE Token | Notes |
|---|---|---|
| BPE token count | per-widget sized units (file MB, mesh tris, gcode lines, AI tokens, …) | Each widget declares how it sizes its work |
| `input_tokens` × $/MTok | `tokens_in` × `rate_in` | Logged in `ledger.tokens_in` |
| `output_tokens` × $/MTok | `tokens_out` × `rate_out` | Logged in `ledger.tokens_out` |
| Model: Haiku · Sonnet · Opus | Tier: Haiku · Sonnet · Opus | Picks rate row from `model_rates` |
| Prompt caching (10% cost on repeat) | Cache hit (10% off if same widget+params+actor in last 24h) | Recorded in `cache_hits` |
| Batch API (50% off) | `batchSize ≥ 10` → 50%; `2..9` → 25% | Auto-applied server-side |
| Per-API-key rate limits | Per-tier `rate_limit_per_min` from `/api/meter/plans` | Enforced at Phase 10 |
| `usage.input_tokens` + `cache_read_input_tokens` | `/api/meter/usage` row | Same shape |
| **none** | `creator_payout` — 70% of cost flows to widget owner | Two-way ledger |
| **none** | `bypass=true` rows for admin actions | Hash-chained anyway |

Every widget call **looks identical to a Claude API request** at the
billing layer. Switching providers later (custom rates, custom tiers, even
USDC) doesn't change the contract — only the rate rows.

## 2. Pricing tiers

```
HAIKU    rate_in 0.25  rate_out 1.25     free / cheap fast widgets
SONNET   rate_in 1.0   rate_out 5.0      pro / standard
OPUS     rate_in 5.0   rate_out 25.0     enterprise / heavy compute (FEA, OCCT, AI Render)
```

These mirror Claude's per-million-token ratio (Haiku ≈ 1× cheaper, Opus
≈ 5× pricier than Sonnet). Editable from `admin-widget-registry` via
`POST /api/meter/widget-owner` and direct UPDATEs on `model_rates`.

## 3. Cost formula

```
raw  = (tokens_in × rate_in[tier]) + (tokens_out × rate_out[tier])
mult = (cache_hit  ? 0.9 : 1)           // 10% off
     × (batch ≥ 10 ? 0.5 : batch ≥ 2 ? 0.75 : 1)   // 50% / 25% / nothing
cost = max(0, round(raw × mult))
creator_payout = cost × royalty_pct[widget] / 100   // default 70%
```

Admin bypass forces `cost = 0` but the row is **still** hash-chained.

## 4. Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/meter/charge` | none | Claude-style charge: tokensIn / tokensOut / modelTier / batchSize |
| `POST` | `/api/meter/refund` | none | mark a tx refunded |
| `POST` | `/api/meter/recharge` | **admin** | issue $CYCLE credit |
| `POST` | `/api/meter/widget-owner` | **admin** | set creator + royalty per widget |
| `GET`  | `/api/meter/balance?actor=` | none | current balance |
| `GET`  | `/api/meter/usage?actor=&days=N` | none | per-day rollup |
| `GET`  | `/api/meter/plans` | none | static plan catalogue |
| `GET`  | `/api/meter/rates` | none | live per-tier rate table |
| `GET`  | `/api/meter/earnings?creator=` | **admin** | royalty totals |
| `GET`  | `/api/meter/ledger?…` | **admin** | raw rows |
| `GET`  | `/api/meter/audit/verify` | **admin** | walk hash chain |
| `GET`  | `/api/health` | none | meter + db + redis + s3 status |

The hash chain spans `(prev_hash, actor, widget, method, cost, ts,
params_hash)`. The new fields (`tokens_in`, `tokens_out`, `model_tier`,
`rate_in/out`, `cache_hit`, `batch_size`, `creator`, `creator_payout`) are
audit metadata recorded alongside but **not included in the chain hash**.
That's deliberate — the chain binds the contractual outcome (cost the
actor was charged), not the derivable inputs.

## 5. Schema (server/meter/schema.sql)

```sql
ledger (
  -- contract spine — bound by the hash chain:
  tx_id, ts, tenant_id, actor, role,
  widget, method, params_hash, cost,
  prev_hash, hash, bypass,

  -- Claude-style audit trail:
  tokens_in, tokens_out,
  model_tier, rate_in, rate_out,
  cache_hit, batch_size,

  -- creator royalty (the bit Claude doesn't have):
  creator, creator_payout,

  -- refund:
  refunded_at, refund_reason
)

credits (id, ts, tenant_id, actor, credit, source, reference)

widget_owners (widget, creator, royalty_pct, added_at)
cache_hits   (widget, params_hash, actor, ts)
model_rates  (tier, rate_in, rate_out, cap_per_call, notes)
```

The migration block in `schema.sql` is idempotent — adding the new
columns to an existing `ledger` won't fail if the meter container reboots.

## 6. Client SDK

```js
import { token } from '/shared/token.js';
import { meter } from '/shared/meter.js';

// Charge (called by loader.js automatically; rarely hand-rolled)
await meter.charge({
  widget:    'extrude',
  kind:      'init',
  actor:     'sachin',
  tokensIn:  4,           // e.g. profile vertex count
  tokensOut: 18,          // e.g. solid triangle count
  modelTier: 'sonnet',
  batchSize: 1,
  params:    { distance: 25, taper: 0 },
});

// Read-side
await token.balance();              // 99000
await token.rates();                // { haiku, sonnet, opus }
await token.usage({ days: 7 });
await token.plans();
token.estimate({ tokensIn: 4, tokensOut: 18, modelTier: 'sonnet' });
                                    // → 94 (raw 4·1 + 18·5 = 94, no discount)
token.estimate({ tokensIn: 4, tokensOut: 18, modelTier: 'sonnet', batchSize: 12 });
                                    // → 47 (50% batch off)

// Admin
await token.recharge({ actor: 'sachin', credit: 5000 });
await token.auditVerify();          // { ok, total, mismatched }
await token.earnings({ creator: 'sachin' });
                                    // { ok, earned: 12340, calls: 87 }
await token.ledger({ limit: 50 });
```

## 7. Widgets

| Widget | Where | What |
|---|---|---|
| **token-balance** | inline pill | shows balance, polls every 30s, click → token-recharge |
| **token-recharge** | modal | admin issues credit; non-admin queues a request |
| **admin-tokens** | admin dashboard | actor lookup + 30d usage + credit + refund |
| **admin-audit** | admin dashboard | live hash-chain verifier + ledger table |
| **admin-payments** | admin dashboard | Stripe webhooks + payouts (stubbed until Phase 10) |
| **admin-widget-registry** | admin dashboard | per-widget pricing + creator + royalty |
| **admin-marketplace** | admin dashboard | listing approvals + creator earnings |

## 8. Two-way creator royalty (the bit Claude doesn't have)

When a widget has a row in `widget_owners`, every charge against that
widget records both:

```
ledger.cost            = N        ($CYCLE the actor pays)
ledger.creator_payout  = N · 0.70 ($CYCLE owed to creator)
```

Phase 10 adds a separate `payouts` table + Stripe-Connect or USDC payout
flow that drains the running `SUM(creator_payout)` per creator into their
bank or wallet. Until then the meter keeps a perfect audit trail and
`/api/meter/earnings` reports the running total.

The platform keeps `1 - royalty_pct` of every charge — defaults to 30%,
adjustable per widget. Marketplace apps default to 70/30, kernel widgets
to 0/100 (platform keeps everything because there's no external creator).

## 9. Wiring in apps

```html
<!-- apps/cyclecad/index.html status bar -->
<div class="status-item">
  <span class="status-label">$CYCLE:</span>
  <span class="status-value" id="status-cycle"></span>
</div>
```

```js
// Boot
const tb = await loadWidget('token-balance', { mount: '#status-cycle', app, meter });
document.body.addEventListener('token-balance:click', () => dispatch('token-recharge'));
```

The pill colours itself by balance — gold above 1k, amber 100-1k, red < 100,
and shows a `🔑` infinity glyph when an admin key is set.

## 10. Hash-chain integrity

```
hash[N] = sha256(hash[N-1] || actor || widget || method || cost || ts || params_hash)
```

Postgres `TIMESTAMPTZ` is re-serialised to ISO before hashing — without
that conversion every row past the first looked mismatched (the bug we
fixed in Stage 1). The admin dashboard footer flips red the moment
`mismatched > 0`.

## 11. Offline / dev fallback

When `/api/meter` is unreachable, `meter.js` writes to
`localStorage.cyclecad.ledger` instead. The Claude-style fields
(`tokensIn`, `tokensOut`, `modelTier`, `batchSize`) are echoed into the
local row so dev metrics look the same shape as production. Local rows
are **not** part of the chain — they're discarded once the meter container
boots back up.

## 12. Migration to Phase 10 (paid)

Identical to before:

1. Set `LEDGER_ENFORCE=true` → server returns 402 when `balance < cost`.
2. Wire `/api/stripe/webhook` to write `credits` rows on `invoice.paid`.
3. Add a `payouts` table + drain `creator_payout` to creators.
4. Flip `tokenPlan` per app in `manifest.json` based on tenant plan.
5. Edit `model_rates` rows to lock in production prices.

No widget code changes. The contract — and the way `meter.charge()` looks
to a widget author — was designed for this from day one.

## 13. Five questions the design answers

1. **How do I know how much a call will cost?** Call
   `token.estimate({ tokensIn, tokensOut, modelTier })` — same numbers the
   server will charge minus possible cache hit. Mirrors Claude's
   `count_tokens` pattern.
2. **What size are tokens?** Each widget defines this in its source
   (mesh tris, file MB, gcode lines, AI tokens). The meter just multiplies
   what the widget reports.
3. **Can a widget over-report tokens to inflate cost?** Yes, but the
   widget owner is the only one who benefits — the admin dashboard's
   `widget-stats` panel surfaces P95 token counts so abuse stands out.
4. **What about Claude's "service tier" (priority/standard)?** Mapped to
   our `modelTier` (haiku/sonnet/opus). A widget can set
   `modelTier: 'opus'` if it must run urgently and the actor can afford it.
5. **Why $CYCLE not USD?** Same reason Claude uses tokens not dollars —
   per-call pricing is decoupled from regional fiat, supports prepaid +
   metered + comp tiers, and gives the marketplace a clean unit of
   account. Phase 10 adds Stripe + USDC ramps; the ledger never changes
   shape.

## 14. File map

```
server/meter/
├── index.js                  Fastify — charge / refund / recharge / balance / plans
│                             rates / earnings / widget-owner / ledger / audit / health
├── schema.sql                ledger + credits + widget_owners + cache_hits + model_rates
├── Dockerfile                node:20-alpine
└── package.json

shared/
├── meter.js                  charge(payload)  — Claude-style: tokensIn / tokensOut / modelTier / batchSize
├── token.js                  balance · rates · usage · plans · estimate · earnings · recharge · audit
└── auth.js                   adminKey · role · tenantId · API-key gen + verify

widgets/
├── token-balance.js          inline pill, 30s poll
├── token-recharge.js         modal (admin issues, others request)
├── admin-tokens.js           operator workbench
├── admin-audit.js            ledger viewer + chain verifier
├── admin-widget-registry.js  per-widget cost / creator / royalty
└── admin-marketplace.js      listing approvals + creator earnings

apps/admin/
├── index.html                dashboard with sidebar nav (Operations · Token · Identity · Widgets · Storage)
└── manifest.json             preload: ui-primitives + token-balance + admin-overview

docs/
└── TOKEN-ENGINE.md           you are here
```
