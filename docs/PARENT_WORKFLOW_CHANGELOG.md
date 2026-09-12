# Parent Workflow Completion Changes

Branch: `feature/parent-workflow-e2e`

- Added governed Parent read-only Homework and Competition/Achievement APIs.
- Added linked-child authorization for the new endpoints.
- Added persisted shared Parent child context and reusable child switcher.
- Wired shared child selection through Dashboard, Attendance, Fees, Report Card, Performance, Messages, Leave and PTM.
- Added Homework and Competitions/Achievements Parent pages and navigation.
- Expanded production Parent route smoke coverage.
- Added Parent workflow contract certification and dedicated CI.
- Added runtime linked-child/isolation smoke for disposable environments.

No production database migration is introduced by this completion layer.
