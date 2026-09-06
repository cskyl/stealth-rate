#!/usr/bin/env python3
"""Serve the static SPA and a dependency-free local JSONL backend."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from yaml_support import load_yaml


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_STUDY_FILES = {"study.json", "items.json", "blocks.json", "consent.md", "instructions.md", "debrief.md"}


def valid_study(study: str) -> str:
    if not isinstance(study, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", study):
        raise ValueError("invalid study identifier")
    return study


def public_file(path: str) -> Path | None:
    """Resolve only deployable public assets, never the repository/private data."""
    clean = unquote(path).lstrip("/")
    parts = clean.split("/")
    if ".." in parts or "\\" in clean or "\x00" in clean:
        return None
    if clean in {"", "index.html", "frontend/dist/index.html"}:
        base, rel = ROOT / "frontend/dist", "index.html"
    elif clean.startswith("assets/"):
        base, rel = ROOT / "frontend/dist", clean
    elif clean.startswith("frontend/dist/assets/"):
        base, rel = ROOT / "frontend/dist", clean.removeprefix("frontend/dist/")
    elif len(parts) == 3 and parts[0] == "studies" and parts[2] in PUBLIC_STUDY_FILES:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", parts[1]):
            return None
        base, rel = ROOT / "studies" / parts[1], parts[2]
    elif len(parts) >= 3 and parts[0] == "media" and re.fullmatch(r"[A-Za-z0-9_-]+", parts[1]):
        if Path(clean).suffix.lower() not in {".mp4", ".webm", ".wav", ".mp3", ".ogg", ".png", ".jpg", ".jpeg"}:
            return None
        base, rel = ROOT / "media" / parts[1], "/".join(parts[2:])
    else:
        return None
    target = (base / rel).resolve()
    if not base.resolve().is_relative_to(ROOT.resolve()) or not target.is_relative_to(base.resolve()) or not target.is_file():
        return None
    return target


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class LocalStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()

    def path(self, study: str, name: str) -> Path:
        valid_study(study)
        if name not in {"sessions", "responses", "events"}:
            raise ValueError("invalid record type")
        target = self.root / study / f"{name}.jsonl"
        target.parent.mkdir(parents=True, exist_ok=True)
        return target

    def read(self, study: str, name: str) -> list[dict]:
        path = self.path(study, name)
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

    def append(self, study: str, name: str, row: dict) -> None:
        with self.path(study, name).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")

    def assign(self, study: str, pid_hash: str, ua_hash: str = "") -> dict:
        valid_study(study)
        with self.lock:
            study_dir = ROOT / "studies" / study
            blocks = json.loads((study_dir / "blocks.json").read_text(encoding="utf-8"))["blocks"]
            config = load_yaml(study_dir / "study.yaml")
            sessions = self.read(study, "sessions")
            latest = {row["session_id"]: row for row in sessions}
            if any(row.get("pid_hash") == pid_hash and row.get("status") not in {"abandoned", "screened_out"} for row in latest.values()):
                old = next(row for row in latest.values() if row.get("pid_hash") == pid_hash)
                block = next(block for block in blocks if block["block_id"] == old["block_id"])
                return {"ok": True, "session_id": old["session_id"], "block_id": old["block_id"], "items": block["items"], "existing": True}
            max_sessions = int(config.get("design", {}).get("max_sessions", 10000))
            if len(latest) >= max_sessions:
                return {"ok": False, "error": "session cap reached"}
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
            active = [row for row in latest.values() if row.get("status") == "started" and datetime.fromisoformat(row["started_at"].replace("Z", "+00:00")) >= cutoff]
            completed = {block["block_id"]: sum(row.get("block_id") == block["block_id"] and row.get("status") == "completed" for row in latest.values()) for block in blocks}
            assigned = {block["block_id"]: sum(row.get("block_id") == block["block_id"] for row in active) for block in blocks}
            chosen = min(blocks, key=lambda block: (assigned[block["block_id"]] - completed[block["block_id"]], completed[block["block_id"]], block["block_id"]))
            session_id = "s_" + secrets.token_hex(8)
            self.append(study, "sessions", {"schema": "stealthrate.session.v1", "session_id": session_id, "study_id": study, "version": config.get("version", ""), "block_id": chosen["block_id"], "pid_hash": pid_hash, "ua_hash": ua_hash, "started_at": now_iso(), "finished_at": "", "status": "started", "headphone_check": {"correct": 0, "total": 0}, "completion_code": ""})
            return {"ok": True, "session_id": session_id, "block_id": chosen["block_id"], "items": chosen["items"]}

    def response(self, study: str, payload: dict) -> dict:
        with self.lock:
            rows = self.read(study, "responses")
            duplicate = any(row.get("session_id") == payload.get("session_id") and row.get("item_id") == payload.get("item_id") and row.get("task") == payload.get("task") for row in rows)
            if not duplicate:
                self.append(study, "responses", {"schema": "stealthrate.response.v1", **payload, "submitted_at": payload.get("submitted_at", now_iso())})
            return {"ok": True, "duplicate": duplicate}

    def event(self, study: str, payload: dict) -> dict:
        self.append(study, "events", {"schema": "stealthrate.event.v1", **payload, "ts": payload.get("ts", now_iso())})
        return {"ok": True}

    def complete(self, study: str, payload: dict) -> dict:
        with self.lock:
            session_id = payload.get("session_id", "")
            code = hashlib.sha256(f"{study}:{session_id}".encode()).hexdigest()[:8].upper()
            sessions = self.read(study, "sessions")
            old = next((row for row in reversed(sessions) if row.get("session_id") == session_id), {})
            self.append(study, "sessions", {**old, "session_id": session_id, "status": "completed", "finished_at": now_iso(), "completion_code": code})
            return {"ok": True, "completion_code": code}


class Handler(BaseHTTPRequestHandler):
    store: LocalStore

    def _send(self, status: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _payload(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def do_POST(self):
        try:
            payload = self._payload()
            self._dispatch(payload)
        except Exception as exc:
            self._send(400, json.dumps({"ok": False, "error": str(exc)}).encode())

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in {"/api", "/api/"}:
            try:
                query = {key: value[-1] for key, value in parse_qs(parsed.query).items()}
                self._dispatch(query)
            except Exception as exc:
                self._send(400, json.dumps({"ok": False, "error": str(exc)}).encode())
            return
        self._static(parsed.path)

    def _dispatch(self, payload: dict) -> None:
        op, study = payload.get("op", ""), payload.get("study", payload.get("study_id", ""))
        valid_study(study)
        if op == "assign": result = self.store.assign(study, payload.get("pid_hash", ""), payload.get("ua_hash", ""))
        elif op == "event": result = self.store.event(study, payload)
        elif op == "response": result = self.store.response(study, payload)
        elif op == "complete": result = self.store.complete(study, payload)
        else: raise ValueError("unknown op")
        self._send(200, json.dumps(result).encode())

    def _static(self, path: str) -> None:
        target = public_file(path)
        if target is None:
            self._send(404, b"not found", "text/plain")
            return
        content_type = {".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/plain"}.get(target.suffix) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self._send(200, target.read_bytes(), content_type)

    def log_message(self, format, *args):
        return


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study", required=True, help="study slug")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    Handler.store = LocalStore(ROOT / "local")
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"serving {args.study} at http://{args.host}:{args.port}/?study={args.study}", flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
