//! Çalışma zamanı ayarları. Hepsi `DONUSTUR_*` ortam değişkenlerinden okunur.

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub data_dir: PathBuf,
    pub workers: usize,
    pub ttl_min: u64,
    pub max_upload_bytes: u64,
    pub job_timeout_min: u64,
    pub password: Option<String>,
    pub hwaccel: bool,
    pub ffmpeg: String,
    pub ffprobe: String,
}

fn env_or<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(default)
}

impl Config {
    pub fn from_env() -> Self {
        let cpus = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(2);
        let default_workers = (cpus / 2).max(1);
        let hwaccel = std::env::var("DONUSTUR_HWACCEL")
            .map(|v| matches!(v.trim(), "auto" | "1" | "true" | "on"))
            .unwrap_or(false);
        Self {
            host: env_or("DONUSTUR_HOST", "0.0.0.0".to_string()),
            port: env_or("DONUSTUR_PORT", 8080),
            data_dir: PathBuf::from(env_or("DONUSTUR_DATA_DIR", "./data".to_string())),
            workers: env_or("DONUSTUR_WORKERS", default_workers).max(1),
            ttl_min: env_or("DONUSTUR_TTL_MIN", 60),
            max_upload_bytes: env_or::<u64>("DONUSTUR_MAX_UPLOAD_MB", 2048) * 1024 * 1024,
            job_timeout_min: env_or("DONUSTUR_JOB_TIMEOUT_MIN", 30),
            password: std::env::var("DONUSTUR_PASSWORD")
                .ok()
                .filter(|p| !p.trim().is_empty()),
            hwaccel,
            ffmpeg: env_or("DONUSTUR_FFMPEG", "ffmpeg".to_string()),
            ffprobe: env_or("DONUSTUR_FFPROBE", "ffprobe".to_string()),
        }
    }

    pub fn uploads_dir(&self) -> PathBuf {
        self.data_dir.join("uploads")
    }
    pub fn outputs_dir(&self) -> PathBuf {
        self.data_dir.join("outputs")
    }
}
