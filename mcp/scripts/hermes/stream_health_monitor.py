"""Stream health watcher for Hermes.

Two modes:

  stream_health_monitor.py
      Prints ONE stable line (HEALTHY / DEGRADED: <cause> / OFFLINE ...) and exits. For a Hermes
      cron monitor script, which wakes the agent only when the line changes.

  stream_health_monitor.py --until-degraded
      Watches quietly and exits only when something needs attention, printing what it saw with
      the numbers. Started by the agent as a background process with notify-on-exit, so the
      agent wakes up in the chat the moment the stream degrades and decides what to do.

Health is measured over a few seconds from Streamlabs' raw frame counters (not the
since-go-live percentages), via its local JSON-RPC API on 127.0.0.1:28194. Standard library only.
"""

import json
import socket
import sys
import time

HOST, PORT = "127.0.0.1", 28194
WINDOW_S = 6
DEGRADED_PCT = 2.0
# --until-degraded: consecutive bad windows before waking the agent (one blip is not a problem).
CONFIRM_WINDOWS = 2


class Api:
    def __init__(self):
        self.sock = socket.create_connection((HOST, PORT), timeout=5)
        self.buf = b""
        self.next_id = 1

    def call(self, resource, method, args=None):
        rid = str(self.next_id)
        self.next_id += 1
        msg = {"jsonrpc": "2.0", "id": rid, "method": method, "params": {"resource": resource, "args": args or []}}
        self.sock.sendall((json.dumps(msg) + "\n").encode())
        deadline = time.time() + 5
        while time.time() < deadline:
            while b"\n" in self.buf:
                line, self.buf = self.buf.split(b"\n", 1)
                try:
                    reply = json.loads(line)
                except ValueError:
                    continue
                if reply.get("id") == rid:
                    if "error" in reply:
                        raise RuntimeError(reply["error"])
                    return reply.get("result")
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("connection closed")
            self.buf += chunk
        raise RuntimeError("timeout")


def pct(n, d):
    return round(100.0 * n / d, 1) if d > 0 else 0.0


def is_live(api):
    status = (api.call("StreamingService", "state") or {}).get("streamingStatus")
    return status in ("live", "reconnecting")


def bitrate(api):
    try:
        return ((api.call("OutputSettingsService", "getSettings") or {}).get("streaming") or {}).get("bitrate")
    except Exception:
        return None


def measure(api):
    """One window: (cause or None, details dict)."""
    a = api.call("PerformanceService", "state")
    time.sleep(WINDOW_S)
    b = api.call("PerformanceService", "state")

    encoded = b["numberEncodedFrames"] - a["numberEncodedFrames"]
    dropped = max(0, b["numberDroppedFrames"] - a["numberDroppedFrames"])
    skipped = max(0, b["numberSkippedFrames"] - a["numberSkippedFrames"])
    rendered = b["numberRenderedFrames"] - a["numberRenderedFrames"]
    lagged = max(0, b["numberLaggedFrames"] - a["numberLaggedFrames"])
    bw = [v for v in (a.get("streamingBandwidth"), b.get("streamingBandwidth")) if isinstance(v, (int, float)) and v > 0]

    d = {
        "dropped": pct(dropped, encoded + dropped),
        "skipped": pct(skipped, encoded + skipped),
        "lagged": pct(lagged, rendered + lagged),
        "upload": round(sum(bw) / len(bw)) if bw else None,
        "cpu": round(b.get("CPU") or 0, 1),
    }
    if d["dropped"] > DEGRADED_PCT:
        return "network", d
    if d["skipped"] > DEGRADED_PCT:
        return "encoder", d
    if d["lagged"] > DEGRADED_PCT:
        return "rendering", d
    return None, d


def describe(cause, d, kbps):
    if cause == "network":
        return (
            f"STREAM DEGRADED (network): dropping {d['dropped']}% of frames over the last {WINDOW_S} s. "
            f"The connection is carrying about {d['upload'] or '?'} kbps but the video bitrate is "
            f"{kbps or '?'} kbps, so frames are dropped before they can be sent."
        )
    if cause == "encoder":
        return (
            f"STREAM DEGRADED (encoder): skipping {d['skipped']}% of frames over the last {WINDOW_S} s. "
            f"The encoder is overloaded (CPU {d['cpu']}%)."
        )
    return f"STREAM DEGRADED (rendering): {d['lagged']}% of frames rendered late over the last {WINDOW_S} s."


def once():
    try:
        api = Api()
    except OSError:
        print("STREAMLABS NOT RUNNING")
        return
    if not is_live(api):
        print("OFFLINE")
        return
    cause, _ = measure(api)
    print({
        None: "HEALTHY",
        "network": "DEGRADED: network - the stream is dropping frames because the connection cannot keep up",
        "encoder": "DEGRADED: encoder - the encoder is overloaded and skipping frames",
        "rendering": "DEGRADED: rendering - frames are rendering late",
    }[cause])


def until_degraded():
    api = None
    bad = 0
    failures = 0
    while True:
        try:
            if api is None:
                api = Api()
            if not is_live(api):
                print("STREAM ENDED: the stream is no longer live, so the watcher stopped.")
                return
            cause, d = measure(api)
            failures = 0
            bad = bad + 1 if cause else 0
            if bad >= CONFIRM_WINDOWS:
                print(describe(cause, d, bitrate(api)))
                return
        except OSError:
            api = None
            failures += 1
        except Exception:
            api = None
            failures += 1
        if failures >= 5:
            print("WATCHER STOPPED: cannot reach Streamlabs (is it still running?).")
            return
        if failures:
            time.sleep(2)


if __name__ == "__main__":
    if "--until-degraded" in sys.argv:
        until_degraded()
    else:
        try:
            once()
        except Exception:  # stable text: an error state, not a traceback
            print("HEALTH CHECK FAILED")
