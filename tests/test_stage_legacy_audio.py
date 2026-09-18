from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO / "audio-study"
SCRIPT = REPO / "tools/stage_legacy_audio.py"


def load_stager():
    spec = importlib.util.spec_from_file_location("stage_legacy_audio", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def relative_files(root: Path) -> set[Path]:
    return {
        p.relative_to(root)
        for p in root.rglob("*")
        if p.is_file() and "media" not in p.relative_to(root).parts
    }


def test_stages_all_non_media_files_and_rewrites_only_assignment_prefix(tmp_path: Path):
    stager = load_stager()
    output = tmp_path / "audio-study"
    source_hash_before = hashlib.sha256((SOURCE / "assignments/A001.html").read_bytes()).hexdigest()

    result = stager.stage_legacy_audio(SOURCE, output)

    assert result["rewritten_assignments"] == 40
    assert result["omitted_media_files"] == 240
    assert not (output / "media").exists()
    assert relative_files(output) == relative_files(SOURCE)
    assert hashlib.sha256((SOURCE / "assignments/A001.html").read_bytes()).hexdigest() == source_hash_before

    for relative in sorted(relative_files(SOURCE)):
        before = (SOURCE / relative).read_bytes()
        after = (output / relative).read_bytes()
        if relative.parent == Path("assignments") and relative.name.startswith("A"):
            assert before.count(stager.LOCAL_MEDIA_PREFIX) == 1
            expected = before.replace(stager.LOCAL_MEDIA_PREFIX, stager.MEDIA_PREFIX)
            assert after == expected
            assert after.count(stager.MEDIA_PREFIX) == 1
            assert after.count(stager.LOCAL_MEDIA_PREFIX) == 0
        else:
            assert after == before


def test_all_forty_assignment_configs_are_unchanged_except_media_prefix(tmp_path: Path):
    stager = load_stager()
    output = tmp_path / "audio-study"
    stager.stage_legacy_audio(SOURCE, output)
    source_assignments = sorted((SOURCE / "assignments").glob("A*.html"))
    staged_assignments = sorted((output / "assignments").glob("A*.html"))
    assert [p.name for p in source_assignments] == [f"A{i:03d}.html" for i in range(1, 41)]
    assert [p.name for p in staged_assignments] == [f"A{i:03d}.html" for i in range(1, 41)]
    for source, staged in zip(source_assignments, staged_assignments):
        expected = source.read_bytes().replace(stager.LOCAL_MEDIA_PREFIX, stager.MEDIA_PREFIX)
        assert staged.read_bytes() == expected


def test_refuses_existing_output(tmp_path: Path):
    stager = load_stager()
    output = tmp_path / "audio-study"
    output.mkdir()
    with pytest.raises(FileExistsError):
        stager.stage_legacy_audio(SOURCE, output)
