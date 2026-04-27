# Tutorial 1 — Quickstart (10 minutes)

> Boot the suite, build a simple part in cycleCAD, peek at the admin
> dashboard, run the test agent. Zero prior experience required.

## Step 1 · Clone & boot

```bash
git clone https://github.com/vvlars-cmd/cyclecad-suite.git
cd cyclecad-suite
make serve
```

Open `http://localhost:8765/apps/cyclecad/`. The welcome splash appears.

> **Why static-only?** Fast, no Docker dependency. The meter falls back
> to localStorage. Switch to `make up` later when you want the real
> Postgres ledger.

## Step 2 · Build your first part

1. Click *New Sketch* on the splash.
2. The Sketch tab is active. Press `R` (rectangle).
3. Click two corners in the viewport.
4. Press `Esc` to drop the tool, then `F` to *Finish Sketch*.
5. Press `E` (extrude). The dialog opens.
6. Type `25 mm` → click `OK`.
7. You have a solid block.

The model tree on the left shows `Origin → Sketch1 → Extrude1`. The
status bar at the bottom shows `Widgets loaded: 8` (kernel + extrude).

## Step 3 · Try the AI Copilot

> Skip if you don't have a Claude / Gemini / Groq key handy.

1. *Tools → ✨ AI Copilot*.
2. The dialog asks for an API key. Pick a provider, paste, *Save*.
3. Type *"M8 hex nut"* → *Run*.
4. A real M8 hex nut appears next to your block.

## Step 4 · Open the admin dashboard

1. In the suite bar at the top, click *admin*.
2. The dashboard loads with a friendly warning — admin key not set.
3. Click *Set admin key…* and paste `rk_dev_local`.
4. The dashboard reloads with the *Overview* widget.
5. Click *$CYCLE Token → Audit*.
6. Click *VERIFY CHAIN*. Banner: `✓ chain OK · 2 rows · 0 mismatched`.

You just verified the hash chain of the very transactions you triggered
in step 2 + 3.

## Step 5 · Run the autonomous test agent

1. In the suite bar, click *tests*.
2. The dashboard shows ~115 widget cards, all green (`live`).
3. Click *Tutorial walkthrough* (or open `/tests/tutorial.html`).
4. Click *▶ Run agent (auto)*.
5. Watch the agent walk every widget — about 3 minutes.

When done, the agent reports pass/fail per widget. Anything red is a
candidate for the next full-impl pass.

## Step 6 · Stop everything

```bash
# Static server runs in the foreground, Ctrl+C stops it.
# If you ran `make up`:
make down
```

## What you just used

| Layer | What you saw |
|---|---|
| Kernel | `loader.js` lazy-loaded `extrude.js` on first click |
| Token engine | `meter.js` charged your call, `audit/verify` walked the chain |
| Widget | `widgets/extrude.js` ran inside a modal, emitted `change`, updated the tree |
| App | `apps/cyclecad/index.html` dispatched the menu action via `dispatch('solid-extrude')` |
| Admin | `apps/admin/index.html` mounted `admin-overview`, then `admin-audit` |
| Test | `tests/tutorial.html` posted `spec-result` messages from hidden iframes |

## Next

- [`02-build-a-widget.md`](02-build-a-widget.md) — ship your own block.
- [`03-token-economy.md`](03-token-economy.md) — Claude-style billing under the hood.
- [`04-admin-dashboard.md`](04-admin-dashboard.md) — running the meter as an operator.
