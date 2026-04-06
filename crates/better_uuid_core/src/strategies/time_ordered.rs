//! `TimeOrdered` — UUID v7 generation (RFC 9562).
//!
//! Produces time-ordered IDs with:
//! - 48 bits: Unix timestamp in milliseconds (big-endian)
//! - 4 bits: version = 0111 (7)
//! - 12 bits: sub-millisecond counter (monotonically increasing within same ms)
//! - 2 bits: variant = 10
//! - 62 bits: random

use crate::error::GenerateError;
use crate::strategy::{GenContext, IdPayload, IdStrategy};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

/// UUID v7 time-ordered strategy.
///
/// Generates IDs that sort lexicographically by creation time.
///
/// # Bit layout (RFC 9562)
///
/// | Field | Bits | Description |
/// |-------|------|-------------|
/// | `unix_ts_ms` | 48 | Unix timestamp in milliseconds (big-endian) |
/// | `ver` | 4 | Version = 7 (`0111`) |
/// | `sub_ms_counter` | 12 | Sub-millisecond monotonic counter |
/// | `var` | 2 | Variant = `10` |
/// | `rand` | 62 | Cryptographically random |
///
/// # Collision model
///
/// - **Random bits:** 62 bits of CSPRNG entropy + 12 bits of counter
/// - **Birthday bound:** ~50% collision probability at ~2^37 IDs per millisecond
/// - **Practical risk:** Negligible — counter handles up to 4096 IDs/ms per process
/// - **CSPRNG:** `getrandom` (OS entropy pool)
#[derive(Debug, Clone)]
pub struct TimeOrdered {
    last_ts: Arc<AtomicU64>,
    last_counter: Arc<AtomicU64>,
}

