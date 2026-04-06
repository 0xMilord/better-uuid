//! Golden fixture generator for better-uuid.
//!
//! Generates 10,000 JSON fixture vectors from Rust strategies for
//! cross-language contract testing with TypeScript.
//!
//! Usage: `cargo run --bin generate_fixtures`
//! Output: `fixtures/vectors.jsonl` (JSON Lines format)

use better_uuid_core::layout::format_native_id;
use better_uuid_core::parse::parse_id;
use better_uuid_core::strategies::{RandomV4, TimeOrdered};
use better_uuid_core::strategy::{GenContext, IdStrategy, OsRandom};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

fn get_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn make_ctx<'a>(prefix: Option<&'a str>, now_ms: u64, random: &'a mut OsRandom) -> GenContext<'a> {
    GenContext {
        prefix,
        now_ms,
        random,
        node: None,
        deterministic_input: None,
        salt: None,
        on_clock_regression: better_uuid_core::ClockRegressionPolicy::Error,
        on_sequence_exhausted: better_uuid_core::SequenceExhaustedPolicy::Error,
    }
}

#[derive(serde::Serialize)]
struct Fixture {
    strategy: &'static str,
    prefix: Option<String>,
    id: String,
    parsed: ParsedFixture,
}

#[derive(serde::Serialize)]
struct ParsedFixture {
    legacy: bool,
    prefix: Option<String>,
    strategy: String,
    schema_version: Option<u8>,
    timestamp_ms: Option<u64>,
    entropy_hex: String,
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn strategy_label(id: u8) -> &'static str {
    match id {
        0x00 => "uuidv4",
        0x01 => "time",
        _ => "unknown",
    }
}

fn main() -> std::io::Result<()> {
    std::fs::create_dir_all("fixtures")?;
    let file = File::create("fixtures/vectors.jsonl")?;
    let mut writer = BufWriter::new(file);

    let mut random = OsRandom;
    let now_ms = get_now_ms();
    let counters_ts: &'static AtomicU64 = Box::leak(Box::new(AtomicU64::new(0)));
    let counters_counter: &'static AtomicU64 = Box::leak(Box::new(AtomicU64::new(0)));

    let prefixes = [None, Some("usr"), Some("ord"), Some("txn"), Some("evt")];
    let total = 10_000;
    let per_strategy = total / 2;

    println!("Generating {total} golden fixtures...");
    println!("  {per_strategy} UUID v4");
    println!("  {per_strategy} UUID v7");

    let mut count = 0;

    // Generate UUID v4 fixtures
    for i in 0..per_strategy {
        let prefix = prefixes[i % prefixes.len()];
        let mut ctx = make_ctx(prefix, 0, &mut random);
        let payload = RandomV4.generate(&mut ctx).unwrap();
        let formatted = format_native_id(&payload);
        let parsed = parse_id(&formatted).unwrap();

        let fixture = Fixture {
            strategy: "uuidv4",
            prefix: prefix.map(String::from),
            id: formatted.clone(),
            parsed: ParsedFixture {
                legacy: parsed.legacy,
                prefix: parsed.prefix,
                strategy: strategy_label(parsed.strategy.into()).to_string(),
                schema_version: parsed.schema_version,
                timestamp_ms: parsed.timestamp_ms,
                entropy_hex: bytes_to_hex(&parsed.bytes),
            },
        };

        writeln!(writer, "{}", serde_json::to_string(&fixture).unwrap())?;
        count += 1;
    }

    // Generate UUID v7 fixtures
    let strategy = TimeOrdered::new();
    counters_ts.store(0, Ordering::Relaxed);
    counters_counter.store(0, Ordering::Relaxed);
    // We need to use Arc-based counters, but TimeOrdered::new() creates its own.
    // For fixture generation, we just use new() which has independent counters.
    for i in 0..per_strategy {
        let prefix = prefixes[i % prefixes.len()];
        let ms = now_ms + (i as u64);
        let mut ctx = make_ctx(prefix, ms, &mut random);
        let payload = strategy.generate(&mut ctx).unwrap();
        let formatted = format_native_id(&payload);
        let parsed = parse_id(&formatted).unwrap();

        let fixture = Fixture {
            strategy: "time",
            prefix: prefix.map(String::from),
            id: formatted.clone(),
            parsed: ParsedFixture {
                legacy: parsed.legacy,
                prefix: parsed.prefix,
                strategy: strategy_label(parsed.strategy.into()).to_string(),
                schema_version: parsed.schema_version,
                timestamp_ms: parsed.timestamp_ms,
                entropy_hex: bytes_to_hex(&parsed.bytes),
            },
        };

        writeln!(writer, "{}", serde_json::to_string(&fixture).unwrap())?;
        count += 1;
    }

    writer.flush()?;
    println!("Generated {count} fixtures → fixtures/vectors.jsonl");

    // Generate legacy UUID fixtures
    let legacy_file = File::create("fixtures/legacy.jsonl")?;
    let mut legacy_writer = BufWriter::new(legacy_file);

    let legacy_ids = [
        "550e8400-e29b-41d4-a716-446655440000",
        "018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    ];

    for legacy_id in &legacy_ids {
        let parsed = parse_id(legacy_id).unwrap();
        let fixture = Fixture {
            strategy: if parsed.strategy == better_uuid_core::StrategyId::UuidV4 {
                "uuidv4"
            } else {
                "time"
            },
            prefix: None,
            id: legacy_id.to_string(),
            parsed: ParsedFixture {
                legacy: true,
                prefix: parsed.prefix,
                strategy: strategy_label(parsed.strategy.into()).to_string(),
                schema_version: parsed.schema_version,
                timestamp_ms: parsed.timestamp_ms,
                entropy_hex: bytes_to_hex(&parsed.bytes),
            },
        };

        writeln!(
            legacy_writer,
            "{}",
            serde_json::to_string(&fixture).unwrap()
        )?;
    }

    legacy_writer.flush()?;
    println!(
        "Generated {} legacy fixtures → fixtures/legacy.jsonl",
        legacy_ids.len()
    );

    Ok(())
}
