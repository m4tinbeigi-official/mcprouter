# Provider Catalog

This document defines the provider inventory: provider shape, official flag, budget types, proxy
rules, and per-provider API-key requirements.

---

## 1. Provider shape (common schema)

Every provider shares these fields:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | machine id, e.g. `evand`, `github` |
| `name` | string | yes | display name |
| `adapter` | string | yes | loaded adapter module id |
| `enabled` | bool | yes | start on |
| `official` | bool | yes | `true` = official service; `false` = personal/unofficial |
| `budget` | object | no | budget config |
| `proxy` | object | no | default proxy override |
| `apiKey` | bool | no | requires stored API key |

---

## 2. Budget configuration

```
budget:
  type: requests | tokens | credits | amount
  limit: number        # e.g. 100, 500, 5000
  window: number       # seconds, default 3600
```

| type | unit | example |
|---|---|---|
| `requests` | tool calls | 100 calls/hour |
| `tokens` | estimated tokens | 500,000 tokens/day |
| `credits` | credits | 50 credits/h |
| `amount` | USD cents | 500 cents ($5.00)/day |

---

## 3. Proxy configuration

```
proxy:
  type: none | http | socks5 | vmess | wireguard
  endpoint: string   # required when type != none
```

| type | Notes |
|---|---|
| `none` | direct, no proxy |
| `http` | HTTP/S proxy (e.g. `http://127.0.0.1:10808`) |
| `socks5` | SOCKS5 (e.g. `socks5://127.0.0.1:10808`) |
| `vmess` | VMess config (endpoint to vmess config file or inline JSON) |
| `wireguard` | WireGuard interface name or endpoint |

**Resolution order** (each route the router uses):

1. `proxyRules[provider_id]` (explicit per-host)
2. `provider.proxy` default
3. `defaultProxy`
4. `none`

---

## 4. API key requirement

`apiKey: true` means the adapter requires a stored key. The panel shows a masked key + regeneration
button. The key is stored in the SQLite store, encrypted at rest, and only decrypted in memory for
the duration of the dispatch.

---

## 5. Example catalog

### Example A — public public API

```
id: evand
name: Evand Events
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
```

### Example B — personal provider with key

```
id: mycustom
name: My Custom Service
adapter: mycustom
enabled: false
official: false
apiKey: true
budget:
  type: requests
  limit: 50
  window: 3600
proxy:
  type: http
  endpoint: http://127.0.0.1:10808
```

### Example C — service that needs a proxy and no key

```
id: public-api
name: Public API Gateway
adapter: public-api
enabled: true
official: true
apiKey: false
budget:
  type: amount
  limit: 500    # cents
  window: 86400
proxy:
  type: socks5
  endpoint: socks5://127.0.0.1:10808
```

---

## 6. Adding providers in the panel

1. Dashboard → Providers → Add Provider.
2. Choose adapter (or create one).
3. Set `enabled`, `official` flag.
4. Set budget (type, limit, window).
5. Pick proxy type + endpoint.
6. If `apiKey` is on, enter the key once; it is stored encrypted.
7. Click **Save**. The router hot-reloads.

---

## 7. Official vs non-official (visual encoding)

In the panel, a provider with `official: false` is rendered with a distinct badge, colour, and
label so the user can immediately see which providers are official services and which are personal
or experimental. The router does not block non-official providers by default — the flag is
informational + the budget still applies.
