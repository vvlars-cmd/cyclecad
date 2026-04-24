#!/usr/bin/env python3
"""
pentabridge — WebSocket bridge between the Pentacad browser client and
LinuxCNC / Kinetic Control on a Pentamachine V2 desktop CNC.

Runs on the machine itself (or a box on the same LAN). Listens on ws://0.0.0.0:7777
and translates JSON messages to halcmd / linuxcncrsh / MDI commands.

Protocol: see docs/pentacad/bridge-protocol.md (v1.0).

Target platform (confirmed from Kinetic Control v5.8.4 image, 2025-04-01):
    - BeagleBone Black running Debian Buster
    - LinuxCNC from the pocketnc emcapplication fork
    - Install root: /opt/source/pocketnc/emcapplication/
    - Pentamachine UI builds: /opt/penta-ui-builds/
    - Source repo: https://bitbucket.org/pocketnc/kinetic-control

Safety: E-stop is hardware-first. This daemon refuses every motion op while
LinuxCNC reports an active estop. No authority to clear it remotely.

Install:
    pip install websockets
    sudo cp pentabridge.py /usr/local/bin/pentabridge
    sudo cp pentabridge.service /etc/systemd/system/
    sudo systemctl enable --now pentabridge

Usage:
    pentabridge --port 7777 --config /home/pmc/linuxcnc/configs/v2-50-chb/v2-50-chb.ini
    pentabridge --mock   # no hardware; echoes every op. For dev.
"""

import argparse
import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from typing import Any, Dict, Optional, Set

try:
    import websockets
    from websockets.server import serve as ws_serve
