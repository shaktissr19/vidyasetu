# Integrated content workflow — local implementation, 3 October 2026

## Release status

This update is prepared locally against production baseline `2a947be5d2cad0dad7653370ea14fae9a60c41cb`. It has not been committed, pushed, deployed, or applied to production. Migration 052 is required. No learner accounts, provider downloads, uploads or publications were created externally.

The update connects existing tools rather than introducing another content system. It makes an individual resource usable throughout discovery, rights review, Library review and learner delivery. It does **not** supply a complete Nursery–12 curriculum or certify a provider's resources as reusable.

## Administrator workflow

1. Open **Content Factory**, select grade, board, subject/topic and search. LOCAL searches existing published Library resources; DIKSHA has structured discovery. Other existing providers offer reference discovery rather than a guaranteed playable-media import. Finding a web page is not obtaining its media or permission.
2. Stage a candidate and choose **Complete delivery & add to Library**. Existing Source Review bookmarks now open the Pipeline. A manually entered resource or original content can start directly in the Pipeline.
3. Configure the exact resource, curriculum metadata and delivery mode. Choose an approved official player, upload an owned/licensed asset through the existing upload flow, or write original bilingual article content. Discovery alone does not download provider files.
4. For external content, record the actual item-level rights evidence, licence and attribution. Verify rights, then approve intake. Editing staged delivery details invalidates prior verification. Original content must use the original source and licence.
5. **Materialise** creates one canonical Library **DRAFT**. Repeating the operation returns the existing resource. It never publishes automatically. Legacy Factory import routes use the same implementation.
6. In **Library**, preview the learner presentation, complete metadata, pass the existing academic, language, accessibility, safety, copyright and technical quality gates, then approve and publish.
7. PUBLIC resources appear through public Learning. REGISTERED resources require login. SUBSCRIBER resources use existing active individual/school subscription entitlement checks in Student Learning. CLASS_ONLY also requires applicable class scope. School-only publication is blocked until the canonical delivery path supports it.

## Required and optional fields

Requirements differ between staging and publication. Saving an incomplete draft does not make it learner-ready.

| Field | Stage/configure | Before publication |
|---|---|---|
| Source, title, category, media type, delivery mode | Required | Required |
| Grade and board selection | At least one of each | Academic scope must remain valid |
| Visibility and access | Required; consistent values | Policy and entitlement checks |
| Source URL / official embed URL / uploaded storage asset / article body | Required as applicable to delivery | Usable, reviewed delivery |
| English and Hindi titles | Hindi can be completed later | Both required by existing quality gates |
| Subject, topic, difficulty | Can be completed later | Required for new Pipeline academic resources |
| Canonical concept and journey stage | Can be completed later | Required for academic resources |
| English and Hindi summaries | Can be completed later | Both required |
| Article bodies in English and Hindi | Format dependent | Both required for articles |
| Attribution | Required for rights verification/original ownership | Required |
| Concrete licence and exact rights evidence URL | Required for external verification | Required; OTHER is insufficient |
| Chapter, provider item ID, duration, thumbnail, licence URL | Optional metadata | Complete when useful to learners or evidence |
| Transcript and image alt text | Optional input fields | Accessibility reviewer must assess suitability; no automatic caption generation |

Academic difficulty values are EASY, MODERATE and ADVANCED. Non-academic categories include motivation, study skills, life skills, wellbeing, career awareness and digital citizenship. They do not require academic subject/concept mapping. Current publication gates still require bilingual titles and summaries; unrestricted multilingual publication is not implemented.

## Media and delivery

| Format | Implemented route | Important limitation |
|---|---|---|
| Video | MP4/WebM upload; approved official embed | No automatic acquisition, transcoding or adaptive streaming |
| Audio | MP3/M4A/WAV/OGG upload | Transcript metadata, not generated captions |
| Text/chapter | Original bilingual Markdown | Safe constrained renderer; no raw HTML |
| Image | PNG/JPEG/WebP upload | Alt text supported |
| PDF, worksheet, question paper | PDF upload and browser preview | Browser support varies; accessible download fallback |
| Word/document | DOCX/TXT upload | Download supported; no Word-to-PDF conversion or embedded DOCX reader |
| Interactive | Approved official embed | Arbitrary uploaded HTML/ZIP execution is blocked |
| External link | Existing reference delivery | Still leaves VidyaSetu; use only when rights/player availability require it |
| Q&A / practice tests | Existing Practice module, linked from Pipeline | Not a document/video conversion engine; questions and assessments retain their own reviews |

