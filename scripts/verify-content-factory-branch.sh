#!/usr/bin/env bash
set -Eeuo pipefail

# Fast repository-level contract checks. Full compile/database E2E runs in
# .github/workflows/content-factory-2-ci.yml.

test -s database/migrations/049_learning_source_library_handoff.sql
test -s scripts/content-factory-source-library-e2e-smoke.sh
test -s docs/content-factory-source-to-library-handoff.md

grep -q "licence_verified_at" database/migrations/049_learning_source_library_handoff.sql
grep -q "imported_resource_id" database/migrations/049_learning_source_library_handoff.sql
grep -q "addApprovedIntakeToLibrary" backend/src/services/adminContentFactory.service.ts
grep -q "add-to-library" backend/src/routes/adminContentFactory.routes.ts
grep -q "Add to Content Library" 'frontend/src/app/(admin)/admin/learning/intake/page.tsx'
grep -q "CONTENT FACTORY SOURCE -> REVIEW -> CONTENT LIBRARY E2E PASSED" scripts/content-factory-source-library-e2e-smoke.sh

echo "Content Factory branch contracts OK"
