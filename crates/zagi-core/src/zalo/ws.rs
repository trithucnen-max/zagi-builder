use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WsFrameError {
    #[error("Gói tin không đủ 4 bytes header")]
    HeaderTooShort,
    #[error("Lỗi giải mã chuỗi UTF-8 JSON: {0}")]
    Utf8Error(#[from] std::string::FromUtf8Error),
    #[error("Lỗi serialize/deserialize JSON: {0}")]
    JsonError(#[from] serde_json::Error),
}

/// Cấu trúc gói tin nhị phân của Zalo WebSocket
/// Header: 4 bytes:
/// - Byte 0: version (u8)
/// - Byte 1..3: cmd (u16 little-endian)
/// - Byte 3: sub_cmd (u8)
/// - Byte 4..: UTF-8 JSON payload
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ZaloWsFrame {
    pub version: u8,
    pub cmd: u16,
    pub sub_cmd: u8,
    pub payload: serde_json::Value,
}

impl ZaloWsFrame {
    pub fn new(version: u8, cmd: u16, sub_cmd: u8, payload: serde_json::Value) -> Self {
        Self {
            version,
            cmd,
            sub_cmd,
            payload,
        }
    }

    /// Tạo gói tin Heartbeat Ping định kỳ
    pub fn create_ping(event_id: i64) -> Self {
        Self {
            version: 1,
            cmd: 2,
            sub_cmd: 1,
            payload: serde_json::json!({
                "eventId": event_id
            }),
        }
    }

    /// Mã hóa gói tin thành byte buffer để gửi qua WebSocket
    pub fn encode(&self) -> Result<Vec<u8>, WsFrameError> {
        let json_bytes = serde_json::to_vec(&self.payload)?;
        let mut buffer = Vec::with_capacity(4 + json_bytes.len());

        buffer.push(self.version);
        let cmd_bytes = self.cmd.to_le_bytes();
        buffer.push(cmd_bytes[0]);
        buffer.push(cmd_bytes[1]);
        buffer.push(self.sub_cmd);
        buffer.extend_from_slice(&json_bytes);

        Ok(buffer)
    }

    /// Giải mã byte buffer từ WebSocket thành ZaloWsFrame
    pub fn decode(bytes: &[u8]) -> Result<Self, WsFrameError> {
        if bytes.len() < 4 {
            return Err(WsFrameError::HeaderTooShort);
        }

        let version = bytes[0];
        let cmd = u16::from_le_bytes([bytes[1], bytes[2]]);
        let sub_cmd = bytes[3];

        let payload = if bytes.len() > 4 {
            let json_str = String::from_utf8(bytes[4..].to_vec())?;
            serde_json::from_str(&json_str)?
        } else {
            serde_json::json!({})
        };

        Ok(Self {
            version,
            cmd,
            sub_cmd,
            payload,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ws_frame_encode_decode_roundtrip() {
        let payload = serde_json::json!({
            "key": "test_cipher_key_123",
            "serverTime": 1729410000
        });

        let frame = ZaloWsFrame::new(1, 501, 0, payload);
        let encoded = frame.encode().expect("Encode thất bại");

        assert_eq!(encoded[0], 1); // version
        assert_eq!(encoded[3], 0); // sub_cmd

        let decoded = ZaloWsFrame::decode(&encoded).expect("Decode thất bại");
        assert_eq!(decoded.version, 1);
        assert_eq!(decoded.cmd, 501);
        assert_eq!(decoded.sub_cmd, 0);
        assert_eq!(decoded.payload["key"], "test_cipher_key_123");
    }

    #[test]
    fn test_create_ping_frame() {
        let ping = ZaloWsFrame::create_ping(123456789);
        assert_eq!(ping.cmd, 2);
        assert_eq!(ping.sub_cmd, 1);
        assert_eq!(ping.payload["eventId"], 123456789);

        let encoded = ping.encode().unwrap();
        let decoded = ZaloWsFrame::decode(&encoded).unwrap();
        assert_eq!(decoded.cmd, 2);
    }
}
