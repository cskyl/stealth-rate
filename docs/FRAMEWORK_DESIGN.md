# Human Stealthiness Evaluation Platform — Framework Design / 人类隐蔽性评测平台设计

*2026-09-02, main agent. Framework only; implementation is delegated to codex
work orders in §9. Status: `DESIGN_ONLY — DO_NOT_COLLECT`. Nothing here
authorizes recruitment, media distribution, or data collection.*

Related prior work inside this project (reuse, do not rebuild from scratch):
`human_detectability_v1/` (R10 design, instrument fields, hostile-review
history — `SHIP_DESIGN_ONLY`), `human_stealth_v1/` (HRPP checklist, V14
sentence-naturalness items), `stealth_operating_point_v2/human_eval/`
(`analyze_human_scores.py` skeleton), and the skill `human-study-kit`.

---

## 0. TL;DR

**EN.** A human stealth study is worth running because it converts the
paper's weakest external critique (COLM: "the threat model is trivial; the
cue is audible/visible") into a measured **human-noticeability vs
model-redirection frontier** on the *same frozen items* the model was
evaluated on (S1 dose ladder, T1-H harmless control). Estimated uplift if it
lands in the paper: significance +0.5–1 axis point, P(accept) +5–8 points;
it does not fix the two dealbreakers in the ICLR plan (selectivity,
training-free baseline), so it is **P4**, run in parallel and never at their
expense. It cannot be in the 2026-09-25 ICLR draft unless a BU HRPP
determination exists by ~09-12; plan it as rebuttal/camera-ready or
next-venue evidence. The platform is a maintainable, config-driven static
web app (Cloudflare Pages + Workers + D1 + R2, or Supabase equivalent) with
Prolific integration, blinded assignment, quality gates, an admin dashboard,
and a fixed JSONL export that feeds `analyze_human_scores.py`.

**ZH.** 值得做：它把 COLM 审稿人最强的批评（"威胁模型太平凡，线索听得见/看得见"）
变成一个可量化的 **人类可察觉度 vs 模型被带偏率的 frontier**，并且用的是模型
评测过的同一批冻结素材（S1 剂量阶梯、T1-H 无害对照）。若能进论文，预计
significance 轴 +0.5–1，录用概率 +5–8 个点；但它不解决 ICLR 计划里的两个致命
点（selectivity、training-free 基线），所以定为 **P4**，只能并行，不能挤占 P0/P1。
9/25 前进不了 ICLR 正文，除非 ~9/12 前拿到 BU HRPP 判定；按 rebuttal /
camera-ready / 下一个 venue 的证据来规划。平台本身是可维护的、配置驱动的静态
网页（Cloudflare Pages + Workers + D1 + R2，或 Supabase 等价方案），带 Prolific
接入、盲化分配、质量门、管理后台、固定的 JSONL 导出，直接喂给分析脚本。

---

## 1. Scientific question and what it feeds / 科学问题与它支撑的 claim

**One question.** At the attack operating points where the model is
redirected, do ordinary human viewers notice the injected cue as an edit, and
how conspicuous / unnatural do they find it?

**Feeds:** a new ledger row **C18 (human noticeability frontier)** and
retires the machine-proxy "stealth" axes (RelRMS, Whisper WER shift) of the
COLM paper's Fig. 3. Allowed wording after a positive result: "at the
low-dose rung, X% of raters did not flag the clip as edited (conspicuousness
median m/5) while the model followed the injected label Y% of the time."
Forbidden regardless of result: "imperceptible", "undetectable", "stealthy
in deployment".

**Both-outcomes test.** (a) Humans mostly miss the cue at rungs where the
model is redirected → gap between human and model, supports the safety
framing. (b) Humans reliably notice → honest bound: "the attack is
human-detectable; its risk is in automated, human-out-of-the-loop
pipelines" (which is the rebuttal's own threat model). Either is content.

**Preregistered predictions (to hash before any response):**
- Audio low rung: ≥50% of raters answer "not edited"; model TF at that rung
  (S1) ≈ 20–35%.
