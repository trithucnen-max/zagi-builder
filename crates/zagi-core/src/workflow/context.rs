use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub const MAX_STRING_LENGTH: usize = 50_000;
pub const TRUNCATED_SUFFIX: &str = "...[truncated]";

/// Ngữ cảnh thực thi Workflow tương thích 1:1 với Zagi TypeScript Context
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExecutionContext {
    pub trigger: Value,
    pub nodes: HashMap<String, Value>,
    pub variables: HashMap<String, Value>,
    pub page_id: String,
    pub skipped_nodes: HashSet<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _triggered_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _run_id: Option<String>,
    #[serde(default)]
    pub is_sandbox: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_nodes: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_edges: Option<Value>,
}

impl Default for ExecutionContext {
    fn default() -> Self {
        Self {
            trigger: serde_json::json!({}),
            nodes: HashMap::new(),
            variables: HashMap::new(),
            page_id: String::new(),
            skipped_nodes: HashSet::new(),
            _wf_name: None,
            _wf_id: None,
            _triggered_by: None,
            _run_id: None,
            is_sandbox: false,
            _wf_nodes: None,
            _wf_edges: None,
        }
    }
}

/// Dạng cấu trúc tuần tự hóa để lưu trữ hoặc gửi qua IPC
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SerializableContext {
    pub trigger: Value,
    pub nodes: HashMap<String, Value>,
    pub variables: HashMap<String, Value>,
    pub page_id: String,
    pub skipped_nodes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _triggered_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _run_id: Option<String>,
    #[serde(default)]
    pub is_sandbox: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_nodes: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub _wf_edges: Option<Value>,
}

fn sanitize_value(v: &Value) -> Value {
    match v {
        Value::String(s) => {
            if s.len() > MAX_STRING_LENGTH {
                let mut truncated = s[..MAX_STRING_LENGTH].to_string();
                truncated.push_str(TRUNCATED_SUFFIX);
                Value::String(truncated)
            } else {
                Value::String(s.clone())
            }
        }
        Value::Array(arr) => Value::Array(arr.iter().map(sanitize_value).collect()),
        Value::Object(map) => {
            let mut sanitized = serde_json::Map::new();
            for (k, val) in map {
                sanitized.insert(k.clone(), sanitize_value(val));
            }
            Value::Object(sanitized)
        }
        _ => v.clone(),
    }
}

/// Tuần tự hóa ExecutionContext thành chuỗi JSON an toàn
pub fn serialize_context(ctx: &ExecutionContext) -> Result<String, serde_json::Error> {
    let sanitized_trigger = sanitize_value(&ctx.trigger);
    let mut sanitized_nodes = HashMap::new();
    for (k, v) in &ctx.nodes {
        sanitized_nodes.insert(k.clone(), sanitize_value(v));
    }

    let mut sanitized_vars = HashMap::new();
    for (k, v) in &ctx.variables {
        sanitized_vars.insert(k.clone(), sanitize_value(v));
    }

    let mut skipped: Vec<String> = ctx.skipped_nodes.iter().cloned().collect();
    skipped.sort(); // Sắp xếp ổn định

    let serializable = SerializableContext {
        trigger: sanitized_trigger,
        nodes: sanitized_nodes,
        variables: sanitized_vars,
        page_id: ctx.page_id.clone(),
        skipped_nodes: skipped,
        _wf_name: ctx._wf_name.clone(),
        _wf_id: ctx._wf_id.clone(),
        _triggered_by: ctx._triggered_by.clone(),
        _run_id: ctx._run_id.clone(),
        is_sandbox: ctx.is_sandbox,
        _wf_nodes: ctx._wf_nodes.as_ref().map(sanitize_value),
        _wf_edges: ctx._wf_edges.as_ref().map(sanitize_value),
    };

    serde_json::to_string(&serializable)
}

/// Phục hồi ExecutionContext từ chuỗi JSON
pub fn deserialize_context(json_str: &str) -> Result<ExecutionContext, serde_json::Error> {
    let serializable: SerializableContext = serde_json::from_str(json_str)?;

    let skipped_set: HashSet<String> = serializable.skipped_nodes.into_iter().collect();

    Ok(ExecutionContext {
        trigger: serializable.trigger,
        nodes: serializable.nodes,
        variables: serializable.variables,
        page_id: serializable.page_id,
        skipped_nodes: skipped_set,
        _wf_name: serializable._wf_name,
        _wf_id: serializable._wf_id,
        _triggered_by: serializable._triggered_by,
        _run_id: serializable._run_id,
        is_sandbox: serializable.is_sandbox,
        _wf_nodes: serializable._wf_nodes,
        _wf_edges: serializable._wf_edges,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_roundtrip_preserves_data() {
        let mut skipped = HashSet::new();
        skipped.insert("node-1".to_string());
        skipped.insert("node-2".to_string());

        let mut vars = HashMap::new();
        vars.insert("name".to_string(), Value::String("Duong".to_string()));

        let ctx = ExecutionContext {
            trigger: serde_json::json!({ "type": "message", "content": "xin chào" }),
            nodes: HashMap::new(),
            variables: vars,
            page_id: "zalo-123".to_string(),
            skipped_nodes: skipped,
            _wf_name: Some("Chăm sóc KH".to_string()),
            _wf_id: Some("wf-001".to_string()),
            _triggered_by: Some("84988888888".to_string()),
            _run_id: Some("run-999".to_string()),
            is_sandbox: false,
            _wf_nodes: None,
            _wf_edges: None,
        };

        let serialized = serialize_context(&ctx).expect("Serialization thất bại");
        let restored = deserialize_context(&serialized).expect("Deserialization thất bại");

        assert_eq!(restored.page_id, "zalo-123");
        assert_eq!(restored._wf_id.unwrap(), "wf-001");
        assert_eq!(restored.skipped_nodes.len(), 2);
        assert!(restored.skipped_nodes.contains("node-1"));
        assert!(restored.skipped_nodes.contains("node-2"));
        assert_eq!(restored.variables["name"], "Duong");
    }

    #[test]
    fn test_truncate_strings_over_50000_chars() {
        let long_str = "x".repeat(60_000);
        let ctx = ExecutionContext {
            trigger: serde_json::json!({ "big": long_str }),
            ..Default::default()
        };

        let serialized = serialize_context(&ctx).unwrap();
        let restored = deserialize_context(&serialized).unwrap();

        let val = restored.trigger["big"].as_str().unwrap();
        assert!(val.ends_with(TRUNCATED_SUFFIX));
        assert!(val.len() <= MAX_STRING_LENGTH + TRUNCATED_SUFFIX.len());
    }
}
