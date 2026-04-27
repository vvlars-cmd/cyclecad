# Tutorial 6 — AI-agent-driven DUO build (REST end-to-end)

> Same outcome as Tutorial 5 — the DUO project on disk turns into a
> complete `.zip` work package — but driven by an AI agent calling
> the cycleCAD Suite REST API. No browser. No human at the keyboard.
> Lights-out. Useful when you want to grind a hundred Inventor
> projects across a dozen tenants without staffing it.

**Estimated time:** 25 minutes (read + smoke run)
**Prerequisites:**

- `make up` is running (`make health` is green; Postgres alive on the
  network the meter can reach).
- The DUO project mounted at `/Users/sachin/cyclecad/cycleCAD-Suite/DUO/`
  (default path — anywhere under `LIBRARY_INGEST_ROOT` works).
- `curl` and `jq` on your shell.
- An Anthropic / OpenAI key on whichever agent runtime you're using
  — Claude Code, Cursor, Cline, your own LangChain harness. The
  REST endpoints are model-agnostic.

If you've not done [`05-reverse-engineer-duo.md`](05-reverse-engineer-duo.md)
yet, skim it first. The shape of the data flow is the same; the
difference is who pushes the buttons.

---

## Why an AI agent

Tutorial 5 is interactive. Every step is "click a thing, watch it
happen". That's great for the first run — you learn the model. It is
not great when you have:

- 12 client tenants with 4-8 projects each.
- An ISO-changes-every-quarter library that needs the BOM regenerated.
- A nightly build that wants the latest snapshots on the support
  portal by 8 AM.
- A reseller who hands you an Inventor project, expects a manufacturer
  bundle 90 minutes later, every time.

For these, you want a one-command pipeline. The Suite ships exactly
that — the REST endpoints listed below were designed with an agent in
mind. Every endpoint is idempotent (or returns 409 Conflict so the
agent can retry / branch), every response is JSON, every long-running
job exposes a `jobId` you can poll.

Pair this with an agent that can call HTTP from a tool, and your
operator workload is "approve the agent's plan once a week and let
it ship".

---

## The five-step plan the agent executes

```
┌──────────┐   ┌─────────────┐   ┌───────────┐   ┌──────────┐   ┌────────┐
│ 1.       │ → │ 2. Reverse  │ → │ 3. Author │ → │ 4. Make  │ → │ 5.     │
│ Import   │   │  engineer   │   │ tutorials │   │ drawings │   │ Bundle │
└──────────┘   └─────────────┘   └───────────┘   └──────────┘   └────────┘
```

The agent advances when each step's response says `ok: true`.

---

## Step 1 — Import

Server-side scripted importer — no file picker, no upload roundtrip.
Walks the host filesystem and inserts everything in one transaction.

```bash
curl -sS -X POST http://localhost:8080/api/library/projects/import-from-path \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: default' \
  -d '{
    "hostPath": "/Users/sachin/cyclecad/cycleCAD-Suite/DUO",
    "projectName": "DUO Anlage"
  }' | jq .
```

Expected response:

```json
{
  "ok": true,
  "projectId": 17,
  "jobId": "imp_2026_04_27_a1b2c3",
  "stats": {
    "total": 473,
    "parts": 394,
    "assemblies": 87,
    "sheetMetal": 12,
    "custom": 234,
    "standard": 79,
    "vendor": 160
  },
  "componentIds": { "...": "...mapping of relpath → DB id" }
}
```

Agent action: stash `projectId` and `componentIds` for later steps.

> **Sandboxing.** The endpoint only accepts paths under
> `LIBRARY_INGEST_ROOT` (defaults to `<repo>/DUO`). Anything else
> returns 400. Set the env var on the meter container if you need
> a different root: `LIBRARY_INGEST_ROOT=/srv/inventor:/srv/duo`.

A `dryRun: true` body returns a preview without inserting — useful
for "what would this do?" prompts.

---

## Step 2 — Reverse-engineer every component

For each component, fetch its details and synthesize a build plan.

