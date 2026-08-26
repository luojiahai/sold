#!/usr/bin/env bash
# Creates the Python venv for the instagrapi collector sidecar.
# Tries the default python3, falling back to older minors if a dependency
# (usually pydantic's compiled core) has no wheel for the newest interpreter.
set -euo pipefail
cd "$(dirname "$0")"

for candidate in "${SOLD_PYTHON_BIN:-}" python3.12 python3.13 python3.11 python3; do
  [ -z "$candidate" ] && continue
  command -v "$candidate" >/dev/null 2>&1 || continue
  echo "==> trying $candidate ($($candidate -V 2>&1))"
  rm -rf .venv
  "$candidate" -m venv .venv
  if ./.venv/bin/pip install --quiet --upgrade pip >/dev/null 2>&1 &&
     ./.venv/bin/pip install --quiet -r requirements.txt; then
    echo "==> installed with $candidate"
    ./.venv/bin/python -c "import instagrapi; print('instagrapi', instagrapi.__version__)"
    exit 0
  fi
  echo "==> $candidate failed, trying next"
done

echo "ERROR: could not build the collector venv with any available interpreter." >&2
echo "Install Python 3.12 (brew install python@3.12) and re-run." >&2
exit 1
