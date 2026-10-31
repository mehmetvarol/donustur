//! API entegrasyon testleri: router'ı gerçek ağ olmadan `oneshot` ile sürer.

use std::{sync::Arc, time::Duration};

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;

use super::{AppState, router};
use crate::{config::Config, engine, jobs::JobStore};

async fn app(password: Option<&str>) -> (Router, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = Config::from_env();
    cfg.data_dir = dir.path().to_path_buf();
    cfg.workers = 2;
    cfg.password = password.map(str::to_string);
    cfg.hwaccel = false;
    let config = Arc::new(cfg);
    let caps = Arc::new(engine::ffmpeg::detect(&config.ffmpeg).await);
    let store = JobStore::new(config.clone(), caps.clone());
    store.wipe_disk().await;
    let state = AppState {
        config,
        store,
        caps,
    };
    (Router::new().nest("/api", router(state)), dir)
}

fn multipart(fields: &[(&str, &str)], file: Option<(&str, &str, &[u8])>) -> (String, Vec<u8>) {
    let b = "----morphboxTest9f3a";
    let mut body = Vec::new();
    for (k, v) in fields {
        body.extend_from_slice(
            format!("--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n")
                .as_bytes(),
        );
    }
    if let Some((name, mime, data)) = file {
        body.extend_from_slice(format!("--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n").as_bytes());
        body.extend_from_slice(data);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{b}--\r\n").as_bytes());
    (format!("multipart/form-data; boundary={b}"), body)
}

async fn json(res: axum::response::Response) -> serde_json::Value {
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null)
}

fn png_bytes() -> Vec<u8> {
    let mut img = image::RgbaImage::new(40, 20);
    for (x, _, p) in img.enumerate_pixels_mut() {
        *p = image::Rgba([x as u8 * 6, 90, 200, 255]);
    }
    let mut cur = std::io::Cursor::new(Vec::new());
    img.write_to(&mut cur, image::ImageFormat::Png).unwrap();
    cur.into_inner()
}

