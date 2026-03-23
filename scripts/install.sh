#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEADLESS=0
SKIP_WIZARD=0
CHECK_ONLY=0
ASSUME_YES=0
LOCAL_BIN_DIR="${HOME}/.local/bin"
ELIZA_BIN_LINK="${LOCAL_BIN_DIR}/eliza-agent"
ELIZA_BIN_SOURCE="${ROOT}/packages/agent/src/index.ts"
ELIZA_SHORT_LINK="${LOCAL_BIN_DIR}/ea"
OS_NAME="unknown"
UPDATED_SHELL_CONFIGS=()

detect_os() {
  case "$(uname -s)" in
    Darwin*)
      OS_NAME="macos"
      ;;
    Linux*)
      OS_NAME="linux"
      ;;
    CYGWIN*|MINGW*|MSYS*)
      OS_NAME="windows"
      ;;
    *)
      OS_NAME="unknown"
      ;;
  esac
}

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

detect_os
if [[ "$OS_NAME" == "windows" ]]; then
  echo "Windows-style shell detected. Use a Unix shell/WSL for this installer flow."
  exit 1
fi
if [[ "$OS_NAME" == "macos" ]]; then
  printf "%s\n" "${dim}  Host: macOS detected. I will use zsh-friendly defaults and local app-style paths.${reset}"
elif [[ "$OS_NAME" == "linux" ]]; then
  printf "%s\n" "${dim}  Host: Linux detected. I will keep the local ~/.local/bin workflow and shell-first defaults.${reset}"
fi

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

