//! Parsing structured IDs from strings.
//!
//! Dispatches on prefix + format to produce a [`ParsedId`] with typed fields.
//! Recognises both native better-uuid payloads and legacy RFC UUID strings.

use crate::StrategyId;
use crate::error::ParseError;
use crate::layout::parse_native_id;
use crate::strategies::time_ordered;

// ---------------------------------------------------------------------------
// Parsed result
// ---------------------------------------------------------------------------

/// Structured representation of a parsed ID.
#[derive(Debug, Clone)]
pub struct ParsedId {
    /// Whether this is a legacy RFC UUID string (v4, v7, etc.).
    pub legacy: bool,
    /// Semantic prefix, if present (e.g. "usr", "ord").
    pub prefix: Option<String>,
    /// Strategy that produced this ID (or detected for legacy).
    pub strategy: StrategyId,
    /// Wire-format schema version (None for legacy IDs).
    pub schema_version: Option<u8>,
    /// Timestamp in milliseconds since Unix epoch (if applicable).
    pub timestamp_ms: Option<u64>,
    /// Raw payload bytes (strategy-specific).
    pub bytes: Vec<u8>,
    /// Node identifier (snowflake strategies only; None for Phase 1).
    pub node_id: Option<u16>,
    /// Region slug (snowflake strategies only; None for Phase 1).
    pub region: Option<String>,
}

// ---------------------------------------------------------------------------
// Legacy UUID detection
// ---------------------------------------------------------------------------

fn is_legacy_uuid_format(s: &str) -> bool {
    if s.len() != 36 {
        return false;
    }
    let b = s.as_bytes();
    if b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return false;
    }
    for (i, &byte) in b.iter().enumerate() {
        if i == 8 || i == 13 || i == 18 || i == 23 {
            continue;
        }
        if !byte.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

fn uuid_version(s: &str) -> Option<u8> {
    if s.len() < 15 {
        return None;
    }
    #[allow(clippy::cast_possible_truncation)]
    (s.as_bytes()[14] as char).to_digit(16).map(|v| v as u8)
}

// ---------------------------------------------------------------------------
// Public parse function
// ---------------------------------------------------------------------------

/// Parse an ID string into a structured [`ParsedId`].
///
/// # Recognition order
///
/// 1. **Native better-uuid** — `<prefix>_<uuid_hex>` form → decoded payload with prefix.
/// 2. **Legacy RFC UUID** — `8-4-4-4-12` hex form → `legacy: true`.
/// 3. **Reject** with [`ParseError::InvalidFormat`] if neither matches.
///
/// # Errors
///
/// Returns [`ParseError::InvalidFormat`] if the input does not match any
/// recognised ID format (native or legacy).
/// Returns [`ParseError::InvalidPrefix`] if a native ID has an invalid prefix.
pub fn parse_id(s: &str) -> Result<ParsedId, ParseError> {
    if s.contains('_') {
        parse_id_native(s)
    } else if is_legacy_uuid_format(s) {
        parse_id_legacy(s)
    } else {
        Err(ParseError::InvalidFormat {
            position: 0,
            snippet: ParseError::safe_snippet(s, 0),
        })
    }
}

fn parse_id_native(s: &str) -> Result<ParsedId, ParseError> {
    let components = parse_native_id(s)?;
    Ok(ParsedId {
        legacy: false,
        prefix: components.prefix,
        strategy: components.strategy,
        schema_version: Some(crate::SCHEMA_VERSION),
        timestamp_ms: components.timestamp_ms,
        bytes: components.bytes.to_vec(),
        node_id: None,
        region: None,
    })
}

fn parse_id_legacy(s: &str) -> Result<ParsedId, ParseError> {
    let version = uuid_version(s).unwrap_or(0);
    let strategy = match version {
        4 => StrategyId::UuidV4,
        7 => StrategyId::TimeOrdered,
        other => StrategyId::Unknown(other),
    };

    let bytes = crate::encode::decode_hex(&s.replace('-', "")).ok_or_else(|| {
        ParseError::InvalidFormat {
            position: 0,
            snippet: ParseError::safe_snippet(s, 0),
        }
    })?;

    let timestamp_ms = if version == 7 {
        time_ordered::parse_uuid_v7_timestamp(s)
    } else {
        None
    };

    Ok(ParsedId {
        legacy: true,
        prefix: None,
        strategy,
        schema_version: None,
        timestamp_ms,
        bytes,
        node_id: None,
        region: None,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_uuid_v4_detected() {
        let result = parse_id("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert!(result.legacy);
        assert_eq!(result.strategy, StrategyId::UuidV4);
    }

    #[test]
    fn legacy_uuid_v7_detected_with_timestamp() {
        let result = parse_id("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b").unwrap();
        assert!(result.legacy);
        assert_eq!(result.strategy, StrategyId::TimeOrdered);
        assert_eq!(result.timestamp_ms, Some(0x018f_3c1a_7b2d));
    }

    #[test]
    fn native_id_with_prefix_v4() {
        let result = parse_id("usr_550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert!(!result.legacy);
        assert_eq!(result.prefix, Some("usr".to_string()));
        assert_eq!(result.strategy, StrategyId::UuidV4);
        assert_eq!(result.schema_version, Some(crate::SCHEMA_VERSION));
    }

    #[test]
    fn native_id_with_prefix_v7() {
        let result = parse_id("ord_018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b").unwrap();
        assert!(!result.legacy);
        assert_eq!(result.prefix, Some("ord".to_string()));
        assert_eq!(result.strategy, StrategyId::TimeOrdered);
        assert_eq!(result.timestamp_ms, Some(0x018f_3c1a_7b2d));
    }

    #[test]
    fn invalid_format_rejected() {
        assert!(parse_id("not-a-valid-id").is_err());
    }

    #[test]
    fn invalid_prefix_rejected() {
        assert!(parse_id("INVALID_018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b").is_err());
    }
}
