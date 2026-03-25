---
command: /security-review
title: Security Review
description: Review the current repo or target codebase for security risks and missing hardening.
---
Review {{TARGET}} for security issues and operational hardening gaps.

Inspect first. Findings come first.

Return:
- the most important findings ordered by severity
- the exact files or subsystems involved
- exploitability or likely impact
- missing tests or controls
- a short residual-risk summary if no critical issues are found

Prefer concrete findings over general advice.