- Visual rungs: conspicuousness rises monotonically with rung; visual-high
  flagged "edited" by ≥80%.
- Harmless-AV control is flagged at the same rate as the matched attack rung
  (the *content* is not what humans notice; the *overlay* is).
- Human classification accuracy (Task B) under attack stays ≥90% of clean
  accuracy (humans are not redirected).
Expected-if-thesis-false: audio low rung flagged by ≥80% → no frontier gap.

---

## 2. Instrument / 评测任务设计

Two short tasks, separate rater pools (never both), mirroring R10's cohorts
but lighter. Pairwise is used only where it sharpens sensitivity.

### Task A — Edit detection & conspicuousness (single-stimulus, deployment-realistic)
Per clip (≤10 s, plays once fully before the form unlocks):
1. "Does this clip appear to have been deliberately edited or modified (text added on screen, or speech added to the sound)?" — **Yes / No**
2. Confidence — 1 (guessing) / 2 / 3 (certain)
3. If Yes: "What did you notice?" — checkboxes: on-screen text / added speech / other + free text (≤80 chars)
4. Conspicuousness — 1 (noticed nothing) … 5 (immediately obvious)
5. Contextual naturalness — 1 (very unnatural) … 5 (fits the video completely)
Anchored endpoints shown once in practice with example clips.

### Task A′ — 2AFC sensitivity (optional add-on, same pool, last block)
Two versions of the same source side by side (clean vs attacked, random
left/right): "Which one was modified?" + confidence. Gives d′ per rung
independent of response bias. 8 pairs per rater.

### Task B — Human answer under attack (is the *human* redirected?)
Same MCQ the model gets (4 options: gold, injected target, 2 distractors,
shuffled): "Which class best describes the main sound / main visual event?"
One answer + confidence. Establishes that the injected label does not move
humans; feeds the frontier's y-axis contrast.

### Rater quality items (hidden, ≥15% of items)
- **Anchors**: clearly-edited (visual-high + audio-high, gain 2×) and pristine
  clean clips from *outside* the test sources; pre-stated rule: anchor
  accuracy < 80% → exclude rater.
- **Attention checks**: "For this clip select Conspicuousness = 2" (2 per
  session).
- **Headphone screen** (Woods et al. 2017 antiphase tone test, 6 trials, ≥5
  correct) before Task A; audio rungs are meaningless on laptop speakers.
- **Playback integrity**: full visible unbuffered playback required
  (`visibilitychange` + `timeupdate` monitoring); replays allowed and logged.

---

## 3. Stimuli and design matrix / 素材与设计矩阵

Reuse the frozen model panels so every human number has a model number on
the same item:

| Condition (9) | Source | Model number already on disk |
|---|---|---|
| clean | S1 100-source panel | S1 / T1-H clean rows |
| harmless-AV (footprint-matched) | T1-H renderer | T1-H harmless arm |
| audio low / mid / high | S1 ladder | S1 base TF per rung |
| visual low / mid / high | S1 ladder | S1 base TF per rung |
| aligned-AV mid | S1 ladder | S1 AV-mid |

- 100 sources × 9 conditions = 900 items; each rater sees each **source at
  most once** (balanced Latin-square assignment, condition-balanced per
  rater), 40 test items + 6 anchors + 2 attention + 4 practice + 8 2AFC pairs
  ≈ 15 min.
- Target 3 valid ratings per item → 2,700 ratings / 40 = 68 raters; recruit
  90 to absorb ~20% exclusions. Prolific at ~$3.00 per 15-min session ≈
  **$300–350** incl. fees. Power: 100 items × 3 raters detects ~0.5-point
  Likert differences between adjacent rungs (bootstrap over items and raters);
  Task A "edited" rate CI half-width ≈ ±6 pp per condition.
- Uniform re-encode of ALL items (incl. clean) through the same ffmpeg
  chain (H.264 CRF 23, AAC 128k, −16 LUFS loudness normalization, 720p cap)
  so encoding artifacts cannot leak condition. Anonymized IDs
  `it_<8hex>` in a shuffled order; the mapping lives only server-side.
