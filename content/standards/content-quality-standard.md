# VidyaSetu Content Quality & Completeness Standard

This standard converts “content-rich” into measurable coverage and quality rather than raw upload counts.

## P0 publication gates

A concept cannot be published unless all mandatory gates pass:

1. **Academic accuracy** — subject expert confirms concepts, worked solutions and explanations.
2. **Age appropriateness** — reading level, examples and cognitive load fit the target class.
3. **English quality** — clear, grammatically sound and learner-friendly.
4. **Hindi quality** — accurate, natural and consistent with the controlled glossary.
5. **Learning outcome alignment** — every major asset serves a declared outcome.
6. **Practice quality** — at least 10 bilingual questions with answer reasoning.
7. **Misconception coverage** — major predictable errors are explicitly corrected.
8. **Application** — at least one unfamiliar/real-life transfer task.
9. **Accessibility** — transcript/captions planned for AV; text alternatives for meaningful visuals; readable structure.
10. **Safety** — practical risk classification and supervision note where needed.
11. **Copyright/licensing** — source and licence metadata verified for every non-original asset.
12. **Technical readiness** — media playable, links valid, no missing required asset.

## Content completeness score

Each concept receives a 100-point completeness score. This is a production-planning metric, not a student score.

| Area | Weight | P0 completion rule |
|---|---:|---|
| Concept structure + learning outcomes | 10 | hierarchy + bilingual outcomes present |
| English learner lesson | 10 | complete and reviewed |
| Hindi learner lesson | 10 | complete and reviewed |
| Concept video | 10 | final media available; script alone = partial |
| Practical/visual/worked learning | 10 | final usable activity/media available |
| Practice bank | 15 | ≥10 bilingual questions with explanations |
| Misconceptions | 5 | ≥2 major misconceptions addressed |
| Application task | 5 | ≥1 transfer/real-life task |
| Revision resource | 5 | notes and/or final revision audio |
| Metadata + board mapping | 5 | class/subject/concept/board/source metadata |
| Accessibility | 5 | applicable captions/transcript/alt-text checks |
| QA approvals | 10 | academic + language + safety/copyright as applicable |

### Score states

- **0–49 — RED / Incomplete**: authoring still underway.
- **50–74 — AMBER / Learning draft**: substantial content exists but not publication-ready.
- **75–89 — BLUE / Review ready**: core learning journey exists; final assets/approvals may remain.
- **90–100 — GREEN / Publish ready**: all applicable P0 gates pass.

A score ≥90 does not override a failed mandatory gate.

## Coverage dashboard metrics

The platform should eventually report, per class/subject/unit:

- total concepts,
- concepts with English,
- concepts with Hindi,
- concept-video coverage,
- practical/visual coverage,
- practice-bank coverage,
- mastery coverage,
- accessibility coverage,
- SME-approved coverage,
- fully complete concepts,
- board mappings verified.

## Question quality

Every question must contain:
- stable public code,
- concept/topic mapping,
- skill/difficulty metadata,
- English prompt,
- Hindi prompt,
- correct answer,
- English explanation,
- Hindi explanation,
- marks and no negative marking for normal learning practice.

Difficulty progression is **FOUNDATION → STANDARD → ADVANCED/CHALLENGE**. A pack should not be composed only of recall questions.

## Media readiness

A script/storyboard is an authoring asset, not a completed video/audio asset. Coverage must distinguish:

- `NOT_STARTED`
- `SCRIPT_READY`
- `MEDIA_READY`
- `QA_APPROVED`

This prevents the platform from reporting media as complete when only a script exists.
