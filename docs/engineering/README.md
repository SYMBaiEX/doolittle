# Engineering documentation

Start with these guides for current development and maintenance. The source,
workspace manifests, and test configuration are authoritative when details
change; update the relevant guide with the code.

| Guide | Use it for |
| --- | --- |
| [Development and testing](fast-development.md) | Local feedback, native acceptance, and release verification boundaries. |
| [Scripts](scripts.md) | Installation, development, source qualification, and release entry points. |
| [SDK upgrades](sdk-package-upgrades.md) | Upstream source builds, package exceptions, and qualification. |
| [Local dependency policy](local-install-dependency-policy.md) | Production audits and desktop artifact checks. |
| [Interface design](doolittle-interface-design.md) and [frontend quality](frontend-quality-contract.md) | Product interface conventions and review requirements. |
| [Shared agent engine](shared-agent-engine.md) | Process and execution ownership. |
| [Automation history](automation-history.md) | Durable dispatch and duplicate-prevention storage. |
| [Coding task evaluations](coding-task-evals.md) | Evaluator use and evidence boundaries. |
| [Agent quality evaluation](agent-quality-eval-checklist.md) and [human review](human-review-evidence.md) | Evaluation interpretation, run review, and evidence handling. |

[Monorepo layout](../monorepo.md), [package ownership](../package-ownership.md),
and [module structure](../module-structure-guidelines.md) describe workspace
boundaries. Generated [plugin inventory](../plugin-inventory.md) and
[capability truth](../capability-truth.md) describe the assembled runtime.

## Historical records

The dated [codebase review](codebase-review-2026-10-25.md) and
[follow-up](review-findings-follow-up-2026-10-26.md), October
[cleanup](october-2026-cleanup.md), [harness decisions](october-2026-harness-decisions.md),
[overhaul](october-2026-overhaul.md), and [UI deep pass](october-2026-ui-deep-pass.md)
preserve evidence and decisions for their respective revisions. The
[desktop migration checklist](../desktop-information-architecture-checklist.md),
[coding harness investigation](../coding-harness-verification-2026-09-22.md),
and [Eliza ownership matrix](../eliza-maximization-matrix.md) are also historical.
They are not current verification or upgrade instructions.

The [representative headless cohort](representative-headless-cohort-draft.md) is
an unexecuted planning draft, not a quality result. Evaluation guides also
contain historical baselines; distinguish their recorded runs from new evidence.
