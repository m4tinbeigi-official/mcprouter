#!/usr/bin/env node
/**
 * scripts/lint.mjs — quick project sanity check (in-repo, zero deps).
 *
 * Checks: package.json parses, src/ exists, docs/ exists, no trace of an em-dash
 * in markdown/text files, and the licence header is present in README.md.
 *
 * Usage: node scripts/lint.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const FAILS = [];

function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) FAILS.push(name);
}

// 1. package.json is valid JSON
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  check("package.json parses", true);
  check("package.name is set", Boolean(pkg.name));
  check("package.version is set", Boolean(pkg.version));
} catch (e) {
  check("package.json parses", false);
}

// 2. src / docs / adapters dirs exist
for (const d of ["src", "docs", "scripts"]) {
  check(`dir ${d}/ exists`, statSync(join(ROOT, d)).isDirectory());
}

// 3. no em-dash in text files (per project standard)
let emdashFound = false;
const textExts = new Set([".md", ".js", ".json", ".yaml", ".toml", ".sh", ".py"]);
for (const de of readdirSync(ROOT, { withFileTypes: true })) {
  if (!de.isDirectory()) continue;
  for (const f of readdirSync(join(ROOT, de.name))) {
    const ext = f.slice(f.lastIndexOf("."));
    if (!textExts.has(ext)) continue;
    const fp = join(ROOT, de.name, f);
    const s = readFileSync(fp, "utf8");
    if (s.includes("—")) {
      emdashFound = true;
      console.log(`  (found em-dash in ${fp})`);
    }
  }
}
check("no em-dash in tracked text files", !emdashFound);

// 4. licence header present in README
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
check("README has licence + MIT mention", readme.includes("MIT") && readme.includes("LICENSE"));

console.log(`\n${FAILS.length ? "FAILED" : "OK"} — ${FAILS.length} check(s) failed`);
process.exit(FAILS.length ? 1 : 0);
