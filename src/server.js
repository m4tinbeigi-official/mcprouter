#!/usr/bin/env node
/**
 * src/server.js — HTTP + stdio entry point for MCPRouter.
 *
 *   HTTP:  POST /mcp, GET /health, GET /panel, GET /metrics
 *   Stdio: MCP JSON-RPC 2.0 over stdin/stdout (for Claude Desktop, Cursor, etc.)
 *
 *   Usage: node src/server.js [--config path] [--transport http|stdio|both] [--port N]
 */
import http from "node:http";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { loadConfig, validateConfig } from "./config.js";
import { providers, upsertProvider, keysFor, proxyRule, incMetrics, touchKey } from "./store.js";
import { dispatch, makeCall } from "./router.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_CONFIG = join(homedir(), ".mcprouter", "config.yaml");

const ARGS = (() => {
  const a = process.argv.slice(2);
  const out = { config: DEFAULT_CONFIG, transport: "both", port: 4000 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--config") out.config = a[++i];
    else if (a[i] === "--transport") out.transport = a[++i];
    else if (a[i] === "--port") out.port = Number(a[++i]);
    else if (a[i] === "--test") out.test = true;
  }
  return out;
})();

/** Minimal static file server for the panel. */
const PUBLIC_DIR = join(ROOT, "public");

function serveStatic(req, res, pathname) {
  let file = join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (pathname.includes("..")) { res.writeHead(403); return res.end("Forbidden"); }
  try {
    const body = readFileSync(file);
    const ext = file.slice(file.lastIndexOf("."));
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 5_000_000) req.destroy(); });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

export function startHttp(cfg, registry, store, port) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      try {
        if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { status: "ok", providers: registry.map((p) => p.id) });
        if (req.method === "GET" && url.pathname === "/metrics") {
          const minute = Math.floor(Date.now() / 1000);
          const list = cfg.providers || [];
          const data = {};
          for (const p of list) data[p.id] = { calls: 0, budgetConsumed: 0, errors: 0 };
          for (const r of store.metricsAll?.()) { if (data[r.providerId]) { data[r.providerId].calls = r.calls; data[r.providerId].budgetConsumed = r.budgetConsumed; data[r.providerId].errors = r.errors; } }
          return json(res, 200, data);
        }
        if (req.method === "POST" && url.pathname === "/mcp") {
          const body = await parseBody(req);
          let call;
          try { call = body.params || body; } catch { call = {}; }
          const result = await dispatch(call, registry, store);
          return json(res, 200, { jsonrpc: "2.0", id: call._id || "1", result });
        }
        if (url.pathname === "/panel") { return serveStatic(req, res, url.pathname); }
        return serveStatic(req, res, url.pathname);
      } catch (e) {
        const code = e.code === "BUDGET_EXCEEDED" ? 422 : e.code === "MISSING_KEY" || e.code === "INVALID_KEY" ? 401 : 500;
        json(res, code, { error: { code: e.code || "UNKNOWN", message: e.message } });
      }
    });
    const [listenHost, p] = (cfg.bind || "127.0.0.1:4000").split(":");
    const listenPort = p ? Number(p) : 4000;
    server.listen(listenPort, listenHost || "127.0.0.1", () => {
      console.log(`MCPRouter listening on http://${listenHost}:${listenPort}`);
      resolve(server);
    });
  });
}

/** Minimal MCP JSON-RPC 2.0 over stdio. */
function runStdio(cfg, registry, store) {
  let pending = {};

  const write = (obj) => {
    process.stdout.write(JSON.stringify(obj) + "\n");
  };

  const readLine = () => new Promise((resolve, reject) => {
    let buf = "";
    const onData = (c) => {
      buf += c;
      if (c === "\n") { process.stdout.removeListener("data", onData); process.stdin.removeListener("end", onEnd); resolve(buf.slice(0, -1)); }
    };
    const onEnd = () => { process.stdout.removeListener("data", onData); reject(new Error("stdin closed")); };
    process.stdout.on("data", onData);
    process.stdin.on("end", onEnd);
  });

  const respond = (id, obj) => { if (id != null) write({ jsonrpc: "2.0", id, ...obj }); else write(obj); };

  const handle = async (msg) => {
    const id = msg.id;
    if (msg.method === "notifications/initialized") return;
    try {
      const call = { adapter: msg.params?.adapter, provider: msg.params?.provider, tool: msg.params?.tool, args: msg.params?.args || {}, apiKeyHash: msg.params?.apiKeyHash };
      const result = await dispatch(call, registry, store);
      respond(id, { result });
    } catch (e) {
      respond(id, { error: { code: e.code || "UNKNOWN", message: e.message } });
    }
  };

  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", result: { protocolVersion: "2025-06-18", serverInfo: { name: "mcprouter", version: "0.1.0" } } }) + "\n");

  const onData = async (chunk) => {
    const line = chunk.toString();
    for (const raw of line.split("\n")) {
      const msg = raw.trim();
      if (!msg) continue;
      try { await handle(JSON.parse(msg)); } catch (e) { console.error("parse error:", e.message); }
    }
  };
  process.stdin.on("data", onData);
}

export async function main() {
  const cfg = loadConfig(ARGS.config);
  const errors = validateConfig(cfg);
  if (errors.length) { console.error("config errors:", errors.join("; ")); process.exit(1); }

  // build registry from config providers (adapter modules are loaded by name)
  const registry = await Promise.all((cfg.providers || []).map(async (p) => {
    let adapter = { id: p.adapter, label: p.id, enabled: false, tools: () => [] };
    try {
      const mod = await import(join(ROOT, "src", "adapters", p.adapter + ".js"));
      adapter = mod.adapter;
    } catch {
      /* placeholder adapter */
    }
    return { id: p.id, adapter, enabled: p.enabled };
  }));

  // ensure providers persisted in store
  for (const p of registry) upsertProvider(p);

  if (ARGS.transport === "stdio" || ARGS.transport === "both") runStdio(cfg, registry, { getProvider: (id) => providers().find((x) => x.id === id), keysFor, proxyRule, incMetrics, metrics: () => [], touchKey });
  if (ARGS.transport === "http" || ARGS.transport === "both") {
    await startHttp(cfg, registry, { getProvider: (id) => providers().find((x) => x.id === id), keysFor, proxyRule, incMetrics, metrics: () => [], touchKey }, ARGS.port);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href || !process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
