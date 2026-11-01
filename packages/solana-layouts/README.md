# Solana layouts

Doolittle's first-party replacement for the archived `@solana/buffer-layout-utils`.
It retains that package's public layout API for the existing wallet/trading SDKs,
using `@solana/buffer-layout` and maintained Noble byte converters. Unsigned
encoders reject negative and overflowing amounts before changing the destination.
Public-key, boolean and 18-place decimal layouts remain available.

This is compatibility code, deliberately owned here instead of modifying an
installed dependency. It contains no native addon or `bigint-buffer`. The CommonJS
entry is also importable from ESM and runs directly in both supported Node hosts
without generating or installing a second build artifact.

`noble-layout-codecs` is an npm alias of `@noble/curves@2.2.0`; it prevents
legacy Solana crypto dependencies from selecting an older converter version.
The root-owned `link:` override maps the legacy import name to this workspace,
so changes do not require rebuilding or reinstalling the package.
