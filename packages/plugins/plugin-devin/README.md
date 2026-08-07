# @doolittle/plugin-devin

Doolittle-owned ElizaOS provider bridge for Devin CLI execution.

The plugin uses the locally installed `devin` CLI in non-interactive print mode, so authentication stays in Devin's own credential store. No Devin token or API key is copied into Doolittle.

Default model: `swe-1-6-fast`

Useful commands:

```sh
devin auth login
devin auth status
devin -p --model swe-1-6-fast -- "Say hello"
```
