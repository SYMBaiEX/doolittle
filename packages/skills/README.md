# Doolittle Skills

This workspace holds curated and generated Doolittle skill documents in the
official Agent Skills filesystem shape: every active skill is a direct child
directory containing `SKILL.md`.

See the current registry in [`index.md`](./index.md).
The skills hub surfaces these families directly through `/skills families` and `/skills hub families`.

Optional, higher-breadth packs live in the sibling [`packages/skill-packs-optional`](../skill-packs-optional) workspace so the curated tier stays clean and the optional tier can evolve independently.

## Capability map

- `modeling`
  - user profile extraction, preference tracking, and continuity summaries
- `profile-learning`
  - session-to-profile distillation and recall alignment
- `repo-ops`
  - local repository work, verification, and durable project notes
- `reports`
  - scheduled summaries and recurring operational reports
- `inbox`
  - inbound triage, reply shaping, routing, and continuity management
- `authoring`
  - operator docs, workspace guides, and user-facing procedural writing
- `ingestion`
  - source normalization, import pipelines, and memory/catalog ingestion
- `install`
  - bootstrap guidance, install flows, and release delivery notes
- `regression`
  - smoke checks, regression coverage, and repeatable behavior validation
- `rag`
  - source-backed retrieval, document ingestion, and citation-aware context
- `release`
  - release planning, rollout validation, rollback safety, and upgrade notes
- `telemetry`
  - logs, metrics, traces, incident summaries, and operator signal review
- `workspace`
  - plugin coverage, native versus custom integration choices, and compatibility notes
- `review`
  - risk checks, guardrails, approval gates, and safe fallback planning
- `coordination`
  - roadmap shaping, workstream alignment, dependency tracking, and milestone planning
- `incidents`
  - outage triage, containment, operator impact, and follow-up investigation
- `engagement`
  - outward-facing replies, onboarding guidance, and Doolittle communication
- `execution`
  - local, container, and remote execution backend planning
- `transport`
  - gateway, delivery, and transport lifecycle work
- `delegation`
  - supervised work queues, child tasks, and handoff tracking
- `mcp`
  - model context protocol server discovery and tool invocation
- `research`
  - page capture, page comparison, and browser evidence gathering
- `voice`
  - transcription, captioning, speech synthesis, and media analysis
- `vision`
  - image inspection, screenshot analysis, and visual evidence capture
- `trajectory`
  - session replay, trajectory export, bundle review, and learning loops
- `evaluation`
  - repeatable scoring, bundle comparison, and regression-oriented review
- `batch`
  - replay bundles, evaluation sweeps, and higher-volume review runs
- `autocoder`
  - code-generation evaluation, SWE-bench style review, and patch-quality checks
- `tts`
  - provider-backed text-to-speech, voice artifact generation, and speech audit notes
- generated skills
  - generated skills created from completed workstreams

## Conventions

- Every `SKILL.md` is a native ElizaOS skill document with YAML frontmatter:
  `name` must match the skill directory, and `description` should be the routing
  sentence the native loader can use for discovery.
- Keep each `SKILL.md` short, specific, and Doolittle branded.
- Prefer concrete deliverables over broad advisory language.
- Keep category and provenance information in the skill document rather than
  adding another directory layer; the official filesystem store discovers
  direct child directories.
