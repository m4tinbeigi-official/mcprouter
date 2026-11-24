# MCPRouter Architecture

This document fixes the component design, data flow, and transport choices for MCPRouter.

---

## 1. Component map

```
                       ┌──────────────────────────────┐
                       │  Client / UI                 │
                       │  claude_desktop, 9Router,    │
                       │  panel, curl, custom MCP     │
                       └──────────────┬───────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │ stdio                       │ HTTP                        │
        ▼                             ▼                             ▼
   ┌──────────┐                ┌──────────────┐              ┌──────────────┐
   │ Claude   │                │ Panel (UI)   │              │ 9Router /    │
   │ Desktop  │                │              │              │ other MCP    │
   └──────────┘                └──────────────┘              └──────────────┘
                                      │
                                      ▼
                          ┌──────────────────────────┐
                          │  MCPRouter core          │
                          │  server.js               │
                          │  - HTTP REST + SSE       │
                          │  - stdio MCP bridge      │
                          │  - adapter registry      │
                          │  - budget & proxy gate   │
                          └────────────┬─────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
   ┌──────────────┐             ┌──────────────┐              ┌──────────────┐
   │ Config       │             │ Store        │              │ Adapters     │
   │ (YAML/TOML)  │◄────────────│ (SQLite)     │              │ (plugins)    │
   │              │   HTTP/     │  keys, budgets,│              │  evand,      │
   │  proxy rules │   stdio     │  proxy pick  │              │  your sites  │
   └──────────────┘             └──────────────┘              └──────────────┘
                                   │  HTTP
                                   ▼
                            ┌────────────────┐
                            │  Third-party   │
                            │  MCP servers   │
                            │  api.site.com │
                            │  ws.site.com   │
                            └────────────────┘
```

---

## 2. Layered architecture

### Layer 0 — Transport
The router exposes two surfaces:

| Surface | Use case |
|---|---|
| **HTTP** (`/mcp` endpoint) | Panel, 9Router-style clients, custom MCP HTTP clients |
| **Stdio** | Claude Desktop, Cursor, and any MCP client that speaks stdio to a local binary |

A call arrives on any surface. The router normalises it to an internal `Call` object and passes it
to the router core.

### Layer 1 — Router core
The core owns the routing decision:

1. **Identify adapter** from the call (adapter name, provider id, or path).
2. **Resolve proxy** for the adapter/provider.
3. **Resolve API key** from the store (if required).
4. **Enforce budget** (request count / credit / custom check).
5. **Dispatch** the call downstream.
6. **Record** metrics (counts, budget remaining, latency) to the store.

### Layer 2 — Config
YAML (default) or JSON. Loaded at startup and on `SIGHUP`. Changes to provider enable/disable,
budget, proxy, and key are hot-reloadable. The panel writes this file (or its own DB that
synchronises to it).

### Layer 3 — Store
SQLite. Tables:

| Table | Purpose |
|---|---|
| `providers` | id, display_name, adapter, enabled, official, budget_type, budget_limit, proxy_preference |
| `keys` | provider_id, masked_key, full_key (encrypted at rest), created_at, last_used |
| `proxy_rules` | provider_id, proxy_type, proxy_endpoint |
| `metrics` | provider_id, minute, calls, budget_consumed, errors |

### Layer 4 — Adapters
Per-site plugins. Each adapter implements:

```js
interface Adapter {
  name;                 // unique id, e.g. "evand"
  label;                // human label, loaded from locale
  description;          // one line
  tools();              // returns list of tool specs
  call(toolName, args, ctx); // returns response
}
```

The adapter makes its own HTTP calls to the third-party service. The router does not know about
Evand, Twitter, GitHub, etc. — only about adapters.

### Layer 5 — Panels / plugins
The web panel reads config + store, lets the user edit providers, keys, budgets, and proxies, and
sends dispatch calls to the router.

---

## 3. Data flow (request → response)

