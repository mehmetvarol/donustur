# syntax=docker/dockerfile:1.7
# 3 aşama: ön yüz (node) → ikili (rust) → çalışma (debian trixie-slim + ffmpeg + libheif)
# Not: bookworm libheif 1.15 taşır; libheif-rs en az 1.17 ister → trixie (1.19). Ubuntu 24.04: 1.17.

# ---------- 1) ön yüz ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 2) rust ----------
FROM rust:1-trixie AS build
WORKDIR /src
# libheif başlıkları: HEIC desteği (feature "heic")
RUN apt-get update && apt-get install -y --no-install-recommends libheif-dev clang pkg-config nasm && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
# bağımlılıkları önbelleğe al
RUN mkdir -p src web/dist && echo 'fn main(){}' > src/main.rs && cargo build --release --features heic && rm -rf src target/release/deps/morphbox*
COPY src ./src
COPY --from=web /web/dist ./web/dist
RUN cargo build --release --features heic && strip target/release/morphbox

# ---------- 3) çalışma ----------
FROM debian:trixie-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libheif1 ca-certificates tini curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /data morphbox \
 && mkdir -p /data && chown morphbox:morphbox /data
COPY --from=build /src/target/release/morphbox /usr/local/bin/morphbox
USER morphbox
WORKDIR /data
VOLUME ["/data"]
ENV MORPHBOX_HOST=0.0.0.0 \
    MORPHBOX_PORT=8080 \
    MORPHBOX_DATA_DIR=/data \
    RUST_LOG=morphbox=info
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["morphbox"]
