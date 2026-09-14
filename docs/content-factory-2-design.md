# VidyaSetu Content Factory 2.0

Status: foundation implementation branch

## Product goal

Platform Admin should be able to choose a learner context (class, board, subject, chapter/topic), find or supply trustworthy source material, validate whether the material can be used, generate/curate a complete learning pack, review it, and publish through the existing audited Learning workflow.

The Student runtime remains canonical: authenticated students receive content allowed for their active grade/board and entitlement; Public Learning remains independently available for resources explicitly published as PUBLIC.

## Admin workflow

1. Curriculum context
   - Class 1–12
   - Board (COMMON or a mapped board)
   - Subject
   - Chapter/unit when mapped
   - Topic/concept when mapped
   - Free topic fallback when the curriculum registry is incomplete
2. Source discovery
   - VidyaSetu governed catalogue
   - DIKSHA live metadata connector
   - Official reference connectors: NROER, CBSE, NCERT/ePathshala, NIOS, SWAYAM, PhET, OER Commons
   - Exact HTTPS external URL supplied by Admin
   - Future: governed document upload and additional stable APIs
3. Source validation
   - source/domain identity
   - licence candidate and evidence
   - attribution
   - adaptation rights
   - commercial/subscriber rights
   - curriculum relevance
   - language/grade fit
   - duplicate detection
   - academic validation
4. Content creation
   - Learn: original lesson/article
   - Watch: governed external video or future VidyaSetu original micro-video
   - Listen: future TTS/audio pipeline
   - Explore: governed interactive or future generated interactive
   - Practice: questions
   - Revise: notes/flashcards
   - Assess: mastery assessment
   - Worksheet: future generated/downloadable worksheet
5. Review and publication
   - DRAFT -> SUBMITTED -> ACADEMIC_REVIEW -> APPROVED -> PUBLISHED
   - AI output never bypasses governance
   - source review and academic review remain distinct

## Content pack model

Migration 048 adds `learning_content_packs` and `learning_content_pack_items`.

A pack is a curriculum/topic container; it does not replace canonical resources/questions/assessments. Pack items point to those canonical governed objects with one of these roles:

- LEARN
- WATCH
- LISTEN
- EXPLORE
- PRACTICE
- REVISE
- ASSESS
- WORKSHEET

This lets the Student UI present one coherent lesson experience while retaining existing resource-level governance, licences, access requirements and review status.

## Curriculum strategy

The platform already has two related structures:

- board curriculum registry (`curriculum_versions`, `curriculum_subjects`, `curriculum_units`, `curriculum_topics`)
- canonical mastery concepts (`learning_concepts`)

Content Factory should use the board curriculum registry for navigation and map to `learning_concepts` when a canonical mastery concept exists. It must not block source discovery when a grade has no concepts yet. A free-topic fallback is therefore required until curriculum ingestion is complete.

Curriculum ingestion is a separate governed workstream. We should not fabricate chapter/topic mappings. Official board/curriculum metadata should be imported and reviewed.

## External URL policy

Migration 048 adds `EXTERNAL_WEB` as a governed source type.

Admin may paste an HTTPS URL. The foundation does not scrape or copy arbitrary pages. It stages the item to Source & Licence Review as `EXTERNAL_LINK_ONLY` unless explicit evidence says otherwise.

Future metadata extraction must include SSRF protections, redirect checks, content-size/time limits, immutable source snapshots/hashes, licence evidence extraction and human confirmation.

## Source connector policy

Connector modes remain explicit:

- LOCAL_CATALOGUE: item-level VidyaSetu results
- LIVE_API: stable structured remote connector such as DIKSHA
- REFERENCE_SEARCH: opens an official search/source when a stable supported API is not available

The UI must show per-provider status and result count so zero results are distinguishable from connector failure.

## AI and media generation

Current AI Creator produces text/question/assessment packs and is deliberately blocked in safe/mock mode from academic approval.

Pending media pipelines:

### Audio/TTS

approved lesson -> narration script -> TTS -> audio file -> transcript/captions -> AUDIO Learning resource -> review

### Original micro-video

validated lesson -> script -> storyboard -> images/diagrams -> narration -> captions -> renderer -> MP4 -> VIDEO Learning resource -> review

### Interactive

validated concept -> constrained interactive specification -> safe renderer/runtime -> accessibility checks -> INTERACTIVE Learning resource -> review

None of these pipelines should auto-publish.

## Delivery rules

Student Learning continues to enforce:

- active student enrolment
- grade/class applicability
- board applicability where configured
- visibility
- PUBLIC / REGISTERED / SUBSCRIBER access requirement

Public Learning continues to expose only PUBLIC + PUBLISHED resources.

## Implementation phases

### Phase A — foundation (this branch)

- Content Factory workspace
- board/class/subject/topic context with curriculum fallback
- source-search diagnostics
- arbitrary HTTPS source staging
- canonical content-pack schema
- existing Creator job handoff

### Phase B — curriculum registry completion

- governed curriculum import format
- board/class/subject/unit/topic coverage dashboard
- mapping from curriculum topics to canonical mastery concepts
- import validation and audit

### Phase C — source validation automation

- metadata extraction for approved external domains/URLs
- licence/attribution evidence assistance
- curriculum relevance score
- duplicate detection
- academic/safety validation report

### Phase D — production AI text creator

- configure production AI provider
- structured grounded generation
- citations and validation
- bilingual quality review

### Phase E — multimodal creator

- TTS/audio
- original micro-video
- worksheets/flashcards
- governed interactive assets
- media validation and accessibility

### Phase F — pack-first Student experience

- Student catalogue renders content packs
- Learn/Watch/Listen/Explore/Practice/Revise/Assess tabs
- progress and mastery at pack/concept level
- existing grade/board/entitlement enforcement retained
