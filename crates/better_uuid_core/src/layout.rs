//! Wire format encoding and decoding for native better-uuid IDs.
//!
//! # Wire format (v1)
//!
//! ```text
//! <prefix>_<uuid_hex>          # When prefix is present
//! <uuid_hex>                   # When no prefix
//! ```
//!
//! For UUID-shaped strategies (v4, v7), the payload is the standard `8-4-4-4-12` hex.

use crate::StrategyId;
use crate::error::ParseError;
use crate::strategies::{random_v4, time_ordered};
use crate::strategy::IdPayload;

/// Separator between prefix and payload in native IDs.
pub const SEPARATOR: char = '_';

/// Components extracted from a native (non-legacy) better-uuid ID string.
#[derive(Debug, Clone)]
pub struct NativeIdComponents {
    /// Semantic prefix, if present (e.g. "usr", "ord").
    pub prefix: Option<String>,
    /// Strategy that produced this ID.
    pub strategy: StrategyId,
    /// Raw payload bytes (16 bytes for UUID-shaped IDs).
    pub bytes: [u8; 16],
    /// Timestamp in milliseconds (if time-ordered strategy).
    pub timestamp_ms: Option<u64>,
}

/// Format an [`IdPayload`] into a string.
///
/// For UUID-shaped strategies (v4, v7), outputs RFC-formatted hex with optional prefix.
///
/// # Panics
///
/// Panics if the payload has fewer than 16 bytes.
#[must_use]
pub fn format_native_id(payload: &IdPayload) -> String {
    assert!(payload.bytes.len() >= 16, "payload must have >= 16 bytes");
    let uuid_bytes: [u8; 16] = payload.bytes[..16].try_into().unwrap();

    let hex = match payload.strategy {
        0x00 => random_v4::format_uuid_v4(&uuid_bytes),
        0x01 => time_ordered::format_uuid_v7(&uuid_bytes),
        other => panic!("unsupported strategy {other} in Phase 1"),
    };

    if let Some(prefix) = &payload.prefix {
        format!("{prefix}{SEPARATOR}{hex}")
    } else {
        hex
    }
}

/// Parse a native better-uuid ID string into components.
///
/// This is the inverse of [`format_native_id`]. It does NOT handle legacy UUID strings;
/// use [`parse_id`](crate::parse_id) for unified parsing.
///
/// # Errors
///
/// Returns [`ParseError::InvalidFormat`] if the string doesn't match the native format.
/// Returns [`ParseError::InvalidPrefix`] if the prefix is invalid.
pub fn parse_native_id(s: &str) -> Result<NativeIdComponents, ParseError> {
    let (prefix_str, id_body) = if let Some(sep_pos) = s.find(SEPARATOR) {
        let prefix = &s[..sep_pos];
        crate::validate_prefix(prefix)?;
        (Some(prefix.to_string()), &s[sep_pos + 1..])
    } else {
        (None, s)
    };

    if id_body.len() != 36 {
        return Err(ParseError::InvalidFormat {
            position: 0,
            snippet: ParseError::safe_snippet(s, 0),
        });
    }

    let b = id_body.as_bytes();
    #[allow(clippy::cast_possible_truncation)]
    let version_nibble = b[14].to_ascii_uppercase();
    let variant_nibble = b[19].to_ascii_uppercase();

    if !matches!(variant_nibble, b'8' | b'9' | b'A' | b'B') {
        return Err(ParseError::InvalidFormat {
            position: 0,
            snippet: ParseError::safe_snippet(s, 0),
        });
    }

    let bytes = parse_uuid_hex(id_body).ok_or_else(|| ParseError::InvalidFormat {
        position: 0,
        snippet: ParseError::safe_snippet(s, 0),
    })?;

    #[allow(clippy::cast_possible_truncation)]
    let strategy = match version_nibble {
        b'4' => StrategyId::UuidV4,
        b'7' => StrategyId::TimeOrdered,
        other => StrategyId::Unknown((other as char).to_digit(16).unwrap_or(0) as u8),
    };

    let timestamp_ms = if strategy == StrategyId::TimeOrdered {
        time_ordered::parse_uuid_v7_timestamp(id_body)
    } else {
        None
    };

    Ok(NativeIdComponents {
        prefix: prefix_str,
        strategy,
        bytes,
        timestamp_ms,
    })
}

