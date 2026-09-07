# Apps Script v2 private receiver

This packet is a receiver only. It has no result-read endpoint: `doGet` returns only a generic health/version response and `doPost` is the sole mutating entry point.

## Owner setup

1. Create a private Google Sheet owned by the study owner.
2. Set Script Properties `STUDY_SHEET_ID`, `STUDY_ID=human_real_stealth_v2`, and `STUDY_VERSION=2.0.0-pilot`.
3. Run `initializeTabs()` once from the owner account. It creates/initializes `invitations`, `responses`, and `sessions`; it never generates invitations or credentials.
4. Deploy as a Web App only after owner Google consent. The sheet remains private; the web app accepts only valid invitation tokens.

The invitations tab is owner-populated with `invite_sha256`, `annotator_id`, `block_id`, `item_order_json`, and `enabled`. `item_order_json` is an array of item IDs or `{item_id, practice}` objects; practice items are excluded from accepted responses.

## POST contract

```json
{"op":"sync","study_id":"human_real_stealth_v2","version":"2.0.0-pilot","invite_token":"32 lowercase hex characters","bundle":{"session":{"study_id":"human_real_stealth_v2","version":"2.0.0-pilot","session_id":"...","block_id":"..."},"events":[],"responses":[{"session_id":"...","item_id":"...","task":"edit","answers":{"edited":"yes","noticed":["on_screen_text","added_speech"],"audio_clarity":3,"visual_readability":2,"conspicuousness":3,"naturalness":4,"confidence":2,"comment":null,"technical_issue":null},"rt_ms":1200,"replay_count":0}]}}
```

The exact response-sheet header order is: `invite_sha256, annotator_id, session_id, block_id, item_id, task, edited, noticed, audio_clarity, visual_readability, conspicuousness, naturalness, stealth_display, confidence, comment, technical_issue, rt_ms, replay_count, answers_json, stored_at`. `noticed` is stored as JSON when it is an array. `stealth_display` is `6 - conspicuousness` only; it is never an average.

The complete request is validated before writes. A token is hashed server-side; raw tokens are never stored. `LockService` protects re-read, deduplication, response append, and session summary. Identical retries are idempotent; conflicting answers or a second session for an invitation are rejected. Formula-leading strings are escaped before Sheets writes. Technical failures require a nonempty reason and all ratings null. Maximum body size is 256 KB and maximum response count is the assigned rated-item count capped at 12.

Response is only `{ok:true,ack_response_count:N}` on success; `N` counts newly stored responses, not echoed answers or secrets.
