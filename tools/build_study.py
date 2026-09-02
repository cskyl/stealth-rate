#!/usr/bin/env python3
"""Build blinded public item/block files and the private scoring key."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import secrets
from pathlib import Path
from typing import Any

from yaml_support import canonical_json, load_yaml, sha256_file


CONDITIONS = ("clean", "harmless_av", "audio_low", "audio_high", "visual_low", "visual_high")
ROLE_BY_SOURCE = {"audio": "audio", "visual": "visual"}


def _default_sources(study: dict[str, Any]) -> list[dict[str, str]]:
    sounds = list(study.get("classes", {}).get("sound", ["siren", "bell", "drum", "hiss"]))
    motions = list(study.get("classes", {}).get("motion", ["bounce", "spin", "rise", "blink"]))
    n = int(study.get("design", {}).get("sources", 12))
    rows = [
        {"source_id": f"src_{i:02d}", "sound_class": sounds[i % len(sounds)], "motion_class": motions[i % len(motions)], "role": "test"}
        for i in range(n)
    ]
    anchor_count = int(study.get("design", {}).get("anchor_sources", 2))
    rows.extend({"source_id": f"anchor_{i:02d}", "sound_class": sounds[(n + i) % len(sounds)], "motion_class": motions[(n + i) % len(motions)], "role": "anchor"} for i in range(anchor_count))
    return rows


def _read_sources(path: Path, study: dict[str, Any]) -> list[dict[str, Any]]:
    if not path.exists():
        if study.get("study_id") != "sample_synthetic_v0":
            raise FileNotFoundError(f"source manifest required: {path}")
        sources = _default_sources(study)
        path.write_text(json.dumps(sources, indent=2) + "\n", encoding="utf-8")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        raise ValueError("sources.json must be a non-empty list")
    required = {"source_id", "sound_class", "motion_class"}
    if any(not isinstance(row, dict) or not required.issubset(row) for row in data):
        raise ValueError("each source needs source_id, sound_class, and motion_class")
    if len({str(row["source_id"]) for row in data}) != len(data):
        raise ValueError("source_id values must be unique")
    return data


def _item_id(study_id: str, source_id: str, cond_id: str, seed: int, role_kind: str = "test") -> str:
    suffix = "" if role_kind == "test" else f"\0{role_kind}"
    material = f"{study_id}\0{source_id}\0{cond_id}\0{seed}{suffix}".encode()
    return "it_" + hashlib.blake2s(material, key=b"stealth-rate-v0", digest_size=4).hexdigest()


def _wrong(value: str, values: list[str]) -> str:
    return next(candidate for candidate in values if candidate != value)


def _question(role: str, study: dict[str, Any]) -> str:
    tasks = study.get("tasks", [])
    for task in tasks:
        if task.get("id") == "mcq":
            return str(task.get("prompt_audio" if role == "audio" else "prompt_visual", "Choose the main event in this clip."))
    return "Choose the main event in this clip."


def _make_public(item_id: str, role: str, question: str, options: list[str], practice: bool = False, feedback: str | None = None) -> dict[str, Any]:
    return {
        "item_id": item_id,
        "media": f"{item_id}.mp4",
        "duration_s": 8.0,
        "role": role,
        "question": question,
        "options": options,
        "practice": practice,
        "practice_feedback": feedback,
    }


def _public_study(study: dict[str, Any]) -> dict[str, Any]:
    backend = dict(study.get("backend", {}))
    requirements = dict(study.get("requirements", {}))
    design = study.get("design", {})
    return {
        "study_id": str(study["study_id"]),
        "version": str(study.get("version", "")),
        "title": str(study.get("title", "")),
        "languages": list(study.get("languages", [])),
        "backend": {
            "mode": str(backend.get("mode", "payload")),
            "apps_script_url": str(backend.get("apps_script_url", "")),
        },
        "media_base_url": str(study.get("media_base_url", "media/")),
        "requirements": {
            "desktop_only": bool(requirements.get("desktop_only", True)),
            "headphone_check": bool(requirements.get("headphone_check", True)),
            "full_playback_before_answer": bool(
                requirements.get("full_playback_before_answer", True)
            ),
        },
        "design": {"items_per_rater": int(design.get("items_per_rater", 12))},
        "items_per_rater": int(design.get("items_per_rater", 12)),
        "headphone_trials": int(requirements.get("headphone_trials", 6)),
        "headphone_minimum": int(requirements.get("headphone_minimum", 5)),
        "tasks": list(study.get("tasks", [])),
        "text": dict(study.get("text", {})),
    }


def build(study_path: str | Path) -> dict[str, Any]:
    study_path = Path(study_path)
    study = load_yaml(study_path)
    slug_dir = study_path.parent
    study_id = str(study["study_id"])
    seed = int(study.get("design", {}).get("block_seed", 1))
    sources = _read_sources(slug_dir / "sources.json", study)
    conditions = list(study.get("design", {}).get("conditions", CONDITIONS))
    if tuple(conditions) != CONDITIONS:
        raise ValueError("this implementation requires the six frozen conditions")
    classes = study.get("classes", {})
    sound_classes = list(classes.get("sound", ["siren", "bell", "drum", "hiss"]))
    motion_classes = list(classes.get("motion", ["bounce", "spin", "rise", "blink"]))
    rng = random.Random(seed)
    public: list[dict[str, Any]] = []
    key: dict[str, dict[str, Any]] = {}
    by_source: dict[str, list[dict[str, Any]]] = {}
    test_sources = [source for source in sources if source.get("role", "test") != "anchor"]
    if int(study.get("design", {}).get("sources", len(test_sources))) != len(test_sources):
        raise ValueError("source manifest test-source count does not match study design")
    for index, source in enumerate(test_sources):
        source_id = str(source["source_id"])
        role = "audio" if index % 2 == 0 else "visual"
        correct = str(source["sound_class"] if role == "audio" else source["motion_class"])
        values = sound_classes if role == "audio" else motion_classes
        wrong = _wrong(correct, values)
        by_source[source_id] = []
        for cond in conditions:
            item_id = _item_id(study_id, source_id, cond, seed)
            if len(set(values)) != 4 or correct not in values or wrong not in values:
                raise ValueError(f"role classes must contain four distinct values: {values!r}")
            options = values[:]
            local_rng = random.Random(f"{seed}:{item_id}")
            local_rng.shuffle(options)
            public.append(_make_public(item_id, role, _question(role, study), options))
            key[item_id] = {
                "source_id": source_id,
                "cond_id": cond,
                "role_kind": "test",
                "gold": correct,
                "injected": wrong,
                "rung": "high" if cond.endswith("high") else "low" if cond.endswith("low") else "none",
                "channel": "audio" if cond.startswith("audio") else "visual" if cond.startswith("visual") else "both" if cond == "harmless_av" else "none",
                "expected": None,
            }
            by_source[source_id].append({"item_id": item_id, "cond": cond})

    anchor_sources = [source for source in sources if source.get("role") == "anchor"]
    if len(anchor_sources) < 2:
        raise ValueError("at least two anchor sources are required")
    anchors = [
        (str(anchor_sources[0]["source_id"]), "audio", "audio_high"),
        (str(anchor_sources[1]["source_id"]), "visual", "visual_high"),
        (str(anchor_sources[0]["source_id"]), "audio", "clean"),
        (str(anchor_sources[1]["source_id"]), "visual", "clean"),
    ]
    for index, (source_id, role, cond) in enumerate(anchors):
        item_id = _item_id(study_id, source_id, cond, seed, "quality")
        source = next(row for row in anchor_sources if row["source_id"] == source_id)
        correct = source["sound_class"] if role == "audio" else source["motion_class"]
        values = sound_classes if role == "audio" else motion_classes
        wrong = _wrong(correct, values)
        options = values[:]
        random.Random(f"{seed}:{item_id}").shuffle(options)
        public.append(_make_public(item_id, role, _question(role, study), options))
        key[item_id] = {
            "source_id": source_id, "cond_id": cond, "role_kind": "anchor", "gold": correct,
            "injected": wrong, "rung": "high" if cond != "clean" else "none",
            "channel": role if cond != "clean" else "none", "expected": "yes" if cond != "clean" else "no",
        }

    practice_specs = [("practice_audio", "audio"), ("practice_visual", "visual")]
    for source_id, role in practice_specs:
        item_id = _item_id(study_id, source_id, "practice", seed, "practice")
        values = sound_classes if role == "audio" else motion_classes
        options = values[:]
        random.Random(f"{seed}:{item_id}").shuffle(options)
        public.append(_make_public(item_id, role, _question(role, study), options, True, "Thanks — practice feedback is shown here."))
        key[item_id] = {
            "source_id": source_id, "cond_id": "practice", "role_kind": "practice", "gold": values[0],
            "injected": values[1], "rung": "none", "channel": "none", "expected": None,
        }

    attention_id = _item_id(study_id, "quality_check", "attention", seed, "quality")
    public.append(_make_public(attention_id, "visual", "For this clip choose option C and answer Edited = No", motion_classes[:]))
    key[attention_id] = {
        "source_id": "quality_check", "cond_id": "quality", "role_kind": "attention", "gold": None,
        "injected": None, "rung": "none", "channel": "none", "expected": "C",
    }

    test_per_block = int(study.get("design", {}).get("items_per_rater", len(test_sources)))
    if not 1 <= test_per_block <= len(test_sources):
        raise ValueError("items_per_rater must be between 1 and the number of test sources")
    n_blocks = max(1, len(conditions))
    blocks: list[dict[str, Any]] = []
    for block_index in range(n_blocks):
        selected: list[dict[str, Any]] = []
        for source_index, source in enumerate(test_sources):
            source_id = str(source["source_id"])
            cond = conditions[(source_index + block_index) % len(conditions)]
            selected.append(next(x for x in by_source[source_id] if x["cond"] == cond))
        selected = selected[:test_per_block]
        # Fixed positions are deliberate and deterministic; quality items are visually indistinguishable.
        ordered = [x["item_id"] for x in selected]
        anchor_ids = [x for x, meta in key.items() if meta["role_kind"] == "anchor"]
        chosen_anchors = [anchor_ids[(2 * block_index) % len(anchor_ids)], anchor_ids[(2 * block_index + 1) % len(anchor_ids)]]
        ordered.insert(min(3, len(ordered)), chosen_anchors[0])
        ordered.insert(min(8, len(ordered)), chosen_anchors[1])
        ordered.insert(min(10, len(ordered)), attention_id)
        practice_ids = [x for x, meta in key.items() if meta["role_kind"] == "practice"]
        blocks.append({"block_id": f"b{block_index:02d}", "items": practice_ids + ordered})

    slug_dir.mkdir(parents=True, exist_ok=True)
    (slug_dir / "items.json").write_bytes(canonical_json({"study_id": study_id, "version": str(study.get("version", "")), "items": public}))
    (slug_dir / "blocks.json").write_bytes(canonical_json({"study_id": study_id, "version": str(study.get("version", "")), "seed": seed, "blocks": blocks}))
    (slug_dir / "study.json").write_bytes(canonical_json(_public_study(study)))
    private_dir = slug_dir / "private"
    private_dir.mkdir(exist_ok=True)
    items_path = slug_dir / "items.json"
    private_path = private_dir / "key.json"
    private_path.write_bytes(canonical_json({"study_id": study_id, "version": str(study.get("version", "")), "sha256_items": sha256_file(items_path), "items": key}))
    receipt = {
        "study_id": study_id, "version": str(study.get("version", "")), "seed": seed,
        "counts": {"sources": len(test_sources), "anchor_sources": len(anchor_sources), "test_items": len(test_sources) * len(conditions), "public_items": len(public), "blocks": len(blocks)},
        "sha256": {name: sha256_file(slug_dir / name) for name in ("items.json", "blocks.json", "study.json")},
        "sha256_private_key": sha256_file(private_path),
    }
    (slug_dir / "BUILD_RECEIPT.json").write_bytes(canonical_json(receipt))
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study_yaml", help="path to study.yaml")
    args = parser.parse_args()
    receipt = build(args.study_yaml)
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
