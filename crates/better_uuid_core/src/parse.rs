//! Parsing structured IDs from strings.
//!
//! Dispatches on prefix + format to produce a [`ParsedId`] with typed fields.
//! Recognises both native better-uuid payloads and legacy RFC UUID strings.

use crate::error::ParseError;
use crate::StrategyId;

// ---------------------------------------------------------------------------
// Parsed result
// ---------------------------------------------------------------------------

/// Structured representation of a parsed ID.
///
/// This is the canonical output of `parse_id`. It unifies native better-uuid
/// IDs and legacy RFC UUID strings behind a single type.
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
    /// Node identifier (snowflake strategies only).
    pub node_id: Option<u16>,
    /// Region slug (snowflake strategies only).
    pub region: Option<String>,
}

// ---------------------------------------------------------------------------
// Legacy UUID detection
// ---------------------------------------------------------------------------

/// Standard RFC 4122 UUID regex pattern: `8-4-4-4-12` hex.
fn is_legacy_uuid_format(s: &str) -> bool {
    if s.len() != 36 {
        return false;
    }
    let bytes = s.as_bytes();
    // Check dash positions: 8, 13, 18, 23
    if bytes[8] != b'-' || bytes[13] != b'-' || bytes[18] != b'-' || bytes[23] != b'-' {
        return false;
    }
    // Check all other chars are valid hex
    for (i, &b) in bytes.iter().enumerate() {
        if i == 8 || i == 13 || i == 18 || i == 23 {
            continue; // dashes already checked
        }
        if !b.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

/// Extract the UUID version from an RFC 4122 string.
///
/// Version nibble is at position 14 (first char of third group).
fn uuid_version(s: &str) -> Option<u8> {
    if s.len() < 15 {
        return None;
    }
    s.as_bytes()[14].to_ascii_uppercase().to_digit(16).map(|v| v as u8)
}

// ---------------------------------------------------------------------------
// Public parse function
// ---------------------------------------------------------------------------

/// Parse an ID string into a structured [`ParsedId`].
///
/// # Recognition order
///
/// 1. **Legacy RFC UUID** — `8-4-4-4-12` hex form → `legacy: true`.
/// 2. **Native better-uuid** — `<prefix>_<payload>` form → decoded payload.
/// 3. **Reject** with [`ParseError::InvalidFormat`] if neither matches.
pub fn parse_id(s: &str) -> Result<ParsedId, ParseError> {
    // Branch 1: legacy UUID
    if is_legacy_uuid_format(s) {
        let version = uuid_version(s).unwrap_or(0);
        let strategy = match version {
            4 => StrategyId::UuidV4,
            7 => StrategyId::TimeOrdered,
            other => StrategyId::Unknown(other),
        };
        let bytes = crate::encode::decode_hex(&s.replace('-', "")).ok_or_else(|| ParseError::InvalidFormat {
            position: 0,
            snippet: ParseError::safe_snippet(s, 0),
        })?;

        return Ok(ParsedId {
            legacy: true,
            prefix: None,
            strategy,
            schema_version: None,
            timestamp_ms: None, // Would need full UUID v7 bit decode
            bytes,
            node_id: None,
            region: None,
        });
    }

    // Branch 2: native better-uuid format
    // Expected: <prefix>_<encoded_payload>  OR  <encoded_payload> (no prefix)
    // For now, return a structured error — full decode wired in Phase 1.
    Err(ParseError::InvalidFormat {
        position: 0,
        snippet: ParseError::safe_snippet(s, 0),
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
        assert_eq!(result.bytes.len(), 16);
    }

    #[test]
    fn legacy_uuid_v7_detected() {
        // UUID v7 example: version nibble '7' at position 14
        let result = parse_id("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b").unwrap();
        assert!(result.legacy);
        assert_eq!(result.strategy, StrategyId::TimeOrdered);
    }

    #[test]
    fn invalid_format_rejected() {
        let result = parse_id("not-a-valid-id");
        assert!(result.is_err());
    }

    #[test]
    fn wrong_length_rejected() {
        let result = parse_id("550e8400-e29b-41d4-a716-44665544000"); // 35 chars
        assert!(result.is_err());
    }
}
