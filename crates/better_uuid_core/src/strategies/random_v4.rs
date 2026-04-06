//! `RandomV4` — RFC 4122 UUID v4 generation.
//!
//! Produces 122 random bits formatted as `8-4-4-4-12` hex with version nibble `4`
//! and variant bits `10`. Uses OS CSPRNG via `getrandom`.

use crate::error::GenerateError;
use crate::strategy::{GenContext, IdPayload, IdStrategy};

/// UUID v4 random strategy.
///
/// Generates 122 random bits with RFC 4122 version/variant bits set correctly.
/// Collision risk: negligible (birthday bound at ~2^61 IDs for 50% collision probability).
#[derive(Debug, Clone, Copy, Default)]
pub struct RandomV4;

impl IdStrategy for RandomV4 {
    const STRATEGY_ID: u8 = 0x00;

    /// Generate a UUID v4 payload.
    ///
    /// # Errors
    ///
    /// Returns [`GenerateError::EntropyFailure`] if the OS CSPRNG fails.
    fn generate(&self, ctx: &mut GenContext<'_>) -> Result<IdPayload, GenerateError> {
        let mut bytes = [0u8; 16];
        ctx.random.fill_bytes(&mut bytes);

        // Set version to 4 (RFC 4122 §4.4)
        bytes[6] = (bytes[6] & 0x0F) | 0x40;
        // Set variant to 10xx (RFC 4122 §4.1.1)
        bytes[8] = (bytes[8] & 0x3F) | 0x80;

        Ok(IdPayload {
            schema_version: crate::SCHEMA_VERSION,
            strategy: Self::STRATEGY_ID,
            prefix: ctx.prefix.map(String::from),
            bytes: bytes.to_vec(),
        })
    }
}

/// Format 16 bytes as RFC 4122 UUID v4 string (`8-4-4-4-12` hex).
#[must_use]
pub fn format_uuid_v4(bytes: &[u8; 16]) -> String {
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15],
    )
}

/// Parse an RFC 4122 UUID v4 string back to 16 bytes.
///
/// Accepts both upper and lower case. Returns `None` if format is invalid
/// or version nibble is not `4`.
#[must_use]
pub fn parse_uuid_v4(s: &str) -> Option<[u8; 16]> {
    parse_uuid_bytes(s, b'4')
}

/// Parse an RFC 4122 UUID string with a specific version nibble.
fn parse_uuid_bytes(s: &str, version: u8) -> Option<[u8; 16]> {
    if s.len() != 36 {
        return None;
    }
    let b = s.as_bytes();
    if b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return None;
    }
    if !b[14].eq_ignore_ascii_case(&version) {
        return None;
    }
    let variant = b[19].to_ascii_uppercase();
    if !matches!(variant, b'8' | b'9' | b'A' | b'B') {
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
    use crate::strategy::OsRandom;

    #[test]
    fn random_v4_generates_valid_uuid() {
        let mut ctx = GenContext {
            prefix: None,
            now_ms: 0,
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        let strategy = RandomV4;
        let payload = strategy.generate(&mut ctx).unwrap();
        assert_eq!(payload.bytes.len(), 16);
        assert_eq!(payload.strategy, RandomV4::STRATEGY_ID);
        assert_eq!(payload.schema_version, crate::SCHEMA_VERSION);
        assert_eq!(payload.bytes[6] & 0xF0, 0x40);
        assert_eq!(payload.bytes[8] & 0xC0, 0x80);
    }

    #[test]
    fn format_uuid_v4_produces_rfc_format() {
        let bytes: [u8; 16] = [
            0x55, 0x0e, 0x84, 0x00, 0xe2, 0x9b, 0x41, 0xd4, 0xa7, 0x16, 0x44, 0x66, 0x55, 0x44,
            0x00, 0x00,
        ];
        assert_eq!(
            format_uuid_v4(&bytes),
            "550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn parse_uuid_v4_roundtrip() {
        let original = "550e8400-e29b-41d4-a716-446655440000";
        let parsed = parse_uuid_v4(original).expect("parse failed");
        assert_eq!(format_uuid_v4(&parsed), original);
    }

    #[test]
    fn parse_uuid_v4_rejects_wrong_version() {
        assert!(parse_uuid_v4("550e8400-e29b-11d4-a716-446655440000").is_none());
    }

    #[test]
    fn parse_uuid_v4_case_insensitive() {
        let upper = "550E8400-E29B-41D4-A716-446655440000";
        let parsed = parse_uuid_v4(upper).expect("parse failed");
        assert_eq!(
            format_uuid_v4(&parsed),
            "550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn uniqueness_test_10k_ids() {
        let mut ctx = GenContext {
            prefix: None,
            now_ms: 0,
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        let mut ids = std::collections::HashSet::new();
        for _ in 0..10_000 {
            let payload = RandomV4.generate(&mut ctx).unwrap();
            let formatted = format_uuid_v4(&payload.bytes.try_into().unwrap());
            assert!(ids.insert(formatted), "Duplicate UUID v4 generated!");
        }
    }
}
