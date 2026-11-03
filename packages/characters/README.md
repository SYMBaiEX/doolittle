# @doolittle/characters

Bundled character configuration for the Doolittle runtime. This data-only
workspace exports [`doolittle.character.json`](doolittle.character.json), which
contains the default identity, system instructions, model-generation settings,
style, and message examples.

## Consumption

```ts
import character from "@doolittle/characters/doolittle.character.json" with {
  type: "json",
};
```

The agent's [character loader](../agent/src/character.ts) passes this definition
to the SDK's `createCharacter`. Character content does not register plugins,
authorize workspace access, or define the model-provider lifecycle. Keep those
behaviors in runtime configuration and native service assembly.

## Editing

Keep the JSON valid and the bundled defaults generic. Do not add credentials,
private user facts, machine paths, or transcript history. Personal profiles and
named bots belong in runtime-managed state, not in the shipped default.

This package has no build or typecheck script. After editing, run the consuming
agent typecheck and exercise character startup through the relevant application:

```sh
nub run --cwd packages/agent typecheck
```

See [development](../../docs/development.md) and [testing](../../docs/testing.md)
for application startup and runtime acceptance scopes.
