# Pentamachine GLB Inventory

> All 5 Pentamachine variants + accessories. Extracted from
> `kinetic-control-v5.8.4-20250401-bbb.img` (`/usr/opt/penta-ui-builds/gltf/`).
> Same files served by Penta themselves at `https://sim.pentamachine.com/gltf/`.
> Committed to this repo as of v0.21 — public on `cyclecad.com`.

| File | Size | Machine | Spindle | Travel (XYZ in) | Default? |
|------|------|---------|---------|-----------------|----------|
| `v1.glb` | 4.5 MB | Pentamachine V1 (legacy) | 24k ER11 | ±3 / ±2 / ±1.5 | — |
| `v1kickstarter.glb` | 3.0 MB | Pentamachine V1 Kickstarter | 24k ER11 | ±3 / ±2 / ±1.5 | — |
| `v2-10.glb` | 2.9 MB | Pentamachine V2-10 | 24k ER11 | ±3.25 / ±2.25 / ±1.75 | ✅ default |
| `v2-50.glb` | 2.2 MB | Pentamachine V2-50 (flagship) | 40k ER20 | ±5 / ±3.5 / ±2.5 | — |
| `solo.glb` | 7.9 MB | Pentamachine Solo | 30k ER16 | ±4 / ±3 / ±2 | — |
| `v2-vise.glb` | 13 MB | V2 workholding vise (accessory, not a machine) | — | — | optional overlay |
| `viewCube.glb` | 40 KB | Chamfered orientation cube widget | — | — | top-right widget |

## Mesh inventory (per-machine)

All 5 machine GLBs share this 15-mesh layout:

```
Base_1, Base_2          — machine base plate
x_1, x_2                — X-axis carriage rails
y                       — Y-axis stage
z                       — Z-axis spindle carriage
a                       — A-tilt trunnion
b                       — B-rotary platter
SHORT, LONG             — two tool holders authored at right angles
                          (Penta shows ONLY the selected one — see SHORT/LONG
                          radio in Show Options panel; default = LONG)
collet, collet001       — collet nuts (collet for LONG, collet001 for SHORT)
buttons                 — pendant buttons (mostly hidden)
cycle_start_led         — green cycle-start LED (red ring)
estop_led               — yellow E-stop LED
```

### Critical for kinematics

- **`a`** rotates around X for A-axis tilt
- **`b`** rotates around Y for B-rotary spin
- **`z`** translates along Y for spindle vertical motion
- **`x_1`, `x_2`** translate along X
- **`y`** translates along Z (depth axis)

The Penta GLB has `a` and `b` as flat siblings, NOT nested. Reparenting `b`
under `a` via `attach()` rotates the GLB into a wrong local frame and
produces the "perpendicular tool holder" bug. Don't reparent — rotate
each independently.

## Where the files live

### Local (this repo, committed)
```
~/cyclecad/app/models/
├── v1.glb
├── v1kickstarter.glb
├── v2-10.glb
├── v2-50.glb
├── solo.glb
├── v2-vise.glb
└── viewCube.glb
```

### Live (GitHub Pages)
```
https://cyclecad.com/app/models/v1.glb
https://cyclecad.com/app/models/v1kickstarter.glb
https://cyclecad.com/app/models/v2-10.glb
https://cyclecad.com/app/models/v2-50.glb
https://cyclecad.com/app/models/solo.glb
https://cyclecad.com/app/models/v2-vise.glb
https://cyclecad.com/app/models/viewCube.glb
```

### Penta's own CDN (CORS-restricted)
```
https://sim.pentamachine.com/gltf/v1.glb
https://sim.pentamachine.com/gltf/v1kickstarter.glb
https://sim.pentamachine.com/gltf/v2-10.glb
https://sim.pentamachine.com/gltf/v2-50.glb
https://sim.pentamachine.com/gltf/solo.glb
https://sim.pentamachine.com/gltf/viewCube.glb
```
Penta's CDN blocks `cyclecad.com` origin — that's why we self-host.

### How to re-extract (if ever needed)
```bash
mkdir -p ~/cyclecad/app/models && docker run --rm --privileged \
  -v "$HOME/Downloads:/in:ro" \
  -v "$HOME/cyclecad/app/models:/out" \
  debian:bookworm-slim bash -c '
    set -e
    apt-get -qq update >/dev/null
    apt-get -qq install -y e2fsprogs util-linux >/dev/null
    dd if=/in/kinetic-control-v5.8.4-20250401-bbb.img \
       of=/tmp/rootfs.ext4 bs=512 skip=8192 status=none
    mkdir -p /mnt/r && mount -o loop,ro /tmp/rootfs.ext4 /mnt/r
    find /mnt/r -type f \( -iname "*.glb" -o -iname "*.gltf" \) -exec cp {} /out/ \;
    umount /mnt/r
  '
```

## Loading order in pentacad-sim.html

```js
function resolveMachineGlbCandidates(m) {
  if (location.hash) {
    const hp = new URLSearchParams(location.hash.slice(1));
    if (hp.get('glb')) return [hp.get('glb')];
  }
  const cached = localStorage.getItem('pentacad.sim.glb.' + m.id);
  const list = [];
  if (cached) list.push(cached);
  list.push(`./models/${m.id}.glb`);                        // self-hosted
  list.push(`https://sim.pentamachine.com/gltf/${m.id}.glb`); // CDN fallback
  return list;
}
```

1. URL hash override (`#glb=...`)
2. localStorage blob URL cache
3. Self-hosted local GLB
4. Penta CDN (CORS-fail on production, but works on localhost)

## License / IP note

These are 3D models extracted from Pentamachine's open distribution
(BeagleBone Black disk image shipped with each machine). They contain
geometry only — no firmware, no proprietary code. Treat as machine-spec
documentation. Matt at Pentamachine has not formally cleared
redistribution; we self-host because Penta's own CDN blocks our origin.
If asked, remove and switch to CDN-only with localhost-dev workaround.
