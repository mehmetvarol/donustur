# syntax=docker/dockerfile:1.7
# 3 aşama: ön yüz (node) → ikili (rust) → çalışma (debian-slim + ffmpeg + libheif)

# ---------- 1) ön yüz ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 2) rust ----------
FROM rust:1-bookworm AS build
WORKDIR /src
# libheif başlıkları: HEIC desteği (feature "heic")
RUN apt-get update && apt-get install -y --no-install-recommends libheif-dev clang pkg-config nasm && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
# bağımlılıkları önbelleğe al
RUN mkdir -p src web/dist && echo 'fn main(){}' > src/main.rs && cargo build --release --features heic && rm -rf src target/release/deps/donustur*
COPY src ./src
COPY --from=web /web/dist ./web/dist
RUN cargo build --release --features heic && strip target/release/donustur

# ---------- 3) çalışma ----------
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libheif1 ca-certificates tini curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /data donustur \
 && mkdir -p /data && chown donustur:donustur /data
COPY --from=build /src/target/release/donustur /usr/local/bin/donustur
USER donustur
WORKDIR /data
VOLUME ["/data"]
ENV DONUSTUR_HOST=0.0.0.0 \
    DONUSTUR_PORT=8080 \
    DONUSTUR_DATA_DIR=/data \
    RUST_LOG=donustur=info
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["donustur"]
