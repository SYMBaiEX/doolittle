# Build Doolittle with Doolittle

Doolittle's desktop and CLI use the same ElizaOS engine, tool permissions,
workspace bindings and coding completion checks. Use a project chat for repo
work so every editor, terminal, approval and coding task stays attached to the
intended checkout.

## Prepare the checkout

Follow the [quickstart](./quickstart.md), then check the local setup:

```sh
nub run bootstrap:check
nub run cli:build
```

Connect a coding-capable provider in Settings → Models & accounts. A linked
Codex account can also be prepared with `codex login`. Choose the actual model
you want to use. An unavailable account stays selected and reports its error;
Doolittle does not silently change your model or account.

Create a branch before asking for changes. Start the built CLI from this repo:

```sh
node apps/cli/dist/index.js
```

In the desktop, add this checkout as a project, start its chat and confirm the
folder grant. Approve only the file and command access needed for the task.
Changing the project picker does not redirect an existing conversation's grant.

## Keep the coding assistant stable while developing it

Use the packaged desktop or the built CLI as the coding assistant. Run the
development desktop separately to inspect changes:

```sh
nub run desktop:dev
```

The development profile is `var/desktop-dev/profile`, separate from the
installed application. Renderer edits update immediately. Runtime, main and
preload changes restart the development app after successful compilation.
That restart stops work running inside that development instance, so keep the
editing conversation in the stable assistant. You do not need to rebuild or
reinstall the packaged assistant for each source edit.

Restart the stable assistant after deliberately rebuilding it to adopt new
runtime code. See [fast development](./engineering/fast-development.md) for
watcher recovery and profile options.

## A useful first coding task

Give Doolittle a bounded request with a concrete check:

> Read AGENTS.md and inspect the relevant code before editing. Fix the issue I
> describe below in this checkout. Preserve unrelated changes. Run the related
> tests, inspect your diff, and report exactly what changed and what passed.
> Do not install dependencies or run the full release gate unless needed.

Use the diff/review view to inspect edits and the attached terminal to inspect
real check results. A successful shell command must have a zero exit code in
the correct workspace. Nub `check:*`, `typecheck` and explicit `test:scope`
commands are recognized; a scoped test is not proof that the entire suite ran.

Stop cancels the active task; closing a view does not. Keep partial edits after
cancellation, review them, and give the next turn the failure or remaining task.
Never treat a model's completion message as a substitute for file changes and
test output.

## Themes

Settings → General → Interface theme offers **Anime Atelier** and **Golden Gate
Glass**, alongside Companion and Canvas. Both include light/dark palettes,
readable code surfaces, compact spacing, saved selection and non-animated
alternatives. Glass becomes opaque for reduced transparency and forced colors.
Decorative artwork disappears in short conversation panes.

The terminal cockpit has matching palettes:

```text
/theme set anime-atelier
/theme set golden-gate-glass
```

Themes contain declarative data. Imported files cannot supply CSS, scripts or
remote artwork. Changing a theme preserves conversation drafts and active work.

## External test checklist

Use a fresh profile and a disposable project before granting access to valuable
repositories. Each tester connects their own provider account.

1. Create a project chat; confirm its exact folder and selected model.
2. Ask for a small code repair, run its checks and inspect the diff.
3. Start another coding task, cancel it and confirm it stops before retrying.
4. Keep an unsent draft, switch theme and appearance, then restart the app.
5. Confirm the draft returns and another project's chat cannot inherit access.
6. Disconnect the provider and confirm the error is actionable without a
   successful completion claim or an automatic account switch.

Report the build revision, platform, provider/model, reproduction steps,
expected/actual result and check output. Remove credentials, private prompts,
repository contents and personal paths before sharing logs or screenshots.

Maintainers certify a candidate with:

```sh
nub run check:release
nub run test:live:coding
```

The live lane repairs a private copy of Doolittle's actual TypeScript command
parser through both clients. A separate parent verifier protects the tests and
dependencies, checks the edit and reruns the assertions. It never asks the live
agent to change the maintainer's checkout.

Use artifacts from the [release workflows](./releases/v0.1.0.md) for distribution.
A local unsigned/ad-hoc macOS build is a development preview; successful local
packaging does not establish notarization or Windows signing.
