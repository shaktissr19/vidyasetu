# Parent Workflow E2E completion

This branch completes the Parent workflow against the existing VidyaSetu School, Teacher and Student foundations.

Certified scope:
- Multi-child switching and linked-child authorization boundaries
- Child dashboard/story and performance visibility
- Attendance and report card visibility
- Homework status, marks and teacher feedback visibility
- Fees/payment/receipt visibility through the existing Parent fee contract
- Leave and school calendar
- Teacher messaging and notifications
- PTM options/bookings
- Documents and certificate requests
- Transport and safety visibility
- Competitions and achievements visibility
- Learning insights, Learning Support and interventions
- Grievances
- Cross-child data isolation and role-impersonation rejection
- Dedicated E2E and APT-independent build/contract CI

The added Parent Homework and Competitions/Achievements APIs are read-only and require the authenticated Parent to be linked to the requested student through `parent_student_links`.

No production database migration, seed, Nginx rewrite, Docker change or PM2 topology change is introduced by this completion work.
