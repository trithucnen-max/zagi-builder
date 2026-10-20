use chrono::Local;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::sleep;

/// Cấu hình bảo vệ chống khoá tài khoản Zalo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiBanConfig {
    pub min_jitter_ms: u64,
    pub max_jitter_ms: u64,
    pub max_stranger_daily: u32,
}

impl Default for AntiBanConfig {
    fn default() -> Self {
        Self {
            min_jitter_ms: 1500,
            max_jitter_ms: 4000,
            max_stranger_daily: 30,
        }
    }
}

/// Nhật ký hạn ngạch gửi tin nhắn người lạ hàng ngày
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaRecord {
    pub date: String,
    pub count: u32,
    pub logs: Vec<QuotaLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaLogEntry {
    pub timestamp: String,
    pub target: String,
}

#[derive(Clone)]
pub struct AntiBanEngine {
    config: AntiBanConfig,
    state: Arc<Mutex<QuotaRecord>>,
}

impl AntiBanEngine {
    pub fn new(config: AntiBanConfig) -> Self {
        let today = Local::now().format("%Y-%m-%d").to_string();
        Self {
            config,
            state: Arc::new(Mutex::new(QuotaRecord {
                date: today,
                count: 0,
                logs: Vec::new(),
            })),
        }
    }

    /// Giãn cách thời gian ngẫu nhiên (Jitter) mô phỏng người thật gõ phím
    pub async fn apply_jitter(&self) -> u64 {
        let delay_ms = {
            let mut rng = rand::rng();
            rng.random_range(self.config.min_jitter_ms..=self.config.max_jitter_ms)
        };
        sleep(Duration::from_millis(delay_ms)).await;
        delay_ms
    }

    /// Kiểm tra và tăng hạn ngạch gửi tin nhắn người lạ
    pub fn check_and_increment_stranger_quota(&self, target_info: &str) -> Result<u32, String> {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let mut state = self.state.lock().unwrap();

        // Tự động reset sang ngày mới
        if state.date != today {
            state.date = today.clone();
            state.count = 0;
            state.logs.clear();
        }

        if state.count >= self.config.max_stranger_daily {
            return Err(format!(
                "Hạn ngạch an toàn chống ban (Anti-Ban): Đã đạt tối đa {} tin nhắn người lạ trong ngày {}. Vui lòng thử lại vào ngày mai.",
                self.config.max_stranger_daily, state.date
            ));
        }

        state.count += 1;
        state.logs.push(QuotaLogEntry {
            timestamp: Local::now().to_rfc3339(),
            target: target_info.to_string(),
        });

        let remaining = self.config.max_stranger_daily - state.count;
        Ok(remaining)
    }

    /// Lấy trạng thái hạn ngạch hiện tại
    pub fn get_quota_status(&self) -> (u32, u32) {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let mut state = self.state.lock().unwrap();
        if state.date != today {
            state.date = today;
            state.count = 0;
            state.logs.clear();
        }
        (state.count, self.config.max_stranger_daily)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_jitter_within_range() {
        let engine = AntiBanEngine::new(AntiBanConfig {
            min_jitter_ms: 10,
            max_jitter_ms: 30,
            max_stranger_daily: 5,
        });

        let delay = engine.apply_jitter().await;
        assert!(delay >= 10 && delay <= 30);
    }

    #[test]
    fn test_stranger_quota_limit() {
        let engine = AntiBanEngine::new(AntiBanConfig {
            min_jitter_ms: 10,
            max_jitter_ms: 20,
            max_stranger_daily: 2,
        });

        assert!(engine.check_and_increment_stranger_quota("user_01").is_ok());
        assert!(engine.check_and_increment_stranger_quota("user_02").is_ok());

        // Lần thứ 3 phải bị chặn
        let res = engine.check_and_increment_stranger_quota("user_03");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Đã đạt tối đa 2 tin nhắn người lạ"));
    }
}
