//! POST /api/jobs — multipart: `target`, `options` (JSON), `file` (akışla diske).

use std::path::PathBuf;

use axum::{
    Json,
    extract::{Multipart, State},
    http::StatusCode,
};
use serde_json::json;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use super::AppState;
use crate::{
    error::{AppError, AppResult},
    formats::{self, Kind},
    jobs::target_or_400,
    probe,
};

const SNIFF_BYTES: usize = 8192;

pub async fn create_job(
    State(st): State<AppState>,
    mut mp: Multipart,
) -> AppResult<(StatusCode, Json<serde_json::Value>)> {
    let (id, dir) = st.store.new_upload_dir().await?;
    match receive(&st, id, dir.clone(), &mut mp).await {
        Ok(view) => Ok((
            StatusCode::ACCEPTED,
            Json(json!({ "id": view.id, "status": view.status })),
        )),
        Err(e) => {
            let _ = tokio::fs::remove_dir_all(&dir).await;
            Err(e)
        }
    }
}

async fn receive(
    st: &AppState,
    id: Uuid,
    dir: PathBuf,
    mp: &mut Multipart,
) -> AppResult<crate::jobs::JobView> {
    let mut target_id: Option<String> = None;
    let mut options_raw: Option<serde_json::Map<String, serde_json::Value>> = None;
    let mut file: Option<(PathBuf, String, u64, Vec<u8>)> = None; // yol, orijinal ad, boyut, ilk baytlar

    while let Some(mut field) = mp
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart: {e}")))?
    {
        match field.name().unwrap_or("") {
            "target" => {
                target_id = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?
                        .trim()
                        .to_string(),
                );
            }
            "options" => {
                let txt = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                if !txt.trim().is_empty() {
                    let v: serde_json::Value = serde_json::from_str(&txt)
                        .map_err(|e| AppError::BadRequest(format!("options JSON: {e}")))?;
                    options_raw =
                        Some(v.as_object().cloned().ok_or_else(|| {
                            AppError::BadRequest("options bir nesne olmalı".into())
                        })?);
                }
            }
            "file" => {
                if file.is_some() {
                    return Err(AppError::BadRequest(
                        "tek dosya gönderin; her dosya ayrı istek".into(),
                    ));
                }
                let original = field.file_name().unwrap_or("dosya").to_string();
                let path = dir.join("input");
                let mut f = tokio::fs::File::create(&path).await?;
                let mut size: u64 = 0;
                let mut head: Vec<u8> = Vec::with_capacity(SNIFF_BYTES);
                while let Some(chunk) = field.chunk().await.map_err(|e| {
                    // gövde sınırı aşıldığında axum buradan hata verir
                    if e.status() == StatusCode::PAYLOAD_TOO_LARGE {
                        AppError::TooLarge
                    } else {
                        AppError::BadRequest(format!("yükleme kesildi: {e}"))
                    }
                })? {
                    size += chunk.len() as u64;
                    if size > st.config.max_upload_bytes {
                        return Err(AppError::TooLarge);
                    }
                    if head.len() < SNIFF_BYTES {
                        let take = (SNIFF_BYTES - head.len()).min(chunk.len());
                        head.extend_from_slice(&chunk[..take]);
                    }
                    f.write_all(&chunk).await?;
                }
                f.flush().await?;
                drop(f);
                file = Some((path, original, size, head));
            }
            _ => {} // bilinmeyen alanları yut
        }
    }

    let (path, original, size, head) =
        file.ok_or_else(|| AppError::BadRequest("`file` alanı eksik".into()))?;
    if size == 0 {
        return Err(AppError::BadRequest("boş dosya".into()));
    }
    let target = target_or_400(
        target_id
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("`target` alanı eksik".into()))?,
    )?;
    let (mime, kind) = probe::sniff(&head)?;
    if !formats::accepts(&target, kind) {
        return Err(AppError::Unsupported(format!(
            "{} türündeki dosya {} hedefine çevrilemez",
            match kind {
                Kind::Image => "görsel",
                Kind::Video => "video",
                Kind::Audio => "ses",
            },
            target.label
        )));
    }
    let options = formats::validate(&target, options_raw.as_ref())?;

    // Ayrıntılı bilgi
    let mut info = probe::InputInfo {
        name: original,
        size,
        mime: mime.clone(),
        kind,
        width: None,
        height: None,
        duration: None,
        codec: None,
        has_audio: None,
    };
    let mut ff = None;
    match kind {
        Kind::Image => {
            if let Some((w, h)) = probe::image_dimensions(&path).await {
                info.width = Some(w);
                info.height = Some(h);
            }
        }
        Kind::Video | Kind::Audio => {
            if !st.caps.available() {
                return Err(AppError::Unsupported(
                    "sunucuda ffmpeg yok; video/ses dönüşümü kapalı".into(),
                ));
            }
            let p = probe::ffprobe(&st.config.ffprobe, &path).await?;
            info.width = p.width;
            info.height = p.height;
            info.duration = p.duration;
            info.codec = p.codec.clone();
            info.has_audio = Some(p.has_audio);
            // sihirli bayt "video" dese de içinde görüntü akışı yoksa (m4a gibi) ses say
            if kind == Kind::Video && !p.has_video && p.has_audio {
                info.kind = Kind::Audio;
                if !formats::accepts(&target, Kind::Audio) {
                    return Err(AppError::Unsupported(
                        "dosyada video akışı yok; yalnız ses hedefleri seçilebilir".into(),
                    ));
                }
            }
            ff = Some(p);
        }
    }

    st.store
        .submit(id, dir, path, info, ff, target, options)
        .await
}
