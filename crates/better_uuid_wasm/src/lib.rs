//! WASM bindings for better-uuid.
//!
//! Exposes generation, parsing, and validation to JavaScript via wasm-bindgen.
//! Uses serde_json for JSON in/out — DX-first approach.

use better_uuid_core::SCHEMA_VERSION;
use better_uuid_core::layout::format_native_id;
use better_uuid_core::parse::parse_id;
use better_uuid_core::strategies::{RandomV4, TimeOrdered};
use better_uuid_core::strategy::{
    ClockRegressionPolicy, GenContext, IdStrategy, OsRandom, SequenceExhaustedPolicy,
};
use better_uuid_core::validate_prefix;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// JS-visible option types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct GenerateOptions {
    strategy: Option<String>,
    prefix: Option<String>,
    mode: Option<String>,
    node: Option<u16>,
    region: Option<String>,
    on_clock_regression: Option<String>,
    on_sequence_exhausted: Option<String>,
    count: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GenerateResult {
    id: String,
    strategy: String,
    prefix: Option<String>,
    timestamp_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Policy helpers
// ---------------------------------------------------------------------------

fn parse_clock_policy(s: &Option<String>) -> ClockRegressionPolicy {
    match s.as_deref() {
        Some("wait") => ClockRegressionPolicy::Wait,
        Some("fallback") => ClockRegressionPolicy::Fallback,
        _ => ClockRegressionPolicy::Error,
    }
}

fn parse_seq_policy(s: &Option<String>) -> SequenceExhaustedPolicy {
    match s.as_deref() {
        Some("wait") => SequenceExhaustedPolicy::Wait,
        _ => SequenceExhaustedPolicy::Error,
    }
}

fn strategy_label(id: u8) -> String {
    match id {
        0x00 => "uuidv4".to_string(),
        0x01 => "time".to_string(),
        0x02 => "ulid".to_string(),
        0x03 => "nanoid".to_string(),
        0x04 => "snowflake".to_string(),
        0x05 => "deterministic".to_string(),
        other => format!("unknown({})", other),
    }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

fn generate_one(opts: &GenerateOptions) -> Result<GenerateResult, String> {
    let strategy_name = opts.strategy.as_deref().unwrap_or("time");
    let prefix_str = opts.prefix.as_deref();

    // Validate prefix if present
    if let Some(p) = prefix_str {
        validate_prefix(p).map_err(|e| format!("invalid prefix: {}", e))?;
    }

    let now_ms = js_sys::Date::now() as u64;
    let mut random = OsRandom;
    let mut ctx = GenContext {
        prefix: prefix_str,
        now_ms,
        random: &mut random,
        node: opts
            .node
            .map(|n| better_uuid_core::strategy::NodeDescriptor {
                node_id: n,
                region: opts.region.clone().unwrap_or_default(),
            }),
        deterministic_input: None,
        salt: None,
        on_clock_regression: parse_clock_policy(&opts.on_clock_regression),
        on_sequence_exhausted: parse_seq_policy(&opts.on_sequence_exhausted),
    };

    let payload = match strategy_name {
        "uuidv4" | "v4" => RandomV4.generate(&mut ctx),
        "time" | "v7" | "uuidv7" => {
            let strat = TimeOrdered::new();
            strat.generate(&mut ctx)
        }
        other => Err(better_uuid_core::error::GenerateError::InvalidPrefix {
            prefix: other.to_string(),
            reason: format!("unsupported strategy '{}'", other),
        }),
    }
    .map_err(|e| format!("generation failed: {}", e))?;

    let id = format_native_id(&payload);

    // Extract timestamp for time-ordered
    let timestamp_ms = if payload.strategy == 0x01 {
        Some(now_ms)
    } else {
        None
    };

    Ok(GenerateResult {
        id,
        strategy: strategy_label(payload.strategy),
        prefix: payload.prefix.clone(),
        timestamp_ms,
    })
}

/// Generate an ID.
///
/// Accepts JSON options: `{"strategy": "time", "prefix": "usr"}`
/// Returns JSON result: `{"id": "usr_...", "strategy": "time", ...}`
/// On error, returns error message string.
#[wasm_bindgen]
pub fn generate_id(options_json: &str) -> Result<String, String> {
    let opts: GenerateOptions = if options_json.is_empty() {
        GenerateOptions {
            strategy: None,
            prefix: None,
            mode: None,
            node: None,
            region: None,
            on_clock_regression: None,
            on_sequence_exhausted: None,
            count: None,
        }
    } else {
        serde_json::from_str(options_json).map_err(|e| format!("invalid options JSON: {}", e))?
    };

    // Handle safe mode: force UUID v4 shape, no prefix
    if opts.mode.as_deref() == Some("safe") {
        let safe_opts = GenerateOptions {
            strategy: Some("uuidv4".to_string()),
            prefix: None,
            mode: None,
            node: None,
            region: None,
            on_clock_regression: None,
            on_sequence_exhausted: None,
            count: None,
        };
        let result = generate_one(&safe_opts)?;
        return serde_json::to_string(&result).map_err(|e| e.to_string());
    }

    // Handle count (batch generation)
    if let Some(count) = opts.count {
        if count <= 1 {
            let result = generate_one(&opts)?;
            return serde_json::to_string(&vec![result]).map_err(|e| e.to_string());
        }
        let mut results = Vec::with_capacity(count);
        for _ in 0..count {
            results.push(generate_one(&opts)?);
        }
        return serde_json::to_string(&results).map_err(|e| e.to_string());
    }

    let result = generate_one(&opts)?;
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
struct ParseResult {
    legacy: bool,
    prefix: Option<String>,
    strategy: String,
    schema_version: Option<u8>,
    timestamp_ms: Option<u64>,
    entropy_hex: String,
    node_id: Option<u16>,
    region: Option<String>,
}

/// Parse an ID string.
///
/// Accepts both native better-uuid IDs and legacy RFC UUID strings.
/// Returns JSON parse result. On error, returns error message string.
#[wasm_bindgen]
pub fn parse_id_json(input: &str) -> Result<String, String> {
    let parsed = parse_id(input).map_err(|e| format!("parse error: {}", e))?;

    let result = ParseResult {
        legacy: parsed.legacy,
        prefix: parsed.prefix,
        strategy: strategy_label(parsed.strategy.into()),
        schema_version: parsed.schema_version,
        timestamp_ms: parsed.timestamp_ms,
        entropy_hex: parsed.bytes.iter().map(|b| format!("{:02x}", b)).collect(),
        node_id: parsed.node_id,
        region: parsed.region,
    };

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Validate a prefix string. Returns `true` if valid.
#[wasm_bindgen]
pub fn validate_prefix_js(prefix: &str) -> bool {
    validate_prefix(prefix).is_ok()
}

/// Check if an ID string is a legacy RFC UUID.
#[wasm_bindgen]
pub fn is_legacy_id_js(input: &str) -> bool {
    parse_id(input).is_ok_and(|p| p.legacy)
}

/// Get the current schema version.
#[wasm_bindgen]
pub fn schema_version() -> u8 {
    SCHEMA_VERSION
}

// ---------------------------------------------------------------------------
// WASM tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod wasm_tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn generate_uuid_v4() {
        let json = generate_id(r#"{"strategy": "uuidv4"}"#).unwrap();
        let result: GenerateResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.strategy, "uuidv4");
        assert_eq!(result.id.len(), 36); // UUID v4 is 36 chars
    }

    #[wasm_bindgen_test]
    fn generate_uuid_v7() {
        let json = generate_id(r#"{"strategy": "time"}"#).unwrap();
        let result: GenerateResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.strategy, "time");
        assert_eq!(result.id.len(), 36);
    }

    #[wasm_bindgen_test]
    fn generate_with_prefix() {
        let json = generate_id(r#"{"strategy": "uuidv4", "prefix": "usr"}"#).unwrap();
        let result: GenerateResult = serde_json::from_str(&json).unwrap();
        assert!(result.id.starts_with("usr_"));
        assert_eq!(result.prefix, Some("usr".to_string()));
    }

    #[wasm_bindgen_test]
    fn generate_safe_mode() {
        let json = generate_id(r#"{"mode": "safe"}"#).unwrap();
        let result: GenerateResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.id.len(), 36); // UUID-shaped
        assert_eq!(result.strategy, "uuidv4");
    }

    #[wasm_bindgen_test]
    fn generate_batch() {
        let json = generate_id(r#"{"strategy": "uuidv4", "count": 5}"#).unwrap();
        let results: Vec<GenerateResult> = serde_json::from_str(&json).unwrap();
        assert_eq!(results.len(), 5);
    }

    #[wasm_bindgen_test]
    fn parse_legacy_uuid_v4() {
        let json = parse_id_json("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let result: ParseResult = serde_json::from_str(&json).unwrap();
        assert!(result.legacy);
        assert_eq!(result.strategy, "uuidv4");
    }

    #[wasm_bindgen_test]
    fn parse_legacy_uuid_v7() {
        let json = parse_id_json("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b").unwrap();
        let result: ParseResult = serde_json::from_str(&json).unwrap();
        assert!(result.legacy);
        assert_eq!(result.strategy, "time");
        assert_eq!(result.timestamp_ms, Some(0x018f_3c1a_7b2d));
    }

    #[wasm_bindgen_test]
    fn parse_native_with_prefix() {
        // Generate first, then parse
        let gen_json = generate_id(r#"{"strategy": "uuidv4", "prefix": "usr"}"#).unwrap();
        let gen_result: GenerateResult = serde_json::from_str(&gen_json).unwrap();

        let parse_json = parse_id_json(&gen_result.id).unwrap();
        let parse_result: ParseResult = serde_json::from_str(&parse_json).unwrap();
        assert!(!parse_result.legacy);
        assert_eq!(parse_result.prefix, Some("usr".to_string()));
        assert_eq!(parse_result.strategy, "uuidv4");
    }

    #[wasm_bindgen_test]
    fn is_legacy_id() {
        assert!(is_legacy_id_js("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_legacy_id_js("not-an-id"));
    }

    #[wasm_bindgen_test]
    fn validate_prefix() {
        assert!(validate_prefix_js("usr"));
        assert!(!validate_prefix_js("btr"));
        assert!(!validate_prefix_js("User-ID"));
    }

    #[wasm_bindgen_test]
    fn test_schema_version() {
        assert_eq!(super::schema_version(), 1u8);
    }

    #[wasm_bindgen_test]
    fn roundtrip_generate_parse() {
        let gen_json = generate_id(r#"{"strategy": "time", "prefix": "ord"}"#).unwrap();
        let gen_result: GenerateResult = serde_json::from_str(&gen_json).unwrap();

        let parse_json = parse_id_json(&gen_result.id).unwrap();
        let parse_result: ParseResult = serde_json::from_str(&parse_json).unwrap();

        assert!(!parse_result.legacy);
        assert_eq!(parse_result.strategy, "time");
        assert_eq!(parse_result.prefix, Some("ord".to_string()));
    }
}
