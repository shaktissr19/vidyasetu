# VidyaSetu Content Pipeline

This module is the provider-agnostic intake boundary for video, audio, text,
image/pictorial, PDF, worksheet, question-paper and interactive learning
content. It supports UKG/LKG/Nursery and Classes 1–12 through the canonical
`education_grade_levels` registry.

## Operating rule

Discovery is not permission. The pipeline never scrapes a provider, downloads
an external stream, bypasses a login, or treats a free-to-view page as reusable.
An external item is stored as metadata and remains unverified until a Platform
Admin records the exact item licence, attribution and evidence URL.

Delivery modes are explicit:

- `VIDYASETU_ORIGINAL`: authored/commissioned content uploaded to VidyaSetu.
- `LICENSED_REHOST`: a file uploaded only when the item-level rights permit
  redistribution; non-commercial licences cannot be subscriber-gated.
- `OFFICIAL_EMBED`: the provider's approved player is shown in an iframe; the
  provider still controls login, playback and downstream terms.
- `EXTERNAL_LINK`: the learner opens the official source platform.

## Admin workflow

1. Open **Admin → Learning → Content Pipeline**.
2. Select source, grade(s), board(s), public learning category, media type and
   delivery mode. Categories include Academic, Motivation, Study Skills, Work
   Ethic, Social Responsibility, Life Skills, Well-being, Career Awareness and
   Digital Citizenship. UKG is a grade option; use `COMMON` for cross-board
   content.
3. Upload an owned/licensed file, or enter the exact HTTPS source/embed URL.
4. Stage the item. Staging creates an intake record, asset record and audit
   event; it does not publish anything.
5. Verify the concrete licence, attribution and evidence URL. Then approve the
   intake and choose **Create Content Library draft**.
6. Complete the existing academic, accessibility, safety, language and
   technical quality gates before publishing. AI-generated text remains a
   draft until reviewed.

## Rights handling

Attribution and the source licence must be retained on the canonical resource.
CC BY/CC BY-SA require attribution; CC BY-SA adaptations retain the same
licence; CC BY-ND must not be adapted; CC BY-NC/NC-SA/NC-ND must not be placed
behind a commercial subscription. Unknown or incompatible rights stay
link-only or are rejected. Item-level terms always override a provider's
default policy.

## Deployment order

Apply the reviewed database migration before starting code that exposes the
pipeline:

```bash
cd /var/www/vidyasetu
bash scripts/prepare-registration-release.sh
bash scripts/deploy-main-native.sh
```

The preparation script takes a PostgreSQL custom-format backup, applies
migrations through `051_learning_content_pipeline.sql` idempotently, and
checks the pipeline tables. The native deployment script remains migration-
free, verifies that migration 051 is present, builds an immutable release,
switches PM2 and runs the existing smoke checks.

Large media should live in the configured S3-compatible bucket/CDN; the VPS
should host the API, database, Redis and frontend. The upload URL currently
accepts video/audio/image/PDF files up to the 500 MB recommended limit. HLS
transcoding, malware scanning and CDN cache policy are follow-up hardening
work before a large public video catalogue.
