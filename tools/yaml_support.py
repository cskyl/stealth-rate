"""Small YAML subset reader used by the dependency-free command line tools."""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any


def _scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return {}
    if value in {"{}", "~", "null", "Null", "NULL"}:
        return None if value != "{}" else {}
    if value in {"true", "True", "TRUE"}:
        return True
    if value in {"false", "False", "FALSE"}:
        return False
    if value.startswith(">") or value.startswith("|"):
        return ""
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_scalar(part.strip()) for part in inner.split(",")]
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        pass
    try:
        return ast.literal_eval(value)
    except (SyntaxError, ValueError):
        return value.strip('"\'')


def load_yaml(path: str | Path) -> dict[str, Any]:
    """Parse the simple mappings/lists used in the frozen study files."""
    lines = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        text = raw.strip()
        if " #" in text:
            text = text.split(" #", 1)[0].rstrip()
        lines.append((indent, text))

    root: dict[str, Any] = {}
    stack: list[tuple[int, Any]] = [(-1, root)]
    i = 0
    while i < len(lines):
        indent, text = lines[i]
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if text.startswith("- "):
            if not isinstance(parent, list):
                raise ValueError(f"list item without list parent at line {i + 1}")
            item_text = text[2:].strip()
            if ":" in item_text and not item_text.startswith(('"', "'")):
                key, raw_value = item_text.split(":", 1)
                item: dict[str, Any] = {key.strip(): _scalar(raw_value)}
                parent.append(item)
                stack.append((indent, item))
            else:
                parent.append(_scalar(item_text))
            i += 1
            continue
        if ":" not in text:
            i += 1
            continue
        key, raw_value = text.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if raw_value in {"", ">", "|"}:
            next_is_list = i + 1 < len(lines) and lines[i + 1][0] > indent and lines[i + 1][1].startswith("- ")
            value: Any = [] if next_is_list else {}
            parent[key] = value
            stack.append((indent, value))
        else:
            parent[key] = _scalar(raw_value)
        i += 1
    return root


def sha256_file(path: str | Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
