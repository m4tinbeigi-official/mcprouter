# MCPRouter Configuration Reference

Config file: `~/.mcprouter/config.yaml` (default) or path from `--config`.

---

## 1. Top-level keys

| Key | Type | Default | Purpose |
|---|---|---|---|
| `bind` | string | `127.0.0.1:4000` | HTTP listen address |
| `transport` | `http` \| `stdio` \| `both` | `both` | Enable stdio bridge |
| `defaultProxy` | string | `none` | Fallback proxy type |
| `locale` | string | `en` | UI locale (`en`, `fa`, `auto`) |
| `panelAuth` | `none` \| `token` \| `basic` | `token` | Panel access control |
| `passphrase` | string | (from env `MCPROUTER_PASSPHRASE`) | Key-encryption passphrase |
| `providers` | array | `[]` | Provider definitions (see below) |
| `adapters` | array | auto-discovered | Which adapters are loaded |
| `license` | object | (see below) | Open-source / commercial licence notice |

---

## 2. Provider definition

Each provider is one entry in `providers`:

```yaml
providers:
  - id: evand
    displayName: "Evand Events"
    description: "Public events & ticket search (public API)."
    adapter: evand
    enabled: true
    official: true            # true = official service, false = personal/unofficial
    budget:
      type: requests
      limit: 100              # credits / requests / tokens per reset window
      window: 3600            # reset window in seconds
    proxy:
      type: none              # none | http | socks5 | vmess | wireguard
      endpoint: ""            # endpoint set per-host in panel / proxy_rules
    apiKey: false             # does this provider require a stored API key?
```

| Field | Meaning |
|---|---|
| `id` | unique machine id, used in routing |
| `displayName` | shown in panel; loaded from locale if empty |
| `adapter` | which adapter module this provider uses |
| `enabled` | enable/disable |
| `official` | true = official service, false = personal/unofficial |
| `budget.type` | `requests`, `tokens`, `credits`, `amount` |
| `budget.limit` | numeric limit |
| `budget.window` | seconds before reset |
| `proxy.type` | fallback proxy class |
| `proxy.endpoint` | endpoint (set per-host in panel) |
| `apiKey` | whether the adapter needs a stored API key |

---

## 3. Adapter list

```yaml
adapters:
  - evand
  - mycustom
```

Unlisted adapters from `src/adapters/*.js` are ignored. Add new adapters by dropping a `.js` file
and listing its id here.

---

## 4. Keys store

```yaml
keys:
  passphraseEnv: MCPROUTER_PASSPHRASE
  encrypt: aes-256-gcm
```

Full API keys are encrypted in the SQLite store. The passphrase can be provided by an environment
variable (preferred) or from a file. The panel asks the user for it at first run.

---

## 5. Proxy rules (per-provider overrides)

```yaml
proxyRules:
  - provider: evand
    type: http
    endpoint: http://127.0.0.1:10808
```

`proxyRules` overrides `provider.proxy` per provider. Setting `type: none` means direct connection
(no proxy). In the panel, the user picks the type and enters the endpoint; the panel writes
`proxyRules`.

---

## 6. Locale

```yaml
locale: en
```

Future state: `fa` will wire the central locale file (in `src/locale/`) so Persian shows up
without code changes. Minimal code is written so that switching the locale string later is a
one-file change in the locale loader.

---

## 7. License / commercial notice

```yaml
license:
  type: mit
  notice: "Open-source. See LICENSE."
```

The panel can show a licence banner from this config. Commercial/licensing variants are a config
option so code stays language-free.

---

## 8. Environment variables

| Variable | Purpose |
|---|---|
| `MCPROUTER_PASSPHRASE` | key-encryption passphrase |
| `MCPROUTER_CONFIG` | alternate config path |
| `MCPROUTER_BIND` | `bind` shorthand |
