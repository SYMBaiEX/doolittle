# Doolittle Solana layouts

`@doolittle/solana-layouts` provides the layout API required by upstream wallet
and trading consumers of `@solana/buffer-layout-utils`. The root `link:` override
maps that legacy import to this first-party compatibility package.

## API

[`index.d.ts`](index.d.ts) defines the public surface: unsigned integer layouts
in both byte orders, `publicKey`, `bool`, the 18-place `decimal` layout, and
`encodeDecode`. [`index.cjs`](index.cjs) implements it using
`@solana/buffer-layout`, Solana public keys, BigNumber, and Noble byte converters.

Existing consumers continue to import the legacy package name:

```ts
import { u64 } from "@solana/buffer-layout-utils";

const bytes = Buffer.alloc(8);
u64().encode(42n, bytes);
const amount = u64().decode(bytes);
```

Unsigned encoders reject invalid and overflowing values before touching the
destination buffer. Keep the established API and byte representation compatible
with real upstream consumers. This package has no native addon or generated
build output; its CommonJS implementation is also loadable from ESM.

## Development

From the repository root:

```sh
nub run --cwd packages/solana-layouts typecheck
nub run test:scope tests/boundary/solana-layouts.test.ts
```

The manifest pins `noble-layout-codecs` as an npm alias so legacy Solana crypto
dependencies cannot select another converter version. Keep changes in this
workspace and the root override; do not patch installed dependencies.
See [SDK maintenance](../../docs/sdk.md) for dependency qualification and
[testing](../../docs/testing.md) for validation scope.
