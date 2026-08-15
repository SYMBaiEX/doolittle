# Security Policy

## Supported versions

| Version | Security updates |
| --- | --- |
| `0.1.x` | Supported after the first public `0.1.0` release |
| Development builds and older snapshots | Not supported; update or reinstall the latest verified release |

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for an
unpatched vulnerability.

- Use GitHub's [private vulnerability reporting](https://github.com/SYMBaiEX/doolittle/security/advisories/new)
  ("Report a vulnerability" under the **Security** tab), or
- Open a minimal private channel with the maintainers.

Include a description, affected version/commit, reproduction steps, and impact.
We aim to acknowledge reports promptly and coordinate a fix and disclosure.

## Security model

Doolittle is terminal-first and **local-first**:

- The HTTP API binds to **loopback (`127.0.0.1`) by default**, so it is reachable
  only from the local machine.
- Exposing the API on a non-loopback interface (e.g. `ELIZA_API_BIND=0.0.0.0`)
  **requires** a bearer token via `ELIZA_API_TOKEN`. Eliza generates a temporary
  process token when one is omitted, so the API is never silently exposed.
- Eliza's native HTTP policy enforces timing-safe authorization, loopback trust,
  DNS-rebinding host checks, origin allowlisting, and terminal-token isolation.
- Trusted loopback requests retain local terminal access. When API-token
  remote access is active, Doolittle's terminal execution and PTY mutation
  routes require both API authorization and `X-Eliza-Terminal-Token`; that
  dedicated token does not authorize other product routes. The canonical
  `/api/terminal/run` endpoint retains Eliza's header-or-body token contract.
- Request bodies admitted to plugin or product routing are capped at 20 MiB,
  including chunked transfers. Oversized bodies receive `413`. Requests
  rejected before routing are not drained; body-framed rejected requests close
  their connection. GET, HEAD, and OPTIONS requests with bodies are rejected.
- Context files (`AGENTS.md`, `SOUL.md`, …) and tool inputs pass through a
  prompt-injection scanner before reaching the model.
- Credentials and secrets are stored under the data directory and are not
  returned to non-local/unauthenticated callers.

## Hardening checklist for operators

- Keep `ELIZA_API_BIND=127.0.0.1` unless you intentionally need remote access.
- If you set a non-loopback host, set a long random `ELIZA_API_TOKEN` and put
  the API behind TLS / a reverse proxy.
- Set a separate long random `ELIZA_TERMINAL_RUN_TOKEN` before allowing remote
  callers to use terminal execution or interactive PTY mutation routes.
- Treat the workspace directory and `.env` as sensitive — they hold credentials.
- Review actions that execute shell commands; approval gates apply to non-CLI
  sources.
