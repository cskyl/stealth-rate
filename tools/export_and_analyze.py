#!/usr/bin/env python3
"""Normalize local, payload, or CSV backend data and run the offline analysis."""

from __future__ import annotations

import argparse
import base64
import csv
import gzip
import io
import json
import shutil
import zlib
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from analyze_human_scores import analyze
from yaml_support import sha256_file


def jsonl_write(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


MAX_PAYLOAD_BYTES = 32 * 1024 * 1024


def _bounded_gzip(raw: bytes) -> bytes:
    decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
    out = decoder.decompress(raw, MAX_PAYLOAD_BYTES + 1)
    if len(out) > MAX_PAYLOAD_BYTES or decoder.unconsumed_tail or not decoder.eof or decoder.unused_data:
        raise ValueError("payload gzip exceeds 32 MiB limit")
    out += decoder.flush()
    if len(out) > MAX_PAYLOAD_BYTES:
        raise ValueError("payload gzip exceeds 32 MiB limit")
    return out


def _decode_payload(path: Path) -> dict | None:
    raw = path.read_bytes()
    candidates = [raw]
    if raw[:2] != b"\x1f\x8b":
        compact = b"".join(raw.split())
        try:
            candidates.append(base64.b64decode(compact, validate=True))
        except Exception:
            pass
    for candidate in candidates:
        try:
            decoded = _bounded_gzip(candidate) if candidate[:2] == b"\x1f\x8b" else candidate
            value = json.loads(decoded.decode("utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, zlib.error):
            continue
        if isinstance(value, dict) and "session" in value:
            return value
    return None


def payload_files(directory: Path) -> list[dict]:
    bundles = []
    by_session: dict[str, str] = {}
    supported = {".gz", ".json", ".txt", ".b64", ".base64"}
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.name.endswith((".mp4", ".jsonl")): continue
        if path.suffix.lower() not in supported: continue
        data = _decode_payload(path)
        if data is None:
            raise ValueError(f"malformed payload response file: {path}")
        session = data.get("session") or {}
        sid = str(session.get("session_id", ""))
        if not sid:
            raise ValueError(f"payload missing session_id: {path}")
        fingerprint = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        previous = by_session.get(sid)
        if previous is not None:
            if previous != fingerprint:
                raise ValueError(f"conflicting payload bundles for session {sid}")
            continue
        by_session[sid] = fingerprint
        bundles.append(data)
    if not bundles:
        raise ValueError(f"no valid payload bundles found in {directory}")
    return bundles


def export(study: str, source: str, directory: Path | None, sheet_csv_url: str | None) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = Path("exports") / study / stamp; target.mkdir(parents=True, exist_ok=False)
    rows = {"sessions": [], "responses": [], "events": []}
    if source == "local":
        source_dir = directory or Path("local") / study
        for name in rows: rows[name] = [{**row} for row in jsonl_read(source_dir / f"{name}.jsonl")]
    elif source == "payload":
        if directory is None:
            raise ValueError("--dir is required for payload import; refusing to scan the checkout")
        for bundle in payload_files(directory):
            session = bundle.get("session", {}); rows["sessions"].append(session); rows["responses"].extend(bundle.get("responses", [])); rows["events"].extend(bundle.get("events", []))
    else:
        if not sheet_csv_url: raise ValueError("--sheet-csv-url is required for apps_script")
        with urllib.request.urlopen(sheet_csv_url, timeout=30) as response: records = list(csv.DictReader(io.TextIOWrapper(response, encoding="utf-8")))
        rows["responses"] = records
    for name, values in rows.items(): jsonl_write(target / f"{name}.jsonl", values)
    receipt = {"study_id": study, "version": "", "source": source, "n_sessions": len(rows["sessions"]), "n_responses": len(rows["responses"]), "n_events": len(rows["events"]), "sha256": {name: sha256_file(target / f"{name}.jsonl") for name in rows}}
    (target / "EXPORT_RECEIPT.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    analyze(study, target)
    return target


def jsonl_read(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()] if path.exists() else []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--study", required=True); parser.add_argument("--source", choices=["local", "payload", "apps_script"], required=True); parser.add_argument("--dir", type=Path); parser.add_argument("--sheet-csv-url"); args = parser.parse_args(); print(export(args.study, args.source, args.dir, args.sheet_csv_url)); return 0


if __name__ == "__main__": raise SystemExit(main())
