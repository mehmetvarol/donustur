#!/bin/sh
# Geliştirme sunucusu: ikiliyi derler ve 8080'de çalıştırır (ön yüz web/dist'ten okunur).
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export RUST_LOG="${RUST_LOG:-donustur=debug,tower_http=info}"
export DONUSTUR_HWACCEL="${DONUSTUR_HWACCEL:-auto}"
# libheif kuruluysa HEIC desteğiyle derle
FEATURES=""
if command -v pkg-config >/dev/null 2>&1 && pkg-config --atleast-version=1.17 libheif 2>/dev/null; then
  FEATURES="--features heic"
fi
exec cargo run --quiet $FEATURES -- "$@"
