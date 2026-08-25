# Recoup — one-command entry points.
# Windows: run these under Git Bash. Paths use the .venv Windows layout (Scripts/); on
# macOS/Linux change `ml/.venv/Scripts/` to `ml/.venv/bin/`.

.PHONY: help install train eval robustness test typecheck selftest demo reset

help:
	@echo "install    - install server, web and ML deps (+ create the Python venv)"
	@echo "train      - regenerate synthetic data and train/calibrate the models"
	@echo "eval       - counterfactual holdout eval: recovered vs. baselines, with 95% CIs"
	@echo "robustness - 2nd INDEPENDENT context-driven world: generate + train + eval (proves ML's edge emerges off a reason lookup)"
	@echo "test       - server policy property tests (offline, no DB/keys) + typechecks"
	@echo "selftest   - signed-webhook end-to-end self-test (API + ML must be running)"
	@echo "demo       - how to bring the whole stack up (see docs/SETUP.md)"

install:
	cd server && npm install
	cd web && npm install
	cd ml && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt

train:
	ml/.venv/Scripts/python ml/src/worldmodel.py --out ml/data/train.csv
	ml/.venv/Scripts/python ml/src/train.py --data ml/data/train.csv --out ml/artifacts

eval:
	ml/.venv/Scripts/python ml/src/eval.py --data ml/data/train.csv --art ml/artifacts --out ml/eval.json

robustness:
	ml/.venv/Scripts/python ml/src/worldmodel2.py --out ml/data/train_v2.csv
	ml/.venv/Scripts/python ml/src/train.py --data ml/data/train_v2.csv --out ml/artifacts_v2
	ml/.venv/Scripts/python ml/src/eval.py --world v2 --data ml/data/train_v2.csv --art ml/artifacts_v2 --out ml/eval_v2.json

test:
	cd server && npm run test && npm run typecheck
	cd web && npm run typecheck

typecheck:
	cd server && npm run typecheck
	cd web && npm run typecheck

selftest:
	cd server && npm run selftest:webhook

demo:
	@echo "Start each in its own terminal (see docs/SETUP.md section 4):"
	@echo "  cd server && npm run db:local"
	@echo "  ml/.venv/Scripts/python -m uvicorn serve:app --app-dir ml/src --port 8899"
	@echo "  cd server && npm run dev"
	@echo "  cd web && npm run dev"
