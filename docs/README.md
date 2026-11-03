# Developer handbook

This handbook explains how to build, change, test, and release Doolittle.

| Guide | Use it for |
| --- | --- |
| [Setup](setup.md) | Toolchain, dependency installation, configuration, and first launch. |
| [Architecture](architecture.md) | Package ownership, runtime flow, and extension points. |
| [Development](development.md) | CLI and Electron development loops. |
| [Testing](testing.md) | Scoped tests, native acceptance, and local checks. |
| [Interface](interface.md) | Desktop components, state ownership, accessibility, and motion. |
| [SDK dependencies](sdk.md) | Source archives, vendor workspaces, and upstream upgrades. |
| [Evaluations](evaluations.md) | Task suites, private evidence, and report comparison. |
| [Security](security.md) | Trust boundaries, secrets, and developer checks. |
| [Releases](releases.md) | Artifact preparation, provenance, and distribution. |

The package manifests define commands and versions. Runtime catalogs, validators,
and tests define behavior. Link to those sources when a detailed inventory would
duplicate implementation. Keep these chapters current as behavior changes.

Each first-party workspace has its own README for local exports, commands, and
ownership. Use the [workspace index](../README.md#workspaces) to find it.
