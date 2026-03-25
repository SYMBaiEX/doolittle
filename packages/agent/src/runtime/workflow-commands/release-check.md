---
command: /release-check
title: Release Check
description: Check whether the current repo or target codebase looks ready to ship and call out blockers.
---
Run a release-readiness review for {{TARGET}}.

Inspect first, then answer directly.

Return:
- current release posture in one short paragraph
- blockers that should stop a release
- medium-risk follow-ups that should be cleaned up soon
- missing validation or smoke checks
- the quickest safe next steps to get to ship-ready

Be concrete and avoid filler.
