#!/usr/bin/env node
/**
 * better-uuid — Release (Node, cross-platform)
 *
 * Usage:
 *   pnpm release:dry-run
 *   pnpm release
 *
 * Env:
 *   RELEASE_BUMP=patch|minor|major
 *   RELEASE_SUMMARY="One line summary"
 *   RELEASE_STRICT_CLEAN=1   (dry-run only: require clean working tree)
 *   DRY_RUN=1                (same as --dry-run)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const pkgDir = path.join(rootDir, "packages", "better-uuid");
const pkgJsonPath = path.join(pkgDir, "package.json");
const pkgName = "better-uuid";

const log = (...a) => console.log("[release]", ...a);
const warn = (...a) => console.warn("[release]", ...a);
const die = (msg) => {
	console.error("[release]", msg);
	process.exit(1);
};

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {
		encoding: "utf8",
		stdio: "inherit",
		cwd: rootDir,
		...opts,
	});
	if (r.status !== 0 && r.status !== null) process.exit(r.status);
	if (r.error) die(r.error.message);
}

/**
 * Run pnpm. If `pnpm` is not on PATH (common on Windows when only npm is installed),
 * fall back to `npm exec -- pnpm …` which resolves pnpm via npm.
 */
function runPnpm(args, opts = {}) {
	const base = { encoding: "utf8", stdio: "inherit", cwd: rootDir, ...opts };
	let r = spawnSync("pnpm", args, base);
	if (r.error?.code === "ENOENT") {
		warn("pnpm not on PATH; using npm exec pnpm …");
		r = spawnSync("npm", ["exec", "--", "pnpm", ...args], {
			...base,
			shell: process.platform === "win32",
		});
	}
	if (r.status !== 0 && r.status !== null) process.exit(r.status);
	if (r.error) die(r.error.message);
}

/** `npm` on Windows is `npm.cmd`; spawn without shell often returns ENOENT. */
function spawnNpm(args, opts = {}) {
	return spawnSync("npm", args, {
		encoding: "utf8",
		stdio: "pipe",
		shell: process.platform === "win32",
		...opts,
	});
}

/**
 * After `npm publish`, the tarball can take minutes to replicate (ETARGET / No matching version).
 * Poll `npm view` until the version is visible, then install with `--prefer-online`.
 */
