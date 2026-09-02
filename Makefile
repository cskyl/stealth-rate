SHELL := /bin/bash
NODE_BIN := /share/pkg.8/nodejs/20.12.2/install/bin
PY_NUMPY := /projectnb/ivc-ml/tianle/anaconda3/envs/qwen5_save/bin/python
STUDY := studies/sample_synthetic_v0/study.yaml

.PHONY: build-study sample-media frontend serve smoke test frontend-flow

build-study:
	python3 tools/build_study.py $(STUDY)

sample-media: build-study
	PATH=$(NODE_BIN):$$PATH $(PY_NUMPY) tools/make_sample_media.py $(STUDY)

frontend: build-study
	set -o pipefail; \
	if (cd frontend && PATH=$(NODE_BIN):$$PATH npm install --no-audit --no-fund --fetch-timeout=3000 --fetch-retries=0 && PATH=$(NODE_BIN):$$PATH npm run lint && PATH=$(NODE_BIN):$$PATH npm run build); then :; \
	else if [ -x /projectnb/ivc-ml/tianle/audio_mllm/game-project-2/node_modules/.bin/tsc ] && [ -x /projectnb/ivc-ml/tianle/audio_mllm/game-project-2/node_modules/.bin/vite ]; then \
		echo 'NPM_INSTALL_UNAVAILABLE_USING_SHARED_TOOLCHAIN'; \
		/projectnb/ivc-ml/tianle/audio_mllm/game-project-2/node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit && \
		cd frontend && node tests/style_check.mjs && cd .. && \
		/projectnb/ivc-ml/tianle/audio_mllm/game-project-2/node_modules/.bin/vite build frontend; \
	else if [ -x frontend/node_modules/.bin/tsc ] && [ -x frontend/node_modules/.bin/vite ]; then \
		echo 'NPM_INSTALL_UNAVAILABLE_USING_LOCAL_TOOLCHAIN'; \
		frontend/node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit && \
		cd frontend && node tests/style_check.mjs && cd .. && \
		frontend/node_modules/.bin/vite build frontend; \
	else echo 'NPM_UNAVAILABLE_USING_STATIC_FALLBACK'; python3 tools/frontend_fallback.py; fi; fi; fi

serve: frontend
	python3 tools/serve_local.py --study sample_synthetic_v0 --port 8765

smoke: build-study frontend
	set -e; \
	port=$$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()' 2>/dev/null || true); \
	server=; \
	if test -n "$$port"; then python3 tools/serve_local.py --study sample_synthetic_v0 --port $$port >/tmp/stealth-rate-serve.log 2>&1 & server=$$!; fi; \
	trap 'kill $$server 2>/dev/null || true' EXIT; \
	sleep 1; \
	if test -n "$$server" && kill -0 $$server 2>/dev/null; then echo "SIMULATOR_PATH=http port=$$port"; python3 tools/simulate_raters.py --study sample_synthetic_v0 --n 12 --base-url http://127.0.0.1:$$port --reset; else echo 'SIMULATOR_PATH=direct (HTTP bind unavailable)'; python3 tools/simulate_raters.py --study sample_synthetic_v0 --n 12 --backend local --reset; fi; \
	python3 tools/export_and_analyze.py --study sample_synthetic_v0 --source local; \
	test -f $$(find exports/sample_synthetic_v0 -name analysis.json -print | sort | tail -1); \
	kill $$server 2>/dev/null || true; echo 'SMOKE_OK'

test: frontend
	python3 -m unittest discover -s tests -p 'test_*.py' -v
	PATH=$(NODE_BIN):$$PATH node tests/bundle_grep.mjs
	if test -d frontend/node_modules/jsdom; then (cd frontend && PATH=$(NODE_BIN):$$PATH npm run test:flow); else echo 'FLOW_TEST_NOT_RUN_JSdom_UNAVAILABLE'; fi

frontend-flow: frontend
	cd frontend && PATH=$(NODE_BIN):$$PATH npm run test:flow
