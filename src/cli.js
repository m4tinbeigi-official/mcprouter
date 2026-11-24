#!/usr/bin/env node
/**
 * src/cli.js — CLI for MCPRouter: init | serve | status
 *
 * Usage:
 *   mcprouter init          create ~/.mcprouter/config.yaml + data dir
 *   mcprouter serve         start the server (default: http + stdio)
 *   mcprouter status        print current provider/config summary
 */
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, validateConfig, DEFAULT_BIND, DEFAULT_TRANSPORT, DEFAULT_LOCALE, DEFAULT_PANEL_AUTH } from "./config.js";
import { providers, upsertProvider } from "./store.js";
import { main as serve } from "./server.js";

const HOME = join(homedir(), ".mcprouter");
const CONFIG = join(HOME, "config.yaml");

export function cmdInit() {
  mkdirSync(HOME, { recursive: true });
  if (existsSync(CONFIG)) { console.log(CONFIG, "already exists — leave unchanged"); return; }
  writeFileSync(CONFIG, INIT_YAML, "utf8");
  console.log("initialized:", CONFIG);
  console.log("edit it (providers, keys, proxy), then run `mcprouter serve`");
}

export function cmdStatus(configPath) {
  const cfg = loadConfig(configPath);
  const errs = validateConfig(cfg);
  console.log("config:", configPath);
  console.log("bind:", cfg.bind, "| transport:", cfg.transport, "| locale:", cfg.locale, "| auth:", cfg.panelAuth);
  if (errs.length) console.warn("VALIDATION WARNINGS:", errs.join("; "));
  console.log("providers:");
  for (const p of cfg.providers || []) {
    console.log(`  - ${p.id} | ${p.adapter} | enabled=${p.enabled} | official=${p.official} | apiKey=${p.apiKey} | budget=${p.budget?.type}:${p.budget?.limit}`);
  }
}

export function autoRun() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "init") cmdInit();
  else if (cmd === "serve") { serve().catch((e) => { console.error(e); process.exit(1); }); }
  else if (cmd === "status") cmdStatus(rest[0] || CONFIG);
  else { console.log("commands: init | serve [options] | status [config]"); }
}

const INIT_YAML = `# MCPRouter configuration — do not commit secrets.
# Keys are encrypted at rest in ~/.mcprouter/data.sqlite.

bind: ${DEFAULT_BIND}
transport: ${DEFAULT_TRANSPORT}
locale: ${DEFAULT_LOCALE}
panelAuth: ${DEFAULT_PANEL_AUTH}

# Global proxy fallback (per-provider overrides possible)
defaultProxy: none

# Adapters to load (drop .js in src/adapters/ and list the id here)
adapters:
  - evand

# Providers
providers:
  - id: evand
    displayName: "Evand Events"
    adapter: evand
    enabled: true
    official: true
    apiKey: false
    budget:
      type: requests
      limit: 100
      window: 3600
    proxy:
      type: none
`;
