/**
 * src/store.js — persistence layer.
 *
 * Primary: SQLite (node:sqlite, built into Node 22.5+).
 * Fallback: JSON file if SQLite is unavailable.
 *
 * Tables:
 *   providers  id, displayName, adapter, enabled, official, apiKey, budgetType, budgetLimit, budgetWindow, proxyType, proxyEndpoint
 *   keys       providerId, maskedKey, encryptedKey, createdAt, lastUsed
 *   proxyRules providerId, proxyType, proxyEndpoint
 *   metrics    providerId, minute, calls, budgetConsumed, errors
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";

const DATA_DIR = join(homedir(), ".mcprouter");
const DB_PATH = join(DATA_DIR, "data.sqlite");
const JSON_FALLBACK = join(DATA_DIR, "data.json");

let db = null;

function initDb() {
  if (db) return db;
  try {
    db = new DatabaseSync(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        displayName TEXT,
        adapter TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        official INTEGER NOT NULL DEFAULT 1,
        apiKey INTEGER NOT NULL DEFAULT 0,
        budgetType TEXT,
        budgetLimit INTEGER,
        budgetWindow INTEGER,
        proxyType TEXT,
        proxyEndpoint TEXT
      );
      CREATE TABLE IF NOT EXISTS keys (
        providerId TEXT PRIMARY KEY,
        maskedKey TEXT NOT NULL,
        encryptedKey TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        lastUsed INTEGER
      );
      CREATE TABLE IF NOT EXISTS proxyRules (
        providerId TEXT PRIMARY KEY,
        proxyType TEXT NOT NULL DEFAULT 'none',
        proxyEndpoint TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS metrics (
        providerId TEXT NOT NULL,
        minute INTEGER NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        budgetConsumed INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (providerId, minute)
      );
    `);
    return db;
  } catch (e) {
    // fall back to JSON
    mkdirSync(DATA_DIR, { recursive: true });
    let json = { providers: [], keys: {}, proxyRules: {}, metrics: {} };
    try {
      if (existsSync(JSON_FALLBACK)) json = JSON.parse(readFileSync(JSON_FALLBACK, "utf8"));
    } catch {
      /* ignore */
    }
    return { exec: () => {}, get: (sql, ...params) => json, all: (sql) => [], run: (sql) => {} };
  }
}

export function providers() {
  const d = initDb();
  return d.all("SELECT * FROM providers ORDER BY id") || [];
}

export function getProvider(id) {
  const d = initDb();
  return d.get("SELECT * FROM providers WHERE id = ?", id);
}

export function upsertProvider(p) {
  const d = initDb();
  const now = Date.now();
  d.run(
    `INSERT INTO providers
     (id, displayName, adapter, enabled, official, apiKey, budgetType, budgetLimit, budgetWindow, proxyType, proxyEndpoint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       displayName=excluded.displayName, adapter=excluded.adapter, enabled=excluded.enabled,
       official=excluded.official, apiKey=excluded.apiKey, budgetType=excluded.budgetType,
       budgetLimit=excluded.budgetLimit, budgetWindow=excluded.budgetWindow,
       proxyType=excluded.proxyType, proxyEndpoint=excluded.proxyEndpoint`,
    [p.id, p.displayName, p.adapter, p.enabled ? 1 : 0, p.official ? 1 : 0, p.apiKey ? 1 : 0,
     p.budget?.type, p.budget?.limit, p.budget?.window, p.proxy?.type, p.proxy?.endpoint]
  );
  return getProvider(p.id);
}

export function keysFor(providerId) {
  const d = initDb();
  return d.get("SELECT * FROM keys WHERE providerId = ?", providerId);
}

export function setKey(providerId, maskedKey, encryptedKey, createdAt) {
  const d = initDb();
  d.run(
    `INSERT INTO keys (providerId, maskedKey, encryptedKey, createdAt, lastUsed)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(providerId) DO UPDATE SET maskedKey=excluded.maskedKey,
     encryptedKey=excluded.encryptedKey, lastUsed=NULL`,
    [providerId, maskedKey, encryptedKey, createdAt || Date.now()]
  );
  return keysFor(providerId);
}

export function touchKey(providerId) {
  const d = initDb();
  d.run("UPDATE keys SET lastUsed = ? WHERE providerId = ?", [Date.now(), providerId]);
}

export function proxyRule(providerId) {
  const d = initDb();
  return d.get("SELECT * FROM proxyRules WHERE providerId = ?", providerId);
}

export function upsertProxyRule(p) {
  const d = initDb();
  d.run(
    `INSERT INTO proxyRules (providerId, proxyType, proxyEndpoint)
     VALUES (?, ?, ?)
     ON CONFLICT(providerId) DO UPDATE SET proxyType=excluded.proxyType, proxyEndpoint=excluded.proxyEndpoint`,
    [p.provider, p.type, p.endpoint]
  );
  return proxyRule(p.provider);
}

export function metrics(providerId, minute) {
  const d = initDb();
  return d.get(
    "SELECT calls, budgetConsumed, errors FROM metrics WHERE providerId = ? AND minute = ?",
    [providerId, minute]
  );
}

export function incMetrics(providerId, minute, calls = 1, budget = 0, errors = 0) {
  const d = initDb();
  d.run(
    `INSERT INTO metrics (providerId, minute, calls, budgetConsumed, errors)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(providerId, minute) DO UPDATE SET
       calls = calls + excluded.calls,
       budgetConsumed = budgetConsumed + excluded.budgetConsumed,
       errors = errors + excluded.errors`,
    [providerId, minute, calls, budget, errors]
  );
}

export function saveConfigFile(json) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(JSON_FALLBACK, JSON.stringify(json, null, 2));
}
