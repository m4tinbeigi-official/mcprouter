# MCPRouter Roadmap

Phases to go from spec to shipped. Each phase is verifiable before the next starts.

---

## Phase 0 — Scaffold (done)

- `package.json` (npm package).
- `src/server.js`, `src/cli.js`, `src/config.js`, `src/store.js`, `src/router.js`.
- Directory structure: `src/adapters/`, `src/panel/`, `src/locale/`, `docs/`, `scripts/`.

---

## Phase 1 — Core routing (MVP)

- HTTP transport with `POST /mcp`.
- Stdio transport bridge.
- Config load + validation (`config.js`).
- SQLite store (`store.js`): providers, keys (encrypted), proxy rules, metrics.
- Router core (`router.js`): resolve adapter, proxy, key, budget; dispatch; record metrics.

**Acceptance:** a minimal `evand` adapter can be called over `POST /mcp` and over stdio; budget
rejects at the limit; proxy `none` works.

---

## Phase 2 — Panel (UI)

- Static panel under `/panel`.
- Provider list + add/edit (name, enabled, official, budget, proxy).
- Keys page (masked key, save, regenerate).
- Proxy page (type + endpoint per provider).
- Locale wire-up (`en` first; `fa` structure in place).

**Acceptance:** a user can add a provider, set a budget and proxy, and save an API key through the
panel with zero core changes.

---

## Phase 3 — Adapter ecosystem

- Generic adapter template + `scaffold.mjs` script.
- `evand` adapter shipped as an example.
- Docs for writing adapters (interface + test).

**Acceptance:** a second adapter (e.g. `remotemcp` or a test double) can be added without editing
core.

---

## Phase 4 — Polish

- Metrics page in the panel.
- Better error mapping (BUDGET_EXCEEDED, MISSING_KEY, RATE_LIMITED, PROXY_UNAVAILABLE).
- README + LICENSE + CI (npm pack + smoke test).
- Release to npm.

---

## Future (out of scope for 0.1.0)

- WebSocket streams.
- Plugin hub / marketplace for adapters.
- Multi-tenancy.
- Webhook budget alerts.
- 9Router-style "combo" grouping of providers.

---

## Verification method

Each phase has a runnable check:

```bash
node scripts/lint.mjs      # sanity check project
node src/cli.js init       # config scaffold
node src/server.js --test  # smoke: health + one example adapter call
```

CI runs the same on every commit; no manual steps required.
