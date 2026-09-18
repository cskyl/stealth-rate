#!/usr/bin/env python3
"""Stage the legacy A study without duplicating its immutable media.

The participant HTML remains byte-for-byte identical except for its one media
URL prefix.  Media are served from the pinned historical GitHub commit so the
old A001--A040 routes and stimulus bytes remain stable while the Pages artifact
does not carry a second 269 MB media copy.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPO / "audio-study"
PINNED_COMMIT = "be95ccc8fa43c40b9a0213cc238e6c460d370025"
MEDIA_PREFIX = (
    "https://raw.githubusercontent.com/cskyl/stealth-rate/"
    f"{PINNED_COMMIT}/audio-study/media/"
).encode("ascii")
LOCAL_MEDIA_PREFIX = b"../media/"
ASSIGNMENT_RE = re.compile(r"^A(?:00[1-9]|0[1-3][0-9]|040)\.html$")


def stage_legacy_audio(source: Path, output: Path) -> dict[str, object]:
    """Copy the participant package, omitting media and pinning A URLs."""
    source = source.resolve()
    output = output.resolve()
    if not source.is_dir():
        raise FileNotFoundError(f"audio-study source directory missing: {source}")
    if output.exists():
        raise FileExistsError(f"staging output already exists: {output}")

    assignments = sorted((source / "assignments").glob("A*.html"))
    expected_assignments = [source / "assignments" / f"A{i:03d}.html" for i in range(1, 41)]
    if assignments != expected_assignments:
        raise RuntimeError(
            "audio-study must contain exactly A001.html--A040.html; "
            f"found {[p.name for p in assignments]}"
        )

    output.mkdir(parents=True)
    copied_files = 0
    rewritten_assignments = 0
    omitted_files = 0
    try:
        for path in sorted(source.rglob("*")):
            relative = path.relative_to(source)
            if relative.parts and relative.parts[0] == "media":
                if path.is_file():
                    omitted_files += 1
                continue
            target = output / relative
            if path.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if not path.is_file():
                raise RuntimeError(f"unsupported source entry: {path}")
            target.parent.mkdir(parents=True, exist_ok=True)
            data = path.read_bytes()
            if relative.parts[:1] == ("assignments",) and ASSIGNMENT_RE.fullmatch(relative.name):
                occurrences = data.count(LOCAL_MEDIA_PREFIX)
                if occurrences != 1:
                    raise RuntimeError(f"{relative} has {occurrences} ../media/ references, expected exactly one")
                data = data.replace(LOCAL_MEDIA_PREFIX, MEDIA_PREFIX)
                rewritten_assignments += 1
            target.write_bytes(data)
            shutil.copystat(path, target)
            copied_files += 1
    except Exception:
        shutil.rmtree(output)
        raise

    if rewritten_assignments != 40:
        raise RuntimeError(f"rewrote {rewritten_assignments} assignments, expected 40")
    if (output / "media").exists():
        raise RuntimeError("legacy staging unexpectedly copied a media directory")

    return {
        "source": str(source),
        "output": str(output),
        "pinned_commit": PINNED_COMMIT,
        "copied_files": copied_files,
        "rewritten_assignments": rewritten_assignments,
        "omitted_media_files": omitted_files,
        "media_prefix": MEDIA_PREFIX.decode("ascii"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(stage_legacy_audio(args.source, args.output), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
