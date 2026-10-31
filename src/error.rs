//! Tipli hatalar ve `{ "error": { "code", "message" } }` JSON cevabı.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Unsupported(String),
    #[error("bulunamadı")]
    NotFound,
    #[error("yetkisiz")]
    Unauthorized,
    #[error("dosya çok büyük")]
    TooLarge,
    #[error("{0}")]
    Conversion(String),
    #[error("iç hata: {0}")]
    Internal(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::BadRequest(_) => "bad_request",
            AppError::Unsupported(_) => "unsupported_media",
            AppError::NotFound => "not_found",
            AppError::Unauthorized => "unauthorized",
            AppError::TooLarge => "too_large",
            AppError::Conversion(_) => "conversion_failed",
            AppError::Internal(_) => "internal",
        }
    }
    pub fn status(&self) -> StatusCode {
        match self {
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Unsupported(_) => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::TooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            AppError::Conversion(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if matches!(self, AppError::Internal(_)) {
            tracing::error!(error = %self, "iç hata");
        }
        let body = json!({ "error": { "code": self.code(), "message": self.to_string() } });
        (self.status(), Json(body)).into_response()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}
impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
