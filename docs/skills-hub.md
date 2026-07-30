# Skills Hub Projection

Doolittle exposes Eliza's official skill lifecycle through a desktop-friendly
skills hub. The official `AgentSkillsService` is the sole owner of catalog
discovery, search, details, refresh, installation, and uninstallation.
Doolittle owns only workspace/generated-skill metadata, family views, portable
manifest export, and the API/CLI projection of official service results.

## On-Disk Layout

- `data/skills-hub/manifests/` stores exported local workspace manifests
- `data/skills-hub/installs/` stores explicitly imported portable manifests
- `data/skills-hub/imports/` stores imported manifests staged into the hub
- `data/skills-hub/exports/` stores bundle exports

The hub does not load or persist a second catalog cache. Catalog and
managed-install records are read from `AGENT_SKILLS_SERVICE`, retained only as
an ephemeral read projection for product summaries, and supplied to bundle
generation as read-only data.

## Runtime Commands

- `/skills hub`
- `/skills summary`
- `/skills catalog`
- `/skills catalog refresh`
- `/skills catalog search <query>`
- `/skills catalog show <slug>`
- `/skills hub distribution`
- `/skills hub families`
- `/skills families`
- `/skills family <slug>`
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
- `GET /skills/hub/distribution`
- `GET /skills/hub/families`
- `GET /skills/hub/families/:slug`
- `GET /skills/families`
- `GET /skills/families/:slug`
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

- Workspace skills are scanned from the Doolittle skills workspace.
- Generated skills are included in hub summaries and exports.
- Curated skill families are surfaced alongside generated families and hub
  distribution counts.
- Catalog search, details, refresh, and mutations resolve the runtime's official
  `AGENT_SKILLS_SERVICE`; the product hub has no fallback catalog client.
- Managed-install records are projected from the official service. Portable
  manifests imported by the user remain a separate product-owned distribution
  feature.
- Bundle exports contain local workspace manifests, explicitly imported
  portable-manifest metadata, and read-only managed installation metadata from
  the official service. Managed records win normalized-slug collisions.
