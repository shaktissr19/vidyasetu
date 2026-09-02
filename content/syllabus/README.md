# VidyaSetu Standard Syllabus Registry

The syllabus registry is the academic backbone of VidyaSetu. It is intentionally separate from learner content.

## Core hierarchy

`Stage → Class → Curricular Area / Subject → Unit / Chapter → Topic → Concept → Micro-concept`

Every stable syllabus node receives a VidyaSetu code. Learning resources map to one or more syllabus nodes instead of becoming the syllabus themselves.

## Separation of responsibilities

### Standard syllabus

Stores:

- class and stage,
- subject/curricular area,
- chapter/unit structure,
- VidyaSetu topic/concept decomposition,
- learning-outcome mappings,
- academic-session version,
- reference-board/textbook mappings,
- source and verification metadata.

### Learning content

May include:

- articles,
- videos,
- audio,
- practical demonstrations,
- simulations,
- worksheets,
- questions,
- assessments,
- revision resources,
- teacher resources,
- licensed/OER resources.

Many learning resources may teach the same syllabus concept. A resource may also support more than one concept.

### Public Learn

Public learning content is not required to map to a school syllabus. Public items such as study skills, motivation, work ethics, social responsibility, digital literacy, career awareness and general learning can remain `curriculumMapping = NONE`.

Academic public content may still map to syllabus nodes so a public lesson can later contribute to a signed-in learner's structured journey.

## Board strategy

VidyaSetu owns a board-independent standard concept layer. NCERT/CBSE is the first reference implementation for the Middle Stage.

Board mappings are separate records and may specify:

- academic year/version,
- chapter placement,
- terminology,
- expected depth,
- additional/omitted concepts,
- assessment style.

Do not duplicate a concept merely because two boards place it in different chapters.

## Language strategy

Language slots are configurable. `R1`, `R2` and `R3` are not hard-coded to English/Hindi/Sanskrit globally. Reference books can be indexed while the student's/school's actual language choices remain configuration data.

## Versioning

Never mutate an old academic-session registry into a new syllabus. Create a new version and preserve historical mappings.

## Class-by-class rollout

Middle Stage rollout order:

1. Class 6 — current reference implementation
2. Class 7
3. Class 8

Mass content generation should begin only after the relevant class syllabus index is sufficiently verified and the target concepts have stable IDs.
