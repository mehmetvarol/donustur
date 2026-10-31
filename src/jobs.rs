//! Süreç içi iş kuyruğu: durum, ilerleme (watch), eşzamanlılık (semaphore), iptal, temizlik.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::{Semaphore, watch};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{
    config::Config,
    engine,
    error::{AppError, AppResult},
    formats::{Engine, Options, Target, find},
    probe::{FfprobeInfo, InputInfo},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Queued,
    Running,
    Done,
    Failed,
    Cancelled,
}

impl Status {
    pub fn is_terminal(self) -> bool {
        matches!(self, Status::Done | Status::Failed | Status::Cancelled)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputInfo {
    pub name: String,
    pub size: u64,
    pub mime: String,
}

/// API'ye dönen iş görünümü. `watch` kanalında bu dolaşır.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobView {
    pub id: Uuid,
    pub status: Status,
    pub progress: f32,
    pub target: String,
    pub options: Options,
    pub input: InputInfo,
    pub output: Option<OutputInfo>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
}

struct Entry {
    tx: watch::Sender<JobView>,
    cancel: CancellationToken,
    upload_dir: PathBuf,
    output_dir: PathBuf,
    output_path: PathBuf,
}

pub struct JobStore {
    jobs: DashMap<Uuid, Arc<Entry>>,
    sem: Arc<Semaphore>,
    config: Arc<Config>,
    caps: Arc<engine::ffmpeg::Capabilities>,
}

/// Dosya adını güvenli hâle getir: yalnız [A-Za-z0-9._-], en çok 80 karakter.
pub fn safe_stem(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let cleaned: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(['.', '_', '-']);
    let cut: String = trimmed.chars().take(80).collect();
    if cut.is_empty() {
        "cikti".to_string()
    } else {
        cut
    }
}

impl JobStore {
    pub fn new(config: Arc<Config>, caps: Arc<engine::ffmpeg::Capabilities>) -> Arc<Self> {
        Arc::new(Self {
            jobs: DashMap::new(),
            sem: Arc::new(Semaphore::new(config.workers)),
            config,
            caps,
        })
    }

    pub fn workers(&self) -> usize {
        self.config.workers
    }

    /// Yükleme için yeni iş kimliği ve klasörü.
    pub async fn new_upload_dir(&self) -> AppResult<(Uuid, PathBuf)> {
        let id = Uuid::new_v4();
        let dir = self.config.uploads_dir().join(id.to_string());
        tokio::fs::create_dir_all(&dir).await?;
        Ok((id, dir))
    }

