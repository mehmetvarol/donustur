//! HTTP API: /api/health, /api/formats, /api/jobs…

pub mod auth;
pub mod upload;

use std::{convert::Infallible, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderValue, StatusCode, header},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{delete, get, post},
};
use futures::Stream;
use serde::Serialize;
use serde_json::json;
use tower::ServiceExt;
use tower_http::services::ServeFile;
use uuid::Uuid;

use crate::{
    config::Config,
    engine,
    error::{AppError, AppResult},
    formats::{self, Target},
    jobs::{JobStore, JobView},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub store: Arc<JobStore>,
    pub caps: Arc<engine::ffmpeg::Capabilities>,
}

pub fn router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/formats", get(list_formats))
        .route("/jobs", get(list_jobs).post(upload::create_job))
        .route("/jobs/{id}", get(get_job))
        .route("/jobs/{id}", delete(delete_job))
        .route("/jobs/{id}/events", get(job_events))
        .route("/jobs/{id}/download", get(download))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::require,
        ));
    Router::new()
        .route("/health", get(health))
        .route("/auth/check", post(auth::check))
        .merge(protected)
        .with_state(state)
}

async fn health(State(st): State<AppState>) -> Json<serde_json::Value> {
    let (queued, running) = st.store.counts();
    Json(json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "ffmpeg": st.caps.version,
        "heic": engine::image::heic_supported(),
        "hwaccel": st.config.hwaccel && st.caps.has("h264_videotoolbox"),
        "workers": st.store.workers(),
        "queued": queued,
        "running": running,
        "auth_required": st.config.password.is_some(),
        "max_upload_bytes": st.config.max_upload_bytes,
        "ttl_min": st.config.ttl_min,
    }))
}

#[derive(Serialize)]
struct TargetOut {
    #[serde(flatten)]
    target: Target,
    available: bool,
}

async fn list_formats(State(st): State<AppState>) -> Json<Vec<TargetOut>> {
    Json(
        formats::catalog()
            .into_iter()
            .map(|t| {
                let available = match t.engine {
                    formats::Engine::Image => true,
                    formats::Engine::Ffmpeg => st.caps.supports(&t),
                };
                TargetOut {
                    target: t,
                    available,
                }
            })
            .collect(),
    )
}

async fn list_jobs(State(st): State<AppState>) -> Json<Vec<JobView>> {
    Json(st.store.list())
}

fn parse_id(id: &str) -> AppResult<Uuid> {
    Uuid::parse_str(id).map_err(|_| AppError::NotFound)
}

async fn get_job(State(st): State<AppState>, Path(id): Path<String>) -> AppResult<Json<JobView>> {
    let id = parse_id(&id)?;
    st.store.get(id).map(Json).ok_or(AppError::NotFound)
}

async fn delete_job(State(st): State<AppState>, Path(id): Path<String>) -> AppResult<StatusCode> {
    let id = parse_id(&id)?;
    if st.store.remove(id).await {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

async fn job_events(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    let id = parse_id(&id)?;
    let rx = st.store.subscribe(id).ok_or(AppError::NotFound)?;
    let stream = futures::stream::unfold((rx, false), |(mut rx, finished)| async move {
        if finished {
            return None;
        }
        let view = rx.borrow_and_update().clone();
        let terminal = view.status.is_terminal();
        let ev = Event::default()
            .event("job")
            .json_data(&view)
            .unwrap_or_else(|_| Event::default().comment("serialize"));
        if terminal {
            return Some((Ok::<_, Infallible>(ev), (rx, true)));
        }
        // bir sonraki değişikliği bekle; gönderici düşerse (iş silindi) bu son olay
        let closed = rx.changed().await.is_err();
        Some((Ok(ev), (rx, closed)))
    });
    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    ))
}

async fn download(
    State(st): State<AppState>,
    Path(id): Path<String>,
    req: Request,
) -> AppResult<Response> {
    let id = parse_id(&id)?;
    let (path, view) = st.store.output(id).ok_or(AppError::NotFound)?;
    let out = view.output.ok_or(AppError::NotFound)?;
    // ServeFile: Range, ETag, Last-Modified'ı halleder
    let res = ServeFile::new(&path)
        .oneshot(req)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut res = res.map(Body::new);
    let headers = res.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&out.mime)
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    let ascii: String = out
        .name
        .chars()
        .filter(|c| c.is_ascii() && !matches!(c, '"' | '\\' | '\r' | '\n'))
        .collect();
    let encoded = percent_encode(&out.name);
    if let Ok(v) = HeaderValue::from_str(&format!(
        "attachment; filename=\"{ascii}\"; filename*=UTF-8''{encoded}"
    )) {
        headers.insert(header::CONTENT_DISPOSITION, v);
    }
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    Ok(res.into_response())
}

fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[cfg(test)]
mod tests;
