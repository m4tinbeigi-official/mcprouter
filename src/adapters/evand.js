/**
 * src/adapters/evand.js — Evand Events MCP adapter.
 *
 * Calls the public Evand API (https://api.evand.com) and exposes two tools:
 *   evand_search_events(query, city, category, online, page, per_page)
 *   evand_list_cities()
 *
 * Zero-key, public API. Budget/proxy/key are handled by the router core.
 */
import { fetch } from "node:undici"; // available in Node 18+ as global fetch in practice

const BASE = "https://api.evand.com";

async function get(path, params) {
  const q = new URLSearchParams();
  for (const k of ["query", "city", "category", "online", "page", "per_page"]) {
    if (params?.[k] !== undefined && params[k] !== "") q.append(k, String(params[k]));
  }
  const res = await fetch(BASE + path + (q.toString() ? "?" + q.toString() : ""), {
    headers: { Accept: "application/json", "User-Agent": "mcprouter/0.1" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Evand HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export const adapter = {
  id: "evand",
  label: "Evand Events",
  description: "Public events & tickets search (Evand public API).",

  tools() {
    return [
      {
        name: "evand_search_events",
        description: "Search/filter Evand events",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Free-text query" },
            city: { type: "string" },
            category: { type: "string" },
            online: { type: "boolean" },
            page: { type: "number" },
            per_page: { type: "number" },
          },
        },
      },
      {
        name: "evand_list_cities",
        description: "List cities with event counts",
        inputSchema: { type: "object", properties: {} },
      },
    ];
  },

  async call(toolName, args, ctx) {
    let payload;
    if (toolName === "evand_search_events") {
      payload = await get("/events", args);
    } else if (toolName === "evand_list_cities") {
      payload = await get("/cities", args);
    } else {
      throw new Error(`unknown tool "${toolName}"`);
    }
    // shallow-normalise to MCP content blocks
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      meta: { provider: "evand", cost: 1 },
    };
  },
};
