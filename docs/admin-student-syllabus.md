# Admin and student syllabus workspace

The implementation extends the existing curriculum versions, subjects, units and topics. It adds an explicit verification gate, connections to canonical learning concepts, and independent-student learning preferences. It does not certify legacy curriculum rows or populate a full official K–12 syllabus.

## Admin workflow

Open `/admin/learning/syllabus` as Super Admin. Select a board and academic year, and name the precise scope (for example, Class 6 Mathematics). Prepare topic rows with canonical grade and subject, chapter/developmental domain, topic, learning outcome, exact HTTPS evidence and page/section reference. Hindi topic names are optional. Manual entry avoids UUID typing; advanced bulk JSON supports up to 500 rows with server validation. PDF extraction and automatic provider fetching are not implemented here.

Saving creates or updates a DRAFT. Omitted rows are not deleted. While the version is DRAFT, topics can be retired or restored with a review note; historical progress is retained. Re-import matching chapter/topic names updates their metadata. Review all entered topics against the official source and applicable year, record a review note, then approve the version. ACTIVE plus verification is required for student visibility; legacy ACTIVE alone is insufficient. Partial scope is explicitly shown by the version title; approved topic counts must not be described as a complete board syllabus.

Choose **Find content for this topic** to prefill Factory grade, board, subject, chapter, topic, academic year and canonical concept. The context follows structured discovery into Prepare & rights. Content then follows existing licence, academic and publication reviews. Alternatively, select an academic Library draft in this workspace and map it to a topic: grade, subject and board must match. Mapping requires a DRAFT resource, snapshots the previous state and invalidates prior quality reviews. Published resources must first return to draft in Library.

Resources mapped to unverified syllabus concepts are not publish-ready. Returning a syllabus to DRAFT or ARCHIVED hides it from students and prevents new publication against its unverified mapping. Previously published resources remain governed by Library; archiving a syllabus is not an automatic content withdrawal.

## Student workflow

Open `/syllabus`, linked from Student Learning Home and My Subjects. Independent students can save board, learning class, academic year and English/Hindi preference. These are learning preferences, not changes to school enrolment. Canonical learner delivery uses independent preferences as well, preventing mismatched syllabus/content scopes. School-linked students retain school-assigned board/class; attempts to override these are rejected on the server. School corrections use existing school enrolment workflows.

Only the matching ACTIVE, verified version is shown. Missing/unverified syllabus has an explicit empty state and no completion percentage. Topics without published material remain visible as Content coming soon and remain in the coverage denominator.

Topic resources use the existing publication, board/grade and visibility boundaries. Subscriber items show a lock without asset URLs; the existing resource endpoint independently enforces active entitlement. School-only content is not introduced into this path. Hindi topic/resource titles use existing translations where available and fall back to English; this is not complete multilingual UI localisation.

Coverage counts published mapped resources. Learning completion counts completed accessible lessons; the UI says exactly that and does not assert complete understanding. Mastery requires existing concept assessment evidence (`MASTERED` plus at least one mastery attempt). Watching a lesson cannot create mastery. Assessment/question creation remains in the existing Question Bank and diagnostic tools; this release does not create new assessments or automatically map unrelated old questions.

New academic years have distinct concepts and do not automatically inherit mastery. Changing an outcome creates a new concept connection; old progress and resources remain attached to the historical concept, requiring fresh content mapping and assessment evidence. Draft/archive actions retain learner progress. Audit entries retain import and status history; automatic syllabus diff/rollback and automatic mastery transfer are not provided.

## Deployment

Migration `053_verified_syllabus_workspace.sql` is required after 052. It is idempotent and additive, widens curriculum grade labels for Pre-Nursery, and deliberately does not set verification timestamps on legacy versions. The existing backup-first preparation script includes 053, and native production schema preflight checks the new tables/verification column before service switch.

For the existing native installation, from its clean main checkout:

```bash
git pull --ff-only origin main
sudo bash scripts/prepare-registration-release.sh
sudo bash scripts/deploy-main-native.sh
```

The preparation script creates and validates a pre-migration database backup. Production migration/deployment are separate from GitHub merge. Production roles, exact official syllabus inventory and device playback are not verified by local tests.

Validation: 20 integration tests pass locally, including real JWT endpoint checks and compiled-server environment bootstrap ordering. Frontend production build and backend compilation pass. Validation includes real database migration idempotency, draft/approval/archive visibility, school profile restrictions, changed outcome and academic-year isolation, gaps, subscriber resource locks, completion versus mastery, real JWT role checks and invalid HTTP input. Existing content regressions and production frontend/backend builds must pass before merge.