```bash
# 2a. List components
curl -sS \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/projects/17/components | jq '.components[] | {id, name, kind}'
```

For each `id`, fetch the synthesized features:

```bash
# 2b. Synthesize feature plan
curl -sS \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/components/42/features | jq .
```

Response shape (the agent reads this and may call back with hints):

```json
{
  "ok": true,
  "componentId": 42,
  "stepPlan": [
    { "step": 1, "kind": "sketch", "plane": "XY",
      "params": { "shape": "rect", "w": 240, "h": 60 },
      "confidence": 0.78 },
    { "step": 2, "kind": "extrude",
      "params": { "distance": 6, "symmetric": true },
      "confidence": 0.71 },
    { "step": 3, "kind": "sketch", "plane": "+Z",
      "params": { "shape": "slot-pattern", "count": 4 },
      "confidence": 0.62 }
  ],
  "bbox": [240, 60, 6],
  "sheetMetal": false
}
```

To refine with a hint, the agent posts the hint back as a `imeta`
patch:

```bash
curl -sS -X PATCH \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/components/42 \
  -d '{ "imeta": { "domainHint": "Structural T-beam carrier, S235JR, 4× M8 mount holes" } }'
```

The next `GET /features` reflects the higher-confidence plan.

---

## Step 3 — Author tutorials

For each component, post a tutorial keyed off its synthesized plan.

```bash
curl -sS -X POST \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/tutorials \
  -d '{
    "componentId": 42,
    "title": "Build TrägerWB2",
    "narrationTier": "sonnet",
    "steps": [
      { "id": "s1", "title": "Base sketch", "narration": "Start with a 240 × 60 rectangle on XY.", "viewport": { "preset": "iso" } },
      { "id": "s2", "title": "Extrude", "narration": "Symmetric 6 mm extrude.", "dependsOn": ["s1"] }
    ]
  }' | jq .
```

Response:

```json
{ "ok": true, "tutorialId": 311, "componentId": 42, "steps": 2, "valid": true }
```

The `valid` flag is the result of `shared/tutorial-schema.js`
validation — agent should refuse to advance until every tutorial in
the batch comes back `valid: true`.

If you want the server to template narration for you, omit the
`narration` field on a step. The endpoint fills it in from
`shared/build-step-templates.js`. (Real LLM narration is on the
roadmap — see *Limitations* in the evening handoff.)

---

## Step 4 — Generate drawings

One drawing per component, one row per view. Today this is two
calls: `POST /drawings` to create the drawing record, then
`POST /drawings/:id/views` for each of front / top / right / iso.

```bash
# 4a. Create the drawing
DRAWING_ID=$(curl -sS -X POST \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/drawings \
  -d '{
    "componentId": 42,
    "sheetSize": "A3",
    "title": "TrägerWB2 — A3 multi-view"
  }' | jq -r .drawingId)

# 4b. Add four views
for view in front top right iso; do
  curl -sS -X POST \
    -H 'content-type: application/json' \
    -H 'x-tenant-id: default' \
    "http://localhost:8080/api/library/drawings/$DRAWING_ID/views" \
    -d "{ \"view\": \"$view\", \"scale\": \"auto\" }"
done
```

The server kicks SVG generation server-side via the same projection
math the GUI uses. Each response includes `svgPath` once rendering
finishes — poll `GET /api/library/drawings/$DRAWING_ID/views` if
the row comes back with `status: pending`.

For 473 components × 4 views the agent should keep concurrency to
≤ 8 in flight; the meter applies the batch discount automatically
when `batchSize >= 10` is detected per-tick.

---

## Step 5 — Build the bundle

> **Roadmap.** Today the bundle is assembled client-side by
> `widgets/export-bundle.js` — the widget pulls down the manifest,
> drawings, and exports and zips them in the browser. The
> server-side `POST /api/library/projects/:id/bundle` endpoint is
> on the roadmap.

For an agent-only flow today, two options:

