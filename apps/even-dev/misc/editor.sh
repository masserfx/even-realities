#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
EDITOR_DIR="${REPO_ROOT}/misc/editor"

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

if [ ! -d "${EDITOR_DIR}" ] || [ ! -f "${EDITOR_DIR}/package.json" ]; then
  if has_cmd git; then
    echo "Initializing misc/editor submodule..."
    git -C "${REPO_ROOT}" submodule update --init --recursive misc/editor
  fi
fi

if [ ! -f "${EDITOR_DIR}/package.json" ]; then
  echo "Editor project not found at ${EDITOR_DIR}" >&2
  echo "Run: git submodule update --init --recursive misc/editor" >&2
  exit 1
fi

cd "${EDITOR_DIR}"

if has_cmd bun; then
  echo "Installing editor dependencies with bun..."
  bun install
  echo "Starting editor dev server with bun..."
  exec bun run dev
fi

if has_cmd npm; then
  echo "Installing editor dependencies with npm..."
  npm install
  echo "Starting editor dev server with npm..."
  exec npm run dev
fi

echo "Neither bun nor npm is installed." >&2
exit 1
