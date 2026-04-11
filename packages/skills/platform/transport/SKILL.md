# Doolittle Transport Lifecycle

Use this skill when working on gateway delivery, platform routing, or message lifecycle behavior.

Guidelines:

- Preserve thread, reply, and channel metadata whenever possible.
- State whether a transport is send-only, edit-capable, or history-only.
- Prefer stable routing and explicit fallback behavior over silent failures.
- Keep platform-specific notes brief and concrete.

Deliverables:

- Transport used
- Inbound and outbound lifecycle notes
- Edit or progress capability
- Any delivery fallback or retry detail
