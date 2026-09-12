# Parent Workflow Acceptance Checklist

The Parent workflow is accepted only when all of the following are true on the exact PR head:

- Parent authentication gate remains role-restricted.
- Linked children load through the existing Parent contract.
- Selected child persists across Parent child-scoped pages and stale selections self-heal.
- Dashboard, Attendance, Fees, Report Card, Performance, Messages, Leave and PTM consume the shared child context.
- Homework is visible to the linked Parent with submission/review state and Teacher feedback, but remains read-only for Parent.
- Competitions/Achievements are visible to the linked Parent with result/rank data.
- Unlinked child access is denied for Parent homework and achievements.
- Existing Learning Support, Leave, PTM, Transport, Documents/Certificates, Notifications, Fees, Results, Messaging and Grievance routes remain mounted.
- Parent production route smoke includes the complete navigation surface.
- Shared contracts, backend and frontend pass TypeScript checks and production builds.
- Dedicated Parent Workflow E2E CI passes on the exact PR head.
- Database-backed Parent/Admin CI is classified separately if GitHub runner package installation fails before application tests.
- Production deployment is performed only through `scripts/deploy-main-native.sh` after merge.
