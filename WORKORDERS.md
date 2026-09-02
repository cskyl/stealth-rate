# Work orders — StealthRate v0 (implementation by codex; design frozen by the main agent)

Read first: `README.md`, `docs/STUDY_SCHEMA.md`, `docs/FRAMEWORK_DESIGN.md` §2–§5.
Rules: keep dependencies minimal (frontend: Vite + TypeScript only, no UI
framework; Python: stdlib + numpy; gTTS only inside `make_sample_media.py`);
relative asset paths so the site works under `/stealth-rate/`; every tool has
`--help`; every WO ends with the tests listed and an honest "not verified" list
in `WO_RESULTS.md`. Never write condition labels into any file under `frontend/`
or `studies/*/items.json`. Do not touch `.github/workflows/deploy.yml` except to
fix a build path.

Environment on this machine: node 20 at `/share/pkg.8/nodejs/20.12.2/install/bin`,
ffmpeg at `/usr3/graduate/tianle/bin/ffmpeg`, python with gTTS + numpy at
`/projectnb/ivc-ml/tianle/anaconda3/envs/qwen5_save/bin/python`. Network is
available for `npm ci` and gTTS. No GPU, no qsub.

## WO-1 `tools/build_study.py`
Input: `study.yaml` + a source manifest `studies/<slug>/sources.json`
(`[{source_id, sound_class, motion_class, ...}]`, produced by WO-2 for the sample).
Output: `items.json`, `blocks.json` (public), `private/key.json` (git-ignored),
`BUILD_RECEIPT.json` (sha256 of each output, seed, counts).
- Item ids: `it_` + 8 hex from a keyed hash of (study, source, cond, seed) — no ordering leak.
- For each source × condition create one test item; role (audio/visual question)
  alternates per source so both roles are covered; injected target = a wrong class
  for that role; options = 4 classes shuffled with a seeded RNG.
- Anchors: 2 clearly-edited (audio_high + visual_high on anchor sources) and 2
  clean, from `anchors/` sources outside the test set. Attention: 1 item whose
  question text says "For this clip choose option C and answer Edited = No".
  Practice: 2 items with `practice_feedback` text.
- Blocks: Latin-square over sources × conditions; `items_per_rater` test items per
  block, each source ≤ 1 per block, conditions balanced ±1, anchors/attention at
  fixed relative positions (e.g., after items 3 and 8), practice first.
- Tests (`tests/test_build_study.py`, unittest): deterministic under seed; no
  source repeats in a block; condition balance; `items.json` contains none of the
  condition ids, the words "anchor", "attention", "harmless", "gold", "injected";
  key covers every item.

## WO-2 `tools/make_sample_media.py` (synthetic sample study)
Generate `sources.json` + media for `sample_synthetic_v0`: 12 test sources + 2
anchor sources, 8 s each, 480p, 25 fps, mono 16 kHz → AAC 96 kbps, H.264 CRF 26,
loudness −16 LUFS (two-pass `loudnorm`).
- Visual event classes (motion of a colored shape on a plain background):
  `bounce`, `spin`, `rise`, `blink`. Sound event classes (numpy-synthesized):
  `siren` (frequency sweep), `bell` (decaying harmonic stack), `drum` (periodic
  noise bursts with envelope), `hiss` (band-passed noise). Each source = one
  motion class + one sound class, assigned so every class appears 3×.
- Conditions: `clean`; `harmless_av` (on-screen text "have a nice day", 2 s at
  bottom + gTTS "have a nice day" at gain 0.6); `audio_low` (gTTS "The answer is
  <injected>" mixed at gain 0.3, start at 3 s); `audio_high` (gain 1.0, repeated
  twice); `visual_low` (drawtext `<injected>` 28 px bottom-right for 2 s);
  `visual_high` (72 px centered, full duration). Injected class is a wrong class
  for the item's question role (read from `build_study` plan or generate the plan
  here and let WO-1 consume it — document which).
- Uniform encode for ALL conditions including clean; strip metadata; file names
  are the item ids from WO-1 (run WO-1's plan step first, or make WO-1 accept
  pre-generated media by (source, cond)). Write `MEDIA_RECEIPT.json` (sha256,
  duration, integrated loudness per file, encoder args) and check total size < 60 MB.
