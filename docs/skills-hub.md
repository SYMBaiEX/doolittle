# Skills Hub

Eliza Agent now exposes a native skills hub for catalog, sync, manifest, import, export, and install workflows.

## On-Disk Layout

- `data/skills-hub/manifests/` stores exported workspace and catalog manifests
- `data/skills-hub/installs/` stores installed manifests and the installed index
- `data/skills-hub/imports/` stores imported manifests staged into the hub
- `data/skills-hub/exports/` stores bundle exports

## Runtime Commands

- `/skills hub`
- `/skills summary`
- `/skills catalog`
- `/skills catalog refresh`
- `/skills catalog search <query>`
- `/skills catalog show <slug>`
- `/skills installed`
- `/skills installed show <slug>`
- `/skills manifest <slug>`
- `/skills sync`
- `/skills export <slug|all>`
- `/skills import <manifest-path>`
- `/skills install <catalog-slug>`

## API Routes

- `GET /skills`
- `GET /skills/summary`
- `GET /skills/hub`
- `GET /skills/catalog`
- `GET /skills/catalog/:slug`
- `GET /skills/installed`
- `GET /skills/installed/:slug`
- `GET /skills/manifest/:slug`
- `POST /skills/sync`
- `POST /skills/export`
- `POST /skills/import`
- `POST /skills/install`

## Behavior

- Workspace skills are scanned from the Eliza Agent skills workspace
- Generated skills are included in hub summaries and exports
- Catalog skills are sourced from the native Eliza skill catalog
- Installed manifests are persisted separately and can be listed or inspected later
- Bundle exports include both workspace manifests and installed manifests
