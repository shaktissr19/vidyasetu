# Syllabus publication workflow (migration 055)

The canonical chapter/topic tree remains `curriculum_subjects → curriculum_units → curriculum_topics`, mapped to shared learning concepts. Existing PDF records remain in `syllabus_documents`; this migration adds the selected medium. It does not turn an extracted PDF outline into verified topics.

## Status and versioning
- `publication_status`: Draft → Reviewed → Published → Archived.
- Only a verified, published curriculum is student-visible. Legacy ACTIVE+verified rows are backfilled as Published; every other existing curriculum remains Draft.
- `version_number` preserves prior academic-year versions. At most one Published version exists per board/year/medium.
- Use the exact PDF rights gate already in place: only redistribute when `redistribution_allowed` is true; otherwise link to the official source.

## Progress and visibility
- `student_syllabus_progress` stores only student ID, topic ID, status and timestamp.
- `syllabus_class_coverage` stores class/section/topic and teacher status separately.
- Restricted legacy content requires explicit board/class/subject or school scope. Public content keeps the existing default.

## CSV import template
Use `templates/syllabus-topics.csv`. Resolve board/class/subject to the canonical registries and map imported topics to existing learning concepts before review. Never auto-publish extracted rows.

## Manual QA
1. Platform admin creates/imports a syllabus; it remains Draft and is absent from student results.
2. Reviewer marks it Reviewed; it remains hidden.
3. Platform admin publishes it; only a matching board, class, medium and academic year student sees it.
4. A different board/class student gets no syllabus and receives no content from a guessed restricted content ID.
5. Student and teacher progress statuses are independently stored and rendered.
6. Archive the current version; verify it disappears while older academic-year records and progress remain.
