use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, REFERER, USER_AGENT};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum QrLoginError {
    #[error("Lỗi HTTP request: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Không thể lấy phiên bản ZLogin từ trang login")]
    VersionNotFound,
    #[error("Phản hồi từ Zalo không hợp lệ: {0}")]
    InvalidResponse(String),
    #[error("Mã QR đã hết hạn")]
    Expired,
    #[error("Người dùng đã từ chối đăng nhập trên điện thoại")]
    Declined,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrCodeData {
    pub code: String,
    pub image_base64: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QrPollStatus {
    WaitingScan,
    Scanned { avatar_url: Option<String>, display_name: Option<String> },
    Confirmed { cookies: Vec<String> },
    Expired,
    Declined,
}

pub struct QrLoginSession {
    client: Client,
    user_agent: String,
}

impl QrLoginSession {
    pub fn new(user_agent: Option<String>) -> Self {
        let ua = user_agent.unwrap_or_else(|| {
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36".to_string()
        });

        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_str(&ua).unwrap());
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5"));

        let client = Client::builder()
            .default_headers(headers)
            .cookie_store(true)
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap();

        Self { client, user_agent: ua }
    }

    pub fn user_agent(&self) -> &str {
        &self.user_agent
    }

    /// Bước 1: Tải trang đăng nhập để thiết lập initial cookie và lấy version script
    pub async fn fetch_zlogin_version(&self) -> Result<String, QrLoginError> {
        let res = self
            .client
            .get("https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F")
            .header(REFERER, "https://chat.zalo.me/")
            .send()
            .await?;

        let html = res.text().await?;
        let re = Regex::new(r"https://stc-zlogin\.zdn\.vn/main-([\d.]+)\.js").unwrap();
        if let Some(caps) = re.captures(&html) {
            if let Some(matched) = caps.get(1) {
                return Ok(matched.as_str().to_string());
            }
        }

        Ok("25.02.01".to_string())
    }

    /// Bước 2: Khởi tạo login info và verify client
    async fn prepare_session(&self, version: &str) -> Result<(), QrLoginError> {
        let params_info = [
            ("continue", "https://zalo.me/pc"),
            ("v", version),
        ];

        let _ = self
            .client
            .post("https://id.zalo.me/account/logininfo")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header(REFERER, "https://id.zalo.me/account?continue=https%3A%2F%2Fzalo.me%2Fpc")
            .form(&params_info)
            .send()
            .await;

        let params_verify = [
            ("type", "device"),
            ("continue", "https://zalo.me/pc"),
            ("v", version),
        ];

        let _ = self
            .client
            .post("https://id.zalo.me/account/verify-client")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header(REFERER, "https://id.zalo.me/account?continue=https%3A%2F%2Fzalo.me%2Fpc")
            .form(&params_verify)
            .send()
            .await;

        Ok(())
    }

    /// Bước 3: Gọi API sinh mã QR đăng nhập
    pub async fn generate_qr(&self) -> Result<QrCodeData, QrLoginError> {
        let version = self.fetch_zlogin_version().await?;
        self.prepare_session(&version).await?;

        let params = [
            ("continue", "https://zalo.me/pc"),
            ("v", version.as_str()),
        ];

        let res = self
            .client
            .post("https://id.zalo.me/account/authen/qr/generate")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header(REFERER, "https://id.zalo.me/account?continue=https%3A%2F%2Fzalo.me%2Fpc")
            .header(ACCEPT, "*/*")
            .form(&params)
            .send()
            .await?;

        let json: serde_json::Value = res.json().await?;
        let data = json.get("data").ok_or_else(|| {
            QrLoginError::InvalidResponse(format!("Không tìm thấy trường 'data': {}", json))
        })?;

        let code = data.get("code").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let raw_image = data.get("image").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let clean_image = raw_image.trim_start_matches("data:image/png;base64,").to_string();

        if code.is_empty() || clean_image.is_empty() {
            return Err(QrLoginError::InvalidResponse("Code hoặc Image base64 rỗng".to_string()));
        }

        Ok(QrCodeData {
            code,
            image_base64: clean_image,
            version,
        })
    }

    /// Bước 4: Polling chờ người dùng quét mã trên điện thoại
    pub async fn poll_waiting_scan(&self, code: &str, version: &str) -> Result<serde_json::Value, QrLoginError> {
        let params = [
            ("code", code),
            ("continue", "https://chat.zalo.me/"),
            ("v", version),
        ];

        let res = self
            .client
            .post("https://id.zalo.me/account/authen/qr/waiting-scan")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header(REFERER, "https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F")
            .form(&params)
            .send()
            .await?;

        let json: serde_json::Value = res.json().await?;
        Ok(json)
    }

    /// Bước 5: Polling chờ người dùng bấm xác nhận đăng nhập trên điện thoại
    pub async fn poll_waiting_confirm(&self, code: &str, version: &str) -> Result<serde_json::Value, QrLoginError> {
        let params = [
            ("code", code),
            ("gToken", ""),
            ("gAction", "CONFIRM_QR"),
            ("continue", "https://chat.zalo.me/"),
            ("v", version),
        ];

        let res = self
            .client
            .post("https://id.zalo.me/account/authen/qr/waiting-confirm")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header(REFERER, "https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F")
            .form(&params)
            .send()
            .await?;

        let json: serde_json::Value = res.json().await?;
        Ok(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qr_session_init() {
        let session = QrLoginSession::new(None);
        assert!(!session.user_agent().is_empty());
    }
}
