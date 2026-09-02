# StealthRate v0 — WO-8 results

Implemented WO-8 without committing and without regenerating any media. The
coordinator must run `make_sample_media.py` with network gTTS after handoff.

## Commands run

```text
python3 tools/build_study.py studies/sample_synthetic_v0/study.yaml
cd frontend && npm run lint
cd frontend && npm run build
node tests/bundle_grep.mjs
python3 -m py_compile tools/make_sample_media.py tools/build_study.py tests/test_sample_media.py
PYTHONPATH=tools python3 <sound RMS/peak invariant probe>
make test
cd frontend && npm run test:flow
```

Passing receipts:

- `study.json` is emitted at `studies/sample_synthetic_v0/study.json` with no
  condition IDs and includes the requested public configuration/task/text data.
- `npm run lint`: `STYLE_CHECK_OK`; all frontend source lines are ≤120 chars.
- Vite build: 24 modules transformed; `dist/index.html` and the production
  bundle were generated successfully.
- `node tests/bundle_grep.mjs`: `BUNDLE_GREP_OK (5 files scanned)`.
- Sound invariant probe: siren, bell, drum, and hiss each measured −20.000 dBFS
  RMS; each peak was ≤0.9. Drum uses 0.5-second bursts and hiss is continuous
  band-limited noise.
- Apps Script README has six numbered deployment steps; `Code.gs` is unchanged.

## Verbatim test tail

```text
FAIL: test_uniform_params_and_duration (test_sample_media.SampleMediaTest.test_uniform_params_and_duration) (item_id='it_f160c412')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/projectnb/ivc-ml/tianle/audio_mllm/stealth-rate/tests/test_sample_media.py", line 35, in test_uniform_params_and_duration
    self.assertLessEqual(abs(float(row["integrated_loudness"]) + 16.0), 1.5)
AssertionError: 12.46 not less than or equal to 1.5

======================================================================
FAIL: test_uniform_params_and_duration (test_sample_media.SampleMediaTest.test_uniform_params_and_duration) (item_id='it_f75d1f33')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/projectnb/ivc-ml/tianle/audio_mllm/stealth-rate/tests/test_sample_media.py", line 35, in test_uniform_params_and_duration
    self.assertLessEqual(abs(float(row["integrated_loudness"]) + 16.0), 1.5)
AssertionError: 7.510000000000002 not less than or equal to 1.5

======================================================================
FAIL: test_uniform_params_and_duration (test_sample_media.SampleMediaTest.test_uniform_params_and_duration) (item_id='it_faaa67a6')
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/projectnb/ivc-ml/tianle/audio_mllm/stealth-rate/tests/test_sample_media.py", line 35, in test_uniform_params_and_duration
    self.assertLessEqual(abs(float(row["integrated_loudness"]) + 16.0), 1.5)
AssertionError: 3.2300000000000004 not less than or equal to 1.5

----------------------------------------------------------------------
Ran 9 tests in 0.482s

FAILED (failures=75, skipped=1)
make: *** [Makefile:45: test] Error 1
```

The 75 failures are the expected preserved WO-7 media receipt loudness values;
the new test now asserts every file is within ±1.5 LU of −16 and must be rerun
after the coordinator regenerates media. No media files were regenerated here.

## Not verified

- Network gTTS media regeneration and the resulting encoded loudness receipt.
- `npm install` / lockfile refresh: registry DNS returned `EAI_AGAIN`; jsdom is
  declared in `frontend/package.json` but is not installed in this sandbox.
- `frontend/tests/flow.test.mjs`: written but not executable here because jsdom
  is unavailable. Run `cd frontend && npm install && npm run test:flow` with
  network access.
- Real browser playback, visibility events, keyboard navigation, download/copy
  UI, Apps Script deployment, Google Sheets, and Prolific integration.
- No human-subject study, participant data, or scientific claim was verified.

No commit, push, or deployment was performed.