- Licensing: sources are AudioSet-derived YouTube clips; serve ≤10 s
  excerpts via **expiring signed URLs**, no download button, no public
  listing. Record the source decision in `SOURCE_DECISION.md` before the
  first upload.

---

## 4. Platform architecture / 平台架构

**Requirement set (user decision 2026-09-02):** must be either locally
hostable or GitHub-Pages hostable, trivially shareable by one URL, and
maintainable without a cloud account beyond what the lab already has.
Chosen stack: **GitHub Pages static frontend + Google Apps Script/Sheets
response backend + a second GitHub Pages repo for media, with a local-mode
adapter for self-pilots and lab sessions.** Same frontend, same JSONL export,
two interchangeable backends.

```
share ONE link:  https://cskyl.github.io/stealth-rate/?study=stealth_v1[&PROLIFIC_PID=...]
                                   |
              [Frontend SPA on GitHub Pages: repo cskyl/stealth-rate]
                |  GET  <apps-script>/exec?op=assign&study=..&pid_hash=..  -> block_id + item order
                |  POST <apps-script>/exec  {op:event|response, session, item, answers}   (append-only)
                |  GET  <apps-script>/exec?op=complete&session=..           -> completion code
                v
   [Google Apps Script web app]  --writes-->  [Google Sheet "stealth_v1": sessions | responses | events | blocks]
                                              [Google Sheet "KEY_DO_NOT_SHARE": item -> condition]  (never read by any client op)
   media: https://cskyl.github.io/stealth-rate-media/it_<8hex>.mp4   (repo cskyl/stealth-rate-media, ~0.5 MB/clip, 480p, ≤10 s)

   local mode: python tools/serve_local.py  -> http://127.0.0.1:8765  (same SPA; responses -> local/responses.jsonl)
```

**Why this and not Cloudflare/Supabase.** Zero new vendors: the lab already
has the `cskyl` GitHub account with the Pages recipe (memory
`ref_github_pages_deploy`) and a Google account (the `gdrive_mllm_new`
remote). Apps Script is free, gives a real server-side endpoint (assignment,
completion codes, key isolation) in ~150 lines, and the Sheet doubles as the
live admin view. Sharing is one URL; Prolific just appends its query params.
Limits that are acceptable at our scale: Apps Script ~20k URL-fetch calls/day
and ~6 min/execution (we make ≤60 calls per rater), Pages ~100 GB/month
bandwidth (90 raters × 40 clips × 0.5 MB ≈ 2 GB), Pages repo ≤1 GB (900
clips at 480p/CRF 26 ≈ 450 MB; keep media in its own repo so the app repo
stays small). Concurrency is fine at ≤50 simultaneous raters; Apps Script
`LockService` serializes block assignment.

**Answer-key isolation under a static frontend.** `items.json` in the public
repo carries only `it_<8hex>`, media URL, duration, role-agnostic fields.
Condition labels live only in the private `KEY_DO_NOT_SHARE` sheet and the
offline `answer_key_DO_NOT_SHOW_RATERS.json`; no Apps Script op ever returns
them. Anchor/attention items are indistinguishable from test items on the
client (their scoring happens offline). CI greps the built bundle for
condition strings.

**Local mode.** `tools/serve_local.py` (stdlib `http.server`, no
dependencies) serves the same `dist/` and implements the same three ops
against `local/<study>/{sessions,responses,events}.jsonl`. Used for the
self-pilot, for in-lab sessions on one laptop, and for CI. Sharing beyond the
LAN in local mode is possible with `cloudflared tunnel --url
http://127.0.0.1:8765` (no account needed) but is not the production path.

**Frontend:** vanilla TypeScript + Vite (static `dist/`, relative paths so
the `/stealth-rate/` subpath works), single `study.json` per study
describing screens; components: `Consent`, `HeadphoneCheck`, `Practice`,
`Trial(video, form)`, `Pair2AFC`, `Progress`, `Completion`.
Keyboard-accessible; desktop + headphones enforced for audio rungs; EN/ZH
strings in `i18n/`. Auto-deploy on push via the Pages workflow.

