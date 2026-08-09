#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEADLESS=0
SKIP_WIZARD=0
CHECK_ONLY=0
ASSUME_YES=0
LAUNCH_DESKTOP=0
PACKAGE_INSTALLER=0
NUB_VERSION="0.7.4"
REQUIRED_NODE_VERSION="$(tr -d '\r\n' < "${ROOT}/.node-version")"
REQUIRED_NODE_MAJOR="${REQUIRED_NODE_VERSION%%.*}"
LOCAL_BIN_DIR="${HOME}/.local/bin"
NUB_TOOL_ROOT="${HOME}/.local/share/doolittle/tooling"
NUB_BIN="${NUB_TOOL_ROOT}/bin/nub"
NUB_COMMAND=""
DOOLITTLE_BIN_LINK="${LOCAL_BIN_DIR}/doolittle"
DOOLITTLE_BIN_SOURCE="${ROOT}/packages/agent/src/index.ts"
DOOLITTLE_SHORT_LINK="${LOCAL_BIN_DIR}/dl"
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

windows_installer_notice() {
  printf "%s\n" "${amber}Windows detected.${reset}"
  printf "%s\n" "This installer is a Unix-style bootstrap for source checkouts; use the standalone Windows installer for production installs."
  printf "%s\n" "On Windows, use scripts/install.ps1 for equivalent bootstrap behavior."
  printf "%s\n" "To build/download it:"
  printf "%s\n" "  1) Ensure changes are committed/pushed and tag a release, or run locally:"
  printf "%s\n" "     nub run desktop:package:win"
  printf "%s\n" "  2) Copy apps/desktop/release/Doolittle-<version>-win-x64.exe to Windows."
  printf "%s\n" "  3) Run the .exe, then launch 'Doolittle Desktop' or use 'doolittle.exe' from Start Menu."
  printf "%s\n" "  4) See docs/desktop.md -> Windows installer section."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --headless|--non-interactive)
      HEADLESS=1
      ;;
    --skip-wizard)
      SKIP_WIZARD=1
      ;;
    --desktop)
      LAUNCH_DESKTOP=1
      ;;
    --no-desktop)
      LAUNCH_DESKTOP=0
      ;;
    --check)
      CHECK_ONLY=1
      ;;
    --yes)
      ASSUME_YES=1
      ;;
    --package-installer)
      PACKAGE_INSTALLER=1
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: bash scripts/install.sh [--headless] [--skip-wizard] [--desktop] [--no-desktop] [--check] [--yes] [--package-installer]"
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
  "${orange}${bold}║                  DOOLITTLE // INSTALLER                     ║${reset}" \
  "${orange}║      Nub-powered install and first-contact onboarding       ║${reset}" \
  "${orange}╚══════════════════════════════════════════════════════════════╝${reset}"
printf "%s\n" "${dim}  This ritual installs the stack, seeds the workspace, and begins first contact.${reset}"

detect_os
if [[ "$OS_NAME" == "windows" ]]; then
  if command -v pwsh >/dev/null 2>&1; then
    powershell=pwsh
  elif command -v powershell >/dev/null 2>&1; then
    powershell=powershell
  else
    windows_installer_notice
    if [[ "$CHECK_ONLY" -eq 1 ]]; then
      exit 0
    fi
    exit 1
  fi

  windows_args=()
  if [[ "$HEADLESS" -eq 1 ]]; then
    windows_args+=("-Headless")
  fi
  if [[ "$SKIP_WIZARD" -eq 1 ]]; then
    windows_args+=("-SkipWizard")
  fi
  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    windows_args+=("-Check")
  fi
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    windows_args+=("-Yes")
  fi
  if [[ "$LAUNCH_DESKTOP" -eq 1 ]]; then
    windows_args+=("-Desktop")
  fi
  if [[ "$PACKAGE_INSTALLER" -eq 1 ]]; then
    windows_args+=("-PackageInstaller")
  fi

  "${powershell}" -NoProfile -ExecutionPolicy Bypass -File "scripts/install.ps1" "${windows_args[@]}"
  exit $?
fi
if [[ "$OS_NAME" == "macos" ]]; then
  printf "%s\n" "${dim}  Host: macOS detected. I will use zsh-friendly defaults and local app-style paths.${reset}"
