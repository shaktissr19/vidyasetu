# School Management Release Gate

Branch: `school-management-e2e`

User-facing product label: **School**. Internally this module may be described as School Management / School ERP.

## Functional gate

- School Admin authentication and profile
- Dashboard with real current-year data
- Enrollment requests and approved official roster
- Direct Student admission and bulk import
- Student detail/edit and Parent linking
- Class and section lifecycle
- First-class Teacher accounts and assignments
- Teacher authentication and permission boundaries
- Attendance roster, existing marks, summary and Parent absence notifications
- Fee structures, invoice generation, payments, receipt numbers, reminders and export
- Timetable authoring with Teacher conflict protection
- School Tests, questions, Student attempt/scoring and result drill-down/export
- Announcements to Students, Parents and Teachers with optional class targeting
- School Profile and Setup readiness workflow
- Canonical `/school/*` navigation with no placeholder actions

## Release gate

1. PostgreSQL migrations 014-017 apply successfully and 017 is idempotent.
2. Backend dependency install and JS syntax checks pass.
3. `scripts/school-e2e-smoke.sh` passes against a disposable native PostgreSQL/Redis stack.
4. Database invariants after E2E pass.
5. Next.js production build succeeds.
6. Every canonical School route responds successfully under `next start`.
7. `scripts/school-production-smoke.sh` remains read-only.
8. `scripts/deploy-main-native.sh` takes a DB backup before migrations and never deletes Docker volumes.
9. Only after all gates are green may this branch be merged to `main` and deployed.
