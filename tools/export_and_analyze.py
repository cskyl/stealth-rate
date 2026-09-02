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
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from analyze_human_scores import analyze
from yaml_support import sha256_file


def jsonl_write(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


def payload_files(directory: Path) -> list[dict]:
    bundles = []
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.name.endswith((".mp4", ".jsonl")): continue
        try: raw = path.read_bytes(); decoded = base64.b64decode(raw, validate=True); data = json.loads(gzip.decompress(decoded))
        except Exception:
            try: data = json.loads(path.read_text(encoding="utf-8"))
            except Exception: continue
        if isinstance(data, dict) and "session" in data: bundles.append(data)
    return bundles


def export(study: str, source: str, directory: Path | None, sheet_csv_url: str | None) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = Path("exports") / study / stamp; target.mkdir(parents=True, exist_ok=False)
    rows = {"sessions": [], "responses": [], "events": []}
    if source == "local":
        source_dir = directory or Path("local") / study
        for name in rows: rows[name] = [{**row} for row in jsonl_read(source_dir / f"{name}.jsonl")]
    elif source == "payload":
        for bundle in payload_files(directory or Path(".")):
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
