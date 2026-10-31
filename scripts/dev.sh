#!/bin/sh
# Geliştirme sunucusu: ikiliyi derler ve 8080'de çalıştırır (ön yüz web/dist'ten okunur).
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export RUST_LOG="${RUST_LOG:-donustur=debug,tower_http=info}"
export DONUSTUR_HWACCEL="${DONUSTUR_HWACCEL:-auto}"
exec cargo run --quiet -- "$@"