Public, student and admin previews use a shared asset renderer. Official players load only after a learner clicks, to avoid automatic third-party player requests. Preview URLs for private hosted assets expire after five minutes. Real object storage and provider playback remain **Not verified** in this local test environment.

## Rights and provider constraints

Technical player approval and legal permission are separate checks. An HTTPS URL, publicly accessible resource or government source does not establish rights to download, modify, embed or sell it. Do not bypass login, capture protected streams or scrape protected content.

The update rejects link-only rehosting, unspecified external licences, and subscriber use under non-commercial licences. Explicit permission can use PERMISSION_GRANTED with evidence; an administrator must inspect its actual scope, attribution, modification, distribution and commercial-use restrictions. These controls assist review; they do not automatically interpret licence text.

YouTube embeds cannot be sold behind subscription access, including a video labelled CC BY. The policy therefore blocks subscriber-gated YouTube embeds. Use public/registered free embeds, or independently licensed hosted video for paid learning. Official sources: [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies), [embedding guidance](https://support.google.com/youtube/answer/171780?hl=en). Child-directed service designation and provider privacy requirements need review before launch; click-to-load is not a substitute.

PhET's current [licensing page](https://phet.colorado.edu/en/licensing) requires attention to commercial licensing. Do not infer current rights from historical blanket open-content claims. Check individual DIKSHA, NCERT, CBSE and other resource terms before reuse. The approved host list grants no permission.

## Corrections and history

Draft/review resources can be edited from Library back into Pipeline. Each correction records a resource-and-relations snapshot and resets manual quality reviews to PENDING. Published/archived resources cannot be edited through this route. Archive a published resource using the existing Library control, restore it to DRAFT, correct it, re-review and republish. Media/source/delivery identity is immutable in this edit route; replacement assets need a new governed intake.

Snapshots are stored in `learning_resource_revisions`; there is no new revision-history browser or automatic rollback UI. Existing intake/provider identity matching prevents repeated materialisation. Cross-provider perceptual duplicate detection is not implemented.

## Verification evidence

- Backend build and ten real-SQL integration tests passed using embedded PostgreSQL (PGlite), migration 052 and actual service code. Tests cover original early-years drafts, discovery-to-Library flow, import idempotency, malformed uploads/players, rights/subscription rules, DOCX, revision invalidation, academic publication, public/private boundaries and active/revoked student subscriptions.
- Six safe-Markdown tests passed.
- Frontend production build passed, including type checks and generation of 103 routes.
- Shell syntax checks and `git diff --check` passed.
- SQL test storage URLs are mocked. Actual storage permissions, malicious-file scanning, mobile device playback, live official players, production migrations and paid billing are **Not verified**.

## Release and acquisition order

1. Review the code and migration. Test migration 052 against a staging backup through the existing migration process; preflight now requires its three metadata columns. Do not auto-apply it to production during this review.
2. Use a staging Super Admin, ordinary Student, active-subscriber Student and expired/revoked-subscriber Student. If school licences are used, add a licensed-school student and an unlicensed-school student. Verify public access without login, private denial, subscription denial/revocation, class mismatch, real uploads, previews and every publish gate.
3. Validate storage ownership/MIME beyond browser declarations, scan files, confirm signed URL expiry and review child privacy/provider designations. No claim of production safety should rely solely on local tests.
4. Pilot one board, two grades and selected subjects. Populate each topic with reviewed Easy/Moderate/Advanced videos plus supporting original/permissioned text, PDF and questions. Use the existing Coverage module to track actual published coverage; grade selection alone is not coverage.
5. Obtain commercial hosting rights for subscriber video or commission originals. Implement permitted provider API discovery/download adapters only after verifying terms, API credentials, rate limits and item-level provenance. A YouTube native search connector is not included in this update.
6. Add asynchronous acquisition/import jobs, retries and per-item status to the existing Pipeline; never a second disconnected Library. Prioritise malware scanning, caption tracks, document conversion and media processing before bulk ingestion.
7. Expand curriculum coverage, languages and source partnerships after the pilot. Version-history UI, thumbnail generation, bulk imports, learner difficulty filters and cross-provider duplicate detection remain subsequent backlog items.

The correct approach remains one governed Library with multiple acquisition methods. Filling it requires a separate, ongoing editorial and licensing programme; software integration cannot replace that work.
