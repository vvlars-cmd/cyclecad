# Pentacad — Pre-flight Checklist

> For the first real hardware test with a Pentamachine V2-50 (or V2-10 / V1 / Solo).
> Complete each section in order. Stop if any step fails — do not move on.
> Expected total time: **30–45 minutes** end to end.

---

## 0. Before the machine arrives

### 0.1 Build is pushed
- [ ] `cyclecad@3.14.x` live on npm
- [ ] `cyclecad.com/app/pentacad.html` loads and shows the machine picker
- [ ] `cyclecad.com/app/pentacad-sim.html` loads and plays the default example

### 0.2 Local serve is ready
Rockhopper's CORS origin regex hardcodes `*.pocketnc.com`. Pentacad served from `cyclecad.com` will be rejected. The simplest workaround is to serve Pentacad from `localhost`:

```bash
cd ~/cyclecad
python3 -m http.server 8000
# open http://localhost:8000/app/pentacad.html
```

- [ ] `http://localhost:8000/app/pentacad.html` renders
- [ ] Machine picker shows V1 / V2-10 / V2-50 / Solo

### 0.3 Simulator smoke test
- [ ] Run all 7 example programs at 10× speed. Each one completes without the simulator freezing or throwing.
- [ ] Load the "Soft-limit test" example — Limits tab goes red as expected.

### 0.4 Test suite green
- [ ] Open `http://localhost:8000/app/tests/pentacad-all-tests.html`. All modules green (or at worst, "skip" for not-yet-implemented methods). No red failures.

---

## 1. Unboxing and power-up

### 1.1 Physical inspection
- [ ] No shipping damage visible on the enclosure or any exterior component
- [ ] E-stop button moves freely; no obstruction
- [ ] Spindle rotates by hand without binding
- [ ] A-trunnion tilts freely through its range
- [ ] B-rotary table spins smoothly with no axial play

### 1.2 Power on
- [ ] Plug into a properly grounded 120 V (NA) or 230 V (EU) outlet
- [ ] Flip the rear main switch — fans spin up, power LED on
- [ ] Front-panel LCD shows boot sequence (or Kinetic Control splash)
- [ ] Ethernet / USB gadget link indicators light up

### 1.3 Don't home yet
Do not press any motion buttons. Homing will be done from Pentacad once we've confirmed the connection. Homing from the front pendant skips the soft-limit check we want to verify.

---

## 2. Network connection

### 2.1 Connect USB cable
- [ ] USB-A (from BeagleBone Black) → USB-C on your Mac (adapter if needed)
- [ ] Wait 10 seconds for the USB gadget driver to enumerate

### 2.2 Determine subnet
macOS, Windows, and Linux each assign a different subnet to the USB gadget. Try in order:

- [ ] On Mac: `ping 192.168.6.2` — expect response within 2 seconds
- [ ] If no response on Mac, try `192.168.7.2` (Linux/Windows subnet)
- [ ] If neither, scan: `nmap -sn 192.168.0.0/16 | grep "scan report"` and look for `.2` addresses

**Record the machine's IP below:**

```
Machine IP: __________________
```

### 2.3 Verify Rockhopper is up
```bash
curl -s http://<machine-ip>:8000/ | head -5
```
- [ ] Returns HTML (Rockhopper serves a simple landing page)

### 2.4 Verify WebSocket port
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGVzdA==" \
  -H "Sec-WebSocket-Protocol: linuxcnc" \
  http://<machine-ip>:8000/websocket/ 2>&1 | head -8
```
- [ ] Returns `HTTP/1.1 101 Switching Protocols`

If any of 2.2–2.4 fails, don't proceed. Troubleshoot network first (see HELP.md → "WebSocket closed").

---

## 3. Pentacad connection

### 3.1 Open Pentacad from localhost
- [ ] `http://localhost:8000/app/pentacad.html` open in Chrome or Safari

### 3.2 Machine tab
- [ ] Pick V2-50 (or your variant) in the machine picker
- [ ] Machine name + envelope appear in the status bar

### 3.3 Rockhopper connection form
- [ ] URL field: `ws://<machine-ip>:8000/websocket/` (subprotocol is auto)
- [ ] User: `default`
- [ ] Password: `default`
- [ ] Click **Connect**

