# Short rating flow — 6 September 2026

User requested a convenient, casual page with a little instruction and no
extra tests. For the v2 real-video pilot the entry page now combines a short
guide and voluntary/privacy notice; Agree & start rating opens formal video
1 immediately. Examples and detailed anchors are optional collapsed help.
There are no mandatory practice, device or headphone screens. Progress counts
formal videos only. Existing assigned items and saved answers are preserved.

Numeric anchors, ratings, media, backend schema, blinding and technical-failure
handling are unchanged. Submitted answers still save locally; download remains
available. The completion response code is collapsed. Sync retry is only shown
when an active collector has pending work. Cloud collection still needs owner
deployment; this UX update does not activate it.

Implementation: Luna medium worker; main integrated privacy/legacy/progress
corrections. Typecheck/build passed. One short local browser smoke played a
real clip, submitted a dummy rating, and resumed at the next clip after refresh.
Receipt: `docs/qa_20260906/simple_flow/receipt.json`. No human returns collected.
The earlier mandatory-practice browser harness is historical, not the current
entry-flow contract. Main smoke: `tools/browser_simple_smoke.py`.
