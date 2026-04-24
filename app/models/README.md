# Pentacad Machine Models

Drop `.glb` files here, named by machine id, and the standalone simulator
(`/app/pentacad-sim.html`) will auto-load them instead of the hand-built
Three.js proxy geometry.

## Expected filenames

| File | Machine | Notes |
|------|---------|-------|
| `v2-50.glb` | Pentamachine V2-50 | Flagship, 40k RPM ER20 |
| `v2-10.glb` | Pentamachine V2-10 | Entry, 24k RPM ER11 |
| `v1.glb` | Pentamachine V1 | Legacy |
| `solo.glb` | Pentamachine Solo | New SKU |
| `v2-vise.glb` | V2 workholding vise | Accessory — not auto-loaded |

## Where to get them

The real Pentamachine GLBs live on the machine itself, served by the
Kinetic Control web UI at:

```
http://<machine-ip>/opt/penta-ui-builds/gltf/<variant>.glb
```

Three ways to get them:

### 1. From a connected machine (USB)
Plug the Pentamachine into your Mac via USB. It appears as a
BeagleBone gadget at `192.168.6.2` (macOS) or `192.168.7.2`
(Linux/Windows). Then:

```bash
curl -o v2-50.glb http://192.168.6.2/opt/penta-ui-builds/gltf/v2-50.glb
curl -o v2-10.glb http://192.168.6.2/opt/penta-ui-builds/gltf/v2-10.glb
curl -o v1.glb    http://192.168.6.2/opt/penta-ui-builds/gltf/v1.glb
curl -o solo.glb  http://192.168.6.2/opt/penta-ui-builds/gltf/solo.glb
```

(The `rh-url` input in `pentacad.html` Machine tab has a "Fetch model"
button that does the same thing and caches the blob for that session.
Caching to a real file in this folder requires you to download them
explicitly with `curl` as above.)

### 2. From the Kinetic Control disk image
If you've already extracted the BeagleBone disk image
(`kinetic-control-v5.8.4-20250401-bbb.img`) — e.g. via `debugfs` or
Docker with `debian:bookworm-slim` — the GLBs are at
`/opt/penta-ui-builds/gltf/` inside the mount. Just copy them here.

### 3. From Matt (long shot — see `docs/pentacad/MATT-REQUEST-LIST.md`)
Priority A1 on the ask list is "native GLBs as standalone downloads".
He may or may not be willing to share them publicly since each one
is customer-facing machine-specific 3D IP.

## How the loader finds them

The standalone simulator tries these sources in order:

1. `#glb=<url>` — explicit URL hash override (e.g.
   `/app/pentacad-sim.html#glb=https://example.com/my-machine.glb`)
2. `localStorage['pentacad.sim.glb.<id>']` — previously cached blob URL
3. `./models/<machine-id>.glb` — this folder
4. The hand-built Three.js proxy — last-resort fallback

The proxy is a reasonable approximation of the V2-50's silhouette
(white panel enclosure, grey column, cylindrical spindle, A-tilt
trunnion with B-rotary platter) so the sim still looks correct
without a GLB, but a real GLB will always look better.

## Repo policy

GLBs are **not** checked into git (they're large binary assets
specific to each machine, and Matt hasn't cleared redistribution).
Keep them local. If you want to share a sim setup without the real
GLBs, the proxy renders identically cross-machine so the receiver
will still see something sensible.
