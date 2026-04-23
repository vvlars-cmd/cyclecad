# AI Copilot — multi-step CAD generation from natural language

> *"create a Raspberry Pi 4B case with port cutouts and 3mm fillet"* → Claude writes a 14-step plan → cycleCAD executes it live in the viewport.

AI Copilot is cycleCAD's answer to Onshape's Adam AI Tools. It lets you describe a mechanical part in plain English; the LLM plans a sequence of Agent API calls; each call executes against the live 3D scene; on step failure, the LLM is asked for a recovery plan (up to 2 retries).

## Quick start

1. **Tools menu → AI Copilot (multi-step)** (or `Ctrl+Shift+A` if bound)
2. Click **🔑** and paste a provider key — Anthropic Claude, Google Gemini (free tier), or Groq (free tier)
3. Pick a model in the dropdown (Claude Sonnet 4.6 is the default when you have an Anthropic key)
4. Type a prompt in the textarea
5. Click **⚡ Generate** — you'll see the plan arrive, then each step execute live

### Try these prompts

| Prompt | What Claude builds |
|---|---|
| `box 100x50x20 with 3mm fillet` | Simple box, extrude, fillet, iso view |
| `create a Raspberry Pi 4B case with port cutouts` | Case base → shell → 4 mounting posts → USB/HDMI/Ethernet cutouts → vent slots → fillet |
| `design a 50mm mounting bracket with 4 holes on 40mm PCD` | Circular sketch → extrude → pattern-hole at PCD |
| `M10 hex nut, 8mm thick, with chamfered edges` | Hex sketch → extrude → through-hole M10 → chamfer both faces |
| `L-bracket 100×60×5mm with 4 M5 mounting holes` | L-profile sketch → extrude → 4 holes |

## Models supported

| Model | Provider | Best for | Cost |
|---|---|---|---|
| **Claude Sonnet 4.6** | Anthropic | Balanced — the default | Paid |
| Claude Haiku 4.5 | Anthropic | Fastest, cheap | Paid |
| Claude Opus 4.6 | Anthropic | Highest quality for hard designs | Paid (higher) |
| Gemini 2.0 Flash | Google | Free tier available | Free |
| Groq Llama 3.1 70B | Groq | Fast + free | Free |

Get Anthropic key at [console.anthropic.com](https://console.anthropic.com), Gemini at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), Groq at [console.groq.com/keys](https://console.groq.com/keys). Keys are stored locally in `localStorage['cyclecad_api_keys']` — never sent to our servers.

## What the copilot can do

The LLM is primed with the full Agent API surface:

| Namespace | Commands |
|---|---|
| `sketch.*` | `start`, `line`, `circle`, `rect`, `end` |
| `ops.*` | `extrude`, `revolve`, `fillet`, `chamfer`, `shell`, `hole`, `pattern` |
| `view.*` | `set` (isometric/top/front/etc.), `fit` |
| `query.*` | `features`, `bbox` |
| `validate.*` | `cost`, `mass` |

It also knows real board specifications:
- **Raspberry Pi 4B**: 85 × 56 × 1.4 mm, mounting holes at `(3.5,3.5), (61.5,3.5), (3.5,52.5), (61.5,52.5)`, Ø2.7
- **Arduino Uno**: 68.6 × 53.4 × 1.6 mm
- **Arduino Nano**: 45 × 18 mm

## Error recovery

When a step fails (e.g., `ops.extrude` called without an active sketch), the copilot:

1. Logs `✗ step N: <method>: <error>`
2. Sends back to LLM: failed step + error + remaining steps + original goal
3. LLM returns a replacement sequence that recovers and continues
4. Logs `ℹ Inserted N recovery steps`

You get two recovery attempts per prompt. After that the run stops and you see a warning.

## Module API

```js
window.CycleCAD.AICopilot = {
  init:        () => true,
  getUI:       () => HTMLElement,               // the sidebar panel
  execute:     (cmd, params) => ...,             // programmatic: "generate" or "stop"
  go:          () => Promise<void>,              // run the current prompt
  abort:       () => void,                       // stop mid-run
  getState:    () => ({ running, stepIndex, results, errors })
}
```

To run a prompt programmatically:
```js
window.CycleCAD.AICopilot.execute('generate', { prompt: 'create a 50mm cube with 3mm fillet' });
```

## Keyboard shortcuts (in the panel)

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Enter` | Generate (same as ⚡ button) |
| `⏹ Stop` button | Abort mid-run |

## Known limitations

- **LLM accuracy**: complex geometry (sweeps, lofts, assemblies) sometimes confuses the planner. Try breaking into simpler prompts and chaining results.
- **Units**: always millimeters. Saying "make a 2 inch cylinder" gets parsed as 2 mm. Convert before prompting.
- **No undo of plan**: once executed, the model is built. Undo individual steps with Ctrl+Z if the feature tree supports it; otherwise start fresh.
- **API cost**: an enclosure plan uses ~1000-2000 input tokens + ~2000-3000 output tokens. On Sonnet 4.6 that's a few cents per design; on Gemini free tier it's $0.

## Inspired by

[Adam AI Tools for Onshape](https://www.adam.new) — their FeatureScript-generating copilot is the inspiration for this module. cycleCAD's version runs natively against the Three.js viewport and works against any of Claude / Gemini / Groq.
