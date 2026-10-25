# Legacy dependency replacements — October 25, 2026

The production workspace audit and the root audit including development tools
now report zero advisories at every severity. The release gate requires an empty
advisory inventory and has no per-advisory exceptions. It still rejects missing,
empty-graph and failed audit reports. Packaged runtime floors separately reject
old file-type, UUID and Zod versions if future dependency changes reintroduce them.

| Former dependency          | Replacement                             | Consumer compatibility                                                                                                 |
| -------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| bigint-buffer 1.1.5        | Noble Curves 2.2 integer/byte utilities | Solana layout utilities preserve their public layouts and delegate conversions to Noble.                               |
| elliptic 6.6.1             | ethers 6.17 signing implementation      | The ethers v5 signing-key boundary delegates signing, recovery, point addition and ECDH to ethers v6.                  |
| file-type 16.5.4           | file-type 22.2                          | Native image decoding uses the modern async detection API.                                                             |
| UUID 8/9                   | UUID 11.1.1                             | CommonJS callers retain named UUID functions and get upstream buffer bounds checks.                                    |
| decode-uri-component 0.2.2 | WalletConnect utilities 2.26            | The upstream update removes the old decoder and uses maintained crypto/codecs.                                         |
| Zod 3                      | Zod 4.6.7                               | Coinbase records declare string keys explicitly; Chromium reads the current `issues` field; abitype advances to 1.2.3. |

The SDK wallet UI imports only Phantom and Solflare. It now declares those two
adapters directly instead of installing every adapter and their unused legacy
crypto stacks. Both existing choices remain available.

Eight advisory backport files are removed. An orphaned sprintf-js patch is also
removed because its only dependency path disappeared. Consumer integration
patches remain explicit in `patchedDependencies`; they adapt existing SDK APIs
to the maintained dependencies rather than patching vulnerable implementations.
`packageExtensions` declares the newly required dependencies, while scoped
removal overrides delete obsolete dependency edges. These changes are reflected
in the lockfile and work from a clean frozen install.

The existing SDK behavior/security patches and the braces recursion guard remain;
those are separate from the six resolved advisory sources. The runtime artifact
policy continues to exclude braces from shipped bundles.

Regression journeys cover UUID generation/bounds, WalletConnect URI/encryption,
Solana integer layout vectors in both module formats, native and vision image
operations, deterministic signing and transaction recovery, Coinbase typed-data
records, browser protocol validation, ABI schemas, and upstream Zod size bounds.
No funded wallets, transactions on a network, or external provider credentials
are used by these tests. Local macOS desktop/CLI and packaged acceptance run in
`nub run check:release`; Windows/Linux execution and paid provider calls remain
separate validation.
