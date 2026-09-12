# Parent Workflow E2E

This release completes the Parent journey by composing the existing certified Parent, School, Teacher and Student capabilities rather than rebuilding them.

## Parent capabilities

- Persisted multi-child switching across Dashboard, Attendance, Fees, Report Card, Performance, Messages, Leave and PTM.
- Read-only Homework visibility with assignment, submission, review, marks and Teacher feedback.
- Read-only Competition/Achievement visibility with score, percentage, percentile and School/overall rank.
- Existing Learning Support, PTM, Leave, Transport, Documents/Certificates, Notifications, Fees, Results, Messaging and Grievance workflows remain in place.
- Homework and achievement visibility is authorized by `parent_student_links`; an unlinked child is rejected.
- Parent homework is intentionally visibility-only. Submission remains a Student action.

## Certification

- `scripts/parent-workflow-contract-smoke.sh` protects route authorization, linked-child isolation, read-only semantics, shared child context, navigation and production smoke coverage.
- `scripts/parent-workflow-e2e-smoke.sh` provides a runtime API isolation check for disposable E2E environments.
- `.github/workflows/parent-workflow-e2e-ci.yml` runs the contract check plus strict shared/backend/frontend TypeScript production builds without depending on OS package installation.
- Existing Parent/Admin E2E CI remains available for database-backed behavioral certification when GitHub runner package infrastructure is healthy.

## Production

Production deployment must continue through `scripts/deploy-main-native.sh`. No Parent-specific production migration or seed is required by this completion layer.