impl TimeOrdered {
    /// Create a new `TimeOrdered` strategy with isolated counter state.
    #[must_use]
    pub fn new() -> Self {
        Self {
            last_ts: Arc::new(AtomicU64::new(0)),
            last_counter: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl Default for TimeOrdered {
    fn default() -> Self {
        Self::new()
    }
}

impl IdStrategy for TimeOrdered {
    const STRATEGY_ID: u8 = 0x01;

    /// Generate a UUID v7 payload.
    ///
    /// # Errors
    ///
    /// Returns [`GenerateError::ClockRegressed`] if the system clock moved backward
    /// and the configured policy is `Error` or `Wait`.
    /// Returns [`GenerateError::SequenceExhausted`] if the sub-millisecond counter
    /// overflowed and the configured policy is `Error`.
    fn generate(&self, ctx: &mut GenContext<'_>) -> Result<IdPayload, GenerateError> {
        let now_ms = ctx.now_ms;
        let prev_ts = self.last_ts.load(Ordering::Acquire);

        if now_ms < prev_ts {
            match ctx.on_clock_regression {
                crate::ClockRegressionPolicy::Fallback => {
                    // Emit a UUID v4 instead
                    let mut v4_bytes = [0u8; 16];
                    ctx.random.fill_bytes(&mut v4_bytes);
                    v4_bytes[6] = (v4_bytes[6] & 0x0F) | 0x40;
                    v4_bytes[8] = (v4_bytes[8] & 0x3F) | 0x80;
                    return Ok(IdPayload {
                        schema_version: crate::SCHEMA_VERSION,
                        strategy: 0x00,
                        prefix: ctx.prefix.map(String::from),
                        bytes: v4_bytes.to_vec(),
                    });
                }
                _ => {
                    return Err(GenerateError::ClockRegressed {
                        last_ts: prev_ts,
                        now: now_ms,
                    });
                }
            }
        }

        let counter = if now_ms > prev_ts {
            // New millisecond — reset counter to random initial value
            let mut rand_bytes = [0u8; 2];
            ctx.random.fill_bytes(&mut rand_bytes);
            let initial = (u64::from(rand_bytes[0]) << 4 | u64::from(rand_bytes[1]) >> 4) & 0xFFF;
            self.last_ts.store(now_ms, Ordering::Release);
            self.last_counter.store(initial, Ordering::Release);
            initial
        } else {
            let current = self.last_counter.fetch_add(1, Ordering::AcqRel);
            if current & 0xFFF == 0 && current > 0xFFF {
                return Err(GenerateError::SequenceExhausted {
                    node: ctx.node.as_ref().map_or(0, |n| n.node_id),
                    timestamp: now_ms,
                });
            }
            current & 0xFFF
        };

        let mut rand_bytes = [0u8; 8];
        ctx.random.fill_bytes(&mut rand_bytes);
        rand_bytes[0] &= 0x3F; // 62 bits max

        let mut uuid = [0u8; 16];
        uuid[0] = ((now_ms >> 40) & 0xFF) as u8;
        uuid[1] = ((now_ms >> 32) & 0xFF) as u8;
        uuid[2] = ((now_ms >> 24) & 0xFF) as u8;
        uuid[3] = ((now_ms >> 16) & 0xFF) as u8;
        uuid[4] = ((now_ms >> 8) & 0xFF) as u8;
        uuid[5] = (now_ms & 0xFF) as u8;
        uuid[6] = 0x70 | ((counter >> 8) & 0x0F) as u8;
        uuid[7] = (counter & 0xFF) as u8;
        uuid[8] = 0x80 | (rand_bytes[0] & 0x3F);
        uuid[9..17].copy_from_slice(&rand_bytes[1..]);

        Ok(IdPayload {
            schema_version: crate::SCHEMA_VERSION,
            strategy: Self::STRATEGY_ID,
            prefix: ctx.prefix.map(String::from),
            bytes: uuid.to_vec(),
        })
    }
}

/// Format 16 bytes as RFC 4122 UUID v7 string (`8-4-4-4-12` hex).
#[must_use]
pub fn format_uuid_v7(bytes: &[u8; 16]) -> String {
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

/// Parse an RFC 4122 UUID v7 string back to components.
///
/// Returns the timestamp in milliseconds since Unix epoch, or `None` if
/// the input is not a valid UUID v7.
#[must_use]
pub fn parse_uuid_v7_timestamp(s: &str) -> Option<u64> {
    if s.len() != 36 {
        return None;
    }
    let b = s.as_bytes();
    if !b[14].eq_ignore_ascii_case(&b'7') {
        return None;
    }
    let variant = b[19].to_ascii_uppercase();
    if !matches!(variant, b'8' | b'9' | b'A' | b'B') {
        return None;
    }
    let mut hex_str = String::with_capacity(12);
    for i in [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13] {
        hex_str.push(b[i] as char);
    }
    u64::from_str_radix(&hex_str, 16).ok()
}

/// Parse an RFC 4122 UUID v7 string back to 16 bytes.
#[must_use]
pub fn parse_uuid_v7(s: &str) -> Option<[u8; 16]> {
    parse_uuid_bytes(s, b'7')
}

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
    use std::time::{SystemTime, UNIX_EPOCH};

    fn get_now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }

    #[test]
    fn time_ordered_generates_valid_uuid_v7() {
        let strategy = TimeOrdered::new();
        let mut ctx = GenContext {
            prefix: None,
            now_ms: get_now_ms(),
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        let payload = strategy.generate(&mut ctx).unwrap();
        assert_eq!(payload.bytes.len(), 16);
        assert_eq!(payload.strategy, TimeOrdered::STRATEGY_ID);
        assert_eq!(payload.bytes[6] & 0xF0, 0x70);
        assert_eq!(payload.bytes[8] & 0xC0, 0x80);
    }

    #[test]
    fn format_uuid_v7_produces_rfc_format() {
        let bytes: [u8; 16] = [
            0x01, 0x8f, 0x3c, 0x1a, 0x7b, 0x2d, 0x7e, 0x3f, 0xa4, 0xb5, 0xc6, 0xd7, 0xe8, 0xf9,
            0x0a, 0x1b,
        ];
        assert_eq!(
            format_uuid_v7(&bytes),
            "018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b"
        );
    }

    #[test]
    fn parse_uuid_v7_timestamp_extraction() {
        let ts = parse_uuid_v7_timestamp("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b");
        assert_eq!(ts, Some(0x018f_3c1a_7b2d));
    }

    #[test]
    fn parse_uuid_v7_roundtrip() {
        let original = "018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b";
        let parsed = parse_uuid_v7(original).expect("parse failed");
        assert_eq!(format_uuid_v7(&parsed), original);
    }

    #[test]
    fn parse_uuid_v7_rejects_wrong_version() {
        assert!(parse_uuid_v7("550e8400-e29b-41d4-a716-446655440000").is_none());
    }

    #[test]
    fn time_ordered_is_lexicographically_sortable() {
        let strategy = TimeOrdered::new();
        let mut ctx = GenContext {
            prefix: None,
            now_ms: 1_700_000_000_000u64,
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        let p1 = strategy.generate(&mut ctx).unwrap();
        let id1 = format_uuid_v7(&p1.bytes.try_into().unwrap());

        ctx.now_ms += 1;
        let p2 = strategy.generate(&mut ctx).unwrap();
        let id2 = format_uuid_v7(&p2.bytes.try_into().unwrap());

        assert!(id1 < id2, "UUID v7 should be sortable: {id1} < {id2}");
    }

    #[test]
    fn time_ordered_with_prefix() {
        let strategy = TimeOrdered::new();
        let mut ctx = GenContext {
            prefix: Some("usr"),
            now_ms: get_now_ms(),
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        let payload = strategy.generate(&mut ctx).unwrap();
        assert_eq!(payload.prefix, Some("usr".to_string()));
    }

    #[test]
    fn clock_regression_detected() {
        let strategy = TimeOrdered::new();
        // Prime the counter
        let mut ctx = GenContext {
            prefix: None,
            now_ms: 1_700_000_000_000u64,
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Error,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        strategy.generate(&mut ctx).unwrap();

        // Now go backward
        ctx.now_ms = 1_699_999_999_999u64;
        let result = strategy.generate(&mut ctx);
        assert!(matches!(result, Err(GenerateError::ClockRegressed { .. })));
    }

    #[test]
    fn clock_regression_fallback_to_v4() {
        let strategy = TimeOrdered::new();
        let mut ctx = GenContext {
            prefix: None,
            now_ms: 1_700_000_000_000u64,
            random: &mut OsRandom,
            node: None,
            deterministic_input: None,
            salt: None,
            on_clock_regression: crate::ClockRegressionPolicy::Fallback,
            on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
        };
        strategy.generate(&mut ctx).unwrap();

        ctx.now_ms = 1_699_999_999_999u64;
        let payload = strategy.generate(&mut ctx).unwrap();
        // Should be v4-shaped (strategy byte 0x00)
        assert_eq!(payload.strategy, 0x00);
        assert_eq!(payload.bytes[6] & 0xF0, 0x40);
    }

    #[test]
    fn uniqueness_test_10k_ids() {
        let strategy = TimeOrdered::new();
        let mut ids = std::collections::HashSet::new();

        for i in 0..10_000u64 {
            let mut ctx = GenContext {
                prefix: None,
                now_ms: 1_700_000_000_000u64 + (i / 100),
                random: &mut OsRandom,
                node: None,
                deterministic_input: None,
                salt: None,
                on_clock_regression: crate::ClockRegressionPolicy::Error,
                on_sequence_exhausted: crate::SequenceExhaustedPolicy::Error,
            };
            let payload = strategy.generate(&mut ctx).unwrap();
            let formatted = format_uuid_v7(&payload.bytes.try_into().unwrap());
            assert!(ids.insert(formatted), "Duplicate at index {i}!");
        }
    }
}