1. **Headless Chromium**. Drive the browser to
   `http://localhost:8080/apps/cyclecad/` → *Library → Build complete
   work package…* via Playwright or
   `mcp__claude-in-chrome__navigate` and capture the resulting download.
   This is what `scripts/build-duo.sh` does in its `--bundle` mode.
2. **Reassemble manually** from the manifest. The agent already has
   every drawing, every tutorial, every export by the time it gets
   to Step 5. Pull the manifest:

```bash
curl -sS \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/projects/17/manifest > duo-manifest.json
```

Then download every referenced URL and zip them into the same
directory layout the GUI builder produces (see "What's in the .zip"
in [`05-reverse-engineer-duo.md`](05-reverse-engineer-duo.md)).
`scripts/build-duo.sh --reassemble` handles this.

The server-side bundle endpoint, when it lands, will be:

```bash
# (Roadmap — not live yet)
curl -sS -X POST \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/projects/17/bundle \
  -d '{ "include": ["source", "stl", "glb", "drawings", "tutorials", "bom"] }' \
  > duo-workpackage.zip
```

Track progress on issue `#bundle-server-side` in the repo backlog.

---

## Closing the loop — verify

After the agent says "done", verify with the manifest endpoint.

```bash
curl -sS \
  -H 'x-tenant-id: default' \
  http://localhost:8080/api/library/projects/17/manifest \
  | jq '{ project, counts: { components: (.components | length), drawings: (.drawings | length), tutorials: (.tutorials | length) } }'
```

Expected:

```json
{
  "project": { "id": 17, "name": "DUO Anlage", "tenantId": "default" },
  "counts": { "components": 473, "drawings": 1892, "tutorials": 473 }
}
```

Anything short tells you which phase under-delivered. If
`drawings < components × 4`, drawing-batch hit a row that crashed
its renderer — the failed rows are in the `drawing_views` table with
`status = 'failed'`.

Cost of the run is in the ledger:

```bash
curl -sS \
  -H 'x-admin-key: rk_dev_local' \
  'http://localhost:8080/api/meter/ledger?actor=agent&limit=2000' \
  | jq '[.[].cost] | add'
```

Sum should be ≈ 4,800 $CYCLE (per-component reverse-engineer + the
4,730 batch-discounted drawings). If your agent uses a non-default
`actor` header, swap that into the query.

---

## Reference

- [`scripts/build-duo.sh`](../../scripts/build-duo.sh) — a curl-based
  reference implementation of the five steps above. Run it as
  `./scripts/build-duo.sh --tenant default --bundle` end-to-end.
  *(Authored by a parallel agent — file may not exist yet at the
  moment you read this; check `git log scripts/`.)*
- [`scripts/AGENT-RUNBOOK.md`](../../scripts/AGENT-RUNBOOK.md) — the
  AI-agent's instruction manual: prompts, retry policy, sandbox
  boundaries, what to do on failure.
  *(Authored by a parallel agent — same caveat.)*
- [`docs/API-REFERENCE.md`](../API-REFERENCE.md) — every endpoint,
  request and response schema, error codes.
- [`docs/TOKEN-ENGINE.md`](../TOKEN-ENGINE.md) — pricing, batch
  discount math, audit chain.

---

## Lights-out checklist

Before you fire-and-forget on a real production tenant:

- [ ] `make up` boots clean from cold (no leftover state surprises).
- [ ] Postgres backup runs nightly. Test restore.
- [ ] `LIBRARY_INGEST_ROOT` points at the right directory and *only*
      that directory.
- [ ] Agent has a per-tenant API key, not the admin key.
- [ ] Per-tenant balance is funded — see
      [`04-admin-dashboard.md`](04-admin-dashboard.md) Step 3.
- [ ] Webhook (or pollable status endpoint) wired into your
      observability — at minimum, page when a job stays in
      `running` over its expected SLA.
- [ ] `audit/verify` runs at least daily and pages on mismatch (the
      cron in [`04-admin-dashboard.md`](04-admin-dashboard.md) Step 9
      is the template).

Once all of these are green, your agent can run the DUO pipeline (or
any other Inventor project) on a schedule, and you only get paged
when something is genuinely wrong.
