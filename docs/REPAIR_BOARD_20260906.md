# StealthRate playback and response repair

User authorized fixing existing problems. Bounded software repair supporting a scientific human-study platform; no new study design, recruitment, real-data collection, or dataset generation. Parent Goal NONE. Existing dirty `tools/analyze_human_scores.py` and `tests/test_analysis.py` belong to previous work and must be preserved. No commit/push/public deploy without explicit permission under workspace rules.

| Work order | Owner/model | Exclusive scope | Acceptance | State |
|---|---|---|---|---|
| UI-REPAIR | Luna high | frontend/src/app.ts, media.ts, screens/*.ts, forms.ts, i18n/*, styles.css, tests/flow.test.mjs | Visible video in practice/trial, genuine playback unlock, clear media errors, no destructive rerenders, dependable start/complete flow | INTEGRATED; browser acceptance below |
| SAVE-REPAIR | Luna medium | frontend/src/state.ts, backend/payload.ts, backend/types.ts; new persistence tests; tools/export_and_analyze.py and new export tests | Scoped durable payload storage, format-compatible import, refresh/completed-session recovery API, no data wiping | ACCEPTED; runtime tests passed |
| BROWSER-QA | Luna high, final harness corrections/main integration | tools/browser_smoke*, docs/qa_20260906/* and isolated QA environment/staging | Actual Firefox/Chromium playback and download proof from isolated localhost, no prod writes or private data | ACCEPTED on Chrome; Firefox limitation below |
| Integration | main | README/docs/build artifacts and cross-file fixes after ownership release | Review diffs, run tests/build/browser smoke, release handoff; distinguish local repair from public version | PUBLISHED with user approval |

Budget: three workers, one implementation pass + bounded repair; main retains safety and final acceptance. No recursive workers. No calls to real collection endpoints; no make smoke/reset or regenerate source stimuli. Browser tool installation, if needed, only under isolated project QA directory, not shared environments. Stop on repeated same blocker after two attempts and return exact evidence.

## Integrated local changes

- Practice now contains a real video; the landing page also has a practice-only preview with native controls.
- Practice/trial show playback state, a visible failure message and a direct clip link. Real played ranges unlock progression; completion does not destroy the video.
- Payload answers and completed downloads persist in study/version/anonymous-participant-scoped browser storage. Duplicate restore and failed-completion retry regressions are covered.
- The importer accepts the actual downloaded gzip, Base64 text and JSON, rejects malformed input, and deduplicates identical session bundles.
- The local server routes Vite assets correctly and refuses private/source paths. Repeated local assignment includes the item list.
- Left/right device-check tones now use only one channel. This is not a validated headphone screening instrument.
- Playback-bypass test hooks require both a loopback host and explicit test flag, not merely a public query parameter.

Main reran: frontend typecheck/lint and flow (1 pass); runtime persistence (3 passes); Python payload import (4), public assets (3), local backend (2), HTTP simulation (1), all passing. The flow test uses simulated media completion and is **not** proof of real decoding. Browser QA is recorded separately below.

Release boundary: local source/build only. No git commit, push, public deployment, real participant records, or formal stimulus release. Pre-existing analyzer changes remain untouched. Request for publication approval is outstanding.

**Superseding release update:** User subsequently explicitly approved commit/push. Repair commit `b8385c1` pushed to `cskyl/stealth-rate`; Pages run `34058109785` completed successfully. Main verified the live homepage loads entry `index-yvhogD_N.js` and actually plays the 854×480 practice video to completion in Chrome, with native controls and no public test hook. Source-only `study.yaml` now returns HTTP 404 from Pages. Live receipt is local `docs/qa_20260906/live_preview/receipt.json`. No original rating workbook, private study key or new research media was published; unrelated dirty analyzer edits remain untouched.

## Browser acceptance

Canonical receipt: `qa_20260906/accepted_chrome/BROWSER_SMOKE_20260906.json`.
Real headless Chrome decoded four unmodified 8-second MP4s at 854×480: two practice and two rated clips. The isolated HTTP fixture truncated each block to four items; local test mode made device-check routing deterministic, but no media completion was fabricated. This is a software smoke test, not a full participant session or human hearing validation.

The test exercised an intentional media 404 with visible error/direct-link fallback, reload between trials, a downloaded raw gzip containing all four response rows, and completed-page refresh restoring the same bundle. Main separately imported the actual downloaded file using `payload_files`: one session/four rows passed. Main inspected a mid-play screenshot with a visible orange square (`06_trial1_played_mid.png`). Practice clips blink and can be visually blank during their off phase. No source clips were regenerated.

Chrome flow reported no captured JS exceptions. This is not exhaustive browser/device compatibility: the SCC system Firefox failed MP4 decoding. Earlier `baseline_old*`, `final*`, and `chrome_final*` folders are diagnostic attempts, NOT accepted final evidence. `QA_BLOCKER_SCOPE.md` describes an earlier integration defect since resolved. No request was sent to a real collection backend.
