#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
check_file() { [[ -f "$1" ]] || fail "Missing required file: $1"; }
require() { local pattern="$1" file="$2"; grep -Fq "$pattern" "$file" || fail "Missing contract '$pattern' in $file"; }

ROUTES=backend/src/routes/parentWorkflow.routes.ts
SERVICE=backend/src/services/parentWorkflow.service.ts
INDEX=backend/src/index.ts
STORE=frontend/src/store/parentContextStore.ts
HOOK=frontend/src/hooks/useParentChildContext.ts
SWITCHER=frontend/src/components/parent/ParentChildSwitcher.tsx
LAYOUT='frontend/src/app/(parent)/layout.tsx'
DASH='frontend/src/app/(parent)/dashboard/page.tsx'
ATT='frontend/src/app/(parent)/parent/attendance/page.tsx'
FEES='frontend/src/app/(parent)/parent/fees/page.tsx'
REPORT='frontend/src/app/(parent)/parent/report-card/page.tsx'
PERF='frontend/src/app/(parent)/parent/performance/page.tsx'
MESSAGES='frontend/src/app/(parent)/messages/page.tsx'
LEAVE='frontend/src/app/(parent)/parent/leave/page.tsx'
PTM='frontend/src/app/(parent)/parent/ptm/page.tsx'
HOMEWORK='frontend/src/app/(parent)/parent/homework/page.tsx'
ACHIEVEMENTS='frontend/src/app/(parent)/parent/achievements/page.tsx'
PROD_SMOKE=scripts/parent-admin-production-smoke.sh

for file in "$ROUTES" "$SERVICE" "$INDEX" "$STORE" "$HOOK" "$SWITCHER" "$LAYOUT" "$DASH" "$ATT" "$FEES" "$REPORT" "$PERF" "$MESSAGES" "$LEAVE" "$PTM" "$HOMEWORK" "$ACHIEVEMENTS" "$PROD_SMOKE"; do
  check_file "$file"
done

# Backend authorization and child-isolation contract.
require "authorize('PARENT')" "$ROUTES"
require "'/children/:studentId/homework'" "$ROUTES"
require "'/children/:studentId/achievements'" "$ROUTES"
require 'parent_student_links' "$SERVICE"
require "This child is not linked to your Parent account" "$SERVICE"
require 'listChildHomework' "$SERVICE"
require 'listChildAchievements' "$SERVICE"
require 'parentWorkflowRoutes' "$INDEX"

# Parent homework is visibility-only: there must be no Parent submission mutation route.
if grep -Eq "router\.(post|put|patch|delete)\('/children/:studentId/homework" "$ROUTES"; then
  fail 'Parent homework route must remain read-only'
fi

# Shared multi-child context must persist and self-heal against stale links.
require "name: 'vidyasetu-parent-context'" "$STORE"
require 'children.some((child) => child.id === selectedChildId)' "$HOOK"
require 'setSelectedChildId(children[0].id)' "$HOOK"
require 'aria-pressed={active}' "$SWITCHER"

for page in "$DASH" "$ATT" "$FEES" "$REPORT" "$PERF" "$MESSAGES" "$LEAVE" "$PTM" "$HOMEWORK" "$ACHIEVEMENTS"; do
  require 'useParentChildContext' "$page"
done

# Parent navigation and production route smoke must expose the complete workflow.
for route in \
  /parent/homework \
  /parent/achievements \
  /parent/learning-support \
  /parent/ptm \
  /parent/attendance \
  /parent/leave \
  /parent/transport \
  /parent/documents \
  /parent/report-card \
  /parent/fees \
  /parent/notifications \
  /parent/messages \
  /parent/grievances; do
  require "$route" "$LAYOUT"
  require "$route" "$PROD_SMOKE"
done

printf 'Parent workflow contract certification passed.\n'
