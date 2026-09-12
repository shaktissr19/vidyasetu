# Parent Workflow E2E Release Notes

This branch completes Parent-side integration on top of the existing Parent, School, Teacher and Student foundations.

The key behavioral change is a single persisted selected-child context across the Parent journey. Parents also gain governed read-only Homework and Competition/Achievement visibility for linked children. New read endpoints validate `parent_student_links` before returning child data.

The release adds focused contract certification and strict production-build CI. Existing database-backed Parent/Admin E2E remains unchanged and continues to provide behavioral coverage when GitHub runner package installation is available.

No production migration, development seed or infrastructure rewrite is required for this release.
