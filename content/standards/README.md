# VidyaSetu Content Foundation — P0 Standard

This directory defines the minimum production standard for VidyaSetu academic content. It exists to prevent the platform from becoming a collection of unrelated PDFs, videos and quizzes.

## Core content hierarchy

Every academic item must map to:

`Stage → Class → Subject → Unit/Chapter → Concept → Micro-concept → Learning Pack`

A concept is the stable learning identity. English, Hindi, video, audio, practicals, worksheets and assessments are variants/assets attached to that concept rather than separate courses.

## Required learning journey

Every important concept must support the VidyaSetu sequence:

1. **SEE / देखो** — curiosity hook or familiar situation.
2. **UNDERSTAND / समझो** — learner-friendly concept explanation.
3. **DO / करके सीखो** — practical, visual, worked or observation activity appropriate to the subject.
4. **PRACTISE / अभ्यास करो** — progressive practice with explanations.
5. **APPLY / जीवन से जोड़ो** — real-world or unfamiliar application.
6. **REVISE / दोहराओ** — compact revision resource.

## P0 minimum learning pack

An important concept is not content-complete until it has, at minimum:

- bilingual learning outcomes (English + Hindi),
- English learner lesson,
- Hindi learner lesson,
- a concept-video production specification,
- one practical/visual/worked-learning activity,
- at least 10 bilingual questions,
- answer reasoning for every question,
- explicit common misconceptions,
- at least one application task,
- revision notes or revision-audio specification,
- curriculum/board metadata,
- accessibility requirements,
- academic, language, safety and copyright QA gates.

Final media binaries may be produced after the academic pack is approved, but the pack must declare them and remain DRAFT until the required publication assets exist.

## Language model

The concept is language-independent. English and Hindi are first-class learning experiences tied to the same concept ID and progression state.

Hindi must be academically correct but learner-friendly. Important academic terminology should generally be introduced bilingually on first use, for example `Pressure — दाब`, `Force — बल`, `Numerator — अंश`.

The controlled glossary in `glossary-en-hi.json` is the source of truth for repeated terminology. Machine translation may assist authoring, but no translated academic content may be auto-published without human language and subject review.

## Indian schooling / board model

VidyaSetu uses a **common concept core + board mapping** strategy. The academically common concept should be authored once, then mapped to CBSE and state-board locations, terminology, depth and assessment patterns where relevant.

Do not duplicate the same science or mathematics concept into separate libraries simply because boards place it in different chapters.

Pilot packs use board code `COMMON` until board-specific mapping has been academically verified.

## Subject-specific pedagogy

Use `subject-pedagogy-templates.md`; Science, Mathematics, Social Science and Languages must not be forced into the same teaching template.

## Quality and completeness

Use `content-quality-standard.md` and `coverage-matrix.json`.

Coverage is measured by concepts fully supported, not by raw asset count. “10,000 videos” is not a quality metric.

## Publication rule

Repository-authored packs begin as `DRAFT`. Import/install scripts may only stage DRAFT content. Publication remains an explicit Learning Studio workflow after academic, language, accessibility, safety, copyright and media readiness checks.
