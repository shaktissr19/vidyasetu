# Curriculum Framework bulk import (Phase A)

Download `templates/curriculum-framework.csv` and include all classes for one board, medium and academic year in a single import. Each row is one topic. Rows may share a unit and chapter; ordering is explicit.

## Columns

- `board_code`, `medium` (`en` or `hi`), `academic_year`, `class_code` (for example `CLASS_10`), `subject_code`
- `unit`, `chapter`, `topic`, optional `topic_hi`
- `learning_outcome`, HTTPS `source_url`, `page_reference`, `sort_order`

Preview validates the complete file against active boards, classes and subjects before saving. Source URLs must use the configured official host list in `SYLLABUS_IMPORT_ALLOWED_HOSTS` (defaults: CBSE Academic, CISCE, UPMSP and NCERT). Imports remain Draft and use the existing syllabus review/publication lifecycle. Existing node UUIDs and student progress are retained. `curriculum_versions.source_hash` stores a SHA-256 digest of the imported rows. Official PDFs remain in the private syllabus document library and can be attached to a version as evidence only after PDF review approves them and the board, year and medium match. The download is not made public by attaching evidence.

This additive migration keeps old syllabus records. Existing curriculum units are treated as their legacy chapter and are backfilled into `curriculum_chapters`; no old topic IDs are replaced.
\n\nThe Framework Manager's current import and coverage view is Phase A. It previews the unit/chapter/topic tree; existing Syllabus Manager controls remain available for individual topic edits and lifecycle actions. Native XLSX upload and direct in-place tree editing are not part of this first phase; the template is Excel-compatible CSV. Student enrollment medium is not inferred from the UI language in this phase.\n