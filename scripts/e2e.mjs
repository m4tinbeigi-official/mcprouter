#!/usr/bin/env node
/**
 * scripts/e2e.mjs — end-to-end smoke test for MCPRouter (zero deps, in-process).
 *
 * Spawns the router in a child process, captures its stderr, then exercises:
 *   GET  /health
 *   POST /mcp  (evand_search_events)
 *   budget enforcement (4th call rejected)
 *   API-key gate
 *   GET  /panel
 *
 * Usage: node scripts/e2e.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const work = mkdtempSync(join(tmpdir(), "mcprouter-e2e-"));
const PORT = 3000 + Math.floor(Math.random() * 60000);
const cfg = join(work, "config.yaml");
writeFileSync(cfg, `
bind: 127.0.0.1:${PORT}
transport: http
locale: en
defaultProxy: none
adapters:
  - evand
providers:
  - id: evand
    adapter: evand
    enabled: true
    official: true
    apiKey: false
    budget:
      type: requests
      limit: 3
      window: 3600
    proxy:
      type: none
`);

const child = spawn(process.execPath, ["src/server.js", "--config", cfg, "--transport", "http", "--port", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env },
});

const results = [];
function check(name, ok, extra = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? " — " + extra : ""}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function post(path, body) {
  const res = await fetch("http://127.0.0.1:" + PORT + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

async function get(path) {
  const res = await fetch("http://127.0.0.1:" + PORT + path);
  return { status: res.status, body: await res.text() };
}

let errSpew = "";
child.stderr.on("data", (c) => { errSpew += c; });
child.stdout.on("data", (c) => { errSpew += "STDOUT: " + c; });

try {
  await sleep(1500);
  const startupErrors = errSpew.split("\n")
    .filter(l => !l.includes("ExperimentalWarning") && !l.includes("listening"))
    .filter(l => /Error|TypeError|ReferenceError|SyntaxError|ENOTFOUND|ECONNREFUSED|EFILE/.test(l))
    .join(" | ");
  check("no startup errors", !startupErrors, startupErrors);

  let r = await get("/health");
  check("GET /health 200 with evand", r.status === 200 && r.body.includes("evand"), r.body.slice(0, 120));

  r = await get("/panel");
  check("GET /panel 200", r.status === 200, r.body.slice(0, 60));

  for (let i = 1; i <= 4; i++) {
    r = await post("/mcp", {
      jsonrpc: "2.0", id: String(i), method: "tools/call",
      params: { adapter: "evand", provider: "evand", tool: "evand_search_events", arguments: { query: "conferences" } },
    });
    const expect = i <= 3 ? 200 : 422;
    check(`post #${i} status ${expect}`, r.status === expect, r.body.slice(0, 80));
  }

  r = await post("/mcp", {
    jsonrpc: "2.0", id: "5", method: "tools/call",
    params: { adapter: "evand", provider: "evand", tool: "evand_search_events", arguments: {}, apiKeyHash: "sha256:deadbeef" },
  });
  check("api-key gate returns 401", r.status === 401, r.body.slice(0, 60));
} catch (e) {
  check("no exception", false, String(e));
  console.error(e);
} finally {
  if (child.pid) child.kill("SIGKILL");
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((x) => !x).length;
console.log(`\n${failed ? failed + " FAILED" : "ALL PASSED"} — ${results.length} checks`);
process.exit(failed ? 1 : 0);
