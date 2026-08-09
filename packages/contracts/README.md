# Doolittle Contracts

This package owns serializable Doolittle product contracts shared across the
agent, desktop, and private plugin workspaces. It does not redefine ElizaOS
lifecycle or plugin types.

The source layout follows ownership rather than consumers:

- `coding-agent.ts` validates persisted coding sessions and iterations.
- `coding-workspace.ts` describes filesystem-facing coding results.
- `repository.ts` defines repository reads and mutation requests.
- `types/` holds focused cross-surface records and stable service identifiers.

Consumers import the package root unless a documented subpath exists. Runtime
validation belongs beside the contract it protects and uses Zod rather than
unchecked casts or shallow shape checks.
