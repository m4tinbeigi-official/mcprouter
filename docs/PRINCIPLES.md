# MCPRouter Design Principles

This document describes the design ethos of MCPRouter so future contributors and AI coding
assistants keep the project consistent and Persian-friendly.

---

## 1. English UI, Persian-ready code

- **UI strings** live in `src/locale/`. All user-visible messages are data, not code.
- **Code identifiers** are English and always ASCII. Never embed Persian inside variable/function
  names.
- **Error messages** are loaded from the locale file, not hard-coded.
- **Formatting** (numbers, currency `تومان`, dates) is delegated to a locale-aware formatter so
  Persian users get `۰٬۰۰۰` and `تومان` suffix automatically later.
- The locale file structure is designed so that `fa` translations can be added without changing
  any structural code.

---

## 2. Adapter-first

The router never contains third-party business logic. Anything that calls a site's API is an
**adapter**:

- Each adapter is a standalone module.
- Adapters know how to format requests and parse responses for their site.
- The router only orchestrates: routing, budget, proxy, key resolution.

This keeps the router readable and the adapters independently testable.

---

## 3. Budget & proxy are first-class config

- Budget is per-provider, per-window. It is enforced server-side.
- Proxy is explicit per-provider, with a fallback chain.
- Neither budget nor proxy is hidden in a comment or a client-side guess.

---

## 4. Official vs non-official is informational, not directive

The `official` boolean is a human-readable flag. The router does not hard-block non-official
providers. It is a rendering and accounting signal in the panel.

---

## 5. Open source & licence notice

- Default licence is MIT.
- The panel can show a licence banner configured in `config.yaml`.
- Commercial or Islamic licensing variants are config-only.

---

## 6. Security & privacy

- Keys are encrypted at rest (AES-256-GCM).
- Raw keys never appear in logs or metrics.
- Panel auth is on by default; CORS is disabled unless explicitly whitelisted.

---

## 7. Zero-em-dash, clean typography

Per project standards:
- No em-dash (`—`) anywhere in UI or copy.
- Persian numbers (`۰-۹`) and the unit after the number.
- RTL layout with logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`).
- Clean, monospace-typography-first design for the panel.

---

## 8. Minimal, boring, readable

- One dependency for the router core; all others are per-adapter.
- No interface-with-one-implementation abstractions.
- No "for later" boilerplate.
- Every non-trivial function gets an inline assert/test.
