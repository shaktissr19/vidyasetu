# Content Factory 2.0 E2E completion — PR summary

## What this change completes

This change closes the operational gap between external source discovery and the canonical Learning Content Library.

### Source governance

- Adds explicit item-level licence verification evidence (`licence_verified_at`, `licence_verified_by`).
- Prevents approval/import of item-review sources until a Platform Admin has explicitly verified a concrete licence outcome.
- Keeps required attribution mandatory.
- Keeps `EXTERNAL_LINK_ONLY` as a safe link/reference outcome without silently copying remote content.

### Source → Learning handoff

- Adds audited handoff fields to `learning_source_intake`.
- Adds Add to Content Library API/UI.
- Creates exactly one canonical Learning resource in DRAFT.
- Preserves source/licence/attribution metadata.
- Maps class to canonical grade and selected board.
- Preserves subject, chapter and topic context.
- Enforces public/private access policy consistency.
- Makes repeated handoff idempotent.

### Admin workflow

- Content Factory shows source-review state and queue counts.
- Source & Licence Review shows verification readiness and explicit Add to Content Library controls.
- Admin sidebar shows pending workflow indicators.

### Certification

The updated Content Factory CI compiles backend/frontend, applies migrations through 049 twice for idempotence and runs a dedicated source-review → Content Library E2E smoke.

No content is auto-published. Existing canonical Learning review states remain authoritative.