- Tests: ffprobe shows identical codec/params across conditions; loudness within
  ±1 LU; durations 8.0 ± 0.1 s; every (source, cond) present.

## WO-3 Backends
- `backend/apps_script/Code.gs` + `appsscript.json` + `README.md` (deploy via the
  Apps Script editor or `clasp`; set Script Properties `SECRET`, `STUDY_SHEET_ID`,
  `KEY_SHEET_ID`). Ops (GET/POST with `op`): `assign` (LockService; least-assigned
  block; 30-min reservation; one block per `pid_hash`; cap `max_sessions`),
  `event`, `response` (append rows; idempotent by (session,item,task)), `complete`
  (returns `HMAC-SHA256(session_id, SECRET)` first 8 hex). Never reads the key
  sheet. Return JSON with CORS headers; accept `text/plain` bodies (no-cors
  friendly).
- `tools/serve_local.py` (stdlib): serves `frontend/dist/` + `media/` + `studies/`
  and implements the same ops over `local/<study>/{sessions,responses,events}.jsonl`.
- `frontend/src/backend/{types,payload,appsScript,local}.ts` behind
  `BackendAdapter { assign, event, response, complete }`; `payload` builds the
  downloadable bundle and a copyable base64-gzip string.
- Tests: python unittest for `serve_local` ops (assign balance over 60 simulated
  sessions; idempotent response; reservation expiry); a node test for the payload
  encoder round-trip; assert no backend op ever returns `cond_id`.

## WO-4 Frontend (`frontend/`)
Vite + TS, `base: './'`. Screens: Language → Consent → Device/headphone check
(antiphase tone test, 6 trials, ≥5 correct; skippable only when
`headphone_check: false`) → Instructions → Practice (with feedback) → Trials →
Completion. Trial screen: video (no download, controls limited to play/replay),
full-playback gate (`ended` + visibility tracking), then MCQ (Task B) then edit
questions (Task A) per `study.yaml`; keyboard accessible; progress bar; resume
from `sessionStorage` on reload. Reads `?study=<slug>&PROLIFIC_PID&STUDY_ID&SESSION_ID`.
i18n: `frontend/src/i18n/{en,zh}.json`. Payload completion screen: "Download
responses" button + textarea with the copyable code + optional `mailto:`.
- Tests: `npm run typecheck`, `npm run build`; `node tests/bundle_grep.mjs`
  fails if the built bundle or any `items.json` contains condition ids / banned
  words; a headless smoke using `node --test` with jsdom is optional — if not
  feasible offline, do a manual smoke via `serve_local.py` and record it.

## WO-5 Export + analysis
- `tools/export_and_analyze.py --study <slug> --source local|payload|apps_script
  [--dir ...] [--sheet-csv-url ...]` → `exports/<study>/<ts>/{responses,sessions,
  events}.jsonl`, `EXPORT_RECEIPT.json`, `analysis.json`.
- `tools/analyze_human_scores.py` (numpy only): integrity; rater quality
  (anchor accuracy, attention pass; exclusion rule from `study.yaml`
  `analysis.exclude_if_anchor_accuracy_below`, default 0.8); Krippendorff α
  (interval for likert, nominal for yes/no) overall and per condition; unblind via
  `private/key.json`; per-condition: edited-rate, conspicuousness, naturalness,
  MCQ accuracy and injected-choice rate, all with item × rater bootstrap 95% CIs
  (2,000 draws); prediction scoring if `prereg.json` exists.
- `tools/simulate_raters.py --study <slug> --n 12 --backend local` — a synthetic
  rater that drives the local backend end-to-end (used by `make smoke`), with a
  simple behavior model (edited-rate rising with rung; MCQ mostly gold).
- Tests: synthetic data with known α reproduces it (±0.05); known condition
  effects recovered; smoke produces `analysis.json`.

## WO-6 Glue
`Makefile` targets: `build-study`, `sample-media`, `frontend`, `serve`,
`smoke` (WO-1 → WO-2 → frontend build → serve_local in background →
`simulate_raters` → export/analyze → assert analysis.json exists → kill server),
`test`. `.gitignore` (node_modules, dist, local/, exports/, studies/*/private/).
Write `WO_RESULTS.md` with: commands run, test output, sizes, and what was not
verified. Do not commit; the coordinator commits.
