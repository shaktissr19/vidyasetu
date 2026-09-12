#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
check() { grep -Fq "$2" "$1" || fail "$1 is missing contract: $2"; }

check backend/src/routes/admin.routes.ts "router.use(authorize('SUPER_ADMIN'))"
check backend/src/routes/admin.routes.ts "router.get('/audit', ctrl.getAuditLog)"
check backend/src/routes/admin.routes.ts "validate(supportUpdateSchema)"
check backend/src/routes/admin.routes.ts "validate(configBodySchema)"
check backend/src/routes/admin.routes.ts "validate(configSchema)"

check backend/src/services/admin.service.ts "Super Admin accounts cannot be suspended"
check backend/src/services/admin.service.ts "export async function updateSupportTicket"
check backend/src/services/admin.service.ts "export async function listAuditLog"
check backend/src/services/admin.service.ts "SUPPORT_"
check backend/src/services/admin.service.ts "CONFIG_UPDATE"
check backend/src/services/admin.service.ts "old_value, new_value"

check frontend/src/services/adminService.ts "export const getAuditLog"
check frontend/src/services/adminService.ts '/admin/config/${encodeURIComponent(key)}'
check frontend/src/app/'(admin)'/layout.tsx "/admin/audit"
check frontend/src/app/'(admin)'/admin/page.tsx "redirect('/admin/analytics')"
check frontend/src/app/'(admin)'/audit/page.tsx "Audit Trail"
check frontend/src/app/'(admin)'/audit/page.tsx "BEFORE"
check frontend/src/app/'(admin)'/audit/page.tsx "AFTER"
check frontend/src/app/'(admin)'/support/page.tsx "Start Work"
check frontend/src/app/'(admin)'/support/page.tsx "Close Ticket"
check frontend/src/app/'(admin)'/support/page.tsx "Reopen"
check frontend/src/app/'(admin)'/settings/page.tsx "Configuration safety"
check scripts/parent-admin-production-smoke.sh "/admin/audit"

bash -n scripts/parent-admin-production-smoke.sh

printf '\nAdmin workflow contract certification passed.\n'
