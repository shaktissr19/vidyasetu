# Content Factory 2.0 — implementation status

This branch completes the governed external-source handoff that was missing from the original Content Factory foundation.

## Implemented in this branch

- Migration 049 for explicit item-level licence verification and audited Source Review → Content Library handoff.
- Source Review API with evidence-ready state and queue counts.
- Explicit Add to Content Library action.
- Canonical Learning resource creation as DRAFT only.
- Board and grade mapping during source handoff.
- Chapter/topic labels for external/cross-board resources.
- Idempotent source-to-resource mapping.
- Platform Admin workflow badges/navigation.
- Source & Licence Review UI with explicit verification and Add to Content Library controls.
- Content Factory UI source-review feedback and queue state.
- End-to-end CI smoke covering authorization, verification, approval, handoff, mappings, idempotence and no auto-publish.

## Still governed by existing Learning workflow

After a source is added to Content Library, normal Learning review remains authoritative:

`DRAFT → SUBMITTED → ACADEMIC_REVIEW → APPROVED → PUBLISHED`

Content Factory does not bypass this lifecycle.

## Production status

This file records code implementation only. Production remains unchanged until this branch is certified, merged to `main`, migration 049 is explicitly applied, and the normal native release is deployed and verified.
