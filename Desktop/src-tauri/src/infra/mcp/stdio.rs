//! JSON-RPC 2.0 MCP по stdio, тот же реестр что и в Tauri.
//!
//! Два кадрирования: по строке (стандарт MCP stdio, так работают opencode и Claude)
//! и `Content-Length` (LSP-стиль). Ответ идёт в том же виде, что и запрос.

use std::io::{self, BufRead, Write};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::commands::AppState;

use super::{invoke, list_tools};

#[derive(Debug, Deserialize)]
struct RpcRequest {
    #[serde(default)]
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    jsonrpc: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

#[derive(Clone, Copy, PartialEq)]
enum Framing {
    Line,
    ContentLength,
}

fn write_message(out: &mut impl Write, body: &str, framing: Framing) -> io::Result<()> {
    match framing {
        Framing::Line => writeln!(out, "{body}")?,
        Framing::ContentLength => write!(out, "Content-Length: {}\r\n\r\n{}", body.len(), body)?,
    }
    out.flush()
}

fn read_message(input: &mut impl BufRead) -> io::Result<Option<(String, Framing)>> {
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        let n = input.read_line(&mut line)?;
        if n == 0 {
            return Ok(None);
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.starts_with('{') {
            return Ok(Some((trimmed.to_string(), Framing::Line)));
        }
        if trimmed.is_empty() {
            if content_length.is_none() {
                continue;
            }
            break;
        }
        if let Some(rest) = trimmed.strip_prefix("Content-Length:") {
            content_length = rest.trim().parse().ok();
        }
    }
    let Some(len) = content_length else {
        return Ok(None);
    };
    let mut buf = vec![0u8; len];
    input.read_exact(&mut buf)?;
    Ok(Some((String::from_utf8_lossy(&buf).into_owned(), Framing::ContentLength)))
}

async fn handle(state: &AppState, req: RpcRequest) -> Option<RpcResponse> {
    if req.method.starts_with("notifications/") {
        return None;
    }
    let result = match req.method.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "vector-workspace", "version": "0.1.0" },
            "instructions": "КТП задаёт тему, раздел, цели и дату урока. КСП — тело урока по форме 130, жёстко привязан к ktpLessonId (один КСП на урок). Менять тему/цели только через ktp_update_lesson + ktp_commit_staged; затем шапка КСП синхронизируется. Правки КСП — карантин + ksp_commit_staged. Начинайте с lesson_get_bundle.",
        })),
        "ping" => Ok(json!({})),
        "tools/list" => {
            let tools: Vec<Value> = list_tools()
                .into_iter()
                .map(|t| json!({
                    "name": t.name,
                    "description": t.description,
                    "inputSchema": t.input_schema,
                }))
                .collect();
            Ok(json!({ "tools": tools }))
        }
        "tools/call" => {
            let name = req
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let args = req.params.get("arguments").cloned().unwrap_or(json!({}));
            match invoke(state, &name, args).await {
                Ok(value) => Ok(json!({
                    "content": [{ "type": "text", "text": serde_json::to_string_pretty(&value).unwrap_or_default() }],
                    "structuredContent": value,
                    "isError": false,
                })),
                Err(e) => Ok(json!({
                    "content": [{ "type": "text", "text": e }],
                    "isError": true,
                })),
            }
        }
        other => Err(format!("Неизвестный метод MCP: {other}")),
    };
    Some(match result {
        Ok(v) => RpcResponse { jsonrpc: "2.0", id: req.id, result: Some(v), error: None },
        Err(e) => RpcResponse {
            jsonrpc: "2.0",
            id: req.id,
            result: None,
            error: Some(json!({ "code": -32601, "message": e })),
        },
    })
}

pub async fn serve(state: AppState) -> io::Result<()> {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let mut stdout = io::stdout();
    loop {
        let Some((raw, framing)) = read_message(&mut input)? else {
            break;
        };
        let Ok(req) = serde_json::from_str::<RpcRequest>(&raw) else {
            continue;
        };
        if let Some(resp) = handle(&state, req).await {
            let body = serde_json::to_string(&resp).unwrap_or_else(|_| "{}".into());
            write_message(&mut stdout, &body, framing)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_line_framed_message() {
        let mut input = io::Cursor::new(b"{\"id\":1}\n".to_vec());
        let (body, framing) = read_message(&mut input).unwrap().unwrap();
        assert_eq!(body, "{\"id\":1}");
        assert!(framing == Framing::Line);
    }

    #[test]
    fn reads_content_length_message() {
        let mut input = io::Cursor::new(b"Content-Length: 8\r\n\r\n{\"id\":1}".to_vec());
        let (body, framing) = read_message(&mut input).unwrap().unwrap();
        assert_eq!(body, "{\"id\":1}");
        assert!(framing == Framing::ContentLength);
    }
}
