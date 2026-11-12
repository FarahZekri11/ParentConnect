#!/usr/bin/env sh
# =====================================================================
# ParentConnect — préparation de l'environnement (Linux / macOS / Git Bash)
# Usage (depuis la racine du projet) :  ./scripts/setup.sh   [--force]
# Seul prérequis : Docker démarré.
# =====================================================================
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm -v "$ROOT:/work" -w /work node:20-alpine node scripts/setup.js "$@"
