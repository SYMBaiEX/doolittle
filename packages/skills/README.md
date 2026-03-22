# Eliza Agent Skills

This workspace holds curated and generated Eliza Agent skill documents.

See the current registry in [`index.md`](./index.md).
The skills hub surfaces these families directly through `/skills families` and `/skills hub families`.

Optional, higher-breadth packs live in the sibling [`packages/skill-packs-optional`](../skill-packs-optional) workspace so the curated tier stays clean and the optional tier can evolve independently.

## Category map

- `identity/modeling`
  - user profile extraction, preference tracking, and continuity summaries
- `memory/profile-learning`
  - session-to-profile distillation and recall alignment
- `productivity/repo-ops`
  - local repository work, verification, and durable project notes
- `automation/reports`
  - scheduled summaries and recurring operational reports
- `communications/inbox`
  - inbound triage, reply shaping, routing, and continuity management
- `documentation/authoring`
  - operator docs, workspace guides, and user-facing procedural writing
- `data/ingestion`
  - source normalization, import pipelines, and memory/catalog ingestion
- `distribution/install`
  - bootstrap guidance, install flows, and release delivery notes
- `testing/regression`
  - smoke checks, regression coverage, and repeatable behavior validation
- `knowledge/rag`
  - source-backed retrieval, document ingestion, and citation-aware context
- `operations/release`
  - release planning, rollout validation, rollback safety, and upgrade notes
- `observability/telemetry`
  - logs, metrics, traces, incident summaries, and operator signal review
- `integrations/workspace`
  - plugin coverage, native versus custom integration choices, and compatibility notes
- `safety/review`
  - risk checks, guardrails, approval gates, and safe fallback planning
- `planning/coordination`
  - roadmap shaping, workstream alignment, dependency tracking, and milestone planning
- `support/incidents`
  - outage triage, containment, operator impact, and follow-up investigation
- `community/engagement`
  - outward-facing replies, onboarding guidance, and Eliza Agent communication
- `platform/execution`
  - local, container, and remote execution backend planning
- `platform/transport`
  - gateway, delivery, and transport lifecycle work
- `platform/delegation`
  - supervised work queues, child tasks, and handoff tracking
- `platform/mcp`
  - model context protocol server discovery and tool invocation
- `browser/research`
  - page capture, page comparison, and browser evidence gathering
- `media/voice`
  - transcription, captioning, speech synthesis, and media analysis
- `media/vision`
  - image inspection, screenshot analysis, and visual evidence capture
- `research/trajectory`
  - session replay, trajectory export, bundle review, and learning loops
- `research/evaluation`
  - repeatable scoring, bundle comparison, and regression-oriented review
- `research/batch`
  - replay bundles, evaluation sweeps, and higher-volume review runs
- `research/action-bench`
  - action-calling benchmark coverage, package-enabled action sweeps, and evaluation gates
- `research/autocoder`
  - code-generation evaluation, SWE-bench style review, and patch-quality checks
- `media/voice/tts`
  - provider-backed text-to-speech, voice artifact generation, and speech audit notes
- `generated/*`
  - generated skills created from completed workstreams

## Conventions

- Keep each `SKILL.md` short, specific, and Eliza Agent branded.
- Prefer concrete deliverables over broad advisory language.
- Use the smallest category that still captures the work cleanly.
