use clap::{Parser, Subcommand};
use zagi_core::zalo::{AntiBanConfig, AntiBanEngine, QrLoginSession};
use zagi_core::Database;

#[derive(Parser)]
#[command(name = "zagi")]
#[command(about = "Zagi High-Performance Native Rust Core & CLI", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Kiểm tra trạng thái hệ thống
    Status,
    /// Quản lý cơ sở dữ liệu SQLite
    Db {
        #[arg(short, long, default_value = "zagi.db")]
        path: String,
    },
    /// Yêu cầu sinh mã QR đăng nhập Zalo
    QrLogin,
    /// Kiểm tra trạng thái và hạn ngạch Anti-ban
    Antiban,
    /// Thử nghiệm Dispatcher gửi tin nhắn qua Anti-Ban Engine & lưu SQLite
    SendMsg {
        #[arg(short, long, default_value = "admin_zalo")]
        owner: String,
        #[arg(short, long, default_value = "khach_hang_01")]
        thread: String,
        #[arg(short, long, default_value = "Xin chào từ Zagi Rust Native Engine!")]
        content: String,
        #[arg(long, default_value_t = false)]
        stranger: bool,
    },
    /// Kiểm tra Workflow Engine & Checkpoint Scheduler
    TestWorkflow,
    /// Khởi chạy Zagi MCP Server trên giao thức Stdio (dành cho Hermes / AI Agents)
    Mcp,
    /// Liệt kê danh sách các công cụ MCP Tools được hỗ trợ
    McpTools,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();

    match &cli.command {
        Some(Commands::Status) => {
            println!("🚀 Zagi Native Rust Core Engine - Version {}", env!("CARGO_PKG_VERSION"));
            println!("⚡ Status: Ready | Architecture: Pure Rust Workspace");
            println!("🛡️  Anti-Ban Engine: Active");
            println!("📱 Zalo Protocol Engine: v25+ Compatible");
        }
        Some(Commands::Db { path }) => {
            println!("🔍 Đang kiểm tra cơ sở dữ liệu SQLite tại: {}", path);
            let db = Database::open(path)?;
            let accounts = db.list_active_accounts()?;
            println!("✅ Kết nối CSDL thành công! Số tài khoản hoạt động: {}", accounts.len());
            for acc in accounts {
                println!("   - [{}] {} (Zalo ID: {})", if acc.is_active { "Active" } else { "Inactive" }, acc.full_name, acc.zalo_id);
            }
        }
        Some(Commands::QrLogin) => {
            println!("🔄 Đang kết nối Zalo Server và tạo phiên QR Login...");
            let session = QrLoginSession::new(None);
            match session.generate_qr().await {
                Ok(qr) => {
                    println!("✅ Sinh mã QR thành công!");
                    println!("   - Mã xác thực (QR Code): {}", qr.code);
                    println!("   - Phiên bản ZLogin: {}", qr.version);
                    println!("   - Kích thước ảnh Base64: {} bytes", qr.image_base64.len());
                    println!("   - Ready for UI rendering: data:image/png;base64,...");
                }
                Err(err) => {
                    eprintln!("❌ Lỗi sinh mã QR: {}", err);
                }
            }
        }
        Some(Commands::Antiban) => {
            let engine = AntiBanEngine::new(AntiBanConfig::default());
            let (used, max) = engine.get_quota_status();
            println!("🛡️  Trạng thái hệ thống chống khoá tài khoản (Anti-Ban):");
            println!("   - Tin nhắn người lạ đã gửi hôm nay: {}/{}", used, max);
            println!("   - Thử nghiệm mô phỏng độ trễ tự nhiên (Jitter)...");
            let jitter = engine.apply_jitter().await;
            println!("   - Độ trễ sinh ra: {} ms (trong ngưỡng an toàn 1500ms - 4000ms)", jitter);
        }
        Some(Commands::SendMsg { owner, thread, content, stranger }) => {
            let db = Database::open("zagi.db")?;
            let antiban = AntiBanEngine::new(AntiBanConfig::default());
            let dispatcher = zagi_core::zalo::MessageDispatcher::new(db, antiban);

            println!("📨 Đang điều phối gửi tin nhắn qua Zalo Dispatcher...");
            println!("   - Người gửi: {}", owner);
            println!("   - Người nhận: {}", thread);
            println!("   - Người lạ (stranger): {}", stranger);
            println!("   - Nội dung: \"{}\"", content);

            let msg = dispatcher.send_text_message(owner, thread, zagi_proto::ThreadType::Direct, content, *stranger).await?;
            println!("✅ Tin nhắn đã được gửi và lưu trữ SQLite an toàn!");
            println!("   - ID: {}", msg.msg_id);
            println!("   - Trạng thái: {}", msg.status);
            println!("   - Thời gian (Timestamp): {}", msg.timestamp);
        }
        Some(Commands::TestWorkflow) => {
            println!("⚙️  Khởi chạy thử nghiệm Workflow DAG & Checkpoint Scheduler...");

            // 1. Dựng đồ thị DAG mẫu
            let mut wf = zagi_core::workflow::WorkflowGraph::new();
            wf.add_node(zagi_core::workflow::WorkflowNode {
                id: "trigger_01".to_string(),
                node_type: "trigger.message".to_string(),
                label: "Nhận tin nhắn".to_string(),
                config: serde_json::json!({}),
            });
            wf.add_node(zagi_core::workflow::WorkflowNode {
                id: "condition_01".to_string(),
                node_type: "logic.condition".to_string(),
                label: "Kiểm tra từ khoá VIP".to_string(),
                config: serde_json::json!({ "keyword": "VIP" }),
            });
            wf.add_node(zagi_core::workflow::WorkflowNode {
                id: "wait_01".to_string(),
                node_type: "logic.wait".to_string(),
                label: "Chờ 1 ngày (86.400s)".to_string(),
                config: serde_json::json!({ "duration": 86400 }),
            });
            wf.add_node(zagi_core::workflow::WorkflowNode {
                id: "action_01".to_string(),
                node_type: "action.send_message".to_string(),
                label: "Gửi ưu đãi đặc quyền VIP".to_string(),
                config: serde_json::json!({ "content": "Tặng voucher 500k cho khách VIP" }),
            });

            wf.add_edge(zagi_core::workflow::WorkflowEdge { id: "e1".to_string(), source: "trigger_01".to_string(), target: "condition_01".to_string(), condition: None })?;
            wf.add_edge(zagi_core::workflow::WorkflowEdge { id: "e2".to_string(), source: "condition_01".to_string(), target: "wait_01".to_string(), condition: Some("true".to_string()) })?;
            wf.add_edge(zagi_core::workflow::WorkflowEdge { id: "e3".to_string(), source: "wait_01".to_string(), target: "action_01".to_string(), condition: None })?;

            let order = wf.get_execution_order()?;
            println!("✅ Phân tích đồ thị Topo (DAG) thành công! Thứ tự thực thi gồm {} bước:", order.len());
            for (idx, node) in order.iter().enumerate() {
                println!("   {}. [{}] {} ({})", idx + 1, node.node_type, node.label, node.id);
            }

            // 2. Thử nghiệm Checkpoint với thời gian chờ 1 ngày
            let wait_ms = 86_400_000u64;
            let need_cp = zagi_core::workflow::should_create_checkpoint(wait_ms);
            println!("💾 Đánh giá điểm chờ Checkpoint (86.400s > 300s): {}", if need_cp { "Cần tạo Checkpoint SQLite (Persistent)" } else { "Chạy setTimeout in-memory" });

            let db = Database::open("zagi.db")?;
            let scheduler = zagi_core::workflow::CheckpointScheduler::new(db);
            let cp = zagi_proto::WorkflowCheckpoint {
                id: format!("cp_demo_{}", chrono::Utc::now().timestamp_millis()),
                run_id: "run_vip_001".to_string(),
                workflow_id: "wf_cham_soc_vip".to_string(),
                node_id: "wait_01".to_string(),
                context_json: "{\"vip\": true, \"customer\": \"Nguyễn Văn A\"}".to_string(),
                resume_at: chrono::Utc::now().timestamp_millis() + (wait_ms as i64),
                status: "pending".to_string(),
                created_at: chrono::Utc::now().timestamp_millis(),
                error_message: None,
            };

            scheduler.save_checkpoint(&cp)?;
            println!("✅ Đã lưu Checkpoint ngủ đông vào SQLite an toàn! (ID: {})", cp.id);
            println!("   - Trạng thái: {}", cp.status);
            println!("   - Dự kiến thức dậy (Resume at): {}", cp.resume_at);
        }
        Some(Commands::Mcp) => {
            let db = Database::open("zagi.db")?;
            let server = zagi_mcp::McpServer::new(db);
            server.run_stdio().await?;
        }
        Some(Commands::McpTools) => {
            println!("🛠️  Danh sách các công cụ MCP Tools được hỗ trợ (8 công cụ):");
            let defs = zagi_mcp::ToolRegistry::get_definitions();
            for (idx, tool) in defs.iter().enumerate() {
                println!("{}. {} - {}", idx + 1, tool.name, tool.description);
            }
        }
        None => {
            println!("🚀 Zagi Native Rust Engine v{}. Gõ 'zagi --help' để xem danh sách lệnh.", env!("CARGO_PKG_VERSION"));
        }
    }

    Ok(())
}
