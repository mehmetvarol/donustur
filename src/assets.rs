//! Ön yüz (web/dist) ikiliye gömülü; SPA için bilinmeyen yollar index.html'e düşer.

use axum::{
    body::Body,
    http::{HeaderValue, StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "web/dist/"]
#[exclude = ".gitkeep"]
struct Assets;

pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    match Assets::get(path) {
        Some(f) => file_response(path, f.data.into_owned()),
        None if path.starts_with("api/") => (StatusCode::NOT_FOUND, "yok").into_response(),
        None => match Assets::get("index.html") {
            Some(f) => file_response("index.html", f.data.into_owned()),
            None => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Ön yüz derlenmemiş. Çalıştır: cd web && npm install && npm run build, sonra cargo build.",
            )
                .into_response(),
        },
    }
}

fn file_response(path: &str, data: Vec<u8>) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let cache = if path.starts_with("assets/") {
        // Vite içerik-hash'li dosyalar
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    (
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_str(mime.as_ref())
                    .unwrap_or(HeaderValue::from_static("application/octet-stream")),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static(cache)),
        ],
        Body::from(data),
    )
        .into_response()
}
