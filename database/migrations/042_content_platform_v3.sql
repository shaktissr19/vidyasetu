-- ============================================================
-- 042_content_platform_v3.sql
-- VidyaSetu Content Platform 3.0
-- Completes the canonical Pre-Nursery -> Class 12 content model,
-- establishes English + Hindi publication invariants, adds assessment
-- grade mappings, richer media readiness, and an auditable content
-- production target catalogue.
--
-- Additive/idempotent. Existing published content remains untouched;
-- the new publication trigger applies when content is newly moved to
-- PUBLISHED after this migration.
-- ============================================================

-- Early-years and richer learning need more than ARTICLE/PDF/VIDEO.
ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'STORY';
ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'ACTIVITY';
ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'FLASHCARD';
ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'GAME';
ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'SIMULATION';
ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'PRACTICAL';

DO $$ BEGIN
  CREATE TYPE learning_media_readiness AS ENUM ('NOT_STARTED','SCRIPT_READY','MEDIA_READY','QA_APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

-- Canonical grade names are bilingual because Learning content is bilingual.
ALTER TABLE education_grade_levels
  ADD COLUMN IF NOT EXISTS name_hi VARCHAR(100);

UPDATE education_grade_levels SET name_hi = CASE code
  WHEN 'PRE_NURSERY' THEN 'प्री-नर्सरी'
  WHEN 'NURSERY' THEN 'नर्सरी'
  WHEN 'LKG' THEN 'लोअर किंडरगार्टन (LKG)'
  WHEN 'UKG' THEN 'अपर किंडरगार्टन (UKG)'
  WHEN 'CLASS_1' THEN 'कक्षा 1'
  WHEN 'CLASS_2' THEN 'कक्षा 2'
  WHEN 'CLASS_3' THEN 'कक्षा 3'
  WHEN 'CLASS_4' THEN 'कक्षा 4'
  WHEN 'CLASS_5' THEN 'कक्षा 5'
  WHEN 'CLASS_6' THEN 'कक्षा 6'
  WHEN 'CLASS_7' THEN 'कक्षा 7'
  WHEN 'CLASS_8' THEN 'कक्षा 8'
  WHEN 'CLASS_9' THEN 'कक्षा 9'
  WHEN 'CLASS_10' THEN 'कक्षा 10'
  WHEN 'CLASS_11' THEN 'कक्षा 11'
  WHEN 'CLASS_12' THEN 'कक्षा 12'
  ELSE name_hi
END
WHERE name_hi IS NULL OR BTRIM(name_hi)='';

-- Assessments were the only major Learning entity without the canonical
-- Pre-Nursery -> Class 12 grade mapping introduced by migration 023.
CREATE TABLE IF NOT EXISTS learning_assessment_grades (
  assessment_id UUID NOT NULL REFERENCES learning_assessments(id) ON DELETE CASCADE,
  grade_id      UUID NOT NULL REFERENCES education_grade_levels(id) ON DELETE CASCADE,
  PRIMARY KEY (assessment_id, grade_id)
);
CREATE INDEX IF NOT EXISTS idx_lag_grade
  ON learning_assessment_grades(grade_id, assessment_id);

-- Preserve compatibility with the older numeric class range for Classes 1-12.
INSERT INTO learning_assessment_grades(assessment_id, grade_id)
SELECT la.id, egl.id
FROM learning_assessments la
JOIN education_grade_levels egl
  ON egl.class_number IS NOT NULL
 AND (la.class_min IS NULL OR egl.class_number >= la.class_min)
 AND (la.class_max IS NULL OR egl.class_number <= la.class_max)
WHERE la.class_min IS NOT NULL OR la.class_max IS NOT NULL
ON CONFLICT DO NOTHING;

-- Rich media/accessibility metadata. Drafts may be incomplete; PUBLISHED AV
-- content is required to be bilingual and QA_APPROVED by the publication guard.
ALTER TABLE learning_resources
  ADD COLUMN IF NOT EXISTS media_readiness learning_media_readiness NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS transcript_hi TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_alt TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_alt_hi TEXT;

CREATE INDEX IF NOT EXISTS idx_learning_resources_media_readiness
  ON learning_resources(media_readiness, review_status)
  WHERE resource_type IN ('VIDEO','AUDIO','INTERACTIVE','GAME','SIMULATION','PRACTICAL');

-- Content production denominator. This table records what VidyaSetu intends
-- to cover; actual syllabus/concept truth remains in learning_concepts and
-- board/version mappings. The target list is deliberately extensible so State
-- boards and Senior Secondary electives can be added without schema changes.
CREATE TABLE IF NOT EXISTS learning_content_targets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id          UUID NOT NULL REFERENCES education_grade_levels(id) ON DELETE CASCADE,
  subject_code      VARCHAR(60) NOT NULL,
  subject_name      VARCHAR(180) NOT NULL,
  subject_name_hi   VARCHAR(180) NOT NULL,
  area_type         VARCHAR(20) NOT NULL DEFAULT 'SUBJECT'
                    CHECK (area_type IN ('DOMAIN','SUBJECT','ELECTIVE','SKILL','ENRICHMENT')),
  priority          VARCHAR(16) NOT NULL DEFAULT 'CORE'
                    CHECK (priority IN ('CORE','ELECTIVE','ENRICHMENT')),
  academic_year     VARCHAR(10) NOT NULL DEFAULT '2026-27',
  board_id          UUID REFERENCES education_boards(id) ON DELETE CASCADE,
  target_status     VARCHAR(24) NOT NULL DEFAULT 'PLANNED'
                    CHECK (target_status IN ('PLANNED','REGISTRY_READY','AUTHORING','REVIEW_READY','LEARNER_READY','DEFERRED')),
  expected_concepts INTEGER CHECK (expected_concepts IS NULL OR expected_concepts >= 0),
  source_reference  TEXT,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_content_target_common
  ON learning_content_targets(grade_id, subject_code, academic_year)
  WHERE board_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_content_target_board
  ON learning_content_targets(grade_id, subject_code, academic_year, board_id)
  WHERE board_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_content_targets_grade_status
  ON learning_content_targets(grade_id, target_status, priority, subject_code);
CREATE INDEX IF NOT EXISTS idx_learning_content_targets_board
  ON learning_content_targets(board_id, grade_id, target_status)
  WHERE board_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_learning_content_targets_updated_at ON learning_content_targets;
CREATE TRIGGER trg_learning_content_targets_updated_at
  BEFORE UPDATE ON learning_content_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Baseline cross-board production areas. These are management targets, not a
-- claim that every board uses the same subject structure. Board/version-specific
-- curricula remain separate and may add or omit targets.
WITH target_seed(grade_code,subject_code,subject_name,subject_name_hi,area_type,priority) AS (
  VALUES
  -- Early Years / Foundational: integrated, play-based domains.
  ('PRE_NURSERY','LANGUAGE_FOUNDATIONS','Language & Communication','भाषा और संचार','DOMAIN','CORE'),
  ('PRE_NURSERY','EARLY_NUMERACY','Early Numeracy','प्रारंभिक संख्याज्ञान','DOMAIN','CORE'),
  ('PRE_NURSERY','WORLD_AROUND_US','The World Around Us','हमारे आसपास की दुनिया','DOMAIN','CORE'),
  ('PRE_NURSERY','ART_MUSIC_MOVEMENT','Art, Music & Movement','कला, संगीत और गतिविधि','DOMAIN','CORE'),
  ('PRE_NURSERY','WELLBEING','Health, Habits & Wellbeing','स्वास्थ्य, आदतें और कल्याण','DOMAIN','CORE'),
  ('NURSERY','LANGUAGE_FOUNDATIONS','Language & Communication','भाषा और संचार','DOMAIN','CORE'),
  ('NURSERY','EARLY_NUMERACY','Early Numeracy','प्रारंभिक संख्याज्ञान','DOMAIN','CORE'),
  ('NURSERY','WORLD_AROUND_US','The World Around Us','हमारे आसपास की दुनिया','DOMAIN','CORE'),
  ('NURSERY','ART_MUSIC_MOVEMENT','Art, Music & Movement','कला, संगीत और गतिविधि','DOMAIN','CORE'),
  ('NURSERY','WELLBEING','Health, Habits & Wellbeing','स्वास्थ्य, आदतें और कल्याण','DOMAIN','CORE'),
  ('LKG','ENGLISH_FOUNDATIONS','English Foundations','अंग्रेज़ी की आधारभूत सीख','DOMAIN','CORE'),
  ('LKG','HINDI_FOUNDATIONS','Hindi Foundations','हिंदी की आधारभूत सीख','DOMAIN','CORE'),
  ('LKG','EARLY_NUMERACY','Early Numeracy','प्रारंभिक संख्याज्ञान','DOMAIN','CORE'),
  ('LKG','WORLD_AROUND_US','The World Around Us','हमारे आसपास की दुनिया','DOMAIN','CORE'),
  ('LKG','ART_MUSIC_MOVEMENT','Art, Music & Movement','कला, संगीत और गतिविधि','DOMAIN','CORE'),
  ('LKG','WELLBEING','Health, Habits & Wellbeing','स्वास्थ्य, आदतें और कल्याण','DOMAIN','CORE'),
  ('UKG','ENGLISH_FOUNDATIONS','English Foundations','अंग्रेज़ी की आधारभूत सीख','DOMAIN','CORE'),
  ('UKG','HINDI_FOUNDATIONS','Hindi Foundations','हिंदी की आधारभूत सीख','DOMAIN','CORE'),
  ('UKG','EARLY_NUMERACY','Early Numeracy','प्रारंभिक संख्याज्ञान','DOMAIN','CORE'),
  ('UKG','WORLD_AROUND_US','The World Around Us','हमारे आसपास की दुनिया','DOMAIN','CORE'),
  ('UKG','ART_MUSIC_MOVEMENT','Art, Music & Movement','कला, संगीत और गतिविधि','DOMAIN','CORE'),
  ('UKG','WELLBEING','Health, Habits & Wellbeing','स्वास्थ्य, आदतें और कल्याण','DOMAIN','CORE'),

  -- Foundational/Primary common production areas.
  ('CLASS_1','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_1','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_1','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_1','WORLD_AROUND_US','The World Around Us','हमारे आसपास की दुनिया','SUBJECT','CORE'),('CLASS_1','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_1','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),
  ('CLASS_2','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_2','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_2','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_2','WORLD_AROUND_US','The World Around Us','हमारे आसपास की दुनिया','SUBJECT','CORE'),('CLASS_2','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_2','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),
  ('CLASS_3','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_3','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_3','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_3','EVS','Environmental / World Studies','पर्यावरण और आसपास की दुनिया','SUBJECT','CORE'),('CLASS_3','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_3','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),
  ('CLASS_4','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_4','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_4','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_4','EVS','Environmental / World Studies','पर्यावरण और आसपास की दुनिया','SUBJECT','CORE'),('CLASS_4','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_4','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),
  ('CLASS_5','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_5','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_5','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_5','EVS','Environmental / World Studies','पर्यावरण और आसपास की दुनिया','SUBJECT','CORE'),('CLASS_5','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_5','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),

  -- Middle Stage.
  ('CLASS_6','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_6','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_6','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_6','SCIENCE','Science','विज्ञान','SUBJECT','CORE'),('CLASS_6','SOCIAL_SCIENCE','Social Science','सामाजिक विज्ञान','SUBJECT','CORE'),('CLASS_6','SKILL_EDUCATION','Skill Education','कौशल शिक्षा','SKILL','CORE'),('CLASS_6','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_6','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),
  ('CLASS_7','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_7','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_7','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_7','SCIENCE','Science','विज्ञान','SUBJECT','CORE'),('CLASS_7','SOCIAL_SCIENCE','Social Science','सामाजिक विज्ञान','SUBJECT','CORE'),('CLASS_7','SKILL_EDUCATION','Skill Education','कौशल शिक्षा','SKILL','CORE'),('CLASS_7','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_7','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),
  ('CLASS_8','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_8','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_8','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_8','SCIENCE','Science','विज्ञान','SUBJECT','CORE'),('CLASS_8','SOCIAL_SCIENCE','Social Science','सामाजिक विज्ञान','SUBJECT','CORE'),('CLASS_8','SKILL_EDUCATION','Skill Education','कौशल शिक्षा','SKILL','CORE'),('CLASS_8','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_8','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),

  -- Secondary common core + current cross-board digital/skill areas.
  ('CLASS_9','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_9','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_9','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_9','SCIENCE','Science','विज्ञान','SUBJECT','CORE'),('CLASS_9','SOCIAL_SCIENCE','Social Science','सामाजिक विज्ञान','SUBJECT','CORE'),('CLASS_9','COMPUTATIONAL_THINKING_AI','Computational Thinking & AI','कम्प्यूटेशनल थिंकिंग और एआई','SKILL','CORE'),('CLASS_9','VOCATIONAL_EDUCATION','Vocational / Skill Education','व्यावसायिक और कौशल शिक्षा','SKILL','ELECTIVE'),('CLASS_9','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_9','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),
  ('CLASS_10','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_10','HINDI','Hindi','हिंदी','SUBJECT','CORE'),('CLASS_10','MATHEMATICS','Mathematics','गणित','SUBJECT','CORE'),('CLASS_10','SCIENCE','Science','विज्ञान','SUBJECT','CORE'),('CLASS_10','SOCIAL_SCIENCE','Social Science','सामाजिक विज्ञान','SUBJECT','CORE'),('CLASS_10','COMPUTATIONAL_THINKING_AI','Computational Thinking & AI','कम्प्यूटेशनल थिंकिंग और एआई','SKILL','CORE'),('CLASS_10','VOCATIONAL_EDUCATION','Vocational / Skill Education','व्यावसायिक और कौशल शिक्षा','SKILL','ELECTIVE'),('CLASS_10','ART_EDUCATION','Art Education','कला शिक्षा','ENRICHMENT','ENRICHMENT'),('CLASS_10','PHYSICAL_WELLBEING','Physical Education & Wellbeing','शारीरिक शिक्षा और कल्याण','ENRICHMENT','ENRICHMENT'),

  -- Senior Secondary: platform reference electives. Board mappings may extend.
  ('CLASS_11','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_11','HINDI','Hindi','हिंदी','SUBJECT','ELECTIVE'),('CLASS_11','PHYSICS','Physics','भौतिक विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_11','CHEMISTRY','Chemistry','रसायन विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_11','BIOLOGY','Biology','जीव विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_11','MATHEMATICS','Mathematics','गणित','ELECTIVE','ELECTIVE'),('CLASS_11','APPLIED_MATHEMATICS','Applied Mathematics','अनुप्रयुक्त गणित','ELECTIVE','ELECTIVE'),('CLASS_11','ACCOUNTANCY','Accountancy','लेखाशास्त्र','ELECTIVE','ELECTIVE'),('CLASS_11','BUSINESS_STUDIES','Business Studies','व्यवसाय अध्ययन','ELECTIVE','ELECTIVE'),('CLASS_11','ECONOMICS','Economics','अर्थशास्त्र','ELECTIVE','ELECTIVE'),('CLASS_11','HISTORY','History','इतिहास','ELECTIVE','ELECTIVE'),('CLASS_11','GEOGRAPHY','Geography','भूगोल','ELECTIVE','ELECTIVE'),('CLASS_11','POLITICAL_SCIENCE','Political Science','राजनीति विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_11','SOCIOLOGY','Sociology','समाजशास्त्र','ELECTIVE','ELECTIVE'),('CLASS_11','PSYCHOLOGY','Psychology','मनोविज्ञान','ELECTIVE','ELECTIVE'),('CLASS_11','COMPUTER_SCIENCE','Computer Science','कंप्यूटर विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_11','INFORMATICS_PRACTICES','Informatics Practices','इन्फॉर्मेटिक्स प्रैक्टिसेज','ELECTIVE','ELECTIVE'),('CLASS_11','ENTREPRENEURSHIP','Entrepreneurship','उद्यमिता','ELECTIVE','ELECTIVE'),('CLASS_11','PHYSICAL_EDUCATION','Physical Education','शारीरिक शिक्षा','ELECTIVE','ELECTIVE'),
  ('CLASS_12','ENGLISH','English','अंग्रेज़ी','SUBJECT','CORE'),('CLASS_12','HINDI','Hindi','हिंदी','SUBJECT','ELECTIVE'),('CLASS_12','PHYSICS','Physics','भौतिक विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_12','CHEMISTRY','Chemistry','रसायन विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_12','BIOLOGY','Biology','जीव विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_12','MATHEMATICS','Mathematics','गणित','ELECTIVE','ELECTIVE'),('CLASS_12','APPLIED_MATHEMATICS','Applied Mathematics','अनुप्रयुक्त गणित','ELECTIVE','ELECTIVE'),('CLASS_12','ACCOUNTANCY','Accountancy','लेखाशास्त्र','ELECTIVE','ELECTIVE'),('CLASS_12','BUSINESS_STUDIES','Business Studies','व्यवसाय अध्ययन','ELECTIVE','ELECTIVE'),('CLASS_12','ECONOMICS','Economics','अर्थशास्त्र','ELECTIVE','ELECTIVE'),('CLASS_12','HISTORY','History','इतिहास','ELECTIVE','ELECTIVE'),('CLASS_12','GEOGRAPHY','Geography','भूगोल','ELECTIVE','ELECTIVE'),('CLASS_12','POLITICAL_SCIENCE','Political Science','राजनीति विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_12','SOCIOLOGY','Sociology','समाजशास्त्र','ELECTIVE','ELECTIVE'),('CLASS_12','PSYCHOLOGY','Psychology','मनोविज्ञान','ELECTIVE','ELECTIVE'),('CLASS_12','COMPUTER_SCIENCE','Computer Science','कंप्यूटर विज्ञान','ELECTIVE','ELECTIVE'),('CLASS_12','INFORMATICS_PRACTICES','Informatics Practices','इन्फॉर्मेटिक्स प्रैक्टिसेज','ELECTIVE','ELECTIVE'),('CLASS_12','ENTREPRENEURSHIP','Entrepreneurship','उद्यमिता','ELECTIVE','ELECTIVE'),('CLASS_12','PHYSICAL_EDUCATION','Physical Education','शारीरिक शिक्षा','ELECTIVE','ELECTIVE')
)
INSERT INTO learning_content_targets
  (grade_id,subject_code,subject_name,subject_name_hi,area_type,priority,academic_year,source_reference)
SELECT egl.id,ts.subject_code,ts.subject_name,ts.subject_name_hi,ts.area_type,ts.priority,'2026-27',
       'VidyaSetu cross-board production baseline; verify exact board/version mapping before publication.'
FROM target_seed ts
JOIN education_grade_levels egl ON egl.code=ts.grade_code
ON CONFLICT DO NOTHING;

-- Universal English + Hindi + canonical-grade publication boundary.
CREATE OR REPLACE FUNCTION enforce_learning_resource_v3_publication()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE grade_count INTEGER;
BEGIN
  IF NEW.review_status='PUBLISHED'::learning_review_status
     AND (TG_OP='INSERT' OR OLD.review_status IS DISTINCT FROM NEW.review_status) THEN
    SELECT COUNT(*) INTO grade_count FROM learning_resource_grades WHERE resource_id=NEW.id;
    IF grade_count=0 THEN RAISE EXCEPTION 'Published Learning resources require at least one canonical grade mapping'; END IF;
    IF NULLIF(BTRIM(NEW.title),'') IS NULL OR NULLIF(BTRIM(NEW.title_hi),'') IS NULL THEN RAISE EXCEPTION 'Published Learning resources require English and Hindi titles'; END IF;
    IF NULLIF(BTRIM(NEW.summary),'') IS NULL OR NULLIF(BTRIM(NEW.summary_hi),'') IS NULL THEN RAISE EXCEPTION 'Published Learning resources require English and Hindi summaries'; END IF;
    IF NEW.resource_type='ARTICLE'::learning_resource_type AND (NULLIF(BTRIM(NEW.body_markdown),'') IS NULL OR NULLIF(BTRIM(NEW.body_markdown_hi),'') IS NULL) THEN
      RAISE EXCEPTION 'Published Learning articles require English and Hindi learner content';
    END IF;
    IF NEW.resource_type IN ('VIDEO'::learning_resource_type,'AUDIO'::learning_resource_type)
       AND (NEW.media_readiness <> 'QA_APPROVED'::learning_media_readiness OR NULLIF(BTRIM(NEW.transcript),'') IS NULL OR NULLIF(BTRIM(NEW.transcript_hi),'') IS NULL) THEN
      RAISE EXCEPTION 'Published video/audio requires QA_APPROVED media plus English and Hindi transcripts';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_learning_resource_v3_publication ON learning_resources;
CREATE TRIGGER trg_learning_resource_v3_publication
  BEFORE INSERT OR UPDATE OF review_status ON learning_resources
  FOR EACH ROW EXECUTE FUNCTION enforce_learning_resource_v3_publication();

CREATE OR REPLACE FUNCTION enforce_learning_question_v3_publication()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE grade_count INTEGER;
DECLARE option_count INTEGER;
DECLARE missing_hi INTEGER;
BEGIN
  IF NEW.review_status='PUBLISHED'::learning_review_status
     AND (TG_OP='INSERT' OR OLD.review_status IS DISTINCT FROM NEW.review_status) THEN
    SELECT COUNT(*) INTO grade_count FROM learning_question_grades WHERE question_id=NEW.id;
    IF grade_count=0 THEN RAISE EXCEPTION 'Published Learning questions require at least one canonical grade mapping'; END IF;
    IF NULLIF(BTRIM(NEW.prompt),'') IS NULL OR NULLIF(BTRIM(NEW.prompt_hi),'') IS NULL THEN RAISE EXCEPTION 'Published Learning questions require English and Hindi prompts'; END IF;
    IF NULLIF(BTRIM(NEW.explanation),'') IS NULL OR NULLIF(BTRIM(NEW.explanation_hi),'') IS NULL THEN RAISE EXCEPTION 'Published Learning questions require English and Hindi explanations'; END IF;
    IF NEW.question_type IN ('MCQ_SINGLE'::learning_question_type,'MCQ_MULTIPLE'::learning_question_type,'TRUE_FALSE'::learning_question_type) THEN
      SELECT COUNT(*),COUNT(*) FILTER(WHERE NULLIF(BTRIM(option_text_hi),'') IS NULL)
        INTO option_count,missing_hi FROM learning_question_options WHERE question_id=NEW.id;
      IF option_count < 2 OR missing_hi > 0 THEN RAISE EXCEPTION 'Published objective questions require bilingual answer options'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_learning_question_v3_publication ON learning_questions;
CREATE TRIGGER trg_learning_question_v3_publication
  BEFORE INSERT OR UPDATE OF review_status ON learning_questions
  FOR EACH ROW EXECUTE FUNCTION enforce_learning_question_v3_publication();

CREATE OR REPLACE FUNCTION enforce_learning_assessment_v3_publication()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE grade_count INTEGER;
BEGIN
  IF NEW.review_status='PUBLISHED'::learning_review_status
     AND (TG_OP='INSERT' OR OLD.review_status IS DISTINCT FROM NEW.review_status) THEN
    SELECT COUNT(*) INTO grade_count FROM learning_assessment_grades WHERE assessment_id=NEW.id;
    IF grade_count=0 THEN RAISE EXCEPTION 'Published Learning assessments require at least one canonical grade mapping'; END IF;
    IF NULLIF(BTRIM(NEW.title),'') IS NULL OR NULLIF(BTRIM(NEW.title_hi),'') IS NULL THEN RAISE EXCEPTION 'Published Learning assessments require English and Hindi titles'; END IF;
    IF NULLIF(BTRIM(NEW.summary),'') IS NULL OR NULLIF(BTRIM(NEW.summary_hi),'') IS NULL THEN RAISE EXCEPTION 'Published Learning assessments require English and Hindi summaries'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_learning_assessment_v3_publication ON learning_assessments;
CREATE TRIGGER trg_learning_assessment_v3_publication
  BEFORE INSERT OR UPDATE OF review_status ON learning_assessments
  FOR EACH ROW EXECUTE FUNCTION enforce_learning_assessment_v3_publication();

COMMENT ON TABLE learning_content_targets IS
  'Content-production denominator by canonical grade and curricular area/subject. Syllabus truth remains versioned in the registry and board mappings.';
COMMENT ON TABLE learning_assessment_grades IS
  'Canonical Pre-Nursery through Class 12 grade targeting for Learning assessments.';
COMMENT ON COLUMN education_grade_levels.name_hi IS
  'Hindi display name used by the bilingual Learning catalogue and Content Factory.';
COMMENT ON COLUMN learning_resources.media_readiness IS
  'Editorial media state; scripts/storyboards are not treated as completed media.';

COMMIT;
