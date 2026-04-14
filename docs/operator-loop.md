# Doolittle Operator Loop

Use this when you already have Doolittle installed and want the shortest truthful path to the daily flow.

## The shape

Doolittle has one runtime and a few ways to drive it:

| Surface | Command | Use when |
|---|---|---|
| Plain shell | `doolittle` | Everyday conversation, approvals, slash commands, and live work |
| Cockpit | `doolittle cockpit` | Fullscreen observability and longer-running operator sessions |
| One-shot aliases | `doolittle status`, `doolittle tools`, `doolittle skills`, `doolittle runtime` | Fast orientation without opening the shell first |
| API | `doolittle api` | Scripted clients, editor integrations, and REST consumers |
| Gateway | `doolittle gateway` | Messaging transports, delivery flow, and gateway supervision |

The important part is that these are not separate products. The shell, API, and gateway all sit on the same assembled runtime.

## Daily loop

The normal loop is:

1. Start with `doolittle`.
2. Ask for work directly, or use `/status` if you need to orient first.
3. If you need capability discovery, use `doolittle tools`, `doolittle skills`, or `doolittle runtime`.
4. If you need transport operations or live delivery state, move into the gateway lane.
5. If something feels wrong, use `doolittle doctor` or `/doctor`.

## Top-level aliases

These are the fastest way to regain context:

| Alias | Maps to | Use when |
|---|---|---|
| `doolittle status` | `/status` | Check readiness, hydration, and operator summary |
| `doolittle tools` | `/tools summary` by default | See the current tool surface quickly |
| `doolittle skills` | `/skills` by default | See installed, generated, and hub-backed skills |
| `doolittle runtime` | `/runtime status` by default | Inspect startup state, plugin inventory, and native ownership |

If you stay inside the shell, the equivalent first commands are:

- `/status`
- `/doctor`
- `/runtime status`
- `/tools summary`
- `/skills`

## Runtime lane

Use the runtime lane when you want to answer, "is the agent itself healthy and assembled correctly?"

Start here:

- `doolittle status`
- `doolittle runtime`
- `doolittle doctor`

Or inside the shell:

- `/status`
- `/runtime status`
- `/doctor`
- `/setup summary`

API equivalents:

- `GET /health`
- `GET /runtime/status`
- `GET /runtime/plugins`
- `GET /doctor`

## Gateway lane

Use the gateway lane when you want to answer, "are transports alive, routing, and delivering correctly?"

Start here:

- `doolittle gateway`
- `/gateway status`
- `/gateway state`
- `/gateway runtime`
- `/gateway trace`

API equivalents:

- `GET /gateway/health`
- `GET /gateway/runtime`
- `GET /gateway/state`
- `GET /gateway/trace`
- `GET /gateway/inbox`
- `GET /gateway/outbox`

The gateway is part of the same runtime story, but it is a different operator concern than basic shell readiness.

## Smallest truthful first-run check

If you want the shortest "am I actually ready?" loop:

1. `doolittle status`
2. `doolittle tools`
3. `doolittle runtime`
4. `doolittle doctor` if anything looks degraded
5. `doolittle gateway` only when you need transport operations

## Recovery

- Shell command missing: restart your terminal or invoke `~/.local/bin/doolittle`.
- Setup looks incomplete: run `doolittle setup`, then `doolittle doctor`.
- Runtime looks degraded: compare `doolittle status` with `doolittle runtime` to separate readiness from capability assembly.
- Gateway looks stale: `doolittle gateway stop`, then `doolittle gateway start`.

## Next docs

- [`README.md`](../README.md) for the full surface map
- [`quickstart.md`](./quickstart.md) for install-to-ready
- [`plugin-inventory.md`](./plugin-inventory.md) for truth about assembled plugin state
