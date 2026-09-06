# Human instructions and approved repair release — 2026-09-06

User approved commit/push of the prior repair and requested improved human-label instructions using an existing audibility sample/workbook. No authorization to publish private raw ratings or third-party research stimuli. Parent Goal NONE; bounded release/documentation task, no collection.

| ID | Owner / route | Scope | Acceptance | Status |
|---|---|---|---|---|
| REFERENCE | Luna medium | Read-only supplied sample/workbook; private report under project guide folder | Summarize instrument and usability gaps without identifiers/raw individual ratings | ACCEPTED / INTEGRATED |
| RELEASE | main | Select prior repair files, secrets preflight, commit/push, live verification | Public built page and media confirmed; unrelated dirty analyzer preserved | PUBLISHED; repair b8385c1, instructions aa4c150, test fix 9af84f4 |
| INSTRUCTIONS | Luna medium UI and reference/docs workers; main review | Public neutral participant guidance, local bilingual advisor/operator guide | Accurate field anchors, playback/save steps, worked examples; no study-key disclosure | ACCEPTED / INTEGRATED |

At most three workers; no recursive delegation. Existing ratings remain immutable. Demo may be tested, but formal participant collection requires owner-approved protocol and materials. Main owns scientific/governance decisions and final acceptance.

## Acceptance and boundaries

Public review entry: https://cskyl.github.io/stealth-rate/?guide=1 . Guide is accessible from the landing page without bypassing consent or study assignment. Includes EN/ZH anchored instructions, invented examples, recovery/manual-return guidance and explicit rating choices with unchanged payload fields.

Real Chrome 2-practice/2-trial test passed after the rating-control change: `docs/qa_20260906/instructions_acceptance/BROWSER_SMOKE_20260906.json` (local QA artifact). Complete playback, intentional rating selection, middle-session refresh, download and completed-session recovery passed. A later one-tick completion assertion in the jsdom test failed intermittently because gzip encoding is asynchronous; replaced with a bounded wait, retained response-count assertions, and passed five consecutive runs. No production playback gate was weakened.

Live Pages run `34058831765` succeeded for `9af84f4`; live Chrome preview decoded the clip to completion and verified the expanded guide/no public test hook. Entry JS `index-DU-z-Cha.js`; local receipt `docs/qa_20260906/live_preview/receipt.json`. SCC Firefox decoding remains unverified/failed; do not generalize to every browser.

Private owner materials in the project's `upgrade_results_report/human_study_guide/`: EN/ZH advisor guide, updated Chinese walkthrough, and blank `Audio_Labeling_Template.xlsx`. Template's audio intelligibility 0–5 is a separate proposed instrument, NOT the current web 1–5 conspicuousness scale. No answer key, real ratings or reference videos were copied into the public app. Future A/B/C independent cohorts and real-material collection are not implemented by this release.
