#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEADLESS=0
SKIP_WIZARD=0
CHECK_ONLY=0
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --headless|--non-interactive)
      HEADLESS=1
      ;;
    --skip-wizard)
      SKIP_WIZARD=1
      ;;
    --check)
      CHECK_ONLY=1
      ;;
    --yes)
      ASSUME_YES=1
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: bash scripts/install.sh [--headless] [--skip-wizard] [--check] [--yes]"
      exit 1
      ;;
  esac
  shift
done

if [[ ! -t 0 || ! -t 1 ]]; then
  HEADLESS=1
fi

orange=$'\033[38;2;255;106;0m'
amber=$'\033[38;2;255;176;0m'
dim=$'\033[2m'
bold=$'\033[1m'
reset=$'\033[0m'

printf "%s\n" \
  "${orange}╔══════════════════════════════════════════════════════════════╗${reset}" \
  "${orange}${bold}║                 ELIZA AGENT // INSTALLER                    ║${reset}" \
  "${orange}║      Bun-first install and first-contact onboarding         ║${reset}" \
  "${orange}╚══════════════════════════════════════════════════════════════╝${reset}"
printf "%s\n" "${dim}  This ritual installs the stack, seeds the workspace, and begins first contact.${reset}"

if ! command -v bun >/dev/null 2>&1; then
  echo "Eliza Agent requires Bun. Install Bun first, then rerun scripts/install.sh."
  exit 1
fi

if [[ "$CHECK_ONLY" -eq 0 ]]; then
  printf "%s\n" "${amber}Feeding the body with workspace dependencies...${reset}"
  bun install
else
  printf "%s\n" "${amber}Skipping dependency install because this is a dry run.${reset}"
fi

BOOTSTRAP_ARGS=()
if [[ "$HEADLESS" -eq 1 ]]; then
  BOOTSTRAP_ARGS+=("--headless")
fi
if [[ "$SKIP_WIZARD" -eq 1 ]]; then
  BOOTSTRAP_ARGS+=("--skip-wizard")
fi
if [[ "$CHECK_ONLY" -eq 1 ]]; then
  BOOTSTRAP_ARGS+=("--check")
fi
if [[ "$ASSUME_YES" -eq 1 ]]; then
  BOOTSTRAP_ARGS+=("--yes")
fi

printf "%s\n" "${amber}Beginning the awakening sequence...${reset}"
bun run scripts/bootstrap.ts "${BOOTSTRAP_ARGS[@]}"

printf "\n%s\n" "${orange}${bold}Install complete.${reset}"
printf "%s\n" "${dim}  The shell is warm. The channels are waiting.${reset}"
printf "%s\n" "  bun run start"
printf "%s\n" "  bun run start --plain-cli"
printf "%s\n" "  bun run dev"
