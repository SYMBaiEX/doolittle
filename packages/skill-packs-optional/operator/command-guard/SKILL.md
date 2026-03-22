# Operator Command Guard

## Purpose

Harden operator commands before they run.

## Use When

- A command could modify state, trigger external side effects, or fan out to other workers.
- A request needs a clearer preview, confirmation, or rollback note.

## Deliver

- A concise risk note.
- The expected blast radius.
- A safer fallback path if the primary action looks risky.