async fn wait_done(app: &Router, id: &str) -> serde_json::Value {
    for _ in 0..200 {
        let res = app
            .clone()
            .oneshot(
                Request::get(format!("/api/jobs/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let v = json(res).await;
        if matches!(
            v["status"].as_str(),
            Some("done") | Some("failed") | Some("cancelled")
        ) {
            return v;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("iş {id} zamanında bitmedi");
}

#[tokio::test]
async fn health_and_formats() {
    let (app, _d) = app(None).await;
    let res = app
        .clone()
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let v = json(res).await;
    assert_eq!(v["ok"], true);

    let res = app
        .oneshot(Request::get("/api/formats").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let v = json(res).await;
    let arr = v.as_array().unwrap();
    assert!(
        arr.iter()
            .any(|t| t["id"] == "webp" && t["available"] == true)
    );
    assert!(
        arr.iter()
            .all(|t| t["options"].is_array() && t["accepts"].is_array())
    );
}

#[tokio::test]
async fn png_to_webp_end_to_end() {
    let (app, _d) = app(None).await;
    let (ct, body) = multipart(
        &[
            ("target", "webp"),
            ("options", r#"{"quality": 70, "width": 20}"#),
        ],
        Some(("Örnek Resim.png", "image/png", &png_bytes())),
    );
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/jobs")
                .header(header::CONTENT_TYPE, ct)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let id = json(res).await["id"].as_str().unwrap().to_string();

    let v = wait_done(&app, &id).await;
    assert_eq!(v["status"], "done", "{v}");
    assert_eq!(v["progress"], 100.0);
    assert_eq!(v["input"]["mime"], "image/png");
    assert_eq!(v["input"]["width"], 40);
    assert_eq!(v["output"]["name"], "rnek_Resim.webp");

    let res = app
        .clone()
        .oneshot(
            Request::get(format!("/api/jobs/{id}/download"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()[header::CONTENT_TYPE], "image/webp");
    assert!(
        res.headers()[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .contains("attachment")
    );
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[0..4], b"RIFF");
    let back = image::load_from_memory(&bytes).unwrap();
    assert_eq!(back.width(), 20);

    // Range desteği
    let res = app
        .clone()
        .oneshot(
            Request::get(format!("/api/jobs/{id}/download"))
                .header(header::RANGE, "bytes=0-3")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::PARTIAL_CONTENT);

    // sil
    let res = app
        .clone()
        .oneshot(
            Request::delete(format!("/api/jobs/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NO_CONTENT);
    let res = app
        .oneshot(
            Request::get(format!("/api/jobs/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn rejects_bad_inputs() {
    let (app, _d) = app(None).await;
    // zip dosyası
    let (ct, body) = multipart(
        &[("target", "webp")],
        Some((
            "a.zip",
            "application/zip",
            b"PK\x03\x04\0\0\0\0\0\0\0\0\0\0",
        )),
    );
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/jobs")
                .header(header::CONTENT_TYPE, ct)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);

    // görseli mp3'e çevirme
    let (ct, body) = multipart(
        &[("target", "mp3")],
        Some(("a.png", "image/png", &png_bytes())),
    );
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/jobs")
                .header(header::CONTENT_TYPE, ct)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);

    // sınır dışı seçenek
    let (ct, body) = multipart(
        &[("target", "jpeg"), ("options", r#"{"quality": 500}"#)],
        Some(("a.png", "image/png", &png_bytes())),
    );
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/jobs")
                .header(header::CONTENT_TYPE, ct)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let v = json(res).await;
    assert_eq!(v["error"]["code"], "bad_request");

    // dosya yok
    let (ct, body) = multipart(&[("target", "jpeg")], None);
    let res = app
        .oneshot(
            Request::post("/api/jobs")
                .header(header::CONTENT_TYPE, ct)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn password_protects_api() {
    let (app, _d) = app(Some("gizli")).await;
    let res = app
        .clone()
        .oneshot(Request::get("/api/formats").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    let res = app
        .clone()
        .oneshot(
            Request::get("/api/formats")
                .header(header::AUTHORIZATION, "Bearer gizli")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let res = app
        .clone()
        .oneshot(
            Request::get("/api/formats?token=gizli")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    // health her zaman açık
    let res = app
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

/// ffmpeg varsa: lavfi ile 1 sn test videosu üret → mp3, gif, mp4.
#[tokio::test]
async fn video_targets_if_ffmpeg_present() {
    let (app, dir) = app(None).await;
    let caps = engine::ffmpeg::detect("ffmpeg").await;
    if !caps.available() {
        eprintln!("ffmpeg yok, video testi atlandı");
        return;
    }
    let src = dir.path().join("test.mp4");
    let st = tokio::process::Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=160x120:rate=15:duration=1",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
        ])
        .arg(&src)
        .status()
        .await
        .unwrap();
    assert!(st.success());
    let data = std::fs::read(&src).unwrap();

    for (target, opts, magic) in [
        ("mp3", r#"{"bitrate":"128"}"#, &b"ID3"[..]),
        ("gif_anim", r#"{"fps":5,"width":80}"#, &b"GIF8"[..]),
        (
            "mp4",
            r#"{"crf":30,"preset":"ultrafast","resolution":"360"}"#,
            &[][..],
        ),
        ("webm", r#"{"crf":40}"#, &[0x1A, 0x45, 0xDF, 0xA3][..]),
    ] {
        let (ct, body) = multipart(
            &[("target", target), ("options", opts)],
            Some(("test.mp4", "video/mp4", &data)),
        );
        let res = app
            .clone()
            .oneshot(
                Request::post("/api/jobs")
                    .header(header::CONTENT_TYPE, ct)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::ACCEPTED, "{target}");
        let id = json(res).await["id"].as_str().unwrap().to_string();
        let v = wait_done(&app, &id).await;
        assert_eq!(v["status"], "done", "{target}: {v}");
        assert!(v["input"]["duration"].as_f64().unwrap() > 0.5);
        let res = app
            .clone()
            .oneshot(
                Request::get(format!("/api/jobs/{id}/download"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK, "{target}");
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        assert!(bytes.len() > 100, "{target} çok küçük");
        if !magic.is_empty() {
            assert_eq!(&bytes[..magic.len()], magic, "{target} sihirli bayt");
        }
    }
}

/// HEIC → JPEG (yalnız `heic` özelliğiyle; fixture heif-enc ile üretilmiş 640×480 testsrc).
#[cfg(feature = "heic")]
#[tokio::test]
async fn heic_to_jpeg_end_to_end() {
    let heic = include_bytes!("../../tests/fixtures/sample-640x480.heic");
    let (app, _d) = app(None).await;
    let (ct, body) = multipart(
        &[("target", "jpeg"), ("options", r#"{"quality": 85}"#)],
        Some(("Tatil Foto.heic", "image/heic", heic)),
    );
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/jobs")
                .header(header::CONTENT_TYPE, ct)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let id = json(res).await["id"].as_str().unwrap().to_string();

    let v = wait_done(&app, &id).await;
    assert_eq!(v["status"], "done", "{v}");
    assert_eq!(v["input"]["mime"], "image/heif");
    assert_eq!(v["input"]["width"], 640);
    assert_eq!(v["input"]["height"], 480);
    assert_eq!(v["output"]["name"], "Tatil_Foto.jpg");

    let res = app
        .oneshot(
            Request::get(format!("/api/jobs/{id}/download"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.headers()[header::CONTENT_TYPE], "image/jpeg");
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[0..2], &[0xFF, 0xD8]);
    let back = image::load_from_memory(&bytes).unwrap();
    assert_eq!((back.width(), back.height()), (640, 480));
}
