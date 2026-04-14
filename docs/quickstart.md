# Doolittle Quickstart

Use this as the default path from install to reliable first command.

## 1) Bootstrap once

```bash
bash scripts/install.sh
```

This performs dependency install, creates missing defaults, and launches the onboarding flow.

If you need a non-interactive pass, use:

```bash
bash scripts/install.sh --headless
bash scripts/install.sh --skip-wizard
bash scripts/install.sh --check
bash scripts/install.sh --yes
```

If install reports PATH changes, open a new terminal before first run.

## 2) Start and verify immediately

```bash
doolittle
```

You should land in the plain interactive CLI by default.

Run these health checks:

```text
/status
/doctor
/runtime status
/setup checklist
```

From API mode:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/runtime/status
curl http://localhost:3000/runtime/plugins
```

If these all return and report readiness, the product boundary is active.

## 3) Learn the operator shape quickly

Doolittle has one runtime and a few ways to drive it:

| Surface | Command | Use when |
|---|---|---|
| Plain shell | `doolittle` | Everyday work, approvals, and slash commands |
| Cockpit | `doolittle cockpit` | Fullscreen observability |
| Runtime check-ins | `doolittle status`, `doolittle tools`, `doolittle skills`, `doolittle runtime` | Fast orientation without opening the shell first |
| API | `doolittle api` | REST and scripted clients |
| Gateway | `doolittle gateway` | Messaging transports and delivery ops |

The top-level aliases are shortcuts onto the same runtime surfaces:

| Alias | Default mapping |
|---|---|
| `doolittle status` | `/status` |
| `doolittle tools` | `/tools summary` |
| `doolittle skills` | `/skills` |
| `doolittle runtime` | `/runtime status` |

For the daily shell rhythm in one place, use [`operator-loop.md`](./operator-loop.md).

## 4) Surface quick reference

### Shell-level entrypoints

| Goal | Command |
|---|---|
| Everyday operator loop | `doolittle` |
| Fullscreen operator UI | `doolittle cockpit` |
| One-shot shell health | `doolittle status` |
| One-shot tools inventory | `doolittle tools` |
| One-shot skills inventory | `doolittle skills` |
| One-shot runtime summary | `doolittle runtime` |
| Scripted one-shot execution | `doolittle exec -p "<prompt>"` |
| API-only server mode | `doolittle api` |
| Gateway runner mode | `doolittle gateway` |
| Re-run setup | `doolittle setup` |
| Read diagnostics | `doolittle doctor` |
| Reinstall artifacts | `doolittle install` |

### In-shell discoverability (minimal)

- `doolittle help` → top-level command inventory
- `doolittle status` / `doolittle runtime` → fast one-shot operator checks without opening the interactive shell
- `doolittle tools` / `doolittle skills` → quick capability inventory from the same runtime surfaces
- `/status` and `/doctor` → runtime health and capability checks
- `/runtime status` / `GET /runtime/status` → startup state and plugin assembly
- `/tools summary` and `/skills list` → capability surface map
- `/execution status` and `/memory list memory` → execution + memory layers
- `/gateway status` and `/gateway state` → transport health and route state

### API quick references

```text
GET /health
GET /features
GET /runtime/status
GET /runtime/plugins
GET /tools/summary
GET /skills
GET /doctor
POST /chat
```

For the full command catalog, continue with the `CLI command reference` in [`README.md`](../README.md).

## 5) Recovery flow (when first-run is noisy)

- PATH not updated: restart shell or run `~/.local/bin/doolittle`.
- Provider setup appears wrong: run `doolittle setup`, then `/doctor` and `/setup summary`.
- Missing commands in runtime: confirm installer completion and `bun` on PATH.
- Gateway state is stale: `doolittle gateway stop` then `doolittle gateway start`.

## 6) Truth-first references

Before documenting capability, route through:

- [`docs/plugin-inventory.md`](./plugin-inventory.md) (what is assembled)
- [`docs/capability-truth.md`](./capability-truth.md) (what each runtime slice can and cannot claim)
