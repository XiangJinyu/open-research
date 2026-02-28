#!/usr/bin/env bash
set -euo pipefail

REPO="XiangJinyu/open-research"
BINARY_NAME="research"        # installed command name
ARCHIVE_PREFIX="openresearch" # release archive prefix (e.g. openresearch-darwin-arm64.zip)
INSTALL_DIR="${OPENRESEARCH_INSTALL_DIR:-$HOME/.openresearch/bin}"
TMP_DIR=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { printf "${CYAN}%s${NC}\n" "$*"; }
ok()      { printf "${GREEN}%s${NC}\n" "$*"; }
warn()    { printf "${YELLOW}%s${NC}\n" "$*"; }
err()     { printf "${RED}%s${NC}\n" "$*" >&2; }
cleanup() { [ -n "$TMP_DIR" ] && rm -rf "$TMP_DIR"; }
trap cleanup EXIT

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)  os="darwin" ;;
    Linux)   os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) err "Unsupported OS: $os"; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) err "Unsupported architecture: $arch"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

get_latest_version() {
  local url="https://api.github.com/repos/${REPO}/releases/latest"
  if command -v curl &>/dev/null; then
    curl -fsSL "$url" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//'
  elif command -v wget &>/dev/null; then
    wget -qO- "$url" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//'
  else
    err "Neither curl nor wget found"; exit 1
  fi
}

download() {
  local url="$1" dest="$2"
  if command -v curl &>/dev/null; then
    curl -fsSL -o "$dest" "$url"
  else
    wget -qO "$dest" "$url"
  fi
}

main() {
  local platform version archive_name download_url

  info "Detecting platform..."
  platform="$(detect_platform)"
  ok "  Platform: ${platform}"

  info "Fetching latest version..."
  version="$(get_latest_version)"
  if [ -z "$version" ]; then
    err "Could not determine latest version. Check https://github.com/${REPO}/releases"
    exit 1
  fi
  ok "  Version: ${version}"

  archive_name="${ARCHIVE_PREFIX}-${platform}"
  case "$platform" in
    linux*) archive_name="${archive_name}.tar.gz" ;;
    *)      archive_name="${archive_name}.zip" ;;
  esac

  download_url="https://github.com/${REPO}/releases/download/${version}/${archive_name}"
  info "Downloading ${download_url}..."

  TMP_DIR="$(mktemp -d)"
  download "$download_url" "${TMP_DIR}/${archive_name}"

  info "Extracting..."
  cd "$TMP_DIR"
  case "$archive_name" in
    *.tar.gz) tar -xzf "$archive_name" ;;
    *.zip)    unzip -qo "$archive_name" ;;
  esac

  mkdir -p "$INSTALL_DIR"

  local bin_name="research"
  [ "$platform" = "windows-x64" ] && bin_name="research.exe"

  local src_name
  if [ -f "research" ]; then src_name="research"
  elif [ -f "research.exe" ]; then src_name="research.exe"
  elif [ -f "openresearch" ]; then src_name="openresearch"
  elif [ -f "openresearch.exe" ]; then src_name="openresearch.exe"
  elif [ -f "opencode" ]; then src_name="opencode"
  elif [ -f "opencode.exe" ]; then src_name="opencode.exe"
  else err "Binary not found in archive"; exit 1
  fi

  cp "$src_name" "${INSTALL_DIR}/${bin_name}"
  chmod +x "${INSTALL_DIR}/${bin_name}"

  if [ "$(uname -s)" = "Darwin" ]; then
    xattr -cr "${INSTALL_DIR}/${bin_name}" 2>/dev/null || true
  fi

  ok "Installed to ${INSTALL_DIR}/${bin_name}"

  # Auto-configure PATH if needed
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    local shell_name profile export_line
    shell_name="$(basename "${SHELL:-/bin/bash}")"

    case "$shell_name" in
      zsh)  profile="$HOME/.zshrc" ;;
      bash) profile="$HOME/.bashrc" ;;
      fish) profile="$HOME/.config/fish/config.fish" ;;
      *)    profile="$HOME/.profile" ;;
    esac

    if [ "$shell_name" = "fish" ]; then
      export_line="set -gx PATH ${INSTALL_DIR} \$PATH"
    else
      export_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
    fi

    if [ -f "$profile" ] && grep -qF "$INSTALL_DIR" "$profile" 2>/dev/null; then
      info "PATH already configured in ${profile}"
    else
      echo "" >> "$profile"
      echo "# Added by OpenResearch installer" >> "$profile"
      echo "$export_line" >> "$profile"
      ok "Added PATH to ${profile}"
    fi

    warn ""
    warn "Restart your terminal, or run now:"
    warn "  $export_line"
  fi

  echo ""
  ok "Done! Run '${BINARY_NAME}' to get started."
}

main "$@"
