# StealthRate v0 work-order results

Implemented WO-1 through WO-6 without committing. The coordinator remains
responsible for the eventual commit.

## Commands run

```text
python3 tools/build_study.py studies/sample_synthetic_v0/study.yaml
python3 -m unittest discover -s tests -p 'test_*.py' -v
PATH=/share/pkg.8/nodejs/20.12.2/install/bin:$PATH /projectnb/ivc-ml/tianle/anaconda3/envs/qwen5_save/bin/python tools/make_sample_media.py studies/sample_synthetic_v0/study.yaml
make smoke
make test
PATH=/share/pkg.8/nodejs/20.12.2/install/bin:$PATH node tests/bundle_grep.mjs
```

## Final receipts

- `make smoke`: passed and printed `SMOKE_OK`; exported analysis at
  `exports/sample_synthetic_v0/20260902T064945Z/analysis.json`.
- `make test`: passed 7 Python tests and `BUNDLE_GREP_OK (4 files scanned)`.
- Sample media: 79 MP4 files, 4.745339393615723 MiB according to
  `studies/sample_synthetic_v0/MEDIA_RECEIPT.json`, below the 60 MB limit.
- Public build artifacts: 12 test sources, 2 separate source rows for quality
  clips, 72 test items, 79 public items, 6 balanced blocks.
- No git commit or push was performed.

## Verbatim final output tails

### `make smoke`

```text
transforming...
✓ 9 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.38 kB │ gzip: 0.29 kB
dist/assets/index-BMWYdyA9.css   1.09 kB │ gzip: 0.58 kB
dist/assets/index-D6-RGaHQ.js   14.84 kB │ gzip: 6.11 kB
✓ built in 110ms
set -e; \
python3 tools/serve_local.py --study sample_synthetic_v0 --port 8765 >/tmp/stealth-rate-serve.log 2>&1 & server=$!; \
trap 'kill $server 2>/dev/null || true' EXIT; \
sleep 1; \
if kill -0 $server 2>/dev/null; then echo 'LOCAL_SERVER_STARTED'; else echo 'LOCAL_SERVER_UNAVAILABLE_IN_SANDBOX'; fi; \
python3 tools/simulate_raters.py --study sample_synthetic_v0 --n 12 --backend local --reset; \
python3 tools/export_and_analyze.py --study sample_synthetic_v0 --source local; \
test -f $(find exports/sample_synthetic_v0 -name analysis.json -print | sort | tail -1); \
kill $server 2>/dev/null || true; echo 'SMOKE_OK'
LOCAL_SERVER_UNAVAILABLE_IN_SANDBOX
exports/sample_synthetic_v0/20260902T064945Z
SMOKE_OK
```

### `make test`

```text
transforming...
✓ 9 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.38 kB │ gzip: 0.29 kB
dist/assets/index-BMWYdyA9.css   1.09 kB │ gzip: 0.58 kB
dist/assets/index-D6-RGaHQ.js   14.84 kB │ gzip: 6.11 kB
✓ built in 109ms
python3 -m unittest discover -s tests -p 'test_*.py' -v
test_known_nominal_alpha (test_analysis.AnalysisTest.test_known_nominal_alpha) ... ok
test_blocks_balance_and_key_coverage (test_build_study.BuildStudyTest.test_blocks_balance_and_key_coverage) ... ok
test_deterministic_and_blinded (test_build_study.BuildStudyTest.test_deterministic_and_blinded) ... ok
test_inventory_and_size (test_sample_media.SampleMediaTest.test_inventory_and_size) ... ok
test_uniform_params_and_duration (test_sample_media.SampleMediaTest.test_uniform_params_and_duration) ... ok
test_balanced_assignments_and_expiry (test_serve_local.LocalBackendTest.test_balanced_assignments_and_expiry) ... ok
test_response_is_idempotent (test_serve_local.LocalBackendTest.test_response_is_idempotent) ... ok

----------------------------------------------------------------------
Ran 7 tests in 0.449s

OK
PATH=/share/pkg.8/nodejs/20.12.2/install/bin:$PATH node tests/bundle_grep.mjs
BUNDLE_GREP_OK (4 files scanned)
```

## Not verified

- The exact `npm run typecheck` and `npm run build` scripts were not run because
  npm install failed on this host (registry DNS/permissions); the source was
  checked with the shared TypeScript 5.9.3 compiler and built with the shared
  Vite 5.4.21 binary.
- Browser execution, keyboard navigation, media rendering in a real browser,
  headphone perception, and payload download/copy UI were not verified with a
  headless or interactive browser.
- The local HTTP server socket was not verified in this sandbox because binding
  port 8765 returned `PermissionError`; the smoke used the direct local-store
  path after recording that limitation.
- Apps Script deployment, Google Sheets headers, CORS behavior, Script
  Properties, HMAC completion codes, and Prolific integration were not verified
  against a live Google account.
- Real gTTS audio was not verified: the host could not reach the gTTS service,
  so generated sample cues used the deterministic voiced-tone fallback.
- No human-subject study, IRB/HRPP determination, real participant data,
  preregistered prediction scoring, or scientific claim was verified.
