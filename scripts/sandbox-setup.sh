#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="eliza-sandbox:bookworm-slim"
DOCKERFILE="scripts/docker/sandbox/Dockerfile"

is_apple_container_available() {
  command -v container >/dev/null 2>&1 \
    && (container --version >/dev/null 2>&1 || container help >/dev/null 2>&1)
}

if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] \
  && is_apple_container_available; then
  engine="apple-container"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  engine="docker"
else
  printf '%s\n' \
    "No usable sandbox engine found." \
    "On Apple Silicon macOS, install and start Apple Container; otherwise install and start Docker." \
    "Doolittle does not install or start container software automatically."
  exit 1
fi

cd "$ROOT"

case "$engine" in
  apple-container)
    container build -t "$IMAGE" -f "$DOCKERFILE" .
    ;;
  docker)
    docker build -t "$IMAGE" -f "$DOCKERFILE" .
    ;;
esac

printf 'Built %s in the %s image store.\n' "$IMAGE" "$engine"
