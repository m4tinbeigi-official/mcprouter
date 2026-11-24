/**
 * src/config.js — load + validate MCPRouter config (YAML, zero-dep subset parser).
 *
 * Supports the subset we need: nested maps, arrays of maps, arrays of scalars,
 * quoted strings, booleans, numbers, empty values, comments. Full JSON is also
 * valid YAML.
 *
 * Usage:
 *   import { loadConfig, validateConfig } from "./config.js";
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_BIND = "127.0.0.1:4000";
export const DEFAULT_TRANSPORT = "both";
export const DEFAULT_LOCALE = "en";
export const DEFAULT_PANEL_AUTH = "token";

/** Minimal YAML-subset parser (recursive descent, zero deps). */
export function parseYaml(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^\s*(---|^\#)/.test(l));

  let idx = 0;

  const peekScalar = (v) => {
    if (v === "" || v === "null" || v === "~") return undefined;
    if (v === "true") return true;
    if (v === "false") return false;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    if (!Number.isNaN(Number(v)) && !v.includes(".")) return Number(v);
    return v;
  };

  function parseYamlMap(minIndent) {
    const obj = {};
    while (idx < lines.length) {
      const line = lines[idx];
      const indent = line.search(/\S/);
      if (indent < minIndent) break;
      if (indent > minIndent) { idx++; continue; }
      const rest = line.slice(indent);
      if (rest.startsWith("- ")) break;
      const colon = rest.indexOf(":");
      if (colon === -1) { idx++; continue; }
      const key = rest.slice(0, colon).trim();
      const val = rest.slice(colon + 1).trim();
      idx++;
      if (val === "" && nextAt(indent + 2)) {
        const nxt = lines[idx];
        if (nxt && nxt.startsWith("- ")) {
          const [child] = parseBlock(indent + 2);
          obj[key] = child;
        } else {
          const [child] = parseYamlMap(indent + 2);
          obj[key] = child;
        }
      } else {
        obj[key] = peekScalar(val);
      }
    }
    return obj;
  }

  function parseBlock(minIndent) {
    const list = [];
    while (idx < lines.length) {
      const line = lines[idx];
      const indent = line.search(/\S/);
      if (indent < minIndent) break;
      if (indent > minIndent) { idx++; continue; }
      if (!line.startsWith("- ")) break;
      idx++;
      const item = line.slice(indent + 2).trim();
      if (!item) {
        const [sub] = parseBlock(indent + 2);
        list.push(sub);
      } else if (item.includes(":")) {
        const colon = item.indexOf(":");
        const k = item.slice(0, colon).trim();
        const v = item.slice(colon + 1).trim();
        const obj = {};
        if (v === "" && nextAt(indent + 2)) {
          const [child] = parseYamlMap(indent + 2);
          obj[k] = child;
        } else {
          obj[k] = peekScalar(v);
        }
        const [extra] = parseYamlMap(indent + 2);
        Object.assign(obj, extra);
        list.push(obj);
      } else {
        list.push(peekScalar(item));
      }
    }
    return [list, idx];
  }

  const nextAt = (minIndent) => {
    if (idx >= lines.length) return false;
    return lines[idx].search(/\S/) >= minIndent;
  };

  return parseYamlMap(0);
}

/** Load a config file (path or name). JSON also accepted. */
export function loadConfig(filePath) {
  const text = readFileSync(filePath, "utf8");
  try {
    const parsed = parseYaml(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return JSON.parse(text);
  }
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg.bind) errors.push("missing bind");
  if (!cfg.providers || !Array.isArray(cfg.providers)) errors.push("missing providers array");
  if (cfg.providers.some((p) => !p.id)) errors.push("every provider needs an id");
  if (cfg.providers.some((p) => !p.adapter)) errors.push("every provider needs an adapter");
  if (cfg.providers.some((p) => p.budget && !["requests", "tokens", "credits", "amount"].includes(p.budget.type))) {
    errors.push("unknown budget type");
  }
  return errors;
}
