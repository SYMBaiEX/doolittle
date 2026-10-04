# Local desktop dependency policy

The October 4, 2026 integration retains ElizaOS `2.0.3-beta.7` and its tracked
patches. Dependency updates do not change the SDK release train.

The root override selects `fast-uri@3.1.7`; locked Undici 6 consumers retain their patched release,
and the existing Cloud, app-core, and Discord overrides select `8.10.2`.
The direct agent-development Sharp dependency is `0.35.4`, with a regenerated
Nub lockfile. Existing Undici 5.x and newer 6.x consumers retain their versions.
Transitive source-only Sharp versions may still be vulnerable.

## Reviewed high advisories

The prior desktop inventory contained fast-uri `3.1.6` and Undici `6.28.0` /
`8.10.0`. The networking fixes are required in emitted runtime bytes, not merely
in the top-level manifest:

- fast-uri: [authority injection](https://github.com/advisories/GHSA-qw65-cvwx-89v3)
  and [host confusion](https://github.com/advisories/GHSA-58mr-gqgx-xq4g).
  The verifier guards the patched 2.x, 3.x, and 4.x release lines separately.
- Undici: [WebSocket subprotocol handling](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5),
  [BalancedPool TLS options](https://github.com/advisories/GHSA-w293-vg96-wgc3),
  and [cross-origin cache isolation](https://github.com/advisories/GHSA-vp8m-p9jh-q5pm).
  Artifact floors are `6.28.1`, `7.29.1`, and `8.10.2` on their respective majors.
- Sharp: [libheif vulnerabilities](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c);
  a future emitted/copy dependency must be at least `0.35.4`.
- adm-zip: [allocation](https://github.com/advisories/GHSA-7q85-xj36-vmfc),
  [decompression bypass](https://github.com/advisories/GHSA-rcw4-f5rp-g42v),
  [extraction permissions](https://github.com/advisories/GHSA-j5f4-cc29-5x44),
  and [unhandled decompression errors](https://github.com/advisories/GHSA-8238-w5pm-2374).
  A future artifact dependency must be at least `0.6.1`.
- [Multipart header handling](https://github.com/advisories/GHSA-x8mw-p69m-v3mx):
  a future `@fastify/busboy` artifact dependency must be at least `3.2.1`.
- [Braces recursion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): no
  reviewed patched release is available, so the verifier rejects braces in an
  artifact rather than inventing a safe version.

The freshly prepared integration inventory must contain fast-uri `3.1.7` and
Undici 6 / 8 releases at or above their reviewed floors. Sharp, adm-zip, busboy, and braces are absent from
both its emitted-package inventory and copied native-package closure. The
verifier blocks their vulnerable versions if later packaging includes them.
This exclusion is not a claim that source/CLI execution paths are safe.

`check:runtime-advisory-policy` retains exact reviewed high-advisory ranges;
unknown advisories and changed ranges still fail closed. This gate is a review
coverage check, not an all-severity security clearance. The complete source
production graph still contains reviewed highs, and moderate/low advisories
remain outside the critical/high checks. The pinned fast-uri version is the
reviewed high-severity floor, not a claim of zero advisories.

## Reproduce before install

Run the repository gates, `check:runtime-advisory-policy`,
`desktop:runtime:prepare`, and `desktop:runtime:audit`. Then package from a clean
commit and run packaged acceptance. `runtime-manifest.json` inventories emitted
bytes and copied native packages; the install verifier checks that same
immutable package inventory rather than trusting the development graph.

Local installation is ad-hoc signed and transactionally verified. It is not a
notarized public release. Keep a separate prior app copy for post-success app
rollback; profile downgrade compatibility is not guaranteed.