### 3.4 Expected outcome
- [ ] Status dot turns green within 2 seconds
- [ ] Status text: "Connected — idle"
- [ ] DRO panel begins updating (all axes still at 0 until home)
- [ ] No red error banners

If it fails:
- **Login failure** — someone changed default credentials. Check with the machine owner.
- **WebSocket close 1006** — CORS. Confirm you opened Pentacad from `localhost`, not from `cyclecad.com`.
- **Timeout** — machine IP changed. Re-verify from §2.

---

## 4. Fetch the machine's GLB

Each Pentamachine has a 3D model in `/opt/penta-ui-builds/gltf/<variant>.glb`. Pentacad can fetch it over HTTP and use it as the viewport visual.

- [ ] Machine tab → **Fetch machine GLB** button
- [ ] Status shows "Loading ~14 MB…" then "✓ Loaded"
- [ ] 3D viewport switches from the simplified proxy to the real V2-50 model
- [ ] Rotate the camera — machine detail is visible (column, spindle, trunnion, table)

If GLB fetch fails (404, timeout):
- Record the error. This is not blocking — the proxy model works. Note it in the Matt request list.
- Continue with the simplified proxy.

---

## 5. Home all axes

### 5.1 Before homing
- [ ] Nothing mounted on the rotary table (no stock, no vise, no fixture)
- [ ] No tool in the spindle
- [ ] Z-axis is not already at the top (some machines fail to home from upper limit)

### 5.2 Home
- [ ] Production tab → **Home All** button (or Machine tab → Home)
- [ ] Sequence: Z homes first (up), then X, Y, A, B
- [ ] Total time: 30–60 seconds
- [ ] Status dot stays green throughout

### 5.3 Verify
- [ ] DRO shows X=0 Y=0 Z=<home position, usually positive> A=0 B=0
- [ ] Production tab status: "Homed — idle"

---

## 6. Jog test

### 6.1 Machine tab → Jog pad
- [ ] Click +X — machine moves +0.1 in (visible on DRO, audible in axis)
- [ ] Click -X — machine returns to 0
- [ ] Repeat for Y, Z, A, B (B will look like nothing visually but DRO changes)

### 6.2 Jog feed-rate slider
- [ ] Move to 25 % — jog is slower and audibly quieter
- [ ] Move to 100 % — jog is full speed
- [ ] Verify commands use `halui.axis.jog-speed` (not G91 G1) by watching the Rockhopper debug console if enabled

### 6.3 Incremental jog
- [ ] Set increment to 0.001 in
- [ ] Click +X once — DRO advances by exactly 0.001 in (not 0.0009 or 0.0011)

---

## 7. First program — air-cut

### 7.1 Load the face-mill example
- [ ] Simulate tab → Examples → Face-mill
- [ ] Program loads, 35 lines
- [ ] Limits tab all green
- [ ] Stats: ~18 moves, ~0.4 min estimated

### 7.2 Set air-cut Z offset
To verify motion without actually cutting, shift Z by +0.5 in so the tool stays above the stock:

- [ ] In the G-code editor, find `Z-0.02` lines
- [ ] Use Find/Replace: `Z-0.02` → `Z0.48` (the +0.5 offset)
- [ ] Re-check Limits tab — still green (Z max is 2.5, 0.48 is fine)

### 7.3 Post and run
- [ ] Production tab → Post / upload program
- [ ] Status dot turns green-pulse (streaming)
- [ ] Click **CYCLE / START**

### 7.4 Watch
Stay near the e-stop. Watch:
- [ ] No tool actually contacts anything (it's 0.48 in above the stock surface — there's no stock anyway)
- [ ] DRO moves through all commanded positions
- [ ] Spindle spins at 15 000 RPM (listen — should sound smooth, no vibration)
- [ ] Motion ends with spindle off and Z at safe height
- [ ] Total time matches the simulator estimate within ±10 %

If anything looks wrong — hand on e-stop, hit it. Check the Issues tab for warnings.

---

## 8. FEED HOLD and abort test

Before you trust the machine with a real cut, verify you can stop it reliably.

