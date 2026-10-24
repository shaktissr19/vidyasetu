# Syllabus Manager: admin and student guide

This workflow stores source PDFs as evidence and creates an editable, versioned syllabus tree. A source PDF upload or import does not by itself publish a syllabus. Only a reviewed and published curriculum version is shown to matching students.

## Admin workflow

Open `/admin/learning/syllabus` as a platform Super Admin. The page has three sections: **Syllabus library**, **Add syllabus**, and **Review & publish**.

### Add a syllabus

- **Official PDF URL:** choose a board source and import a direct PDF URL from an allowed official domain. The service downloads, validates, scans and parses the PDF, then saves a Draft document and outline.
- **Upload PDF files:** upload up to 10 text-based PDFs in one submission, with a 25 MB limit per PDF. The service stores each document and creates a Draft outline where class and subject can be identified. A title override is available for a single-file upload. Add the official source URL before document approval; it is not required just to save a Draft.
- **CSV or Excel:** download the Excel template, prepare rows for a board, academic year and medium, then select the workbook. One workbook can contain multiple classes, subjects, units, chapters and topics. Use **Preview and validate** to see row errors and scope counts before saving the import as Draft.

The PDF parser handles supported text PDFs. Scanned image-only PDFs require OCR and cannot be reliably converted by this workflow. Review all extracted rows; extraction is a starting Draft, not an official certification. If extraction cannot resolve class or subject, correct document metadata and rebuild the Draft from the library record. Unsupported or malformed PDFs should be deleted as incorrect Drafts and re-uploaded in a supported format.

### View and correct an import

In **Syllabus library**, filter by board, class, subject and year, then open a record. The record shows the stored PDF preview, document metadata and extracted tree. Admins can edit title, class, subject, medium and source URL, then rebuild the Draft. The tree supports adding and editing topics, and the library supports deleting an incorrect unapproved Draft. Deletion removes that document's evidence; a topic supported by another source document is retained.

PDFs are private by default. Malware scanning, PDF validation and checksum deduplication run during intake. The document's source URL and rights evidence are checked before approval. Student PDF download is available only after redistribution permission is recorded; otherwise students get the official source link.

### Review and publish

The document review and syllabus publication are separate gates. Approving a PDF records that its evidence was reviewed; it does not publish the curriculum. In **Review & publish**, verify board, academic year, medium, class, subject, unit, chapter, topic and page references against the official source. Add a review note, mark the syllabus **Reviewed**, then publish it. Draft, Reviewed, Published/Active and Archived states are preserved as separate governance steps. Archiving removes the syllabus from student visibility.

Publishing requires an official source URL and a complete human review. The published version becomes available automatically to students matching its board, class, medium and academic year. No per-school assignment is needed. Keep academic years in separate versions; do not overwrite an earlier year's syllabus.

## Student workflow

Students open **My Syllabus** at `/syllabus`. Matching published syllabi are organized by subject, then chapter and topic. Students can open the source document and mark topic progress. They see only the syllabus matching their school or saved learning profile; a different board is never used as a fallback. If no syllabus appears, check that the school/student board, class, medium and current academic year match a published version.

The official PDF is downloadable only when the admin has explicitly verified redistribution rights. Otherwise the student can open the official source URL.

## Automatic sourcing and current limits

The manager can discover/import supported official PDF sources and can extract a Draft from an uploaded or imported PDF. It does **not** crawl every board website or automatically guarantee a complete CBSE, CISCE/ICSE, or state-board catalogue. Official sites publish content with different structures, languages and document formats; the admin must select the correct source and review the generated tree. Scanned PDFs need OCR, which is not included. Coverage is therefore determined by the syllabus versions admins have imported and published, not by the list of boards in the selector.

## Deployment and upload proxy limit

The API accepts up to 10 PDFs at 25 MB each (250 MB of file data). Nginx must permit multipart overhead as well. `scripts/deploy-main-native.sh` installs an idempotent Nginx request-body limit of 260 MB before checking public routes. The helper backs up an existing managed config, validates the complete Nginx configuration, reloads Nginx, and restores the prior config if validation or reload fails. If deployment is performed by another process, run the helper as root before testing large uploads:

```bash
sudo bash scripts/configure-syllabus-upload-nginx.sh
```

Then validate the production flow using one PDF, a multi-PDF batch, and a rejected oversized file. Production-specific storage credentials, OCR needs, source coverage and successful upload through the live proxy still require checks on the deployed server.

## Validation evidence

The repository tests cover parser behavior, upload limits and batch handling, evidence ownership, Draft structure creation, metadata correction, deletion behavior, and existing syllabus/content access rules. A successful local build does not prove the live server's proxy, object-storage credentials or migration state; those must be verified on the deployed release.