async function waitForNpmVersion(name, version, { maxAttempts = 36, delayMs = 5000 } = {}) {
	for (let i = 0; i < maxAttempts; i++) {
		const r = spawnNpm(["view", `${name}@${version}`, "version"], { cwd: rootDir });
		const line = (r.stdout ?? "").trim().split(/\r?\n/)[0] ?? "";
		if (r.status === 0 && line === version) {
			return true;
		}
		log(
			`Smoke: registry not listing ${name}@${version} yet (${i + 1}/${maxAttempts}), waiting ${delayMs / 1000}s…`,
		);
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
	return false;
}

function runCapture(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {
		encoding: "utf8",
		cwd: rootDir,
		...opts,
	});
	if (r.error) die(r.error.message);
	return { status: r.status, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

function hasCmd(name) {
	const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], {
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	return r.status === 0;
}

function getSemVer(bump, ver) {
	const base = String(ver).split("-")[0];
	const parts = base.split(".").map((p) => parseInt(String(p).replace(/\D/g, ""), 10) || 0);
	let [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
	switch (bump) {
		case "patch":
			patch++;
			break;
		case "minor":
			minor++;
			patch = 0;
			break;
		case "major":
			major++;
			minor = 0;
			patch = 0;
			break;
		default:
			die(`Invalid bump: ${bump}`);
	}
	return `${major}.${minor}.${patch}`;
}

function readPkgVersion() {
	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
	return pkg.version;
}

function writePkgVersion(newVersion) {
	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
	pkg.version = newVersion;
	writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function gitCleanCheckRelaxed() {
	const { status, stdout } = runCapture("git", [
		"status",
		"--porcelain",
		"--",
		":!scripts/",
		":!.github/",
		":!RELEASING.md",
		":!.qwen/",
		":!docs/",
	]);
	if (status !== 0) die("git status failed");
	if (stdout) {
		let msg = `Uncommitted changes:\n${stdout}`;
		if (stdout.includes("package.json")) {
			msg +=
				"\n\nHint: Root package.json is not ignored—commit/stash it (only paths under scripts/, .github/, docs/, etc. are skipped). See RELEASING.md.";
		}
		die(msg);
	}
}

async function main() {
	const argv = process.argv.slice(2);
	const dryRun =
		argv.includes("--dry-run") || process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

	process.chdir(rootDir);

	const currentVersion = readPkgVersion();

	if (dryRun) {
		log("═══ DRY RUN — no files will be modified ═══");
		log("");
		log("Current version:", currentVersion);
		log("");
		log("Available bumps:");
		log("  patch  →", getSemVer("patch", currentVersion));
		log("  minor  →", getSemVer("minor", currentVersion));
		log("  major  →", getSemVer("major", currentVersion));
		log("");

		const branch = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout;
		log("Current branch:", branch);
		if (branch !== "main") warn("Not on main — interactive release will checkout main first");

		if (process.env.RELEASE_STRICT_CLEAN === "1") {
			log("Strict clean check enabled");
			const dirty = runCapture("git", ["status", "--porcelain"]).stdout;
			if (dirty) die("Working tree is not clean.");
		} else {
			log("Relaxed clean check");
		}

		if (!hasCmd("cargo")) die("Rust toolchain not found (cargo)");
		if (!hasCmd("pnpm") && !hasCmd("npm")) die("Need pnpm or npm on PATH for install/publish steps");
		log("");
		log("═══ Release plan (dry run) ═══");
		log("1. git checkout main && git pull");
		log("2. pnpm install --frozen-lockfile (or npm exec pnpm if pnpm missing from PATH)");
		log("3. Rust: fmt, clippy, test");
		log("4. TS: typecheck, test");
		log("5. Bump version + CHANGELOG");
		log("6. git commit + tag");
		log("7. pnpm --filter better-uuid build (dist/ + wasm/; not in git)");
		log("8. pnpm publish --no-git-checks (ignore gitignored build artifacts)");
		log("9. Smoke test");
		log("");
		log("═══ Dry run complete ═══");
		return;
	}

	const branch = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout;
	if (branch !== "main") {
		log("Switching to main");
		run("git", ["checkout", "main"]);
		run("git", ["pull", "origin", "main"]);
	}

	gitCleanCheckRelaxed();

	log("Installing dependencies");
	runPnpm(["install", "--frozen-lockfile"]);

	log("Running Rust fmt check");
	run("cargo", ["fmt", "--check"]);

	log("Running Rust clippy");
	run("cargo", ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"]);

	log("Running Rust tests");
	run("cargo", ["test", "--all-features"]);

	log("Running TypeScript typecheck");
	runPnpm(["typecheck"]);

	log("Running TypeScript tests");
	runPnpm(["test"]);

	let bump = process.env.RELEASE_BUMP;
	let summary = process.env.RELEASE_SUMMARY;

	/** @type {import('node:readline').Interface | undefined} */
	let rl;
	const ask = async (q) => {
		if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		return rl.question(q);
	};
	try {
		if (!bump) {
			console.log("");
			console.log(`═══ Current version: ${currentVersion} ═══`);
			console.log("");
			console.log("Select bump:");
			console.log(`  1) patch  → ${getSemVer("patch", currentVersion)}`);
			console.log(`  2) minor  → ${getSemVer("minor", currentVersion)}`);
			console.log(`  3) major  → ${getSemVer("major", currentVersion)}`);
			console.log("");
			const choice = (await ask("Choose [1-3]: ")).trim();
			if (choice === "1") bump = "patch";
			else if (choice === "2") bump = "minor";
			else if (choice === "3") bump = "major";
			else die("Invalid choice");
		}

		if (!summary) {
			summary = (await ask("One-line release summary: ")).trim();
		}
	} finally {
		rl?.close();
	}

	if (!summary) die("RELEASE_SUMMARY is required (or enter at prompt)");

	const newVersion = getSemVer(bump, currentVersion);
	log("Bump:", `${currentVersion} → ${newVersion} (${bump})`);
	log("Summary:", summary);

	log(`Writing version ${newVersion}`);
	writePkgVersion(newVersion);

	const changelogPath = path.join(pkgDir, "CHANGELOG.md");
	const today = new Date().toISOString().slice(0, 10);
	const entry = `## ${newVersion} (${today})\n\n- ${summary}\n\n`;
	const old = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "# Changelog\n\n";
	writeFileSync(changelogPath, entry + old, "utf8");

	log("Committing release");
	run("git", ["add", "packages/better-uuid/package.json", "packages/better-uuid/CHANGELOG.md"]);
	run("git", ["commit", "-m", `release: v${newVersion} — ${summary}`]);
	run("git", ["tag", `v${newVersion}`]);

	log(`Building ${pkgName} (dist + wasm) for publish`);
	runPnpm(["--filter", pkgName, "build"]);

	log(`Publishing ${pkgName}@${newVersion}`);
	// build/ leaves gitignored artifacts; release commit is already done — pnpm would block with ERR_PNPM_GIT_UNCLEAN otherwise
	runPnpm(["--filter", pkgName, "publish", "--access", "public", "--no-git-checks"]);

	log("Pushing to origin");
	run("git", ["push", "origin", "main"]);
	run("git", ["push", "origin", `v${newVersion}`]);

	log("Running smoke test");
	const smokeDir = mkdtempSync(path.join(tmpdir(), "better-uuid-smoke-"));
	try {
		const init = spawnNpm(["init", "-y"], { cwd: smokeDir });
		if (init.status !== 0) warn("npm init failed:", init.stderr || init.stdout);

		const visible = await waitForNpmVersion(pkgName, newVersion);
		if (!visible) {
			warn(
				`Smoke: timed out waiting for ${pkgName}@${newVersion} on registry — skip install (check npmjs.com in a few minutes).`,
			);
		} else {
			const tryInstall = () =>
				spawnNpm(
					["install", `${pkgName}@${newVersion}`, "--prefer-online", "--no-fund", "--no-audit"],
					{ cwd: smokeDir },
				);
			let inst = tryInstall();
			for (let retry = 0; inst.status !== 0 && retry < 5; retry++) {
				warn(`Smoke: npm install failed, retry ${retry + 1}/5 in 8s…`);
				await new Promise((r) => setTimeout(r, 8000));
				inst = tryInstall();
			}
			if (inst.status !== 0) {
				warn("npm install failed:", inst.stderr || inst.stdout);
			} else {
				const probe = spawnSync(
					process.execPath,
					[
						"--input-type=module",
						"-e",
						`import('${pkgName}').then(m => { console.log(typeof m.createId); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })`,
					],
					{ cwd: smokeDir, encoding: "utf8" },
				);
				if (probe.stdout?.trim() === "function") log("Smoke test passed");
				else warn("Smoke probe output:", probe.stdout, probe.stderr);
			}
		}
	} finally {
		rmSync(smokeDir, { recursive: true, force: true });
	}

	log("");
	log("═══ Release complete ═══");
	log("Package:", `${pkgName}@${newVersion}`);
	log("Tag:", `v${newVersion}`);
}

await main();