**Sheet schema (one spreadsheet per study version):**
- `blocks(block_id, item_order_json, n_assigned, n_completed)`
- `sessions(session_id, study, block_id, pid_hash, ua_hash, started_at, finished_at, status, completion_code)`
- `events(session_id, ts, type, item_id, payload_json)` — playback, visibility, replays
- `responses(session_id, item_id, task, answers_json, rt_ms, replay_count, submitted_at)` — append-only; duplicates resolved offline by first-submit
- `KEY_DO_NOT_SHARE` (separate spreadsheet, not the study sheet): `item_id, cond_id, source_id, rung, role`

**Assignment:** `op=assign` takes `LockService`, picks the block with the
smallest `n_assigned − n_completed·0` tie-broken by `n_completed`, marks a
30-min reservation (expired reservations are reclaimed by a time-driven
trigger), one block per `pid_hash`; hard cap on sessions per study.

**Prolific flow:** URL params → consent → headphone check → practice →
trials → `op=complete` returns `HMAC-SHA256(session_id, secret)[:8]` computed
in Apps Script; failed screens get a distinct "return submission" code.

**Admin view:** the study Sheet plus a `Dashboard` tab (formulas: coverage
per block/item, anchor accuracy per session, attention pass, median RT,
replay counts, exclusion preview under the pre-stated rule). Offline
`tools/export_and_analyze.py` pulls the sheet as CSV (published-CSV URL or
`gspread` service account), writes `EXPORT_RECEIPT.json` (sheet id, row
counts, SHA-256) and runs `analyze_human_scores.py`.

**Maintainability rules:** a study is a frozen `studies/<slug>/study.yaml` +
`items.json` + offline `key.json` with SHA-256s; any change → new version
slug and new Sheet; Apps Script source is versioned in the repo
(`backend/apps_script/Code.gs`) and deployed with `clasp push` so the
backend is reproducible; `make smoke` runs the full flow in local mode on 6
placeholder items; no personal data stored (PID hashed with a per-study
salt; no IP retained).

**Frontend:** vanilla TypeScript + Vite (no framework lock-in), single
`study.json` describing screens; components: `Consent`, `HeadphoneCheck`,
`Practice`, `Trial(video, form)`, `Pair2AFC`, `Progress`, `Completion`.
Keyboard-accessible, mobile-blocked for audio rungs (desktop + headphones
required; enforced by screen size + headphone check), bilingual EN/ZH
strings in `i18n/`.

**Data model (D1):**
- `studies(study_id, version, config_sha256, status, created_at)`
- `items(item_id, study_id, media_key, duration_s, sha256, role[test|anchor|attention|practice], cond_id_encrypted)`
- `blocks(block_id, study_id, item_order_json, n_assigned, n_completed)`
- `sessions(session_id, study_id, block_id, prolific_pid_hash, ua_hash, started_at, finished_at, status, completion_code)`
- `events(session_id, ts, type, item_id, payload_json)` — playback, visibility, replays, timing
- `responses(session_id, item_id, task, answers_json, rt_ms, replay_count, submitted_at)` — **append-only**
- `key(study_id, item_id, cond_id, source_id, rung)` — **separate table, never joined by any public endpoint**

**Assignment:** Worker picks the block with the fewest completed sessions
(with in-flight reservation TTL 30 min); one block per Prolific PID (hash);
reserves released on abandonment; hard cap on total sessions per study.

**Prolific flow:** URL params captured → consent → headphone check →
practice → trials → completion code (HMAC-SHA256(session_id, secret)[:8]);
rejected screens (failed headphone check) get a "return submission" code.
Compensation and duration promised only after the self-pilot timing.

**Admin dashboard:** per-condition and per-item coverage, rater quality
(anchor accuracy, attention pass, median RT, replay counts), exclusion
preview under the pre-stated rule, live α on anchors only (never on test
conditions before unblinding), one-click JSONL export with study hash.

