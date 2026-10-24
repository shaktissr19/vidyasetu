# Curriculum Framework Manager and official outline fetch

Download `templates/curriculum-framework.csv` and include all classes for one board, medium and academic year in a single import. Each row is one topic. Rows may share a unit and chapter; ordering is explicit.

## CSV columns

- `board_code`, `medium` (`en` or `hi`), `academic_year`, `class_code` (for example `CLASS_10`), `subject_code`
- `unit`, `chapter`, `topic`, optional `topic_hi`
- `learning_outcome`, HTTPS `source_url`, `page_reference`, `sort_order`

Preview validates the complete file against active boards, classes and subjects before saving. Source URLs must use the configured official host list in `SYLLABUS_IMPORT_ALLOWED_HOSTS` (defaults: CBSE Academic, CISCE, UPMSP and NCERT). Imports remain Draft and use the existing syllabus review/publication lifecycle. Existing node UUIDs and student progress are retained. Official PDFs remain in the private syllabus document library and can be attached to a version as evidence only after PDF review approves them and the board, year and medium match.

## Automatic source-assisted import

Framework Manager currently has board-specific source connectors for CBSE, CISCE (ICSE/ISC) and UPMSP. Select a board, academic year and medium; optionally select a class and subject. Leaving either optional scope blank scans the broader official index. Choose one or more PDFs, extract the outline, assign any class/subject the source filename did not reveal, review the hierarchy and page references, then add the candidates to the existing framework preview/import flow. Other boards need an official host and source-page connector configured before their documents can be fetched. The selected academic year is stored with the import but does not transform or validate a board's PDF label; reviewers must confirm that the source session/year and class scope match the framework.

The service fetches HTTPS pages and PDFs only from `SYLLABUS_IMPORT_ALLOWED_HOSTS`. It rejects redirects, private/reserved DNS results, oversized responses and PDFs over 500 pages or 2 MB of extracted text. PDFs without embedded text need OCR and are not silently guessed. SHA-256 hashes from fetched PDFs are combined into the imported framework version's `source_hash`.

Extraction recognizes common unit/part, chapter, numbered topic and bullet patterns. It is a candidate parser, not a guarantee that every board's PDF layout is understood. Each result includes source page references and is labelled for academic review. Automatically extracted learning-outcome fields carry an `[AUTO_EXTRACTED]` marker; they are cleared when a reviewer confirms the outline and moves the version to Reviewed. Learning outcomes are optional for syllabi that publish only topic headings. The reviewer must verify the hierarchy and citations against the official PDF before the existing Draft → Reviewed → Published workflow can release it to students. Content discovery remains a separate step after topic publication.

The source index may be dynamic or use a layout the link scanner does not recognize. In those cases, the admin can open the official source page, copy a direct PDF URL or upload the source document and continue with the current import/review tools. A successful scan or extraction does not certify board coverage; use the Framework coverage matrix to inspect missing class/subject scopes.

Native XLSX upload and in-place tree editing are not provided; the existing template is Excel-compatible CSV. Student enrollment medium is not inferred from the UI language.
