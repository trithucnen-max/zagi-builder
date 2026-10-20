use petgraph::algo::toposort;
use petgraph::graph::{DiGraph, NodeIndex};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WorkflowGraphError {
    #[error("Workflow chứa chu trình lặp vô tận (Cycle detected)")]
    CycleDetected,
    #[error("Không tìm thấy node: {0}")]
    NodeNotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub condition: Option<String>,
}

pub struct WorkflowGraph {
    graph: DiGraph<WorkflowNode, WorkflowEdge>,
    node_map: HashMap<String, NodeIndex>,
}

impl WorkflowGraph {
    pub fn new() -> Self {
        Self {
            graph: DiGraph::new(),
            node_map: HashMap::new(),
        }
    }

    /// Thêm node vào đồ thị
    pub fn add_node(&mut self, node: WorkflowNode) -> NodeIndex {
        let id = node.id.clone();
        let idx = self.graph.add_node(node);
        self.node_map.insert(id, idx);
        idx
    }

    /// Thêm cạnh kết nối (Edge) giữa 2 nodes
    pub fn add_edge(&mut self, edge: WorkflowEdge) -> Result<(), WorkflowGraphError> {
        let src_idx = self
            .node_map
            .get(&edge.source)
            .copied()
            .ok_or_else(|| WorkflowGraphError::NodeNotFound(edge.source.clone()))?;

        let tgt_idx = self
            .node_map
            .get(&edge.target)
            .copied()
            .ok_or_else(|| WorkflowGraphError::NodeNotFound(edge.target.clone()))?;

        self.graph.add_edge(src_idx, tgt_idx, edge);
        Ok(())
    }

    /// Kiểm tra tính hợp lệ và lấy thứ tự thực thi topo (Topological order)
    pub fn get_execution_order(&self) -> Result<Vec<WorkflowNode>, WorkflowGraphError> {
        let sorted_indices = toposort(&self.graph, None).map_err(|_| WorkflowGraphError::CycleDetected)?;

        let mut order = Vec::with_capacity(sorted_indices.len());
        for idx in sorted_indices {
            order.push(self.graph[idx].clone());
        }

        Ok(order)
    }

    /// Lấy danh sách các node kế tiếp của một node
    pub fn get_next_nodes(&self, node_id: &str) -> Vec<WorkflowNode> {
        if let Some(&src_idx) = self.node_map.get(node_id) {
            self.graph
                .neighbors(src_idx)
                .map(|tgt_idx| self.graph[tgt_idx].clone())
                .collect()
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_dag_execution_order() {
        let mut wf = WorkflowGraph::new();

        wf.add_node(WorkflowNode {
            id: "trigger".to_string(),
            node_type: "trigger.message".to_string(),
            label: "Khi nhận tin nhắn".to_string(),
            config: serde_json::json!({}),
        });

        wf.add_node(WorkflowNode {
            id: "condition".to_string(),
            node_type: "logic.condition".to_string(),
            label: "Kiểm tra từ khoá".to_string(),
            config: serde_json::json!({ "regex": "báo giá" }),
        });

        wf.add_node(WorkflowNode {
            id: "send_msg".to_string(),
            node_type: "action.send_message".to_string(),
            label: "Gửi bảng giá".to_string(),
            config: serde_json::json!({ "content": "Dạ bảng giá của bạn đây ạ" }),
        });

        wf.add_edge(WorkflowEdge {
            id: "e1".to_string(),
            source: "trigger".to_string(),
            target: "condition".to_string(),
            condition: None,
        }).unwrap();

        wf.add_edge(WorkflowEdge {
            id: "e2".to_string(),
            source: "condition".to_string(),
            target: "send_msg".to_string(),
            condition: Some("true".to_string()),
        }).unwrap();

        let order = wf.get_execution_order().expect("Lấy thứ tự thực thi thất bại");
        assert_eq!(order.len(), 3);
        assert_eq!(order[0].id, "trigger");
        assert_eq!(order[1].id, "condition");
        assert_eq!(order[2].id, "send_msg");
    }

    #[test]
    fn test_cycle_detection() {
        let mut wf = WorkflowGraph::new();
        wf.add_node(WorkflowNode {
            id: "a".to_string(),
            node_type: "step".to_string(),
            label: "A".to_string(),
            config: serde_json::json!({}),
        });
        wf.add_node(WorkflowNode {
            id: "b".to_string(),
            node_type: "step".to_string(),
            label: "B".to_string(),
            config: serde_json::json!({}),
        });

        wf.add_edge(WorkflowEdge { id: "e1".to_string(), source: "a".to_string(), target: "b".to_string(), condition: None }).unwrap();
        wf.add_edge(WorkflowEdge { id: "e2".to_string(), source: "b".to_string(), target: "a".to_string(), condition: None }).unwrap();

        assert!(matches!(wf.get_execution_order(), Err(WorkflowGraphError::CycleDetected)));
    }
}
