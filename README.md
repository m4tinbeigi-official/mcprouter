# MCPRouter

**Self-hosted MCP proxy & provider router.** A Node.js open-source server that gives you a
9Router-style management panel for connecting, bridging, and routing Model Context Protocol
(MCP) servers from many different sites and services.

Instead of standing up one MCP client per service, you install MCPRouter once. You add adapters
for different sites, configure API keys, assign budgets, enable/disable providers, and pick
proxies per provider — all from one panel.

```
Browser / Claude Desktop / 9Router / other MCP client
        │  stdio / SSE / HTTP transport
        ▼
   MCPRouter (Node.js, self-hosted)
        │
   ┌────┼────┬──────────────┬──────────────┬──────────────┐
   ▼    ▼    ▼              ▼              ▼              ▼
 Adapts  Providers   Proxy rules   API keys   Budgets    Panels
 (site)  (configured)
```

---

## Features

| Area | What it does |
|---|---|
| **Multi-site adapters** | Add adapters for different sites (a web platform, a database, a SaaS tool). Each adapter exposes one or more MCP tools. |
| **Provider management** | Enable / disable providers, set a display order, toggle **official vs non-official** flags, and attach a per-provider **budget**. |
| **Per-provider budget** | A limit (e.g. 100 credits / 500 requests / 50 USD) per provider or per project. The router rejects calls that would exceed it. |
| **API key storage** | Store API keys for the providers that require them, in a local encrypted store. Keys never leave your host. |
| **Proxy routing** | A dedicated proxy section: for each provider you tell the router which proxy to use (e.g. `http://127.0.0.1:10808`, `vmess`, `wireguard`, or `off`). |
| **Single panel** | One web UI (`/panel`) for all providers, keys, budgets, proxy rules, and adapter status — like 9Router but generic. |
| **English UI, Persian-ready code** | All UI strings are in a central locale file. Code is written to allow Persian text without changing structure. |
| **Open source** | MIT-licensed, npm-publishable, single binary or Node module. |

---

## Quick start

```bash
# 1. Install
npm install -g mcprouter

# 2. Create a config
mcprouter init

# 3. Edit the config
nano ~/.mcprouter/config.yaml

# 4. Start
mcprouter serve        # panel + router on the same port

# 5. Open the panel
open http://127.0.0.1:4000/panel
```

Minimal self-contained run (no install):

```bash
git clone https://github.com/mcprouter/mcprouter.git
cd mcprouter
npm install
cp .mcprouter.example.yaml .mcprouter.yaml
# edit .mcprouter.yaml: bind port, default proxy, provider list
npm start
```

---

## Project layout

```
mcprouter/
├── package.json
├── README.md
├── LICENSE
├── src/
│   ├── server.js        # HTTP + stdio entry point
│   ├── cli.js           # `mcprouter init / serve / status`
│   ├── config.js        # config load + validation
│   ├── router.js        # request routing, rate / budget enforcement
│   ├── store.js         # local encrypted key + budget store (SQLite)
│   ├── proxy.js         # proxy selector (provider -> proxy)
│   ├── adapters/        # per-site MCP adapters (plugins)
│   │   ├── base.js      # adapter interface
│   │   ├── evand.js     # Evand events MCP (example)
│   │   └── ...          # add your own .js files here
│   ├── panel/           # web UI (static + JSON API)
│   └── locale/          # English/RTL strings
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONFIGURATION.md
│   ├── PROVIDERS.md
│   ├── API.md
│   └── PRINCIPLES.md
└── scripts/
    ├── scaffold.mjs     # scaffold a new adapter in one command
    └── lint.mjs         # quick project sanity check
```

> Engines are fixed, but adapters are the extension point. Each adapter is a small self-contained
> module that speaks the MCPRouter adapter interface. Adding a new site MCP means writing one
> adapter file and enabling it in the panel — no core changes.

---

## Design principles

1. **English UI, Persian-ready code.** UI strings live in `src/locale/`. Code uses English
   identifiers, English error messages, and avoids tight coupling to any single language. Islamic
   / Persian licensing text is a config option, not a code comment.
2. **Adapter-first.** Everything that talks to a third-party service is an adapter. The router
   never contains provider-specific logic.
3. **Budget & proxy as first-class config.** Budget and proxy are per-provider, in the config and
   in the panel. The router enforces them before a call leaves the host.
4. **Official / non-official flag.** Each provider has an `official` boolean + a `budgetType` and
   `budgetLimit`. The panel renders it so the user can see at a glance which providers are official
   and which are personal/unofficial projects.
5. **API key gateway.** Providers that need authentication get an API key stored in the local store.
   The panel shows a masked key + a "regenerate" action. No keys in config files.
6. **Proxy rules are explicit.** A provider can declare a required proxy class (e.g. `socks5`,
   `http`, `vmess`, `none`). The panel sets the actual endpoint per host.
7. **StdIO + HTTP.** The router can speak MCP over stdio (for Claude Desktop / fixed clients) and
   over HTTP (for the panel and 9Router-style HTTP clients).

---

## License

MIT — see `LICENSE`. Commercial / Islamic / Persian licensing variants are supported via the
`license` key in config; the default is MIT.

---

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — component diagram, data flow, transport choices
- [CONFIGURATION.md](docs/CONFIGURATION.md) — full config reference (providers, budgets, proxy, locale)
- [PROVIDERS.md](docs/PROVIDERS.md) — provider catalog, official flags, proxy rules, budget types
- [API.md](docs/API.md) — JSON-RPC + REST API reference
- [PRINCIPLES.md](docs/PRINCIPLES.md) — design principles and Persian-readiness guidelines

---

## Where the regex comes from (motivation)

We are building a router for MCP proxies. This spec fixes the shape so the panel and the router
agree on: what a provider is, how it is configured, how it is proxied, how its key is stored, and
how its budget is enforced. It is written to be completely usable by two people (Ops + Dev) and by
one or many future adapters.