elif [[ "$OS_NAME" == "linux" ]]; then
  printf "%s\n" "${dim}  Host: Linux detected. I will keep the local ~/.local/bin workflow and shell-first defaults.${reset}"
fi

ensure_nub() {
  mkdir -p "$LOCAL_BIN_DIR"
  export PATH="${NUB_TOOL_ROOT}/bin:${LOCAL_BIN_DIR}:$PATH"

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "The source installer needs Node.js ${REQUIRED_NODE_MAJOR}+ to install Nub."
    echo "Install Node.js, then rerun scripts/install.sh."
    echo "The standalone Doolittle Desktop installer does not require Node.js or Nub."
    exit 1
  fi

  local node_version
  node_version="$(node --version 2>/dev/null | sed 's/^v//')"
  local node_major="${node_version%%.*}"
  if [[ ! "$node_major" =~ ^[0-9]+$ ]] || (( node_major < REQUIRED_NODE_MAJOR )); then
    echo "Doolittle requires Node.js ${REQUIRED_NODE_MAJOR}+ (the repository pins ${REQUIRED_NODE_VERSION}); found ${node_version:-unknown}."
    exit 1
  fi

  local installed_version=""
  if [[ -x "$NUB_BIN" ]]; then
    installed_version="$("$NUB_BIN" --version 2>/dev/null | head -n 1 | sed 's/^v//')"
  fi
  if [[ "$installed_version" == "$NUB_VERSION" ]]; then
    NUB_COMMAND="$NUB_BIN"
    return
  fi
  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    if command -v nub >/dev/null 2>&1; then
      installed_version="$(nub --version 2>/dev/null | head -n 1 | sed 's/^v//')"
      if [[ "$installed_version" == "$NUB_VERSION" ]]; then
        NUB_COMMAND="$(command -v nub)"
        return
      fi
    fi
    local repo_nub="${ROOT}/node_modules/.bin/nub"
    if [[ -x "$repo_nub" ]]; then
      installed_version="$("$repo_nub" --version 2>/dev/null | head -n 1 | sed 's/^v//')"
      if [[ "$installed_version" == "$NUB_VERSION" ]]; then
        export PATH="${ROOT}/node_modules/.bin:$PATH"
        NUB_COMMAND="$repo_nub"
        return
      fi
    fi
    echo "Doolittle requires Nub ${NUB_VERSION}; found ${installed_version:-nothing}."
    echo "Install it with: npm install --global --prefix \"${NUB_TOOL_ROOT}\" @nubjs/nub@${NUB_VERSION}"
    exit 1
  fi

  printf "%s\n" "${amber}Installing Doolittle's Nub ${NUB_VERSION} toolkit…${reset}"
  npm install --global --prefix "$NUB_TOOL_ROOT" "@nubjs/nub@${NUB_VERSION}"
  if [[ ! -x "$NUB_BIN" ]]; then
    echo "Nub installed, but its launcher was not found at ${NUB_BIN}."
    exit 1
  fi
  NUB_COMMAND="$NUB_BIN"
}

ensure_nub

if [[ "$CHECK_ONLY" -eq 0 ]]; then
  printf "%s\n" "${amber}Feeding the body with workspace dependencies...${reset}"
  "$NUB_COMMAND" install --frozen-lockfile --ignore-scripts
  printf "%s\n" "${amber}Installing Electron's standalone desktop runtime...${reset}"
  "$NUB_COMMAND" run desktop:runtime:install
else
  printf "%s\n" "${amber}Skipping dependency install because this is a dry run.${reset}"
fi