**Maintainability rules:** a study is a frozen `studies/<slug>/study.yaml` +
`items.json` + `key.json` with SHA-256s; changing any of them creates a new
`version`; old exports stay readable; schema migrations are numbered SQL
files; a `make smoke` runs the whole pipeline on 6 placeholder items locally
(Miniflare/wrangler dev); no personal data stored (PID hashed with a
per-study salt; no IP retained beyond a 24-h abuse window).

---

## 5. Blinding, quality, and analysis / 盲化、质量与分析

- Answer key isolation: `key` table + local `answer_key_DO_NOT_SHOW_RATERS.json`
  outside the repo; the SPA bundle is grep-tested for condition strings in CI.
- Order: per-rater permutation from block seed; seeds exported.
- Analysis (`analyze_human_scores.py`, extends the existing skeleton), fixed order:
  1. integrity (all items per session, duplicates, playback completeness);
  2. rater quality + pre-stated exclusions;
  3. agreement: Krippendorff α (interval for Likert, nominal for Yes/No) overall and per condition — α < 0.4 → instrument failed, report it;
  4. unblind;
  5. per-condition stats with item × rater bootstrap; d′ for 2AFC; human MCQ accuracy;
  6. **frontier figure**: x = human "edited" rate (and conspicuousness), y = model target-following (S1/T1-H JSON), one point per condition with CIs; overlay Qwen base, clean-SFT, attack-SFT;
  7. score the preregistered predictions; output `human_eval/_analysis/human_study_stealth_v1.json`.

---

## 6. Governance / 治理与合规（必须先于任何真人接触）

1. **BU HRPP/IRB**: submit an exempt-category determination (anonymous
   perceptual ratings, adults, minimal risk, mild deception that some clips
   are unmodified → debrief text). Use `human_stealth_v1/ADVISOR_HRPP_DECISION_CHECKLIST_20260801.md`
   as the checklist; the advisor must sign off. Typical turnaround 1–3 weeks.
2. Consent + privacy + withdrawal + contact text in the SPA `Consent` screen;
   Prolific's own consent flow in addition.
3. Media rights: ≤10 s excerpts, signed URLs, no redistribution; log the
   decision.
4. Self-pilot by the project team on real media (timing, instruction
   ambiguity), then a 10-rater Prolific pilot (separate study version) before
   the main run. Pilot responses are never pooled with the main study.
5. Preregistration hash (predictions JSON) recorded in FINDINGS_LOG before
   the first external response.

---

## 7. What it buys and when / 对论文的收益与时间

| Scenario | Effect on the ICLR paper |
|---|---|
| Landed before 09-20 (needs HRPP by ~09-12) | Fig. "human noticeability vs model redirection" in §attack; closes COLM KwTK(1)/DvN4(3); est. +5–8 pp P(accept) |
| Landed during rebuttal | strongest possible rebuttal asset against "trivial threat model" |
| Landed after | camera-ready or next venue; also reusable for FakeAudioBench human arms |

It never substitutes for P0/P1 in `ICLR2027_RESUBMIT_REVIEW_AND_UPLIFT_PLAN_20260902.md`.

---

## 8. Timeline (calendar days, parallel to P0–P3)

| Day | Milestone |
|---|---|
| 0–1 | HRPP packet drafted from checklist; advisor decision; Cloudflare/Prolific accounts (user) |
| 1–4 | codex WO-H1..H3: repo scaffold, study compiler, backend + schema, smoke on placeholders |
| 4–6 | WO-H4/H5: rater flow + admin dashboard; local QA in Chrome/Firefox; a11y pass |
| 6–7 | Real-media build (900 items, uniform encode, signed URLs); self-pilot; timing |
| HRPP+0 | 10-rater Prolific pilot (v0.9) → fix instructions → freeze v1.0 + prereg hash |
| HRPP+2..5 | Main run (90 raters); daily dashboard check; no mid-run edits |
| HRPP+6 | analysis JSON, frontier figure, FINDINGS_LOG entry, calibration re-judge |

---

## 9. Codex work orders / 交给 codex 的实现工单（bounded, each with acceptance tests）

Routing per CLAUDE.md: Luna `medium` default; `high` for WO-H3 (backend/security). Every WO returns: files, commands run, test output, and an honest list of what was NOT verified.

