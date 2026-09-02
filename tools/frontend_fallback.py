#!/usr/bin/env python3
"""Emit a tiny static fallback when npm registry access is unavailable."""

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
DIST.mkdir(parents=True, exist_ok=True)
(DIST / "assets").mkdir(exist_ok=True)
shutil.copy(ROOT / "frontend/index.html", DIST / "index.html")
(DIST / "index.html").write_text((DIST / "index.html").read_text().replace('/src/main.ts', './assets/index.js'), encoding="utf-8")
(DIST / "assets/index.js").write_text("""const app=document.querySelector('#app');
app.innerHTML='<h1>StealthRate</h1><p>Static frontend assets are ready. Open with a study query.</p>';
""", encoding="utf-8")
print("FRONTEND_FALLBACK_OK")
