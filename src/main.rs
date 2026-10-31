//! Morphbox — kendi sunucunda çalışan görsel/video/ses dönüştürücü.

mod api;
mod assets;
mod config;
mod engine;
mod error;
mod formats;
mod jobs;
mod probe;

use std::{sync::Arc, time::Duration};

use axum::{Router, extract::DefaultBodyLimit, http::HeaderValue, routing::get};
use tower_http::{set_header::SetResponseHeaderLayer, trace::TraceLayer};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("morphbox=info,tower_http=warn")),
        )
        .with(tracing_subscriber::fmt::layer().compact())
        .init();

    let config = Arc::new(config::Config::from_env());
    tokio::fs::create_dir_all(config.uploads_dir()).await?;
    tokio::fs::create_dir_all(config.outputs_dir()).await?;

    let caps = Arc::new(engine::ffmpeg::detect(&config.ffmpeg).await);
    match &caps.version {
        Some(v) => tracing::info!(ffmpeg = %v, encoders = caps.encoders.len(), "ffmpeg bulundu"),
        None => {
            tracing::warn!(bin = %config.ffmpeg, "ffmpeg bulunamadı; yalnız görsel dönüşümü çalışır")
        }
    }

    let store = jobs::JobStore::new(config.clone(), caps.clone());
    store.wipe_disk().await;

    // TTL temizleyici
    {
        let store = store.clone();
        let ttl = Duration::from_secs(config.ttl_min * 60);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(60));
            loop {
                tick.tick().await;
                let n = store.sweep(ttl).await;
                if n > 0 {
                    tracing::info!(removed = n, "süresi dolan işler silindi");
                }
            }
        });
    }

    let state = api::AppState {
        config: config.clone(),
        store,
        caps,
    };
    let csp = "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    let app = Router::new()
        .nest("/api", api::router(state))
        .fallback(get(assets::serve))
        .layer(DefaultBodyLimit::max(
            usize::try_from(config.max_upload_bytes + 1024 * 1024).unwrap_or(usize::MAX),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(csp),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(TraceLayer::new_for_http());

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, workers = config.workers, auth = config.password.is_some(), "Morphbox hazır → http://{}", addr.replace("0.0.0.0", "localhost"));
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("SIGTERM");
        tokio::select! { _ = ctrl_c => {}, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = ctrl_c.await;
    }
    tracing::info!("kapanıyor");
}
