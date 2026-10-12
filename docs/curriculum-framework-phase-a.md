# Curriculum Framework bulk import (Phase A)

Download `templates/curriculum-framework.csv` and include all classes for one board, medium and academic year in a single import. Each row is one topic. Rows may share a unit and chapter; ordering is explicit.

## Columns

- `board_code`, `medium` (`en` or `hi`), `academic_year`, `class_code` (for example `CLASS_10`), `subject_code`
- `unit`, `chapter`, `topic`, optional `topic_hi`
- `learning_outcome`, HTTPS `source_url`, `page_reference`, `sort_order`

Preview validates the complete file against active boards, classes and subjects before saving. Imports remain Draft and use the existing syllabus review/publication lifecycle. Existing node UUIDs and student progress are retained. `curriculum_versions.source_hash` stores a SHA-256 digest of the imported rows. Official PDFs remain in the private syllabus document library and can be attached to a version as evidence.

This additive migration keeps old syllabus records. Existing curriculum units are treated as their legacy chapter and are backfilled into `curriculum_chapters`; no old topic IDs are replaced.
