# MCPRouter API Reference

---

## 1. Transport overview

| Transport | Endpoint | Use |
|---|---|---|
| HTTP | `POST /mcp` | Panel + 9Router-style clients |
| HTTP | `GET /health` | Liveness check |
| HTTP | `GET /panel` | Web UI |
| Stdio | stdin/stdout | Claude Desktop, Cursor, local MCP clients |

HTTP and stdio share the same internal routing. Stdio speaks MCP JSON-RPC 2.0; HTTP wraps the
same messages under `/mcp`.

---

## 2. Routing envelope

All calls carry the same shape so the router can dispatch identically:

```json
{
  "adapter": "evand",
  "provider": "evand",
  "tool": "evand_search_events",
  "args": {},
  "apiKeyHash": "sha256:..."   // optional, prefilled from store
}
```

The router core normalises this into an internal `Call`.

---

## 3. HTTP endpoints

### `POST /mcp`

Dispatch a tool call to an adapter.

**Request**

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "tools/call",
  "params": {
    "adapter": "evand",
    "provider": "evand",
    "name": "evand_search_events",
    "arguments": { "query": "conferences" }
  }
}
```

**Responses**

- `200` MCP success:

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "result": {
    "content": [{ "type": "text", "text": "..." }],
    "meta": { "provider": "evand", "cost": 12 }
  }
}
```

- `422` BUDGET_EXCEEDED:

```json
{ "error": { "code": "BUDGET_EXCEEDED", "message": "provider evand budget exhausted" } }
```

- `401` MISSING_KEY / INVALID_KEY for providers needing a key.

### `GET /health`

```json
{ "status": "ok", "providers": { "evand": "enabled" } }
```

### `GET /panel`

Serves the panel static files. Requires panel auth.

---

## 4. Stdio envelope

The router reads JSON-RPC 2.0 over stdin. The adapter name is passed inside `params` as above.
Responses go to stdout. Notifications (`notifications/initialized`) are consumed by the router
without error.

---

## 5. Metrics

`GET /metrics` (or via panel) returns recent dispatch stats:

```json
{
  "evand": {
    "calls": 1234,
    "budgetConsumed": 77,
    "errors": 3,
    "lastError": "RATE_LIMITED"
  }
}
```

Metrics are stored per-minute in SQLite under `metrics`.

---

## 6. WebSocket (future)

Long-lived streams (chat with tools) will use WebSocket upgrade at `/mcp/ws`. Out of scope for
0.1.0.
