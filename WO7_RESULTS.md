# StealthRate v0 — WO-7 results

## Commands run

```text
python3 tools/build_study.py studies/sample_synthetic_v0/study.yaml
python3 tools/make_sample_media.py studies/sample_synthetic_v0/study.yaml --measure-existing
python3 -m unittest discover -s tests -p 'test_*.py' -v
make smoke
```

The study rebuild preserved all item IDs. Public options are four distinct
role classes for all 79 items, and the private key covers all public items.
The existing 79 MP4s were not regenerated. Their receipt now contains numeric
ffmpeg loudnorm second-pass measurements and `tts_cues` provenance; existing
cue media is recorded as `fallback`.

## Verbatim test tail

```text
test_known_nominal_alpha (test_analysis.AnalysisTest.test_known_nominal_alpha) ... ok
test_blocks_balance_and_key_coverage (test_build_study.BuildStudyTest.test_blocks_balance_and_key_coverage) ... ok
test_deterministic_and_blinded (test_build_study.BuildStudyTest.test_deterministic_and_blinded) ... ok
test_options_are_distinct_and_contain_gold_and_injected (test_build_study.BuildStudyTest.test_options_are_distinct_and_contain_gold_and_injected) ... ok
test_inventory_and_size (test_sample_media.SampleMediaTest.test_inventory_and_size) ... ok
test_uniform_params_and_duration (test_sample_media.SampleMediaTest.test_uniform_params_and_duration) ... FAIL
test_balanced_assignments_and_expiry (test_serve_local.LocalBackendTest.test_balanced_assignments_and_expiry) ... ok
test_response_is_idempotent (test_serve_local.LocalBackendTest.test_response_is_idempotent) ... ok
test_three_raters_over_http (test_simulate_http.HttpSimulationTest.test_three_raters_over_http) ... skipped 'HTTP bind denied; direct path remains covered: [Errno 1] Operation not permitted'

======================================================================
FAIL: test_uniform_params_and_duration (test_sample_media.SampleMediaTest.test_uniform_params_and_duration)
----------------------------------------------------------------------
Traceback (most recent call last):
  File ".../tests/test_sample_media.py", line 32, in test_uniform_params_and_duration
    self.assertTrue(all(abs(value + 16.0) <= 1.5 for value in loudness))
AssertionError: False is not true

----------------------------------------------------------------------
Ran 9 tests in 0.427s

FAILED (failures=1, skipped=1)
```

`make smoke` passed with `SIMULATOR_PATH=direct (HTTP bind unavailable)` and
`SMOKE_OK`. Focused builder/backend tests passed; the HTTP test is present but
skips when loopback binding is denied.

## Not verified / coordinator follow-up

- The preserved legacy MP4 set does not satisfy the new ±1.5-LU loudness gate;
  coordinator must regenerate/re-encode media with network gTTS and uniform
  loudnorm outside this sandbox, then rerun the full suite.
- HTTP server execution was not verified here because loopback bind is denied.
- No real gTTS generation, browser interaction, Apps Script deployment, or
  human study was verified.
- No commit or push was performed.