fn parse_uuid_hex(s: &str) -> Option<[u8; 16]> {
    if s.len() != 36 {
        return None;
    }
    let b = s.as_bytes();
    if b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return None;
    }
    let hex_positions = [
        (0, 1),
        (2, 3),
        (4, 5),
        (6, 7),
        (9, 10),
        (11, 12),
        (14, 15),
        (16, 17),
        (19, 20),
        (21, 22),
        (24, 25),
        (26, 27),
        (28, 29),
        (30, 31),
        (32, 33),
        (34, 35),
    ];
    let mut result = [0u8; 16];
    for (i, (hi, lo)) in hex_positions.iter().enumerate() {
        let hi_val = (b[*hi] as char).to_digit(16)?;
        let lo_val = (b[*lo] as char).to_digit(16)?;
        #[allow(clippy::cast_possible_truncation)]
        let val = ((hi_val << 4) | lo_val) as u8;
        result[i] = val;
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SCHEMA_VERSION;
    use crate::strategies::{RandomV4, TimeOrdered};
    use crate::strategy::OsRandom;

    #[test]
    fn format_and_parse_uuid_v4_no_prefix() {
        let payload = IdPayload {
            schema_version: SCHEMA_VERSION,
            strategy: u8::from(StrategyId::UuidV4),
            prefix: None,
            bytes: vec![
                0x55, 0x0e, 0x84, 0x00, 0xe2, 0x9b, 0x41, 0xd4, 0xa7, 0x16, 0x44, 0x66, 0x55, 0x44,
                0x00, 0x00,
            ],
        };
        let formatted = format_native_id(&payload);
        assert_eq!(formatted, "550e8400-e29b-41d4-a716-446655440000");

        let components = parse_native_id(&formatted).unwrap();
        assert_eq!(components.prefix, None);
        assert_eq!(components.strategy, StrategyId::UuidV4);
    }

    #[test]
    fn format_and_parse_uuid_v4_with_prefix() {
        let payload = IdPayload {
            schema_version: SCHEMA_VERSION,
            strategy: u8::from(StrategyId::UuidV4),
            prefix: Some("usr".to_string()),
            bytes: vec![
                0x55, 0x0e, 0x84, 0x00, 0xe2, 0x9b, 0x41, 0xd4, 0xa7, 0x16, 0x44, 0x66, 0x55, 0x44,
                0x00, 0x00,
            ],
        };
        let formatted = format_native_id(&payload);
        assert_eq!(formatted, "usr_550e8400-e29b-41d4-a716-446655440000");

        let components = parse_native_id(&formatted).unwrap();
        assert_eq!(components.prefix, Some("usr".to_string()));
        assert_eq!(components.strategy, StrategyId::UuidV4);
    }

    #[test]
    fn format_and_parse_uuid_v7_with_prefix() {
        let payload = IdPayload {
            schema_version: SCHEMA_VERSION,
            strategy: u8::from(StrategyId::TimeOrdered),
            prefix: Some("usr".to_string()),
            bytes: vec![
                0x01, 0x8f, 0x3c, 0x1a, 0x7b, 0x2d, 0x7e, 0x3f, 0xa4, 0xb5, 0xc6, 0xd7, 0xe8, 0xf9,
                0x0a, 0x1b,
            ],
        };
        let formatted = format_native_id(&payload);
        assert_eq!(formatted, "usr_018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b");

        let components = parse_native_id(&formatted).unwrap();
        assert_eq!(components.prefix, Some("usr".to_string()));
        assert_eq!(components.strategy, StrategyId::TimeOrdered);
        assert_eq!(components.timestamp_ms, Some(0x018f_3c1a_7b2d));
    }

    #[test]
    fn parse_rejects_invalid_prefix() {
        assert!(parse_native_id("INVALID_018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b").is_err());
    }

    #[test]
    fn roundtrip_random_v4_generated() {
        let mut ctx = crate::strategy::GenContext {
            prefix: Some("txn"),
            now_ms: 0,
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        let payload = RandomV4.generate(&mut ctx).unwrap();
        let formatted = format_native_id(&payload);
        assert!(formatted.starts_with("txn_"));

        let components = parse_native_id(&formatted).unwrap();
        assert_eq!(components.prefix, Some("txn".to_string()));
        assert_eq!(components.strategy, StrategyId::UuidV4);
    }

    #[test]
    fn roundtrip_time_ordered_generated() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut ctx = crate::strategy::GenContext {
            prefix: Some("ord"),
            now_ms,
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        let strategy = TimeOrdered::new();
        let payload = strategy.generate(&mut ctx).unwrap();
        let formatted = format_native_id(&payload);
        assert!(formatted.starts_with("ord_"));

        let components = parse_native_id(&formatted).unwrap();
        assert_eq!(components.prefix, Some("ord".to_string()));
        assert_eq!(components.strategy, StrategyId::TimeOrdered);
        assert_eq!(components.timestamp_ms, Some(now_ms));
    }
}
