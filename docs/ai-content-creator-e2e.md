# VidyaSetu Hybrid AI Content Creator — E2E Contract

The Content Creator is an Admin-only authoring and research workflow integrated with the canonical Learning Platform.

## End-to-end flow

1. **Discover** — Admin searches the governed VidyaSetu catalogue or DIKSHA metadata.
2. **Govern sources** — External candidates are staged into OER Intake. Item-level licence and required attribution must be verified before approval.
3. **Create** — Admin chooses From Curriculum, From Sources, or Improve Existing, language, boards, pack content, and Learning destination.
4. **Destination**
   - **Private Learning**: REGISTERED / CLASS_ONLY / SCHOOL_ONLY with Registered Free or Subscriber access.
   - **Public Learning**: PUBLIC visibility + PUBLIC access.
5. **Generate** — OpenAI/Gemini creates the bilingual structured pack from governed context. Arbitrary URLs are not silently scraped.
6. **Validate** — deterministic checks cover lesson completeness, bilingual requirements, practice volume, citations and source rights.
7. **Human review** — AI output cannot proceed without explicit Admin approval.
8. **Materialise** — approved output becomes ordinary canonical Learning Studio DRAFT resource/questions/assessment.
9. **Submit to Learning** — Admin explicitly sends the materialised pack to Private or Public Learning review; canonical entities move DRAFT → SUBMITTED atomically.
10. **Normal Learning governance** — Learning Studio continues SUBMITTED → ACADEMIC_REVIEW → APPROVED → PUBLISHED. The Creator never skips this workflow and never auto-publishes.

## Source governance

- Local approved/published VidyaSetu resources are already governed candidates.
- DIKSHA discovery is metadata-only and does not establish reuse rights.
- Sources with item-level licence checks cannot be APPROVED/IMPORTED without a verified non-OTHER licence.
- Sources requiring attribution cannot be APPROVED/IMPORTED without attribution evidence.
- Subscriber outputs cannot use non-commercial grounding sources.
- EXTERNAL_LINK_ONLY sources cannot be adapted as grounding evidence.

## Production migrations

The feature requires both additive migrations, applied in order:

1. `045_learning_ai_content_creator.sql`
2. `046_learning_creator_source_discovery.sql`

The native deploy script intentionally does not run database migrations or seeds.