```
Client                                    Router core                                    Adapter / third-party
   │                                                │                                          │
   │  → POST /mcp {adapter, tool, args, key_hash}   │                                          │
   │───────────────────────────────────────────────▶│                                          │
   │                                                │  load provider record                  │
   │                                                │  look up proxy rule                    │
   │                                                │  resolve API key (mask/compare)        │
   │                                                │  budget.check(adapter, tool, args)     │
   │                                                │  if fail → {error: BUDGET_EXCEEDED}  │
   │                                                ▼                                          │
   │                                                │  call(tool, args, {key, proxy, ctx})  │
   │                                                │  → HTTP to api.site.com                │
   │                                                │  read response                         │
   │                                                │  record metrics                        │
   │                                                ▼                                          │
   │                                                │  return payload                      │
   │                                                │                                          │
   │                                                ◀─────────────────────────────────────────│
   │                                                │                                          │
   │  ← MCP JSON-RPC success / error               │                                          │
   └────────────────────────────────────────────────┴──────────────────────────────────────────┘
```

### Budget examples

| budgetType | Meaning | Check |
|---|---|---|
| `requests` | number of tool calls | decrement counter, reject when `<= 0` |
| `tokens` | estimated token spend | estimate from args + known tool cost, reject when `<= 0` |
| `credits` | arbitrary credit units | per-adaptor pricing callback |
| `amount` | USD cents | fixed per call from adapter metadata |

### Proxy resolution order

1. `proxy_rules[provider_id]` (explicit per-host)
2. provider default `proxyPreference` (e.g. `socks5`, `http`, `none`)
3. global default proxy
4. `none` (direct)

---

## 4. Transport choices

### HTTP transport (`/mcp`)

```
POST /mcp HTTP/1.1
Host: 127.0.0.1:4000
Content-Type: application/json

{ "jsonrpc": "2.0", "id": "1", "method": "tools/call",
  "params": { "adapter": "evand", "name": "evand_search_events", "arguments": {...} } }
```

Response:

```
{ "jsonrpc": "2.0", "id": "1",
  "result": { "content": [{ "type": "text", "text": "..." }] } }
```

### Stdio transport

The router process is launched with `stdio: true` by Claude Desktop/Cursor. It reads MCP JSON-RPC
over stdin, routes internally, and writes responses to stdout. The router maintains an internal
in-memory map of active calls so that stdio and HTTP calls for the same adapter can share state if
needed (e.g. long-running streams).

---

## 5. Panel pages (9Router-style)

| Page | What it manages |
|---|---|
| Dashboard | Top stats: providers count, enabled/disabled, total budget, recent errors |
| Providers | List + add/edit provider: name, adapter, enabled, official flag, budget type/limit |
| Keys | Add/store/rotate API keys per provider (masked view + regenerate) |
| Proxy | Per-provider proxy selector: type (none/http/socks5/vmess/wg) + endpoint |
| Adapters | Installed adapters list, enable/disable, add new adapter file drop-in |
| Logs | Recent dispatch metrics, errors, budget warnings |
| Settings | Locale, default proxy, auth/captcha, open-source licence notice |

---

## 6. Security posture

- **Zero trust between adapters and store**: keys are encrypted at rest with a key derived from
  the local config passphrase. Full key is only decrypted in memory for the duration of a dispatch.
- **Budget enforced server-side**, not in the client.
- **No raw keys in logs** or metrics tables.
- **Auth** on the panel: session token or API token; optional Basic auth.
- **CORS** disabled by default; explicit whitelist for the panel origin.
- **Rate limit** global limit + per-provider burst.

---

## 7. Extension: adding a new site

1. Write `src/adapters/mysite.js` implementing the adapter interface.
2. Register it in the config `adapters` list.
3. Add keys/proxy/budget entries via the panel.
4. (Future) npm publish the adapter as `mcprouter-adapter-mysite`.

No core code changes are required. The router discovers adapters from the config + the
`src/adapters/` directory at startup.
