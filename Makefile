SHELL := /bin/sh
export PATH := $(HOME)/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$(PATH)
# macOS'un make 3.81'i export edilen PATH'i komut aramada kullanmaz → tam yol
CARGO := $(shell command -v cargo 2>/dev/null || echo $(HOME)/.cargo/bin/cargo)
DOCKER := $(shell command -v docker 2>/dev/null || echo /opt/homebrew/bin/docker)

.PHONY: help web build run dev test lint fmt docker docker-run clean launchd

help: ## bu listeyi göster
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

web: ## ön yüzü derle (web/dist)
	cd web && npm install --no-audit --no-fund && npm run build && touch dist/.gitkeep

build: web ## ön yüz + release ikili (target/release/morphbox)
	$(CARGO) build --release

build-heic: web ## HEIC destekli release (brew install libheif pkgconf gerekir)
	$(CARGO) build --release --features heic

run: build ## release ikiliyi çalıştır (HEIC için: make build-heic && ./target/release/morphbox)
	MORPHBOX_HWACCEL=auto ./target/release/morphbox

dev: ## geliştirme: cargo run (ön yüz web/dist'ten; ayrı pencerede `cd web && npm run dev` ile HMR)
	sh scripts/dev.sh

test: ## rust testleri + ön yüz tip denetimi
	$(CARGO) test
	cd web && npm run typecheck

lint: ## clippy -D warnings + fmt --check
	$(CARGO) clippy --all-targets -- -D warnings
	$(CARGO) fmt --check

fmt: ## kodu biçimle
	$(CARGO) fmt

docker: ## docker imajı
	$(DOCKER) build -t morphbox:latest .

docker-run: ## compose ile ayağa kaldır
	$(DOCKER) compose up -d --build

clean: ## derleme çıktıları
	$(CARGO) clean
	rm -rf web/dist/* && touch web/dist/.gitkeep

launchd: ## macOS açılışta başlatma plist'ini bu makineye göre üret (target/)
	@mkdir -p target
	@sed -e "s|__REPO__|$(CURDIR)|g" -e "s|__HOME__|$(HOME)|g" deploy/com.morphbox.server.plist > target/com.morphbox.server.plist
	@plutil -lint target/com.morphbox.server.plist
	@echo "Kurmak için:"
	@echo "  cp target/com.morphbox.server.plist ~/Library/LaunchAgents/"
	@echo "  launchctl bootstrap gui/$$(id -u) ~/Library/LaunchAgents/com.morphbox.server.plist"