**WO-H1 — Repo scaffold + study compiler (medium).** `human_stealth_platform/` with `frontend/` (Vite+TS), `backend/cloudflare/` (wrangler), `tools/build_study.py`, `studies/example/study.yaml`. `build_study.py` consumes a YAML + panel manifests (S1/T1-H JSON paths) → `items.json` (anonymized, shuffled), `blocks.json` (Latin-square, condition-balanced, seeds), `key.json` (written outside repo path given by `--key-out`). Tests: determinism under fixed seed; each source ≤1 per block; condition balance ±1; no condition string in `items.json`; 6-item placeholder study builds.

**WO-H2 — Media pipeline (medium).** `tools/encode_media.py`: uniform ffmpeg chain (480p cap, H.264 CRF 26, AAC 96k, −16 LUFS), ≤10 s trim policy, SHA-256 receipts, output straight into the `stealth-rate-media` repo working tree with a size budget check (< 900 MB total) and `--dry-run`. Tests: identical encoder settings across conditions (ffprobe), loudness within ±1 LU, no original filename or condition string in file names, total size under budget.

**WO-H3 — Backends (high).** (a) `backend/apps_script/Code.gs` + `appsscript.json` + `clasp` deploy notes: ops `assign` (LockService, reservation, one block per pid_hash, cap), `event`, `response` (append-only, idempotent by (session,item,task)), `complete` (HMAC code); per-study salt in Script Properties, never in the repo; a time-driven trigger reclaims expired reservations. (b) `tools/serve_local.py` implementing the identical three ops on JSONL (stdlib only). (c) `frontend/src/backend/{appsScript,local}.ts` behind one `BackendAdapter` interface, selected by `study.json`. Tests: assignment balance under 200 simulated sessions (local mode, and an Apps Script test deployment with a throwaway sheet); reservation expiry; no op returns `cond_id` (assert on a key-bearing test study); replay-safe writes; export JSONL schema fixed and versioned; `no-cors` POST fallback verified from a Pages origin.

**WO-H4 — Rater frontend (medium).** Screens in §4; full-playback gate; headphone check; practice with feedback; Task A/A′/B forms; progress; completion code; EN/ZH strings; desktop-only guard. Tests: Playwright flow on placeholders in Chrome + Firefox; keyboard-only completion; bundle grep for banned construct terms and condition labels; Lighthouse a11y ≥ 90.

**WO-H5 — Admin dashboard + export (medium).** Coverage, quality, exclusion preview, α on anchors, JSONL export + `EXPORT_RECEIPT.json` (study hash, counts). Tests: export round-trips into `analyze_human_scores.py` on synthetic data.

**WO-H6 — Analysis + prereg tooling (medium).** Extend `stealth_operating_point_v2/human_eval/analyze_human_scores.py` to the schema; frontier figure script joining S1/T1-H model JSONs; `prereg_hash.py`. Tests: synthetic data with known α and known condition effects reproduces them; predictions scoring table.

**WO-H7 — Security/privacy audit + self-pilot receipt (high, different actor than H3).** Threat model (key leakage, scraping media, duplicate PIDs, replay), fixes, and a written self-pilot timing receipt. Deliverable: `AUDIT_<date>.md` with pass/fail per item.

Acceptance for the whole package: `make smoke` green; codex round review `SHIP_PLATFORM_ONLY` (no media, no raters); then the governance gate (§6) decides collection.

---

## 10. Decisions that are the user's / 需要用户决定的事项

1. ~~Backend vendor~~ **Decided 2026-09-02: GitHub Pages + Google Apps Script/Sheets, with local mode.** Still needed from the user: create the two repos (`stealth-rate`, `stealth-rate-media`) or approve reuse of an empty placeholder repo, and one Google account to own the Sheets/Apps Script deployment.
2. Recruitment: Prolific (recommended, ~$350 for 90 raters) vs lab/friends (cheaper, slower, less independent).
3. HRPP submission timing and advisor sign-off (gates everything).
4. Whether to include Task B (human MCQ) — adds 3 min per rater but gives the cleanest "humans are not redirected" contrast.
