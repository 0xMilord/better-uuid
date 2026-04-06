//! WASM bindings for better-uuid.
//!
//! Thin `wasm-bindgen` layer over `better_uuid_core`. Exposes generation
//! and parsing as JS-friendly functions with `JsValue` serialization.

use better_uuid_core::{parse_id, validate_prefix, ParsedId, StrategyId};
use serde::Serialize;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// JS-visible parse result
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct JsParsed {
    legacy: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    prefix: Option<String>,
    strategy: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    schema_version: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamp_ms: Option<u64>,
    entropy: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    node_id: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    region: Option<String>,
}

fn strategy_label(id: StrategyId) -> String {
    match id {
        StrategyId::UuidV4 => "uuidv4".to_string(),
        StrategyId::TimeOrdered => "time".to_string(),
        StrategyId::Ulid => "ulid".to_string(),
        StrategyId::NanoLike => "nanoid".to_string(),
        StrategyId::Snowflake => "snowflake".to_string(),
        StrategyId::Deterministic => "deterministic".to_string(),
        StrategyId::Unknown(v) => format!("unknown({v})"),
    }
}

// ---------------------------------------------------------------------------
// Public WASM exports
// ---------------------------------------------------------------------------

/// Parse an ID string and return a structured JSON object.
///
/// Works with both native better-uuid IDs and legacy RFC UUID strings.
#[wasm_bindgen]
pub fn parse_id_json(input: &str) -> Result<String, String> {
    let parsed = parse_id(input).map_err(|e| format!("{e}"))?;

    let js_result = JsParsed {
        legacy: parsed.legacy,
        prefix: parsed.prefix,
        strategy: strategy_label(parsed.strategy),
        schema_version: parsed.schema_version,
        timestamp_ms: parsed.timestamp_ms,
        entropy: better_uuid_core::encode::encode_hex(&parsed.bytes),
        node_id: parsed.node_id,
        region: parsed.region,
    };

    serde_json::to_string(&js_result).map_err(|e| format!("serialization error: {e}"))
}

/// Validate a prefix string. Returns `true` if valid.
#[wasm_bindgen]
pub fn validate_prefix_js(prefix: &str) -> bool {
    validate_prefix(prefix).is_ok()
}

/// Get the current schema version (for forward-compatibility checks).
#[wasm_bindgen]
pub fn schema_version() -> u8 {
    better_uuid_core::SCHEMA_VERSION
}

// ---------------------------------------------------------------------------
// WASM tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod wasm_tests {
    use wasm_bindgen_test::*;
    use super::*;

    #[wasm_bindgen_test]
    fn parse_legacy_uuid_v4() {
        let json = parse_id_json("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert!(json.contains("\"legacy\":true"));
        assert!(json.contains("\"strategy\":\"uuidv4\""));
    }

    #[wasm_bindgen_test]
    fn schema_version_matches_core() {
        assert_eq!(schema_version(), better_uuid_core::SCHEMA_VERSION);
    }

    #[wasm_bindgen_test]
    fn validate_prefix_accepts_valid() {
        assert!(validate_prefix_js("usr"));
        assert!(validate_prefix_js("ord1"));
    }

    #[wasm_bindgen_test]
    fn validate_prefix_rejects_invalid() {
        assert!(!validate_prefix_js("User-ID"));
        assert!(!validate_prefix_js("btr"));
    }
}
