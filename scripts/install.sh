#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "Eliza Agent requires Bun. Install Bun first, then rerun scripts/install.sh."
  exit 1
fi

echo "Installing Eliza Agent workspace dependencies with Bun..."
bun install

echo "Bootstrapping local workspace state..."
bun run bootstrap

echo "Done. Next steps:"
echo "  bun run dev"
echo "  bun run start"
