//! Encoding and alphabet codecs.
//!
//! Supports Crockford base32 (default), base58, and hex (UUID-shaped strategies).

use base32::{Alphabet, decode as b32_decode, encode as b32_encode};
use std::fmt::Write;

/// Crockford base32 alphabet (case-insensitive).
pub const CROCKFORD: Alphabet = Alphabet::Crockford;

/// Encode bytes to a Crockford base32 string.
#[must_use]
pub fn encode_crockford(bytes: &[u8]) -> String {
    b32_encode(CROCKFORD, bytes)
        .trim_end_matches('=')
        .to_string()
}

/// Decode a Crockford base32 string back to bytes.
#[must_use]
pub fn decode_crockford(s: &str) -> Option<Vec<u8>> {
    let upper = s.to_ascii_uppercase();
    b32_decode(CROCKFORD, &upper)
}

/// Encode bytes to a canonical hex string (lowercase, no separator).
#[must_use]
pub fn encode_hex(bytes: &[u8]) -> String {
    let mut result = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(result, "{b:02x}");
    }
    result
}

/// Decode a hex string back to bytes.
#[must_use]
pub fn decode_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crockford_roundtrip() {
        let input = b"hello world";
        let encoded = encode_crockford(input);
        assert!(!encoded.contains('='));
        let decoded = decode_crockford(&encoded).expect("decode failed");
        assert_eq!(decoded, input);
    }

    #[test]
    fn crockford_case_insensitive() {
        let encoded = encode_crockford(b"test");
        assert_eq!(
            decode_crockford(&encoded.to_ascii_uppercase()),
            decode_crockford(&encoded.to_ascii_lowercase())
        );
    }

    #[test]
    fn crockford_omits_ambiguous() {
        let encoded = encode_crockford(&[0xFF; 16]);
        assert!(!encoded.contains('I'));
        assert!(!encoded.contains('L'));
        assert!(!encoded.contains('O'));
        assert!(!encoded.contains('U'));
    }

    #[test]
    fn hex_roundtrip() {
        let input = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let encoded = encode_hex(&input);
        assert_eq!(encoded, "deadbeef");
        let decoded = decode_hex(&encoded).expect("decode failed");
        assert_eq!(decoded, input);
    }

    #[test]
    fn hex_rejects_odd_length() {
        assert!(decode_hex("abc").is_none());
    }

    #[test]
    fn hex_rejects_invalid_chars() {
        assert!(decode_hex("g00d").is_none());
    }
}