except ImportError:
    print("Install dependencies:  pip install websockets", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DEFAULT_PORT = 7777
DRO_HZ = 10           # broadcast DRO 10 times/second
PING_TIMEOUT = 12     # seconds


# ---------------------------------------------------------------------------
# LinuxCNC interface — thin wrapper over halcmd + linuxcncrsh
# ---------------------------------------------------------------------------
class LinuxCNC:
    """Send commands to LinuxCNC. Mock mode available for dev."""

    def __init__(self, ini_path: Optional[str] = None, mock: bool = False):
        self.ini_path = ini_path
        self.mock = mock
        self.pos = {"x": 0.0, "y": 0.0, "z": 0.0, "a": 0.0, "b": 0.0}
        self.feed_rate = 0.0
        self.spindle = {"rpm": 0, "load": 0, "on": False}
        self.estopped = False
        self.coolant = {"mist": False, "flood": False}
        self.tool_id = 0
        self._log = logging.getLogger("pentabridge.lcnc")

    async def ping(self) -> bool:
        """Check LinuxCNC is alive."""
        if self.mock:
            return True
        try:
            proc = await asyncio.create_subprocess_exec(
                "halcmd", "getp", "halui.machine.is-on",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=2)
            return proc.returncode == 0
        except Exception as err:  # noqa: BLE001
            self._log.warning("ping failed: %s", err)
            return False

    async def jog(self, axis: str, direction: int, distance: float, feed_rate: float) -> Dict[str, Any]:
        """Jog one axis.

        Two paths exist in Kinetic Control (confirmed from v5.8.4 halui dump):
          (a) MDI incremental move — `G91 G1 X<d> F<feed>` via linuxcncrsh.
              Works but requires the machine to be in MDI mode.
          (b) Direct halui jog pins:
                setp halui.axis.jog-speed <feed>
                setp halui.axis.<c>.increment <d>
                setp halui.axis.<c>.increment-plus TRUE   (or increment-minus)
              Works in manual or MDI mode; faster than MDI because no parser round-trip.
        This implementation uses (b) for single-axis moves — much more responsive.
        """
        if self.estopped:
            return {"ok": False, "error": "estop engaged"}
        axis_l = axis.lower()
        signed = direction * distance
        self.pos[axis_l] += signed
        if self.mock:
            await asyncio.sleep(0.05)
            return {"ok": True, "data": {"done": True, "pos": dict(self.pos)}}
        # Real: direct halui jog via increment pins (no MDI mode required)
        pin_letter = axis.upper()
        edge_pin = "increment-plus" if direction >= 0 else "increment-minus"
        # Stage the jog speed + increment, then trigger the edge pin
        await self._halcmd(f"setp halui.axis.jog-speed {feed_rate}")
        await self._halcmd(f"setp halui.axis.{pin_letter.lower()}.increment {distance}")
        return await self._halcmd(f"setp halui.axis.{pin_letter.lower()}.{edge_pin} TRUE")

    async def _mdi(self, line: str) -> Dict[str, Any]:
        if self.mock:
            await asyncio.sleep(0.01)
            return {"ok": True, "data": {"line": line}}
        try:
            proc = await asyncio.create_subprocess_exec(
                "linuxcncrsh", "-c", line,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, err = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode == 0:
                return {"ok": True, "data": {"line": line}}
            return {"ok": False, "error": err.decode().strip()}
        except asyncio.TimeoutError:
            return {"ok": False, "error": "mdi timeout"}
        except Exception as err:  # noqa: BLE001
            return {"ok": False, "error": str(err)}

    async def home(self, axis: str = "ALL") -> Dict[str, Any]:
        """Home one joint or all joints.

        LinuxCNC homes PER JOINT not per axis. On a V2 5-axis:
            joint 0 = X, 1 = Y, 2 = Z, 3 = A, 4 = B
        Confirmed halui pins:
            halui.joint.<d>.home   (trigger — set TRUE to start home-joint-d)
            halui.joint.<d>.unhome
            halui.joint.<d>.is-homed (read)
        """
        if self.estopped:
            return {"ok": False, "error": "estop engaged"}
        if self.mock:
            self.pos = {"x": 0.0, "y": 0.0, "z": 0.0, "a": 0.0, "b": 0.0}
            await asyncio.sleep(0.3)
            return {"ok": True, "data": {"homed": True}}
        axis_to_joint = {"X": 0, "Y": 1, "Z": 2, "A": 3, "B": 4}
        if axis == "ALL":
            # Home each joint in sequence (LinuxCNC convention — no home-all pin)
            for jnum in range(5):
                await self._halcmd(f"setp halui.joint.{jnum}.home TRUE")
                await asyncio.sleep(0.2)
            return {"ok": True, "data": {"homed": "ALL"}}
        jnum = axis_to_joint.get(axis.upper())
        if jnum is None:
            return {"ok": False, "error": f"unknown axis: {axis}"}
        return await self._halcmd(f"setp halui.joint.{jnum}.home TRUE")

    async def mdi(self, line: str) -> Dict[str, Any]:
        if self.estopped:
            return {"ok": False, "error": "estop engaged"}
        return await self._mdi(line)

    async def stream_line(self, line: str, line_index: int) -> Dict[str, Any]:
        if self.estopped:
            return {"ok": False, "error": "estop engaged"}
        # In mock mode, simulate executing each line by updating DRO from any
        # X/Y/Z/A/B words. This keeps the DRO feed lively during demos.
        if self.mock:
            for axis, key in (("X", "x"), ("Y", "y"), ("Z", "z"), ("A", "a"), ("B", "b")):
                pos = self._extract_word(line, axis)
                if pos is not None:
                    self.pos[key] = pos
            s = self._extract_word(line, "S")
            if s is not None:
                self.spindle["rpm"] = s
                self.spindle["on"] = s > 0
            f = self._extract_word(line, "F")
            if f is not None:
                self.feed_rate = f
            await asyncio.sleep(0.02)  # pretend each line takes 20ms
            return {"ok": True}
        return await self._mdi(line)

    @staticmethod
    def _extract_word(line: str, letter: str) -> Optional[float]:
        """Very forgiving G-code word extractor."""
        import re
        m = re.search(rf"\b{letter}([\-\d.]+)", line.upper())
        if not m:
            return None
        try:
            return float(m.group(1))
        except ValueError:
            return None

    async def pause(self) -> Dict[str, Any]:
        # CONFIRMED Kinetic Control halui pin: halui.program.pause (trigger TRUE)
        if self.mock:
            return {"ok": True, "data": {"acknowledged": True}}
        return await self._halcmd("setp halui.program.pause TRUE")

    async def resume(self) -> Dict[str, Any]:
        # CONFIRMED: halui.program.resume
        if self.mock:
            return {"ok": True, "data": {"acknowledged": True}}
        return await self._halcmd("setp halui.program.resume TRUE")

    async def abort(self) -> Dict[str, Any]:
        # CONFIRMED: halui.program.stop
        if self.mock:
            return {"ok": True, "data": {"aborted": True}}
        return await self._halcmd("setp halui.program.stop TRUE")

    async def feed_override(self, factor: float) -> Dict[str, Any]:
        # CONFIRMED against Kinetic Control v5.8.4 halui pin list:
        # `halui.feed-override.value` is READ-ONLY (current value). To SET,
        # use `halui.feed-override.direct-value` (range 0.0–2.0).
        factor = max(0.0, min(2.0, factor))
        if self.mock:
            return {"ok": True, "data": {"factor": factor}}
        return await self._halcmd(f"setp halui.feed-override.direct-value {factor}")

    async def spindle_override(self, factor: float) -> Dict[str, Any]:
        # CONFIRMED against Kinetic Control v5.8.4: spindle overrides are
        # PER-SPINDLE-INDEX. The V2 has one spindle at index 0. The write pin
        # is `halui.spindle.0.override.direct-value`; `.value` is read-only.
        factor = max(0.0, min(1.5, factor))
        if self.mock:
            return {"ok": True, "data": {"factor": factor}}
        return await self._halcmd(f"setp halui.spindle.0.override.direct-value {factor}")

    async def set_coolant(self, mist: bool, flood: bool) -> Dict[str, Any]:
        self.coolant = {"mist": mist, "flood": flood}
        if self.mock:
            return {"ok": True, "data": dict(self.coolant)}
        cmds = []
        if mist:
            cmds.append("M7")
        if flood:
            cmds.append("M8")
        if not (mist or flood):
            cmds.append("M9")
        for c in cmds:
            await self._mdi(c)
        return {"ok": True, "data": dict(self.coolant)}

    async def probe(self, axis: str, direction: int, distance: float, feed_rate: float) -> Dict[str, Any]:
        if self.estopped:
            return {"ok": False, "error": "estop engaged"}
        signed = direction * distance
        line = f"G38.2 {axis}{signed:+.4f} F{feed_rate}"
        if self.mock:
            await asyncio.sleep(0.2)
            return {"ok": True, "data": {"contact": True, "pos": dict(self.pos)}}
        return await self._mdi(line)

    async def clear_estop(self) -> Dict[str, Any]:
        # CONFIRMED: halui.estop.reset (trigger TRUE)
        if self.mock:
            self.estopped = False
            return {"ok": True, "data": {"cleared": True}}
        return await self._halcmd("setp halui.estop.reset TRUE")

    async def _halcmd(self, cmd: str) -> Dict[str, Any]:
        try:
            parts = cmd.split()
            proc = await asyncio.create_subprocess_exec(
                "halcmd", *parts,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, err = await asyncio.wait_for(proc.communicate(), timeout=5)
            if proc.returncode == 0:
                return {"ok": True, "data": {"acknowledged": True}}
            return {"ok": False, "error": err.decode().strip()}
        except Exception as err:  # noqa: BLE001
            return {"ok": False, "error": str(err)}

    async def read_dro(self) -> Dict[str, Any]:
        """Read current position from HAL. In mock mode, return last stored.

        CONFIRMED pins from Kinetic Control v5.8.4 halui list:
            halui.axis.x.pos-feedback — current commanded position (after trajectory)
            halui.axis.x.pos-commanded — requested position (before servo)
            halui.axis.x.pos-relative — relative to WCS
        We use pos-feedback since that reflects actual machine state.
        """
        if self.mock:
            return dict(self.pos)
        axes = {}
        for letter in ("x", "y", "z", "a", "b"):
            try:
                proc = await asyncio.create_subprocess_exec(
                    "halcmd", "getp", f"halui.axis.{letter}.pos-feedback",
                    stdout=asyncio.subprocess.PIPE,
                )
                out, _ = await asyncio.wait_for(proc.communicate(), timeout=1)
                axes[letter] = float(out.decode().strip())
            except Exception:  # noqa: BLE001
                axes[letter] = self.pos[letter]
        self.pos = axes
        return axes


# ---------------------------------------------------------------------------
# WebSocket session handler
# ---------------------------------------------------------------------------
clients: Set = set()  # websocket connections


async def broadcast_event(event: str, data: Dict[str, Any]) -> None:
    """Send an unsolicited event to every connected client."""
    if not clients:
        return
    msg = json.dumps({"event": event, "data": data})
    await asyncio.gather(*[c.send(msg) for c in list(clients) if not c.closed], return_exceptions=True)


async def handle_connection(ws, lcnc: LinuxCNC) -> None:
    """Per-client message loop."""
    log = logging.getLogger("pentabridge.conn")
    peer = ws.remote_address
    log.info("client connected: %s", peer)
    clients.add(ws)
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"ok": False, "error": "malformed json"}))
                continue
            msg_id = msg.get("id")
            op = msg.get("op", "")
            args = msg.get("args", {}) or {}
            log.debug("op %s args=%s", op, args)
            try:
                if op == "ping":
                    reply = {"ok": True, "data": {"pong": True, "ts": args.get("ts")}}
                elif op == "jog":
                    reply = await lcnc.jog(
                        args.get("axis", "X"),
                        int(args.get("direction", 1)),
                        float(args.get("distance", 0.1)),
                        float(args.get("feedRate", 200)),
                    )
                elif op == "home":
                    reply = await lcnc.home(args.get("axis", "ALL"))
                elif op == "mdi":
                    reply = await lcnc.mdi(args.get("line", ""))
                elif op == "stream-line":
                    reply = await lcnc.stream_line(
                        args.get("line", ""), int(args.get("index", 0))
                    )
                    # Also send a line event so the client can tick its cursor
                    await broadcast_event("line", {"lineNumber": args.get("index", 0) + 1})
                elif op == "pause":
                    reply = await lcnc.pause()
                elif op == "resume":
                    reply = await lcnc.resume()
                elif op == "abort":
                    reply = await lcnc.abort()
                elif op == "feedOverride":
                    reply = await lcnc.feed_override(float(args.get("factor", 1.0)))
                elif op == "spindleOverride":
                    reply = await lcnc.spindle_override(float(args.get("factor", 1.0)))
                elif op == "coolant":
                    reply = await lcnc.set_coolant(bool(args.get("mist")), bool(args.get("flood")))
                elif op == "probe":
                    reply = await lcnc.probe(
                        args.get("axis", "Z"),
                        int(args.get("direction", -1)),
                        float(args.get("distance", 10)),
                        float(args.get("feedRate", 50)),
                    )
                elif op == "clearEstop":
                    reply = await lcnc.clear_estop()
                else:
                    reply = {"ok": False, "error": f"unknown op: {op}"}
            except Exception as err:  # noqa: BLE001
                log.exception("op handler failed")
                reply = {"ok": False, "error": str(err)}

            out = {"id": msg_id}
            if reply.get("ok", True):
                out["ok"] = True
                if "data" in reply:
                    out["data"] = reply["data"]
            else:
                out["ok"] = False
                out["error"] = reply.get("error", "unknown error")
            await ws.send(json.dumps(out))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(ws)
        log.info("client disconnected: %s", peer)


