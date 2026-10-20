use crate::protocol::{JsonRpcRequest, JsonRpcResponse};
use crate::tools::ToolRegistry;
use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{error, info};
use zagi_core::db::Database;

pub struct McpServer {
    registry: ToolRegistry,
}

impl McpServer {
    pub fn new(db: Database) -> Self {
        Self {
            registry: ToolRegistry::new(db),
        }
    }

    /// Xử lý một Request JSON-RPC 2.0 theo chuẩn MCP
    pub async fn handle_request(&self, req: JsonRpcRequest) -> Option<JsonRpcResponse> {
        let id = req.id.clone().unwrap_or(json!(null));

        match req.method.as_str() {
            "initialize" => {
                let result = json!({
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {
                        "name": "zagi-mcp",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "capabilities": {
                        "tools": {}
                    }
                });
                Some(JsonRpcResponse::success(id, result))
            }
            "notifications/initialized" => {
                // Client đã khởi tạo thành công, không cần trả lời phản hồi
                None
            }
            "ping" => {
                Some(JsonRpcResponse::success(id, json!({})))
            }
            "tools/list" => {
                let tools = ToolRegistry::get_definitions();
                Some(JsonRpcResponse::success(id, json!({ "tools": tools })))
            }
            "tools/call" => {
                let params = req.params.unwrap_or(json!({}));
                let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));

                let tool_res = self.registry.execute_tool(name, &args).await;
                Some(JsonRpcResponse::success(id, json!(tool_res)))
            }
            _ => {
                Some(JsonRpcResponse::error(id, -32601, format!("Không hỗ trợ phương thức: '{}'", req.method)))
            }
        }
    }

    /// Khởi chạy server lắng nghe qua Stdio (Chuẩn transport chính thức của MCP)
    pub async fn run_stdio(&self) -> anyhow::Result<()> {
        let stdin = tokio::io::stdin();
        let mut stdout = tokio::io::stdout();
        let mut reader = BufReader::new(stdin).lines();

        info!("Zagi MCP Server running on stdio");

        while let Some(line) = reader.next_line().await? {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            match serde_json::from_str::<JsonRpcRequest>(line) {
                Ok(req) => {
                    if let Some(resp) = self.handle_request(req).await {
                        let resp_str = serde_json::to_string(&resp)?;
                        stdout.write_all(resp_str.as_bytes()).await?;
                        stdout.write_all(b"\n").await?;
                        stdout.flush().await?;
                    }
                }
                Err(e) => {
                    error!("Lỗi parse JSON-RPC: {}", e);
                    let err_resp = JsonRpcResponse::error(json!(null), -32700, format!("Parse error: {}", e));
                    let err_str = serde_json::to_string(&err_resp)?;
                    stdout.write_all(err_str.as_bytes()).await?;
                    stdout.write_all(b"\n").await?;
                    stdout.flush().await?;
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mcp_initialize_and_tools_list() {
        let db = Database::open_in_memory().unwrap();
        let server = McpServer::new(db);

        // 1. Initialize
        let init_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(1)),
            method: "initialize".to_string(),
            params: Some(json!({})),
        };
        let init_resp = server.handle_request(init_req).await.unwrap();
        assert_eq!(init_resp.id, json!(1));
        assert!(init_resp.result.unwrap().get("serverInfo").is_some());

        // 2. Tools list
        let list_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(2)),
            method: "tools/list".to_string(),
            params: None,
        };
        let list_resp = server.handle_request(list_req).await.unwrap();
        let tools = list_resp.result.unwrap()["tools"].as_array().unwrap().clone();
        assert_eq!(tools.len(), 8);

        // 3. Tool call
        let call_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(3)),
            method: "tools/call".to_string(),
            params: Some(json!({
                "name": "zagi_get_status",
                "arguments": {}
            })),
        };
        let call_resp = server.handle_request(call_req).await.unwrap();
        assert!(call_resp.result.unwrap().get("content").is_some());
    }
}
