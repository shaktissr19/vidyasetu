# VidyaSetu Content Factory — Governed Source-to-Library Handoff

This document defines the certified Content Factory path for external learning sources.

## Canonical workflow

1. **Discover or add a source** in Content Factory / Source Library.
2. **Stage the selected external item** into Source & Licence Review.
3. A Platform Admin records **item-level licence and attribution evidence**.
4. The source progresses through `LICENCE_REVIEW` and `CONTENT_REVIEW` to `APPROVED`.
5. An approved source is explicitly **added to Content Library** with Class, Board, Subject, Chapter/Topic, Language and audience policy.
6. The handoff creates exactly one canonical `learning_resources` row in `DRAFT` review state.
7. The existing Content Library review states remain authoritative for subsequent submission, academic review, approval and publication.

No source discovery, licence review, source approval, or Source-to-Library handoff publishes learner-facing content automatically.

## Governance rules

- Sources that require item-level licence review cannot be approved or imported unless `licence_verified_at` is populated by an explicit Platform Admin verification action.
- Required attribution must be present before approval/import.
- `OTHER` is not treated as verified reuse evidence.
- `EXTERNAL_LINK_ONLY` is a valid verified outcome when VidyaSetu only links to the original resource and does not copy/adapt it.
- Repeated Add-to-Library requests are idempotent and return the original canonical Learning resource.
- Public Learning requires `visibility=PUBLIC` and `access_requirement=PUBLIC`.
- Private learner content may use `CLASS_ONLY` / `REGISTERED` or `SUBSCRIBER` access.

## Audit fields introduced by migration 049

`learning_source_intake`:
- `licence_verified_at`
- `licence_verified_by`
- `imported_resource_id`
- `imported_at`
- `imported_by`

`learning_resources`:
- `chapter_label`

The handoff also preserves source URL, source record, licence, attribution, media metadata where available, class/grade mapping, board mapping and subject/topic context.

## E2E certification

`scripts/content-factory-source-library-e2e-smoke.sh` proves:

- SUPER_ADMIN authorization boundary.
- Unverified external items cannot be approved.
- Explicit licence verification is persisted.
- Verified items can be approved.
- Approved items can be converted to exactly one canonical DRAFT Learning resource.
- Class/grade and board mappings are created.
- No handoff auto-publishes content.
- Repeated handoff is idempotent.
- Queue counters reflect Source Review and Content Library work.
- Public/private access policy mismatches are rejected.
