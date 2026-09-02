You are implementing the StealthRate platform in this repository (a fresh git repo; the design and contracts are frozen).
Read, in order: README.md, docs/STUDY_SCHEMA.md, docs/FRAMEWORK_DESIGN.md (sections 2-5 only), WORKORDERS.md.
Then implement WO-1 through WO-6 exactly as specified in WORKORDERS.md, in order, committing nothing (the coordinator commits).
Hard rules:
- Minimal dependencies: frontend = Vite + TypeScript only; Python = stdlib + numpy (gTTS only in tools/make_sample_media.py).
- Use node from /share/pkg.8/nodejs/20.12.2/install/bin (prepend to PATH), ffmpeg /usr3/graduate/tianle/bin/ffmpeg, python /projectnb/ivc-ml/tianle/anaconda3/envs/qwen5_save/bin/python for anything needing numpy/gTTS; plain python3 is fine for stdlib tools. Network is available. No GPU, no qsub.
- Never put condition ids, "anchor", "attention", "harmless", "gold", "injected" into frontend/ or studies/*/items.json. studies/*/private/ is git-ignored.
- Do not modify .github/workflows/deploy.yml except to fix a build path; the site is served under /stealth-rate/ so Vite base must be './'.
- Keep the sample media total under 60 MB.
- Finish with `make smoke` and `make test` passing, then write WO_RESULTS.md: commands run, test outputs (verbatim tails), media size, and an explicit list of what was NOT verified.
Start now. When done, print the exact line: WORKORDERS_COMPLETE