    /// Yüklenmiş dosyayı kuyruğa al.
    #[allow(clippy::too_many_arguments)]
    pub async fn submit(
        self: &Arc<Self>,
        id: Uuid,
        upload_dir: PathBuf,
        input_path: PathBuf,
        input: InputInfo,
        ff: Option<FfprobeInfo>,
        target: Target,
        options: Options,
    ) -> AppResult<JobView> {
        let output_dir = self.config.outputs_dir().join(id.to_string());
        tokio::fs::create_dir_all(&output_dir).await?;
        let out_name = format!("{}.{}", safe_stem(&input.name), target.ext);
        let output_path = output_dir.join(&out_name);

        let view = JobView {
            id,
            status: Status::Queued,
            progress: 0.0,
            target: target.id.to_string(),
            options: options.clone(),
            input,
            output: None,
            error: None,
            created_at: Utc::now(),
            started_at: None,
            finished_at: None,
        };
        let (tx, _rx) = watch::channel(view.clone());
        let entry = Arc::new(Entry {
            tx,
            cancel: CancellationToken::new(),
            upload_dir,
            output_dir,
            output_path: output_path.clone(),
        });
        self.jobs.insert(id, entry.clone());

        let store = Arc::clone(self);
        tokio::spawn(async move {
            store
                .run_job(
                    entry,
                    input_path,
                    output_path,
                    out_name,
                    ff,
                    target,
                    options,
                )
                .await;
        });
        Ok(view)
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_job(
        &self,
        entry: Arc<Entry>,
        input_path: PathBuf,
        output_path: PathBuf,
        out_name: String,
        ff: Option<FfprobeInfo>,
        target: Target,
        options: Options,
    ) {
        let permit = tokio::select! {
            p = self.sem.clone().acquire_owned() => p,
            _ = entry.cancel.cancelled() => {
                entry.tx.send_modify(|v| { v.status = Status::Cancelled; v.finished_at = Some(Utc::now()); });
                return;
            }
        };
        let _permit = permit.expect("semaphore açık");
        if entry.cancel.is_cancelled() {
            entry.tx.send_modify(|v| {
                v.status = Status::Cancelled;
                v.finished_at = Some(Utc::now());
            });
            return;
        }
        entry.tx.send_modify(|v| {
            v.status = Status::Running;
            v.started_at = Some(Utc::now());
        });
        tracing::info!(job = %entry.tx.borrow().id, target = target.id, "başladı");

        let timeout = Duration::from_secs(self.config.job_timeout_min * 60);
        let result = match target.engine {
            Engine::Image => {
                self.run_image(
                    &entry,
                    &input_path,
                    &output_path,
                    &target,
                    &options,
                    timeout,
                )
                .await
            }
            Engine::Ffmpeg => {
                self.run_ffmpeg(
                    &entry,
                    &input_path,
                    &output_path,
                    &target,
                    &options,
                    ff.unwrap_or_default(),
                    timeout,
                )
                .await
            }
        };

        match result {
            Ok(()) => {
                let size = tokio::fs::metadata(&output_path)
                    .await
                    .map(|m| m.len())
                    .unwrap_or(0);
                entry.tx.send_modify(|v| {
                    v.status = Status::Done;
                    v.progress = 100.0;
                    v.finished_at = Some(Utc::now());
                    v.output = Some(OutputInfo {
                        name: out_name.clone(),
                        size,
                        mime: target.mime.to_string(),
                    });
                });
                tracing::info!(job = %entry.tx.borrow().id, size, "bitti");
            }
            Err(e) => {
                let cancelled = entry.cancel.is_cancelled();
                entry.tx.send_modify(|v| {
                    v.status = if cancelled {
                        Status::Cancelled
                    } else {
                        Status::Failed
                    };
                    v.finished_at = Some(Utc::now());
                    v.error = Some(e.to_string());
                });
                let _ = tokio::fs::remove_file(&output_path).await;
                tracing::warn!(job = %entry.tx.borrow().id, error = %e, cancelled, "başarısız");
            }
        }
        // giriş dosyasına artık gerek yok
        let _ = tokio::fs::remove_dir_all(&entry.upload_dir).await;
    }

    async fn run_image(
        &self,
        entry: &Arc<Entry>,
        input: &Path,
        output: &Path,
        target: &Target,
        options: &Options,
        timeout: Duration,
    ) -> AppResult<()> {
        let (input, output, target, options) = (
            input.to_path_buf(),
            output.to_path_buf(),
            target.clone(),
            options.clone(),
        );
        let mime = entry.tx.borrow().input.mime.clone();
        let tx = entry.tx.clone();
        let task = tokio::task::spawn_blocking(move || {
            engine::image::convert(&input, &mime, &output, &target, &options, |p| {
                tx.send_modify(|v| v.progress = p);
            })
        });
        tokio::select! {
            r = task => r.map_err(|e| AppError::Internal(format!("görev çöktü: {e}")))?,
            _ = entry.cancel.cancelled() => Err(AppError::Conversion("iptal edildi".into())),
            _ = tokio::time::sleep(timeout) => Err(AppError::Conversion("zaman aşımı".into())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_ffmpeg(
        &self,
        entry: &Arc<Entry>,
        input: &Path,
        output: &Path,
        target: &Target,
        options: &Options,
        ff: FfprobeInfo,
        timeout: Duration,
    ) -> AppResult<()> {
        if !self.caps.available() {
            return Err(AppError::Conversion("ffmpeg bulunamadı".into()));
        }
        let plan = engine::ffmpeg::build_plan(
            target,
            options,
            input,
            output,
            &ff,
            &self.caps,
            self.config.hwaccel,
        )?;
        let tx = entry.tx.clone();
        let first = engine::ffmpeg::run(
            &self.config.ffmpeg,
            &plan.args,
            plan.expected_duration,
            entry.cancel.clone(),
            timeout,
            |p| {
                tx.send_modify(|v| v.progress = p);
            },
        )
        .await;
        match (first, plan.fallback) {
            (Ok(()), _) => Ok(()),
            (Err(e), Some(fb)) if !entry.cancel.is_cancelled() => {
                tracing::warn!(error = %e, "donanım kodlayıcı başarısız, yazılıma dönülüyor");
                let tx = entry.tx.clone();
                tx.send_modify(|v| v.progress = 0.0);
                engine::ffmpeg::run(
                    &self.config.ffmpeg,
                    &fb,
                    plan.expected_duration,
                    entry.cancel.clone(),
                    timeout,
                    |p| {
                        tx.send_modify(|v| v.progress = p);
                    },
                )
                .await
            }
            (Err(e), _) => Err(e),
        }
    }

    pub fn get(&self, id: Uuid) -> Option<JobView> {
        self.jobs.get(&id).map(|e| e.tx.borrow().clone())
    }

    pub fn subscribe(&self, id: Uuid) -> Option<watch::Receiver<JobView>> {
        self.jobs.get(&id).map(|e| e.tx.subscribe())
    }

    /// İndirme için çıktı yolu + görünüm (yalnız bitmiş işler).
    pub fn output(&self, id: Uuid) -> Option<(PathBuf, JobView)> {
        let e = self.jobs.get(&id)?;
        let v = e.tx.borrow().clone();
        (v.status == Status::Done).then(|| (e.output_path.clone(), v))
    }

    /// İptal et ve tüm dosyaları sil.
    pub async fn remove(&self, id: Uuid) -> bool {
        let Some((_, e)) = self.jobs.remove(&id) else {
            return false;
        };
        e.cancel.cancel();
        e.tx.send_modify(|v| {
            if !v.status.is_terminal() {
                v.status = Status::Cancelled;
                v.finished_at = Some(Utc::now());
            }
        });
        // ffmpeg'in dosyayı bırakması için kısa bekleme
        tokio::time::sleep(Duration::from_millis(200)).await;
        let _ = tokio::fs::remove_dir_all(&e.upload_dir).await;
        let _ = tokio::fs::remove_dir_all(&e.output_dir).await;
        true
    }

    pub fn list(&self) -> Vec<JobView> {
        let mut v: Vec<JobView> = self.jobs.iter().map(|e| e.tx.borrow().clone()).collect();
        v.sort_by_key(|j| std::cmp::Reverse(j.created_at));
        v
    }

    pub fn counts(&self) -> (usize, usize) {
        let mut queued = 0;
        let mut running = 0;
        for e in self.jobs.iter() {
            match e.tx.borrow().status {
                Status::Queued => queued += 1,
                Status::Running => running += 1,
                _ => {}
            }
        }
        (queued, running)
    }

    /// TTL'den eski işleri sil.
    pub async fn sweep(&self, ttl: Duration) -> usize {
        let cutoff =
            Utc::now() - chrono::Duration::from_std(ttl).unwrap_or(chrono::Duration::hours(1));
        let old: Vec<Uuid> = self
            .jobs
            .iter()
            .filter(|e| e.tx.borrow().created_at < cutoff)
            .map(|e| e.tx.borrow().id)
            .collect();
        let n = old.len();
        for id in old {
            self.remove(id).await;
        }
        n
    }

    /// Yeniden başlatmada önceki çalıştırmadan kalan dosyaları sil.
    pub async fn wipe_disk(&self) {
        for d in [self.config.uploads_dir(), self.config.outputs_dir()] {
            let _ = tokio::fs::remove_dir_all(&d).await;
            let _ = tokio::fs::create_dir_all(&d).await;
        }
    }
}

/// Hedef kimliğinden Target (api katmanı için kısayol).
pub fn target_or_400(id: &str) -> AppResult<Target> {
    find(id).ok_or_else(|| AppError::BadRequest(format!("bilinmeyen hedef format: {id}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_stem_cases() {
        assert_eq!(safe_stem("../../etc/passwd"), "passwd");
        assert_eq!(safe_stem("Tatil Fotoğrafı (1).HEIC"), "Tatil_Foto_raf___1");
        assert_eq!(safe_stem(".hidden"), "hidden");
        assert_eq!(safe_stem(""), "cikti");
        assert_eq!(safe_stem("a".repeat(200).as_str()).len(), 80);
    }
}