setup_path() {
  printf "%s\n" "${amber}Forging the local eliza-agent command...${reset}"
  mkdir -p "$LOCAL_BIN_DIR"
  chmod +x "$ELIZA_BIN_SOURCE"
  ln -sf "$ELIZA_BIN_SOURCE" "$ELIZA_BIN_LINK"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$LOCAL_BIN_DIR"; then
    local path_line='export PATH="$HOME/.local/bin:$PATH"'
    local shell_configs=()
    case "$(basename "${SHELL:-/bin/bash}")" in
      zsh)
        [[ -f "$HOME/.zshrc" ]] && shell_configs+=("$HOME/.zshrc")
        [[ -f "$HOME/.zprofile" ]] && shell_configs+=("$HOME/.zprofile")
        if [[ ${#shell_configs[@]} -eq 0 ]]; then
          touch "$HOME/.zshrc"
          shell_configs+=("$HOME/.zshrc")
        fi
        ;;
      bash)
        [[ -f "$HOME/.bashrc" ]] && shell_configs+=("$HOME/.bashrc")
        [[ -f "$HOME/.bash_profile" ]] && shell_configs+=("$HOME/.bash_profile")
        if [[ ${#shell_configs[@]} -eq 0 ]]; then
          touch "$HOME/.bashrc"
          shell_configs+=("$HOME/.bashrc")
        fi
        ;;
      *)
        [[ -f "$HOME/.profile" ]] && shell_configs+=("$HOME/.profile")
        [[ -f "$HOME/.zshrc" ]] && shell_configs+=("$HOME/.zshrc")
        [[ -f "$HOME/.bashrc" ]] && shell_configs+=("$HOME/.bashrc")
        if [[ ${#shell_configs[@]} -eq 0 ]]; then
          touch "$HOME/.profile"
          shell_configs+=("$HOME/.profile")
        fi
        ;;
    esac
    [[ -f "$HOME/.profile" ]] && shell_configs+=("$HOME/.profile")

    for shell_config in "${shell_configs[@]}"; do
      if ! grep -v '^[[:space:]]*#' "$shell_config" 2>/dev/null | grep -q '\.local/bin'; then
        {
          echo
          echo "# Eliza Agent — ensure ~/.local/bin is on PATH"
          echo "$path_line"
        } >> "$shell_config"
        UPDATED_SHELL_CONFIGS+=("$shell_config")
      fi
    done
  fi

  export PATH="$LOCAL_BIN_DIR:$PATH"
  printf "%s\n" "${dim}  eliza-agent -> ${ELIZA_BIN_LINK}${reset}"

  if should_install_shortcut; then
    ln -sf "$ELIZA_BIN_SOURCE" "$ELIZA_SHORT_LINK"
    printf "%s\n" "${dim}  ea -> ${ELIZA_SHORT_LINK}${reset}"
  fi

  if [[ ${#UPDATED_SHELL_CONFIGS[@]} -gt 0 ]]; then
    printf "%s\n" "${dim}  Updated shell startup file(s):${reset}"
    for shell_config in "${UPDATED_SHELL_CONFIGS[@]}"; do
      printf "%s\n" "${dim}    - ${shell_config}${reset}"
    done
    case "$(basename "${SHELL:-/bin/bash}")" in
      zsh)
        printf "%s\n" "${dim}  Reload with: source ~/.zshrc  (or open a new terminal)${reset}"
        ;;
      bash)
        printf "%s\n" "${dim}  Reload with: source ~/.bashrc  (or open a new terminal)${reset}"
        ;;
      *)
        printf "%s\n" "${dim}  Reload with: source your shell profile or open a new terminal${reset}"
        ;;
    esac
  else
    printf "%s\n" "${dim}  PATH already includes ${LOCAL_BIN_DIR}; no shell profile update needed.${reset}"
  fi
}

should_install_shortcut() {
  if [[ -L "$ELIZA_SHORT_LINK" ]]; then
    return 0
  fi

  if [[ -e "$ELIZA_SHORT_LINK" ]]; then
    return 1
  fi

  if command -v ea >/dev/null 2>&1; then
    return 1
  fi

  return 0
}

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
if [[ "$CHECK_ONLY" -eq 1 ]]; then
  printf "%s\n" "${dim}  Dry run: skipping symlink and shell profile writes.${reset}"
  printf "%s\n" "${dim}  Would create: ${ELIZA_BIN_LINK}${reset}"
  if should_install_shortcut; then
    printf "%s\n" "${dim}  Would create shortcut: ${ELIZA_SHORT_LINK}${reset}"
  fi
  printf "%s\n" "${dim}  Run without --check to complete the install and onboarding ritual.${reset}"
else
  setup_path
fi
bun run scripts/bootstrap.ts "${BOOTSTRAP_ARGS[@]}"

printf "\n%s\n" "${orange}${bold}Install complete.${reset}"
printf "%s\n" "${dim}  The shell is warm. The channels are waiting.${reset}"
printf "%s\n" "${dim}  If a fresh terminal cannot find eliza-agent, reload your shell or open a new session.${reset}"
printf "%s\n" "  eliza-agent"
if [[ -L "$ELIZA_SHORT_LINK" ]]; then
  printf "%s\n" "  ea"
fi
printf "%s\n" "  eliza-agent plain"
printf "%s\n" "  eliza-agent setup"
printf "%s\n" "  eliza-agent doctor"
printf "%s\n" "${dim}  Once the cockpit is open, try: summarize this repo and tell me where to start${reset}"
printf "%s\n" "${dim}  Or run a shell action directly: !git status${reset}"

if [[ "$CHECK_ONLY" -eq 0 && "$HEADLESS" -eq 0 ]]; then
  printf "\n%s\n" "${amber}Launching Eliza Agent now...${reset}"
  printf "%s\n" "${dim}  Press Ctrl-C to return to your shell.${reset}"
  if "$ELIZA_BIN_LINK"; then
    exit 0
  fi
  printf "\n%s\n" "${orange}${bold}The first launch tripped over something local.${reset}"
  printf "%s\n" "${dim}  Your install is still in place. The fastest recovery steps are below.${reset}"
  printf "%s\n" "  eliza-agent doctor"
  printf "%s\n" "  eliza-agent plain"
  printf "%s\n" "  eliza-agent setup"
  printf "%s\n" "${dim}  If this was only a shell PATH refresh issue, restart the terminal or source your profile.${reset}"
  exit 1
fi