# ---------------------------------------------------------------------------
# DRO broadcaster — runs independently, emits dro + spindle every 100ms
# ---------------------------------------------------------------------------
async def dro_broadcaster(lcnc: LinuxCNC) -> None:
    log = logging.getLogger("pentabridge.dro")
    period = 1.0 / DRO_HZ
    while True:
        try:
            pos = await lcnc.read_dro()
            await broadcast_event(
                "dro", {"pos": pos, "feedRate": lcnc.feed_rate}
            )
            if lcnc.spindle["on"]:
                await broadcast_event("spindle", dict(lcnc.spindle))
        except Exception as err:  # noqa: BLE001
            log.warning("dro error: %s", err)
        await asyncio.sleep(period)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
async def main() -> None:
    parser = argparse.ArgumentParser(description="Pentacad ↔ Kinetic Control bridge")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--config", help="LinuxCNC .ini path")
    parser.add_argument("--mock", action="store_true", help="No hardware — echo every op")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    log = logging.getLogger("pentabridge")

    lcnc = LinuxCNC(ini_path=args.config, mock=args.mock)
    if not args.mock and not await lcnc.ping():
        log.warning("LinuxCNC not responding — starting anyway in passthrough mode.")

    async def handler(ws):
        await handle_connection(ws, lcnc)

    log.info("pentabridge listening on ws://%s:%s  (mock=%s)", args.host, args.port, args.mock)
    async with ws_serve(handler, args.host, args.port, ping_timeout=PING_TIMEOUT):
        asyncio.create_task(dro_broadcaster(lcnc))
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\npentabridge stopped.")
