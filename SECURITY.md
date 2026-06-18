# Security Policy

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
- Exposing the API on a non-loopback interface (e.g. `DOOLITTLE_HOST=0.0.0.0`)
  **requires** a bearer token via `DOOLITTLE_API_TOKEN`. Without a token, a
  non-loopback bind rejects every request — the API is never silently exposed.
- Context files (`AGENTS.md`, `SOUL.md`, …) and tool inputs pass through a
  prompt-injection scanner before reaching the model.
- Credentials and secrets are stored under the data directory and are not
  returned to non-local/unauthenticated callers.

## Hardening checklist for operators

- Keep `DOOLITTLE_HOST=127.0.0.1` unless you intentionally need remote access.
- If you set a non-loopback host, set a long random `DOOLITTLE_API_TOKEN` and put
  the API behind TLS / a reverse proxy.
- Treat the workspace directory and `.env` as sensitive — they hold credentials.
- Review actions that execute shell commands; approval gates apply to non-CLI
  sources.
