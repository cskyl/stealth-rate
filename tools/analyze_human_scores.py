#!/usr/bin/env python3
"""Analyze exported StealthRate JSONL using only the Python standard library and numpy."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from yaml_support import load_yaml


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()] if path.exists() else []


def latest_sessions(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {row.get("session_id", ""): row for row in rows if row.get("session_id")}


def krippendorff_alpha(values_by_unit: dict[str, list[Any]], level: str = "nominal") -> float | None:
    ratings = [values for values in values_by_unit.values() if len(values) >= 2]
    if not ratings:
        return None
    counts: defaultdict[Any, float] = defaultdict(float)
    observed_num = 0.0
    observed_den = 0.0
    for values in ratings:
        local: defaultdict[Any, int] = defaultdict(int)
        for value in values: local[value] += 1; counts[value] += 1
        n = len(values)
        for left, left_count in local.items():
            for right, right_count in local.items():
                weight = left_count * (right_count - (1 if left == right else 0)) / max(1, n - 1)
                distance = 0.0 if left == right else 1.0 if level == "nominal" else (float(left) - float(right)) ** 2
                observed_num += weight * distance
                observed_den += weight
    total = sum(counts.values())
    if total < 2: return None
    expected = 0.0
    for left, left_count in counts.items():
        for right, right_count in counts.items():
            distance = 0.0 if left == right else 1.0 if level == "nominal" else (float(left) - float(right)) ** 2
            expected += (left_count / total) * (right_count / total) * distance
    observed = observed_num / observed_den if observed_den else 0.0
    return 1.0 if expected == 0 else 1.0 - observed / expected


def bootstrap(values: list[float], draws: int, rng: np.random.Generator) -> list[float]:
    if not values: return [float("nan"), float("nan")]
    samples = rng.choice(np.asarray(values, dtype=float), size=(draws, len(values)), replace=True).mean(axis=1)
    return [float(np.quantile(samples, 0.025)), float(np.quantile(samples, 0.975))]


def analyze(study_slug: str, export_dir: Path, output_path: Path | None = None) -> dict[str, Any]:
    study_dir = Path("studies") / study_slug
    config = load_yaml(study_dir / "study.yaml")
    public = {row["item_id"]: row for row in json.loads((study_dir / "items.json").read_text())["items"]}
    key = json.loads((study_dir / "private/key.json").read_text())["items"]
    sessions = latest_sessions(read_jsonl(export_dir / "sessions.jsonl"))
    responses = read_jsonl(export_dir / "responses.jsonl")
    events = read_jsonl(export_dir / "events.jsonl")
    response_key = {(row.get("session_id"), row.get("item_id"), row.get("task")): row for row in responses}
    valid_sessions = {sid for sid, row in sessions.items() if row.get("status") == "completed"}
    complete_items = {sid: {row.get("item_id") for row in responses if row.get("session_id") == sid} for sid in sessions}
    integrity = {
        "n_sessions": len(sessions), "n_completed": len(valid_sessions), "n_responses": len(responses), "n_events": len(events),
        "duplicate_response_keys": len(responses) - len(response_key), "sessions_missing_responses": {sid: int(len(items) == 0) for sid, items in complete_items.items() if sid in valid_sessions},
        "playback_complete_events": sum(row.get("type") == "ended" for row in events),
    }
    anchor_by_session: defaultdict[str, list[bool]] = defaultdict(list)
    attention_by_session: defaultdict[str, list[bool]] = defaultdict(list)
    for row in responses:
        meta, item = key.get(row.get("item_id"), {}), public.get(row.get("item_id"), {})
        answer = row.get("answers", {})
        if isinstance(answer, str): answer = json.loads(answer)
        if row.get("task") == "edit" and meta.get("role_kind") == "anchor": anchor_by_session[row.get("session_id", "")].append(answer.get("edited") == meta.get("expected"))
        if row.get("task") == "mcq" and meta.get("role_kind") == "attention":
            attention_by_session[row.get("session_id", "")].append(answer.get("choice") == (item.get("options") or [None, None, None])[2] and response_key.get((row.get("session_id"), row.get("item_id"), "edit"), {}).get("answers", {}).get("edited") == "no")
    threshold = float(config.get("analysis", {}).get("exclude_if_anchor_accuracy_below", 0.8))
    quality = {}
    included: set[str] = set()
    for sid in sessions:
        anchor_accuracy = float(np.mean(anchor_by_session[sid])) if anchor_by_session[sid] else 0.0
        attention_pass = bool(attention_by_session[sid]) and all(attention_by_session[sid])
        excluded = anchor_accuracy < threshold or (bool(config.get("analysis", {}).get("exclude_if_attention_failed", True)) and not attention_pass)
        quality[sid] = {"anchor_accuracy": anchor_accuracy, "attention_pass": attention_pass, "excluded": excluded}
        if sid in valid_sessions and not excluded: included.add(sid)

    agreement_values: defaultdict[str, list[Any]] = defaultdict(list)
    for row in responses:
        if row.get("session_id") not in included: continue
        answer = row.get("answers", {})
        if isinstance(answer, str): answer = json.loads(answer)
        if row.get("task") == "edit": agreement_values[row.get("item_id", "")].append(answer.get("edited"))
    agreement = {"edited_nominal_alpha": krippendorff_alpha(agreement_values, "nominal"), "conspicuousness_interval_alpha": None}
    stats: defaultdict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    rng = np.random.default_rng(20260902)
    for row in responses:
        sid, item_id = row.get("session_id"), row.get("item_id")
        if sid not in included or key.get(item_id, {}).get("role_kind") != "test": continue
        meta, item = key[item_id], public[item_id]
        answer = row.get("answers", {})
        if isinstance(answer, str): answer = json.loads(answer)
        cond = meta["cond_id"]
        if row.get("task") == "edit":
            stats[cond]["edited_rate"].append(float(answer.get("edited") == "yes")); stats[cond]["conspicuousness"].append(float(answer.get("conspicuousness", np.nan))); stats[cond]["naturalness"].append(float(answer.get("naturalness", np.nan)))
        if row.get("task") == "mcq":
            stats[cond]["mcq_accuracy"].append(float(answer.get("choice") == meta.get("gold"))); stats[cond]["injected_choice_rate"].append(float(answer.get("choice") == meta.get("injected")))
    per_condition = {}
    for cond, measurements in stats.items():
        per_condition[cond] = {name: {"mean": float(np.nanmean(values)), "ci95": bootstrap([v for v in values if np.isfinite(v)], 2000, rng), "n": len(values)} for name, values in measurements.items()}
    result = {"schema": "stealthrate.analysis.v1", "study_id": study_slug, "integrity": integrity, "rater_quality": quality, "included_sessions": sorted(included), "agreement": agreement, "per_condition": per_condition, "prediction_scoring": None}
    prereg = study_dir / "prereg.json"
    if prereg.exists(): result["prediction_scoring"] = {"status": "loaded", "predictions": json.loads(prereg.read_text())}
    if output_path is None: output_path = export_dir / "analysis.json"
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study", required=True)
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(); result = analyze(args.study, args.export_dir, args.output); print(json.dumps({"sessions": result["integrity"]["n_sessions"], "conditions": len(result["per_condition"])}, indent=2)); return 0


if __name__ == "__main__": raise SystemExit(main())
