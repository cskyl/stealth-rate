# Data contracts

All files are UTF-8 JSON/YAML/JSONL. Ids are opaque strings. Times are ISO-8601 UTC.

## `studies/<slug>/study.yaml` (authored)

```yaml
study_id: sample_synthetic_v0
version: "0.1.0"
title: "Do you notice anything unusual?"
languages: [en, zh]            # UI strings; rater picks
backend:
  mode: payload                # payload | apps_script | local
  apps_script_url: ""          # required when mode == apps_script
media_base_url: "media/sample_synthetic_v0/"   # relative to site root or absolute
requirements:
  desktop_only: true
  headphone_check: true        # antiphase tone test, 6 trials, >=5 correct
  full_playback_before_answer: true
design:
  sources: 12                  # independent source clips
  conditions: [clean, harmless_av, audio_low, audio_high, visual_low, visual_high]
  items_per_rater: 12          # each source at most once per rater, conditions balanced
  anchors_per_rater: 2         # from anchors/ (outside test sources)
  attention_per_rater: 1
  practice_items: 2
  pairs_2afc_per_rater: 0      # optional Task A'
  target_ratings_per_item: 3
  block_seed: 20260902
tasks:                         # order shown per item
  - id: mcq                    # Task B (human answer)
    prompt_audio: "Which sound is present in this clip?"
    prompt_visual: "Which motion is shown in this clip?"
    confidence: [1, 2, 3]
  - id: edit                   # Task A
    fields:
      edited: {type: yesno, prompt: "Does this clip appear to have been deliberately edited or modified (text added on screen, or speech added to the sound)?"}
      confidence: {type: likert, min: 1, max: 3}
      noticed: {type: multiselect, options: [on_screen_text, added_speech, other], when: "edited == yes"}
      conspicuousness: {type: likert, min: 1, max: 5, anchors: ["noticed nothing", "immediately obvious"]}
      naturalness: {type: likert, min: 1, max: 5, anchors: ["very unnatural", "fits completely"]}
text:
  consent_md: consent.md       # files next to study.yaml
  instructions_md: instructions.md
  debrief_md: debrief.md
prolific:
  completion_code_secret_env: STEALTHRATE_SECRET   # apps_script only
```

## `studies/<slug>/items.json` (built, PUBLIC — no condition information)

```json
{"study_id": "...", "version": "...", "items": [
  {"item_id": "it_3fa9c1e2", "media": "it_3fa9c1e2.mp4", "duration_s": 8.0,
   "role": "audio", "question": "Which sound is present in this clip?",
   "options": ["bell", "drum", "hiss", "siren"], "practice": false,
   "practice_feedback": null}
]}
```
`role` is the question role only (audio/visual question), never the attack channel.
Anchor and attention items look identical to test items; the attention item's
instruction is embedded in its question text.

## `studies/<slug>/blocks.json` (built, PUBLIC)

```json
{"study_id": "...", "version": "...", "seed": 20260902,
 "blocks": [{"block_id": "b00", "items": ["it_...", "..."]}]}
```
Order inside a block is the presentation order for that block. Every block:
each source ≤ 1, conditions balanced ±1, anchors and attention interleaved at
fixed relative positions, practice items first.

## `studies/<slug>/private/key.json` (built, PRIVATE — git-ignored)

```json
{"study_id": "...", "version": "...", "sha256_items": "...",
 "items": {"it_3fa9c1e2": {"source_id": "src_07", "cond_id": "audio_low",
   "role_kind": "test|anchor|attention|practice", "gold": "drum",
   "injected": "bell", "rung": "low", "channel": "audio",
   "expected": null}}}
```
`expected` is set for anchors (`"edited": "yes"|"no"`) and attention items
(the forced answer).

## Response event stream (all backends) — `responses.jsonl`

One JSON object per line, append-only:

```json
{"schema": "stealthrate.response.v1", "study_id": "...", "version": "...",
 "session_id": "s_...", "block_id": "b03", "item_id": "it_...", "task": "mcq|edit|pair",
 "answers": {"choice": "drum", "confidence": 2},
 "rt_ms": 4821, "replay_count": 0, "playback_complete": true,
 "submitted_at": "2026-09-02T18:00:00Z"}
```

`sessions.jsonl`: `{schema: "stealthrate.session.v1", session_id, study_id, version,
block_id, pid_hash, ua_hash, lang, started_at, finished_at, status:
"started|screened_out|completed|abandoned", headphone_check: {correct, total},
completion_code}`.

`events.jsonl`: `{schema: "stealthrate.event.v1", session_id, ts, type:
"play|pause|ended|visibility_hidden|visibility_visible|replay|screen", item_id,
payload}`.

`payload` mode bundles `{session, events[], responses[]}` into one JSON the rater
downloads or copies (base64 of gzip); `tools/export_and_analyze.py --source
payload <dir>` ingests any number of such files.

## Export receipt

`exports/<study>/<ts>/EXPORT_RECEIPT.json`: `{study_id, version, source,
n_sessions, n_responses, n_events, sha256: {responses, sessions, events}}`.

## Analysis output

`exports/<study>/<ts>/analysis.json`: integrity → rater quality (anchor
accuracy, attention pass, exclusion rule applied) → agreement (Krippendorff α)
→ unblind (reads key.json) → per-condition stats with item × rater bootstrap
→ prediction scoring if `studies/<slug>/prereg.json` exists.
