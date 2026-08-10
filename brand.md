# Doolittle interface identity

Doolittle is a focused desktop operator for ElizaOS. Its interface should feel
like a precise native workbench: calm at rest, information-rich while work is
running, and explicit about local runtime state.

## Visual language

- Use the existing near-black surfaces, warm neutral text, and Doolittle orange
  (`#ff6b16` dark, `#df5700` light) as the single primary accent.
- Use Avenir Next or the configured system sans stack for product copy and the
  configured mono stack for evidence, state, identifiers, and code.
- Prefer flat surfaces, fine borders, compact radii, and restrained motion.
  Avoid ornamental gradients, excessive shadows, or nested cards that do not
  communicate a real boundary.
- Preserve readable type and control targets. Gain density by removing repeated
  chrome, widening scannable records, and disclosing secondary controls—not by
  shrinking every label.

## Interaction principles

- The current project, runtime health, and primary action remain obvious.
- Chat and coding workspaces own the viewport; supporting pages use consistent
  headers, metric strips, and bounded master-detail layouts.
- Advanced setup stays available through deliberate progressive disclosure.
- Loading, empty, degraded, and error states never compete with speculative or
  stale content.
- Light, dark, comfortable, compact, narrow, keyboard, and reduced-motion paths
  must remain first-class.

When extending the interface, preserve these constraints before introducing a
new visual primitive or page-specific spacing system.