### 8.1 Start a long-running program
- [ ] Load the "Bottle-opener ring" example (~8 min)
- [ ] Post and run as in §7

### 8.2 Feed hold test
- [ ] 30 seconds in, click **FEED HOLD** in the Production tab
- [ ] Motion stops within 1 second; spindle keeps spinning
- [ ] DRO stops updating
- [ ] Click FEED HOLD again — motion resumes

### 8.3 Feed override test
- [ ] Drag feed-rate slider to 50 % — motion slows to half
- [ ] Slider to 200 % — motion at max feed
- [ ] Back to 100 % — normal
- [ ] Verify: these send `halui.feed-override.direct-value` (NOT `.value`)

### 8.4 Abort test
- [ ] Click **ABORT** (or press e-stop on the front panel)
- [ ] Motion stops within 0.2 seconds
- [ ] Spindle spins down over ~3 seconds
- [ ] Status dot turns red
- [ ] Program state: "aborted"
- [ ] Click **RESET** (amber button) to clear
- [ ] Status returns to green/idle

---

## 9. Post-flight

### 9.1 Record results
In the repo:

```bash
touch docs/pentacad/first-flight-<date>.md
```

Fill in:
- Machine serial / variant
- Date + time of test
- Which checks passed (this checklist)
- Measured values: ping latency to Rockhopper, GLB fetch size + time, first-program run time vs. estimate
- Any deviations: commands that didn't behave as expected, pins that didn't exist, missing fields in machine definitions

### 9.2 Update machine JSON
If anything measured differs from the estimates in `machines/<id>/kinematics.json` (envelope, rapid rate, spindle max):

- [ ] Edit the JSON
- [ ] Set `_confirmed: true` for each now-validated value
- [ ] Commit with message `machines: confirm <id> specs from first hardware test`

### 9.3 Git push
```bash
rm -f ~/cyclecad/.git/HEAD.lock ~/cyclecad/.git/index.lock && \
cd ~/cyclecad && \
git add docs/pentacad/first-flight-<date>.md machines/ && \
git commit -m "First hardware test: V2-50 confirmed" && \
git push origin main
```

---

## Emergency procedures

### Tool crash
- **Don't panic.** Hit e-stop.
- Raise Z manually (power on, release e-stop, jog +Z slowly at 10 % feed)
- Inspect tool — broken or bent tool = reject, don't try to reuse
- Inspect spindle for deflection (use a dial indicator on the spindle nose if you have one)
- If spindle is OK: continue. If not OK: stop work, inspect further with Matt.

### Soft-limit violation at runtime
- Rockhopper rejects the over-travel motion with an error
- Status dot turns red
- RESET clears the error
- **Fix the CAM**, not the soft limit. Reducing the soft limit risks the machine.

### Spindle stall
- RPM drops to 0 mid-cut; Rockhopper raises spindle_fault
- Feed hold engages automatically
- Raise Z manually, back out the tool
- Usually caused by: depth too aggressive, stepdown too large, tool dull, material harder than expected

### Loss of network mid-run
- Rockhopper has a watchdog that stops motion if the control connection dies
- DRO freezes; spindle keeps spinning until Rockhopper auto-aborts (~1 sec)
- Re-establish WS connection, then RESET
- The program does NOT auto-resume — you must restart it manually (Rockhopper has no checkpoint / resume mid-program)

### Rockhopper won't start
```bash
ssh root@<machine-ip>
sudo systemctl status rockhopper
# if dead:
sudo systemctl restart rockhopper
# if still dead:
sudo journalctl -u rockhopper --since "10 min ago"
```
Common causes: config file changed, port 8000 taken by something else, LinuxCNC backend crashed.

---

## When everything works

Congratulations — you've validated Pentacad against real hardware. Time to:

- [ ] Run a real part (try Tutorial 06 — bottle-opener ring — with stock loaded)
- [ ] Post to LinkedIn: "Just ran my first Pentacad-generated toolpath on a Pentamachine V2-50."
- [ ] Tag this release `v3.15.0` and bump the VERSION in `pentacad.js` to `1.1.0`
- [ ] Update this checklist with lessons learned (what was missing, what was unclear) → PR to GitHub