setup_path() {
  printf "%s\n" "${amber}Forging the local doolittle command...${reset}"
  mkdir -p "$LOCAL_BIN_DIR"
  rm -f "$DOOLITTLE_BIN_LINK"
  {
    printf '%s\n' '#!/usr/bin/env bash'
    printf '%s\n' 'set -euo pipefail'
    printf 'exec %q %q "$@"\n' "$NUB_BIN" "$DOOLITTLE_BIN_SOURCE"
  } > "$DOOLITTLE_BIN_LINK"
  chmod +x "$DOOLITTLE_BIN_LINK"

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
          echo "# Doolittle — ensure ~/.local/bin is on PATH"
          echo "$path_line"
        } >> "$shell_config"
        UPDATED_SHELL_CONFIGS+=("$shell_config")
      fi
    done
  fi

  export PATH="$LOCAL_BIN_DIR:$PATH"
  printf "%s\n" "${dim}  doolittle -> ${DOOLITTLE_BIN_LINK}${reset}"

  if should_install_shortcut; then
    ln -sf "$DOOLITTLE_BIN_LINK" "$DOOLITTLE_SHORT_LINK"
    printf "%s\n" "${dim}  dl -> ${DOOLITTLE_SHORT_LINK}${reset}"
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
  if [[ -L "$DOOLITTLE_SHORT_LINK" ]]; then
    return 0
  fi

  if [[ -e "$DOOLITTLE_SHORT_LINK" ]]; then
    return 1
  fi

  if command -v dl >/dev/null 2>&1; then
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
  printf "%s\n" "${dim}  Would create: ${DOOLITTLE_BIN_LINK}${reset}"
  if should_install_shortcut; then
    printf "%s\n" "${dim}  Would create shortcut: ${DOOLITTLE_SHORT_LINK}${reset}"
  fi
  printf "%s\n" "${dim}  Run without --check to complete the install and onboarding ritual.${reset}"
else
  setup_path
fi
"$NUB_COMMAND" scripts/bootstrap.ts "${BOOTSTRAP_ARGS[@]}"

if [[ "$PACKAGE_INSTALLER" -eq 1 && "$CHECK_ONLY" -eq 0 ]]; then
  printf "%s\n" "${amber}Building the standalone Windows installer...${reset}"
  "$NUB_COMMAND" run desktop:package:win
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  printf "\n%s\n" "${orange}${bold}Install check complete.${reset}"
  printf "%s\n" "${dim}  No install files, symlinks, or shell profiles were changed.${reset}"
  printf "%s\n" "${dim}  Run without --check when you are ready to install Doolittle.${reset}"
  printf "%s\n" "${dim}  doolittle desktop${reset}"
  exit 0
fi

printf "\n%s\n" "${orange}${bold}Install complete.${reset}"
printf "%s\n" "${dim}  The shell is warm. The channels are waiting.${reset}"
printf "%s\n" "${dim}  If a fresh terminal cannot find doolittle, reload your shell or open a new session.${reset}"
printf "%s\n" "  doolittle"
if [[ -L "$DOOLITTLE_SHORT_LINK" ]]; then
  printf "%s\n" "  dl"
fi
printf "%s\n" "  doolittle cockpit"
printf "%s\n" "  doolittle desktop"
printf "%s\n" "  doolittle plain"
printf "%s\n" "  doolittle exec -p \"summarize this repo\""
printf "%s\n" "  doolittle setup"
printf "%s\n" "  doolittle doctor"
printf "%s\n" "${dim}  Try: summarize this repo and tell me where to start${reset}"
printf "%s\n" "${dim}  Or run a shell action directly: !git status${reset}"

if [[ "$CHECK_ONLY" -eq 0 && "$HEADLESS" -eq 0 ]]; then
  printf "\n%s\n" "${amber}Launching Doolittle now...${reset}"
  printf "%s\n" "${dim}  Press Ctrl-C to return to your shell.${reset}"
  launch_status=0
  if [[ "$LAUNCH_DESKTOP" -eq 1 ]]; then
    "$DOOLITTLE_BIN_LINK" desktop || launch_status=$?
  else
    "$DOOLITTLE_BIN_LINK" || launch_status=$?
  fi
  if [[ "$launch_status" -eq 0 || "$launch_status" -eq 130 || "$launch_status" -eq 143 ]]; then
    exit 0
  fi
  printf "\n%s\n" "${orange}${bold}The first launch tripped over something local.${reset}"
  printf "%s\n" "${dim}  Your install is still in place. The fastest recovery steps are below.${reset}"
  printf "%s\n" "  doolittle doctor"
  printf "%s\n" "  doolittle plain"
  printf "%s\n" "  doolittle setup"
  printf "%s\n" "${dim}  If this was only a shell PATH refresh issue, restart the terminal or source your profile.${reset}"
  exit 1
fi
