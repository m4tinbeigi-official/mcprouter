#!/usr/bin/env node
/**
 * scripts/scaffold.mjs — generate a new adapter for MCPRouter in one command.
 *
 * Usage:
 *   node scripts/scaffold.mjs --id=myadapter --name="My Adapter" --desc="desc"
 *
 * Creates src/adapters/myadapter.js (or --dir) and prints the config snippet to paste
 * into config.yaml. Does NOT modify config.yaml for you.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..");

function arg(name, required = false) {
  const v = process.argv.includes(`--${name}=`);
  const idx = process.argv.findIndex((a) => a === `--${name}=`);
  const raw = v ? process.argv[idx].split("=")[1] : undefined;
  if (required && (!raw || raw.startsWith("--"))) {
    console.error(`Missing required value for --${name}`);
    process.exit(1);
  }
  return raw || (idx >= 0 ? process.argv[idx + 1] : undefined);
}

const id = arg("id", true);
const name = arg("name", true);
const desc = arg("desc", true);

const file = arg("dir", false) || join(ROOT, "src", "adapters", `${id}.js`);
const dir = file.endsWith(".js") ? file.slice(0, -len(file, ".js")) : file;
const len = (s, suffix) => s.length - suffix.length;

mkdirSync(dir, { recursive: true });

const template = `// MCPRouter adapter: ${name}
//
// ${desc}
// Add this file to src/adapters/ and list its id in config.yaml. No core changes needed.

export const adapter = {
  id: "${id}",
  label: "${name}",
  description: "${desc}",

  tools() {
    // return [{ name: "...", description: "...", inputSchema: { type: "object", properties: {} } }];
    return [];
  },

  async call(toolName, args, ctx) {
    // ctx = { key, proxy, timeout, metrics }
    // Return: { content: [{ type: "text", text: "..." }], meta: { provider, cost: 0 } }
    throw new Error(`adapter "${id}" has no call() implemented for tool "${toolName}"`);
  },
};
