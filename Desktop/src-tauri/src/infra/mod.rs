//! Инфраструктура: инструменты взаимодействия с внешним миром.
//! - `keyring` — OS Keyring (Windows Credential Manager) — Фаза 8
//! - `opencode` — контроль дочернего процесса OpenCode CLI через stdio — Фаза 8

pub mod ktp_service;
pub mod solver_host;
pub mod tup_parser;
pub mod tup_html_parser;
pub mod tup_import;
