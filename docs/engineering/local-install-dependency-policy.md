# Local desktop dependency policy

Current status: the [dependency replacements](../security/dependency-replacements-2026-10-25.md) remove all six
remaining advisory sources and eight backport files. Audit inventories are clean;
the release policy now requires zero advisories. The details below describe the
earlier remediation snapshot.


The October 25, 2026 update selects the newest usable SDK packages independently;
see [SDK upgrade evidence](sdk-package-upgrades.md) for publication/API limits.

Networking/parser overrides now select fast-uri 3.1.9, Undici 6.29.1 / 7.30.1 /
8.12.2, body-parser 1.20.9 / 2.4.0, ip-address 10.7.5, markdown-it 14.3.3,
serialize-javascript 7.1.3, and toml 5.0.1. Electron is 45.0.0.

Zod 4 consumers use 4.6.7. Version 3 consumers consolidate on 3.25.76 with a
version-preserving backport of the leading collection-size gate from
[colinhacks/zod a0ebf97](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd).
The same backport protects the legacy v3 surface inside 4.6.7. Oversized arrays
and sets now fail before element parsing, async work, or outer refinements.
The legacy package's v4 array/set/map paths also check leading upper bounds.
Valid input and transformation behavior remain intact. Both CommonJS and ESM
consumer entrypoints run in the release boundary suite. The v3 advisory remains
visible to version scanners; this is a tested patch, not a claim of zero alerts.

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
  Artifact floors are `6.29.1`, `7.30.1`, and `8.12.2` on their respective majors.
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

The freshly prepared integration inventory must contain fast-uri `3.1.9` and
Undici 6 / 8 releases at or above their reviewed floors. Sharp, adm-zip, busboy, and braces are absent from
both its emitted-package inventory and copied native-package closure. The
verifier blocks their vulnerable versions if later packaging includes them.
This exclusion is not a claim that source/CLI execution paths are safe.

`check:runtime-advisory-policy` retains exact reviewed ranges and severities
for production advisories at every severity. Unknown advisories, changed ranges
or severities, and missing/error audit inventories fail closed. This gate checks
review coverage, not scanner closure. Version-based findings remain in
the source graph; their tested patches retain truthful upstream versions.
Consumer regressions and packaged artifact verification remain separate gates.

## Reproduce before install

Run the repository gates, `check:runtime-advisory-policy`,
`desktop:runtime:prepare`, and `desktop:runtime:audit`. Then package from a clean
commit and run packaged acceptance. `runtime-manifest.json` inventories emitted
bytes and copied native packages; the install verifier checks that same
immutable package inventory rather than trusting the development graph.

Local installation is ad-hoc signed and transactionally verified. It is not a
notarized public release. Keep a separate prior app copy for post-success app
rollback; profile downgrade compatibility is not guaranteed.
