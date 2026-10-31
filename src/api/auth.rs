//! İsteğe bağlı tek şifre. `DONUSTUR_PASSWORD` tanımlıysa `/api/*` (health hariç)
//! `Authorization: Bearer <şifre>` ya da `?token=<şifre>` ister (SSE/indirme için).

use axum::{
    Json,
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::Next,
    response::Response,
};
use serde::Deserialize;

use super::AppState;
use crate::error::AppError;

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn token_from(req: &Request) -> Option<String> {
    if let Some(v) = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(t) = v.strip_prefix("Bearer ") {
            return Some(t.trim().to_string());
        }
    }
    req.uri().query().and_then(|q| {
        q.split('&')
            .find_map(|kv| kv.strip_prefix("token=").map(|v| v.to_string()))
            .and_then(|v| percent_decode(&v))
    })
}

fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let h = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(h, 16).ok()?);
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

pub async fn require(
    State(st): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let Some(expected) = st.config.password.as_deref() else {
        return Ok(next.run(req).await);
    };
    match token_from(&req) {
        Some(t) if constant_time_eq(t.as_bytes(), expected.as_bytes()) => Ok(next.run(req).await),
        _ => Err(AppError::Unauthorized),
    }
}

#[derive(Deserialize)]
pub struct Check {
    password: String,
}

/// Ön yüz şifre ekranı: doğruysa 204, değilse 401.
pub async fn check(
    State(st): State<AppState>,
    Json(body): Json<Check>,
) -> Result<StatusCode, AppError> {
    match st.config.password.as_deref() {
        None => Ok(StatusCode::NO_CONTENT),
        Some(p) if constant_time_eq(p.as_bytes(), body.password.as_bytes()) => {
            Ok(StatusCode::NO_CONTENT)
        }
        Some(_) => Err(AppError::Unauthorized),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_and_compare() {
        assert_eq!(percent_decode("a%20b+c").unwrap(), "a b c");
        assert_eq!(percent_decode("%C3%A7ay").unwrap(), "çay");
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
    }
}
