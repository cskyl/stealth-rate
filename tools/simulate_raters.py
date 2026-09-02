#!/usr/bin/env python3
"""Drive the local adapter with deterministic synthetic rater behavior."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from serve_local import LocalStore, now_iso


class DirectBackend:
    def __init__(self, study: str):
        self.study = study
        self.store = LocalStore(ROOT / "local")

    def call(self, payload: dict) -> dict:
        op = payload["op"]
        if op == "assign":
            return self.store.assign(self.study, payload["pid_hash"], payload.get("ua_hash", ""))
        if op == "event":
            return self.store.event(self.study, payload)
        if op == "response":
            return self.store.response(self.study, payload)
        if op == "complete":
            return self.store.complete(self.study, payload)
        raise ValueError(f"unknown operation: {op}")


class HttpBackend:
    def __init__(self, base_url: str):
        self.url = base_url.rstrip("/") + "/api"

    def call(self, payload: dict) -> dict:
        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
        if result.get("ok") is False:
            raise RuntimeError(result)
        return result


def run(study: str, n: int, reset: bool = False, base_url: str | None = None) -> None:
    store = DirectBackend(study) if base_url is None else HttpBackend(base_url)
    if reset:
        for path in (ROOT / "local" / study).glob("*.jsonl"):
            path.unlink()
    key = json.loads((ROOT / "studies" / study / "private/key.json").read_text())["items"]
    public = {row["item_id"]: row for row in json.loads((ROOT / "studies" / study / "items.json").read_text())["items"]}
    for rater in range(n):
        assignment = store.call({"op": "assign", "study": study, "pid_hash": f"sim-{rater:04d}", "ua_hash": "simulator"})
        if not assignment.get("ok"): raise RuntimeError(assignment)
        sid = assignment["session_id"]
        for item_id in assignment["items"]:
            meta, item = key[item_id], public[item_id]
            store.call({"op": "event", "study": study, "session_id": sid, "type": "ended", "item_id": item_id, "ts": now_iso(), "payload": {"simulated": True}})
            if meta["role_kind"] == "practice": continue
            if meta["role_kind"] == "attention":
                choice = item["options"][2]; edited = "no"
            elif meta["role_kind"] == "anchor":
                choice = meta["gold"]; edited = meta["expected"]
            else:
                choice = meta["gold"]
                edited = "no" if meta["cond_id"] == "clean" else "yes"
            common = {"session_id": sid, "item_id": item_id, "rt_ms": 1200 + rater, "replay_count": 0, "submitted_at": now_iso()}
            store.call({"op": "response", "study": study, **common, "task": "mcq", "answers": {"choice": choice, "confidence": 3}})
            store.call({"op": "response", "study": study, **common, "task": "edit", "answers": {"edited": edited, "conspicuousness": 3 if edited == "no" else 4, "naturalness": 4 if edited == "no" else 3, "confidence": 3}})
        store.call({"op": "complete", "study": study, "session_id": sid})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study", required=True)
    parser.add_argument("--n", type=int, default=12)
    parser.add_argument("--backend", choices=["local"], default="local", help="direct JSONL store (default fallback)")
    parser.add_argument("--base-url", help="serve_local origin, e.g. http://127.0.0.1:8765; uses HTTP ops")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    run(args.study, args.n, args.reset, args.base_url)
    print(f"SIMULATE_RATERS_OK path={'http' if args.base_url else 'direct'} raters={args.n}")
    return 0


if __name__ == "__main__": raise SystemExit(main())
