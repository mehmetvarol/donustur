SHELL := /bin/sh
export PATH := $(HOME)/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$(PATH)

.PHONY: help web build run dev test lint fmt docker docker-run clean

help: ## bu listeyi göster
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

web: ## ön yüzü derle (web/dist)
	cd web && npm install --no-audit --no-fund && npm run build && touch dist/.gitkeep

build: web ## ön yüz + release ikili (target/release/donustur)
	cargo build --release

build-heic: web ## HEIC destekli release (brew install libheif gerekir)
	cargo build --release --features heic

run: build ## release ikiliyi çalıştır
	DONUSTUR_HWACCEL=auto ./target/release/donustur

dev: ## geliştirme: cargo run (ön yüz web/dist'ten; ayrı pencerede `cd web && npm run dev` ile HMR)
	sh scripts/dev.sh

test: ## rust testleri + ön yüz tip denetimi
	cargo test
	cd web && npm run typecheck

lint: ## clippy -D warnings + fmt --check
	cargo clippy --all-targets -- -D warnings
	cargo fmt --check

fmt: ## kodu biçimle
	cargo fmt

docker: ## docker imajı
	docker build -t donustur:latest .

docker-run: ## compose ile ayağa kaldır
	docker compose up -d --build

clean: ## derleme çıktıları
	cargo clean
	rm -rf web/dist/* && touch web/dist/.gitkeep
