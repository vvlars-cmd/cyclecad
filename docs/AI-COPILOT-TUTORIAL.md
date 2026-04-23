# AI Copilot — hands-on tutorial

Goal: design a **Raspberry Pi 4B enclosure** from scratch using only natural language, in under 2 minutes.

## Prereqs

- cycleCAD v3.10.0 or later (`npm install cyclecad@latest`, or pull from GitHub)
- An API key for one of: Anthropic Claude, Google Gemini, or Groq
- Modern browser with `fetch` support (any recent Chrome/Safari/Firefox)

## Step 1 — Open the copilot

Tools menu → **AI Copilot (multi-step)**. A dialog opens with a model dropdown, a prompt textarea, Generate/Stop buttons, a progress bar, and a live log.

## Step 2 — Set your API key

Click the **🔑** icon next to the model dropdown. A browser prompt asks for your key. Paste it, click OK. The key is stored in `localStorage['cyclecad_api_keys']` — it never leaves your machine.

If you have a Claude key, the model dropdown defaults to **Claude Sonnet 4.6**. If not, it defaults to **Gemini 2.0 Flash (free)**.

## Step 3 — First prompt

Start simple to validate everything works:

```
box 100x50x20 with 3mm fillet
```

Click **⚡ Generate**. You should see:

```
ℹ Planning with Claude Sonnet 4.6...
✓ Got 7-step plan. Executing...
⋯ step 1: sketch.start — Start sketch
✓ step 1 done
⋯ step 2: sketch.rect — Rectangle
✓ step 2 done
⋯ step 3: sketch.end — Finish
✓ step 3 done
⋯ step 4: ops.extrude — Extrude
✓ step 4 done
⋯ step 5: ops.fillet — Fillet edges
✓ step 5 done
⋯ step 6: view.set — Isometric
✓ step 6 done
⋯ step 7: view.fit — Fit
✓ step 7 done
✓ Done — 7/7 succeeded
```

The 3D viewport will show a 100×50×20 box with rounded edges, framed in isometric view.

## Step 4 — The real deal

Clear the prompt and paste:

```
create a Raspberry Pi 4B case. Use board specs: 85×56mm, 1.4mm thick, mounting holes at (3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5) Ø2.7. Add:
- 2mm wall thickness
- 12mm internal height
- USB cutout on the right side
- HDMI cutout next to USB
- Ethernet cutout on the left
- SD card cutout on one short side
- vent slots on top
- 3mm fillet on outer edges
```

Click **⚡ Generate**. This triggers a larger plan — typically 12-18 steps. The log fills in as each step runs. Watch the viewport: the case base appears, then shells into a hollow box, mounting posts rise, port cutouts carve out, vent slots appear, edges round over.

Typical elapsed time: 25-60 seconds (most of it is the LLM thinking; the Agent API calls themselves are instant).

## Step 5 — Handling errors gracefully

Try this deliberately tricky prompt:

```
extrude the current sketch 10mm
```

There's no active sketch — the first call to `ops.extrude` will fail. Watch the log:

```
⋯ step 1: ops.extrude — Extrude sketch
✗ step 1: No active sketch
ℹ Asking for recovery plan (1/2)...
ℹ Inserted 3 recovery steps
⋯ step 2: sketch.start — Start a sketch first
✓ step 2 done
⋯ step 3: sketch.rect — Default rectangle
✓ step 3 done
⋯ step 4: sketch.end — Finish sketch
✓ step 4 done
⋯ step 5: ops.extrude — Now extrude
✓ step 5 done
```

The copilot self-corrected: it inserted the missing sketch steps and resumed.

## Step 6 — Programmatic access

You can kick off a prompt from the browser console:

```js
window.CycleCAD.AICopilot.execute('generate', {
  prompt: 'design a 50mm mounting bracket with 4 M5 holes on 40mm PCD'
});
```

Monitor state:

```js
setInterval(() => {
  const s = window.CycleCAD.AICopilot.getState();
  console.log(`${s.running ? 'running' : 'idle'} — ${s.results} ok / ${s.errors} errs`);
}, 500);
```

Stop mid-run:

```js
window.CycleCAD.AICopilot.abort();
```

## Step 7 — Tune your prompts

| Prompt quality | Example |
|---|---|
| **Weak**: *"make a case"* | Claude guesses dimensions |
| **Better**: *"make a 100×60×25 case with 2mm wall"* | Claude knows the envelope |
| **Best**: *"make a 100×60×25 case. 2mm wall. 4 M3 mounting holes at (5,5), (95,5), (5,55), (95,55). 3mm fillet on outer edges. One USB-C cutout (9×4) on the front face centered horizontally, 10mm up from the base."* | Claude gets it right in one shot |

**Rule of thumb**: mention every dimension you care about. Claude is good at filling gaps with sensible defaults, but precise inputs produce precise parts.

## Step 8 — What's next

- Read `docs/AI-COPILOT.md` for the full feature reference
- Check `docs/API-REFERENCE.md` for the underlying Agent API the copilot drives
- Try composing prompts: generate a base plate → save → regenerate with additional features

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing anthropic key — click 🔑` | Set the key for the selected provider |
| `Claude 401` | Key is invalid or expired. Regenerate at console.anthropic.com |
| `Gemini 429` | Rate-limited on free tier. Wait 60s or switch to Groq |
| Plan executes but nothing appears in viewport | Agent API may not be loaded. Check console for `window.cycleCAD.execute is not available` |
| Model returns prose instead of JSON | Rerun — sometimes models forget the format. The parser tries to be lenient but fails on pure prose. |
| Recovery loop doesn't fire | You're already at the 2-retry limit or the recovery call itself failed. Check log for `Recovery failed: ...` |
