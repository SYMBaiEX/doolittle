# Fresh branch scan review — 2026-10-11

The first completed JavaScript CodeQL analysis for this remediation branch is
`1933033304`, at commit `0c631e9d`. It reports **53 results: one critical and
52 high**, versus 162 results on main `90ad26af` (analysis `1932676719`).
Actions analysis `1933026161` reports zero results. This is a scanner-result
comparison, not a count of vulnerabilities fixed: rewritten flows received 52
new alert identities, and result identity changes alone do not prove repair.

Independent source review covered all 53 current identities in the groups
below. The 47 production results do not demonstrate a new exploitable path
within the documented private, operator-owned, stable-root model. That does
not make every production result a blanket false positive. Descendant/leaf
checks do not provide an OS sandbox against hostile same-user ancestor swaps.
Native Windows filesystem behavior remains unverified.

| Alert IDs | Source boundary and disposition |
|---|---|
| 270–273, 313 | Job control: UUID-derived paths under checked private directories; heartbeat uses no-follow/exclusive opens and compares descriptor identity before truncation. |
| 276–284 | Job index: owned canonical root and private child directories; validated UUID/derived paths, bounded reads and a private mutation lock. |
| 274–275, 314 | Job log: exclusive private creation; opened descriptor identity, single-link and size checks before append. |
| 285–288 | Autocoder persistence: operator-selected root, private child directory, bounded single-link reader and atomic persistence. |
| 315 | Autocoder artifacts: canonical containment, checked final entry, no-follow open and bounded identity-pinned descriptor reads. |
| 289–290 | Memory: private child directory, bounded single-link reads, owned exclusive temporary writes and atomic replacement. |
| 291–293 | Settings: operator-selected root, pinned bounded reader, identity-based cache and persistence-before-cache mutation. |
| 294 | Trajectory: service-root authorization and canonical containment, no descendant symlinks, bounded pinned reads; ancestors must remain trusted/stable. |
| 295–303 | Profiles: private child directory and bounded reader; exclusive legacy migration and atomic persistent store. |
| 304–307, 316–317 | Shared helpers: regular-file/directory and owner checks; no-follow/nonblocking opens; descriptor identity checks before read/chmod, bounded read and post-stat. |
| 254 | Read helper: `O_RDONLY` open without `O_CREAT`; the insecure-temporary-file rule is a static misclassification of a reader. |
| 310–311, 318 | Eval reports: operator-selected report root, no-follow/nonblocking open, descriptor identity/single-link checks and 16 MiB bound. |
| 312 | Test-only VM execution of the installed UUID 8 UMD package, resolved from the package manifest with four fixed filenames. No user string reaches this execution; retain the actual browser-bundle regression. |
| 321 | Test-only classification accumulator from committed ledger JSON. A follow-up uses `Map` to remove prototype-key ambiguity without weakening the count assertion. |
| 319–320 | Private atomic-write fixtures: readback assertions target files created inside an owned `mkdtemp` directory. |
| 308–309 | Deliberate eval symlink/hardlink fixtures under an owned temporary directory, verifying rejection by the production reader. |

No alert was dismissed, no rule was disabled, and no scanned path was excluded.
The original 162-alert baseline and historical disposition overlay remain
separate. The final-head CI/CodeQL result, normal merge and installed application
receipt must be checked independently; this note does not certify a newer
commit or GitHub alert closure. Seven version-based dependency advisories
remain visible despite their reviewed mechanism patches.
