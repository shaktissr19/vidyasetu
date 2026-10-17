# Curriculum-backed learning assets (Phases B–D)

This layer extends the existing Curriculum Framework Manager and the existing Content Library workflow. It does not replace their Draft → Submitted → Academic Review → Approved → Published states.

## Workflow

1. Publish a reviewed curriculum framework in **Admin → Syllabus**.
2. Stage media through **Admin → Learning Pipeline**. Rights must be verified before approval.
3. Map a staged Library asset to a published topic in **Admin → Topic Assets**, individually or with a CSV. Mappings validate topic medium plus the resource board, class and subject.
4. Assign a subject reviewer. Assigned teachers review the five checklist gates in **School → Learning Reviews**. Reviewers can mark PASS, FAIL, or Not Applicable.
5. Move the resource through the existing Library workflow. Assets only show to students after the resource is Published, rights are Verified, and the asset is not taken down.
6. Students see topic formats and status under **My Syllabus**. Student self-progress and teacher class coverage are separate; parent views show syllabus progress.

## Mapping CSV

Use `database/templates/asset-topic-mapping.csv`. The filename must match exactly one uploaded asset's original filename. Each topic ID is the permanent UUID shown by framework tooling/export. Import runs in preview mode first; commit is all-or-nothing when all rows validate.

- `medium`: `en` or `hi`
- `visibility`: `PUBLIC`, `CLASS_RESTRICTED`, or `SCHOOL_PRIVATE`
- `schoolId`: required only for `SCHOOL_PRIVATE`

## Deploy schema

Run the explicit backup-and-migration preparation from the repository root on the server, then use the existing application deploy script:

```bash
sudo bash scripts/prepare-registration-release.sh
sudo bash scripts/deploy-main-native.sh
```

The preparation script backs up the database, applies missing migrations 051–058 in order, then verifies the framework and asset governance schema. Migrations 057 and 058 have matching `.down.sql` rollback files; review and back up before a rollback.

## Manual QA

- [ ] Platform admin can see coverage heatmap and upload media through the existing pipeline.
- [ ] Mapping preview rejects unknown/ambiguous filenames, draft/retired topics, wrong medium, board, class, or subject; commit writes no rows when any row fails.
- [ ] Asset with unverified rights cannot enter Academic Review. A rights-verified asset still cannot enter until all five gates are PASS or Not Applicable.
- [ ] Assigned reviewer can save checklist answers; an unassigned teacher cannot.
- [ ] Existing Content Library controls still govern submission, approval and publication.
- [ ] A Published, rights-verified, active mapping appears on the matching student's topic page with format/source/reviewer badges.
- [ ] A Class 7 student cannot fetch a Class 8 restricted resource by guessing its resource ID; covered by the PGlite integration test.
- [ ] Takedown removes mapped content from student discovery and direct fetch; restore returns it only if the existing publication and rights checks still pass.
- [ ] Student progress and teacher class coverage remain independent; check student, parent, and teacher percentages.
- [ ] Audio marked offline-ready can be saved and reopened from the device cache; usage events increment topic analytics without storing student identity.

## Media delivery boundary

The application serves existing object-storage assets through the current signed-URL path and supports audio/video playback plus offline caching for resources already marked offline-ready. This repository does not include a video transcoding worker, HLS packaging job, CDN provisioning, or caption-generation service. HLS multi-bitrate output and generated audio-only renditions require that media infrastructure to be provisioned and configured; the app must not claim those renditions exist until the worker writes and validates them.
