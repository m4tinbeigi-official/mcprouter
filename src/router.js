/**
 * src/router.js — routing core.
 *
 * Given a dispatch call, an adapter registry, and a store, resolve:
 *   1. adapter + enabled
 *   2. proxy (explicit rule > provider.default > global default > none)
 *   3. API key (if required)
 *   4. budget (reject if exhausted)
 *   5. metrics
 * and dispatch to the adapter, returning the payload.
 */
import crypto from "node:crypto";

const BUDGET_FORBIDDEN = Symbol("budget-forbidden");
const WRAP = (fn) => (...a) => { try { return fn(...a); } catch (e) { throw { code: "ADAPTER_ERROR", message: e.message }; } };
const NO_KEY = Symbol("no-key");

export const PROXY_TYPES = ["none", "http", "socks5", "vmess", "wireguard"];

/** Shallow-merge: overrides win over defaults. */
export function merge(o, ...sources) {
  for (const s of sources) for (const k of Object.keys(s)) o[k] = s[k];
  return o;
}

export function resolveProxy(cfg, provider, call) {
  if (call.proxy && call.proxy.type) return { type: call.proxy.type, endpoint: call.proxy.endpoint };
  if (cfg.proxyRules?.[call.provider]) return cfg.proxyRules[call.provider];
  const p = provider || cfg.providers?.find((x) => x.id === call.provider);
  if (p && p.proxy?.type) return { type: p.proxy.type, endpoint: p.proxy.endpoint };
  if (cfg.defaultProxy) return { type: cfg.defaultProxy, endpoint: "" };
  return { type: "none", endpoint: "" };
}

export function requiresKey(provider) {
  return Boolean(provider && provider.apiKey);
}

export function resolveKey(store, providerId, call) {
  if (!requiresKey(store.getProvider(providerId))) return null;
  const k = store.keysFor(providerId);
  if (!k) throw { code: "MISSING_KEY", message: `provider "${providerId}" requires an API key` };
  if (call.apiKeyHash && k.encryptedKey !== call.apiKeyHash) {
    throw { code: "INVALID_KEY", message: "provided API key does not match stored key" };
  }
  store.touchKey(providerId);
  return { masked: k.maskedKey, full: k.encryptedKey };
}

export function checkBudget(store, providerId, cost) {
  const p = store.getProvider(providerId);
  if (!p || !p.enabled) throw { code: "DISABLED", message: `provider "${providerId}" is disabled` };
  if (!p.budget) return true;
  const minute = Math.floor(Date.now() / 1000);
  const m = store.metrics(providerId, minute);
  const used = m ? m.budgetConsumed : 0;
  const remaining = (p.budget.limit || Infinity) - used - cost;
  if (remaining <= 0) throw { code: "BUDGET_EXCEEDED", message: `provider "${providerId}" budget exhausted` };
  store.incMetrics(providerId, minute, calls = 1, budget = cost);
  return true;
}

export function dispatch(call, adapters, store) {
  const { adapter: adapterId, provider, tool, args = {}, apiKeyHash } = call;

  const providerDef = adapters.find((a) => a.id === provider || a.id === adapterId);
  if (!providerDef) throw { code: "UNKNOWN_ADAPTER", message: `adapter "${adapterId}" not found` };
  if (providerDef.enabled === false) throw { code: "DISABLED", message: `adapter "${adapterId}" disabled` };

  const proxy = resolveProxy(call, null, call);
  const key = resolveKey(store, providerDef.id, { ...call, proxy });
  checkBudget(store, providerDef.id, 0);

  const adapter = providerDef.adapter;
  const toolDef = adapter?.tools?.find((t) => t.name === tool);
  if (!toolDef) throw { code: "UNKNOWN_TOOL", message: `tool "${tool}" not found on adapter "${adapterId}"` };

  store.incMetrics(providerDef.id, Math.floor(Date.now() / 1000), calls = 1, budget = 0, errors = 0);

  const result = providerDef.adapter.call(tool, args, {
    key, proxy,
    timeout: call.timeout || 30000,
    metrics: {
      record: (c, b, e) => store.incMetrics(providerDef.id, Math.floor(Date.now() / 1000), c, b, e)
    }
  });

  return { content: result.content || [], meta: { provider: providerDef.id, cost: 0, ...result.meta } };
}

export function makeCall(adapter, provider, tool, args, opts = {}) {
  return { adapter, provider, tool, args, apiKeyHash: opts.apiKeyHash, proxy: opts.proxy, timeout: opts.timeout };
}
