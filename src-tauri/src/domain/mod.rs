use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

pub fn default_true() -> bool {
    true
}

pub fn default_body_type() -> String {
    "none".to_string()
}

pub fn default_schema_version() -> u32 {
    CURRENT_SCHEMA_VERSION
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueItem {
    pub id: String,
    pub key: String,
    pub value: String,
    pub enabled: bool,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, alias = "inherited_from")]
    pub inherited_from: Option<String>,
    #[serde(default, alias = "is_inherited_override")]
    pub is_inherited_override: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FormField {
    #[serde(default)]
    pub id: Option<String>,
    pub key: String,
    pub value: String,
    #[serde(default, alias = "is_file")]
    pub is_file: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    #[serde(default = "default_schema_version", alias = "schema_version")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub method: String,
    pub path: String,
    #[serde(default, alias = "path_params")]
    pub path_params: Vec<KeyValueItem>,
    #[serde(default, alias = "query_params")]
    pub query_params: Vec<KeyValueItem>,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default = "default_body_type", alias = "body_type")]
    pub body_type: String,
    #[serde(default, alias = "body_content")]
    pub body_content: String,
    #[serde(default, alias = "form_fields")]
    pub form_fields: Vec<FormField>,
    #[serde(default, alias = "sub_project_id")]
    pub sub_project_id: Option<String>,
    #[serde(default, alias = "file_name")]
    pub file_name: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extensions: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSyncSource {
    #[serde(alias = "importer_id")]
    pub importer_id: String,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubProjectMetadata {
    pub id: String,
    pub name: String,
    #[serde(alias = "base_url")]
    pub base_url: String,
    #[serde(default = "default_true", alias = "inherit_base_url")]
    pub inherit_base_url: bool,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default = "default_true", alias = "inherit_headers")]
    pub inherit_headers: bool,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    #[serde(default = "default_true", alias = "inherit_variables")]
    pub inherit_variables: bool,
    #[serde(default, alias = "swagger_source_url")]
    pub swagger_source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "collection_source")]
    pub collection_source: Option<CollectionSyncSource>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentItem {
    pub id: String,
    pub name: String,
    pub variables: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSettingsItem {
    #[serde(default, alias = "dangerously_disable_ssl")]
    pub dangerously_disable_ssl: bool,
    #[serde(default, alias = "enable_proxy")]
    pub enable_proxy: bool,
    #[serde(default, alias = "proxy_url")]
    pub proxy_url: String,
    #[serde(default = "default_true", alias = "enable_cookie_jar")]
    pub enable_cookie_jar: bool,
}

impl Default for NetworkSettingsItem {
    fn default() -> Self {
        Self {
            dangerously_disable_ssl: false,
            enable_proxy: false,
            proxy_url: "http://127.0.0.1:7890".to_string(),
            enable_cookie_jar: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetadata {
    #[serde(default = "default_schema_version", alias = "schema_version")]
    pub schema_version: u32,
    pub name: String,
    #[serde(alias = "base_url")]
    pub base_url: String,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub environments: Vec<EnvironmentItem>,
    #[serde(default, alias = "active_environment_id")]
    pub active_environment_id: Option<String>,
    #[serde(default, alias = "swagger_source_url")]
    pub swagger_source_url: Option<String>,
    #[serde(default, alias = "network_settings")]
    pub network_settings: Option<NetworkSettingsItem>,
    #[serde(default, skip_serializing_if = "Vec::is_empty", alias = "disabled_plugins")]
    pub disabled_plugins: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    #[serde(alias = "request_id")]
    pub request_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub status: u16,
    #[serde(alias = "duration_ms")]
    pub duration_ms: u64,
    pub timestamp: u64,
    #[serde(default, alias = "headers")]
    pub headers: Option<Vec<(String, String)>>,
    #[serde(default, alias = "body_type")]
    pub body_type: Option<String>,
    #[serde(default, alias = "body_content")]
    pub body_content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubProjectData {
    pub config: SubProjectMetadata,
    #[serde(alias = "dir_name")]
    pub dir_name: String,
    pub requests: Vec<SavedRequest>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FullProjectData {
    pub path: String,
    pub config: ProjectMetadata,
    #[serde(alias = "sub_projects")]
    pub sub_projects: Vec<SubProjectData>,
    pub history: Vec<HistoryItem>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestPayload {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    #[serde(alias = "body_type")]
    pub body_type: String,
    #[serde(alias = "body_content")]
    pub body_content: Option<String>,
    #[serde(alias = "form_fields")]
    pub form_fields: Option<Vec<FormField>>,
    #[serde(alias = "timeout_ms")]
    pub timeout_ms: Option<u64>,
    #[serde(default, alias = "dangerously_disable_ssl")]
    pub dangerously_disable_ssl: Option<bool>,
    #[serde(default, alias = "proxy_url")]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CookieItem {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
    pub path: Option<String>,
    pub raw: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponsePayload {
    pub request_id: String,
    pub status: u16,
    pub status_text: String,
    pub duration_ms: u64,
    pub size_bytes: usize,
    pub headers: Vec<(String, String)>,
    pub cookies: Vec<CookieItem>,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_base64: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportedCollection {
    pub title: String,
    #[serde(default, alias = "base_url")]
    pub base_url: Option<String>,
    pub requests: Vec<SavedRequest>,
    #[serde(default, alias = "source_format")]
    pub source_format: String,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeStats {
    pub added: usize,
    pub updated: usize,
    pub deprecated: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub requests: Vec<SavedRequest>,
    pub stats: MergeStats,
}
