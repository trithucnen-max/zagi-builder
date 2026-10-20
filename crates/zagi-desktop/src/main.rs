// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;
use zagi_core::db::Database;
use zagi_core::workflow::{WorkflowEdge, WorkflowGraph, WorkflowNode};
use zagi_core::zalo::antiban::{AntiBanConfig, AntiBanEngine};
use zagi_core::zalo::dispatcher::MessageDispatcher;
use zagi_core::zalo::qr::QrLoginSession;
use zagi_proto::ThreadType;

#[tauri::command]
fn get_app_status() -> serde_json::Value {
    json!({
        "app": "Zagi Native Rust Edition",
        "version": env!("CARGO_PKG_VERSION"),
        "status": "ready",
        "architecture": "Pure Rust Native Shell"
    })
}

#[tauri::command]
async fn get_qr_code() -> Result<serde_json::Value, String> {
    let session = QrLoginSession::new(None);
    match session.generate_qr().await {
        Ok(qr) => Ok(json!({
            "code": qr.code,
            "version": qr.version,
            "image": qr.image_base64
        })),
        Err(e) => Err(format!("Lỗi sinh mã QR: {}", e)),
    }
}

#[tauri::command]
async fn send_message(
    owner: String,
    thread_id: String,
    content: String,
    is_stranger: bool,
) -> Result<serde_json::Value, String> {
    let db = Database::open("zagi.db").map_err(|e| e.to_string())?;
    let antiban = AntiBanEngine::new(AntiBanConfig::default());
    let dispatcher = MessageDispatcher::new(db, antiban);

    match dispatcher
        .send_text_message(
            &owner,
            &thread_id,
            ThreadType::Direct,
            &content,
            is_stranger,
        )
        .await
    {
        Ok(sent) => Ok(json!({
            "success": true,
            "msgId": sent.msg_id,
            "timestamp": sent.timestamp,
            "status": sent.status
        })),
        Err(e) => Err(format!("Lỗi gửi tin: {}", e)),
    }
}

#[tauri::command]
fn run_workflow_test() -> Result<serde_json::Value, String> {
    let mut wf = WorkflowGraph::new();
    wf.add_node(WorkflowNode {
        id: "trigger_01".to_string(),
        node_type: "trigger.message".to_string(),
        label: "Nhận tin nhắn".to_string(),
        config: json!({}),
    });
    wf.add_node(WorkflowNode {
        id: "condition_01".to_string(),
        node_type: "logic.condition".to_string(),
        label: "Lọc từ khoá".to_string(),
        config: json!({ "keyword": "VIP" }),
    });

    wf.add_edge(WorkflowEdge {
        id: "e1".to_string(),
        source: "trigger_01".to_string(),
        target: "condition_01".to_string(),
        condition: None,
    })
    .map_err(|e| e.to_string())?;

    let order = wf.get_execution_order().map_err(|e| e.to_string())?;
    Ok(json!({
        "success": true,
        "nodesCount": order.len(),
        "status": "completed"
    }))
}

#[tauri::command]
fn list_mcp_tools() -> serde_json::Value {
    let tools = zagi_mcp::ToolRegistry::get_definitions();
    json!(tools)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            get_qr_code,
            send_message,
            run_workflow_test,
            list_mcp_tools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
