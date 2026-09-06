# StealthRate

Blinded human-rating platform for audio-visual typographic-attack **stealthiness**:
do ordinary viewers notice an injected spoken / on-screen cue, how conspicuous is
it, and are *humans* redirected by it the way multimodal models are?

- **Static frontend** (Vite + TypeScript) hosted on GitHub Pages — one link to share.
- **Three interchangeable backends**: `payload` (no server: the rater downloads /
  copies a response bundle at the end — used by the public demo), `apps_script`
  (Google Apps Script + Google Sheets; free, server-side block assignment and
  completion codes), `local` (`tools/serve_local.py`, stdlib only; writes JSONL —
  for self-pilots, lab sessions, CI).
- **Config-driven studies**: a study is `studies/<slug>/study.yaml` + built
  `items.json` / `blocks.json`; the answer key never enters the public bundle.
- **Sample study included** (`sample_synthetic_v0`): fully synthetic clips
  (shapes + synthesized sounds + gTTS cues), so the demo carries no third-party media.

Live demo: https://cskyl.github.io/stealth-rate/ (payload mode; ~5 minutes).

Design rationale, instrument, blinding and analysis plan: `docs/FRAMEWORK_DESIGN.md`.
Data contracts: `docs/STUDY_SCHEMA.md`. Implementation work orders: `WORKORDERS.md`.

## Quick start

For this existing checkout, the sample JSON/media are already present: **do not
regenerate them just to preview the repair**. Build the frontend and launch the
local server as below. The server does not override `study.json`'s backend:
the included sample uses **payload mode**, so download the response bundle at
completion; it does not automatically write ratings to server-side JSONL.

Local repair status and browser evidence: [September 6 repair board](docs/REPAIR_BOARD_20260906.md).
The public demo does not receive local edits until a separate approved deployment.

```bash
# 1. build a study (anonymized items, Latin-square blocks, private key)
python tools/build_study.py studies/sample_synthetic_v0/study.yaml

# 2. generate the synthetic sample media (ffmpeg + gTTS)
python tools/make_sample_media.py studies/sample_synthetic_v0/study.yaml

# 3. run locally (backend is selected by study.json; sample uses payload)
cd frontend && npm ci && npm run build && cd ..
python tools/serve_local.py --study sample_synthetic_v0 --port 8765
# open http://127.0.0.1:8765/?study=sample_synthetic_v0

# 4. export + analyze
python tools/export_and_analyze.py --study sample_synthetic_v0 --source local
```

For downloaded sample payloads, use an isolated folder containing only the
returned bundles (raw `.json.gz`, Base64 text, or JSON):

```bash
python tools/export_and_analyze.py --study sample_synthetic_v0 --source payload --dir /absolute/path/to/returned-bundles
```

Keep the same browser/profile to resume. Submitted answers and completed exports
are retained in that browser's local storage; clearing site data removes them.
Download the completed bundle and return it to the study owner. The synthetic
demo is still not an approved participant study.

`make smoke` runs steps 1–4 end to end on the sample study with a simulated rater.

## Deploying your own study

1. Copy `studies/sample_synthetic_v0/` to `studies/<slug>/`, edit `study.yaml`.
2. Put encoded clips under `media/<slug>/` (see `tools/encode_media.py`; keep
   the repo < 1 GB or use a second Pages repo for media and set `media_base_url`).
3. Choose a backend in `study.yaml`:
   - `payload` — nothing to deploy;
   - `apps_script` — deploy `backend/apps_script/Code.gs` as a web app
     (instructions in `backend/apps_script/README.md`), paste the `/exec` URL;
   - `local` — `tools/serve_local.py`.
4. Push to `main`; the Pages workflow builds and publishes automatically.

## Blinding guarantees

`items.json` contains only anonymized ids, media URLs, question text and options.
Condition, source and rung live in `studies/<slug>/private/key.json` (git-ignored)
and, for `apps_script`, in a separate private spreadsheet that no client-facing
operation reads. CI greps the built bundle for condition strings.

## Governance

This repository is software. Collecting data from people requires the study
owner's IRB/HRPP determination, consent text in `study.yaml`, and a frozen study
version with a preregistration hash. The sample study is a demo, not a study.

License: MIT.
