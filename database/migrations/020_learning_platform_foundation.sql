-- ============================================================
-- 020_learning_platform_foundation.sql
-- VidyaSetu Learning Platform Phase 1
-- Cross-board curriculum registry, source/licence governance,
-- public learning resources and original life-skills content.
-- Additive/idempotent. Does not reset or delete existing data.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE learning_board_type AS ENUM ('COMMON','NATIONAL','STATE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_source_kind AS ENUM (
    'VIDYASETU_ORIGINAL','NROER','SCHOOL','TEACHER','OTHER_OER','EXTERNAL_OFFICIAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_license_code AS ENUM (
    'VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND',
    'PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_visibility AS ENUM ('PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_category AS ENUM (
    'ACADEMIC','MOTIVATION','STUDY_SKILLS','WORK_ETHIC','SOCIAL_RESPONSIBILITY',
    'LIFE_SKILLS','WELLBEING','CAREER_AWARENESS','DIGITAL_CITIZENSHIP'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_resource_type AS ENUM (
    'ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUIZ','QUESTION_PAPER',
    'INTERACTIVE','EXTERNAL_LINK'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_review_status AS ENUM (
    'DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS education_boards (
  id            UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(30)         NOT NULL UNIQUE,
  name          VARCHAR(180)        NOT NULL,
  short_name    VARCHAR(60),
  board_type    learning_board_type NOT NULL,
  state         VARCHAR(100),
  authority     VARCHAR(220),
  website       TEXT,
  is_active     BOOLEAN             NOT NULL DEFAULT TRUE,
  sort_order    SMALLINT            NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_education_boards_updated_at
  BEFORE UPDATE ON education_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO education_boards (id, code, name, short_name, board_type, state, authority, sort_order) VALUES
  ('82000000-0000-0000-0000-000000000001','COMMON','Cross-board / Common Learning','Common','COMMON',NULL,'VidyaSetu cross-board catalogue',1),
  ('82000000-0000-0000-0000-000000000002','CBSE','Central Board of Secondary Education','CBSE','NATIONAL',NULL,'Central Board of Secondary Education',2),
  ('82000000-0000-0000-0000-000000000003','CISCE','Council for the Indian School Certificate Examinations','CISCE','NATIONAL',NULL,'Council for the Indian School Certificate Examinations',3),
  ('82000000-0000-0000-0000-000000000004','NIOS','National Institute of Open Schooling','NIOS','NATIONAL',NULL,'National Institute of Open Schooling',4),
  ('82000000-0000-0000-0000-000000000005','UPMSP','Uttar Pradesh Madhyamik Shiksha Parishad','UP Board','STATE','Uttar Pradesh','Uttar Pradesh Madhyamik Shiksha Parishad',10),
  ('82000000-0000-0000-0000-000000000006','RBSE','Board of Secondary Education Rajasthan','RBSE','STATE','Rajasthan','Board of Secondary Education Rajasthan',11),
  ('82000000-0000-0000-0000-000000000007','MPBSE','Madhya Pradesh Board of Secondary Education','MPBSE','STATE','Madhya Pradesh','Madhya Pradesh Board of Secondary Education',12),
  ('82000000-0000-0000-0000-000000000008','BSEB','Bihar School Examination Board','BSEB','STATE','Bihar','Bihar School Examination Board',13),
  ('82000000-0000-0000-0000-000000000009','MSBSHSE','Maharashtra State Board of Secondary and Higher Secondary Education','Maharashtra Board','STATE','Maharashtra','MSBSHSE',14),
  ('82000000-0000-0000-0000-000000000010','KSEAB','Karnataka School Examination and Assessment Board','Karnataka Board','STATE','Karnataka','KSEAB',15),
  ('82000000-0000-0000-0000-000000000011','TNBSE','Tamil Nadu State Board','Tamil Nadu Board','STATE','Tamil Nadu','Directorate of Government Examinations / State Board',16),
  ('82000000-0000-0000-0000-000000000012','WBBSE','West Bengal Board of Secondary Education','WBBSE','STATE','West Bengal','West Bengal Board of Secondary Education',17),
  ('82000000-0000-0000-0000-000000000013','PSEB','Punjab School Education Board','PSEB','STATE','Punjab','Punjab School Education Board',18),
  ('82000000-0000-0000-0000-000000000014','GSEB','Gujarat Secondary and Higher Secondary Education Board','GSEB','STATE','Gujarat','GSEB',19),
  ('82000000-0000-0000-0000-000000000015','HBSE','Board of School Education Haryana','HBSE','STATE','Haryana','Board of School Education Haryana',20),
  ('82000000-0000-0000-0000-000000000016','JAC','Jharkhand Academic Council','JAC','STATE','Jharkhand','Jharkhand Academic Council',21),
  ('82000000-0000-0000-0000-000000000099','OTHER_STATE','Other State / Regional Board','Other Board','OTHER',NULL,'Configured by VidyaSetu Platform Admin',99)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES education_boards(id);
CREATE INDEX IF NOT EXISTS idx_schools_board_id ON schools(board_id);

CREATE TABLE IF NOT EXISTS curriculum_versions (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id       UUID        NOT NULL REFERENCES education_boards(id) ON DELETE CASCADE,
  academic_year  VARCHAR(10) NOT NULL,
  title          VARCHAR(180) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  effective_from DATE,
  effective_to   DATE,
  source_url     TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, academic_year)
);

CREATE OR REPLACE TRIGGER trg_curriculum_versions_updated_at
  BEFORE UPDATE ON curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS curriculum_subjects (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_version_id UUID        NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  subject_id            UUID        REFERENCES subjects(id),
  class_name            VARCHAR(10) NOT NULL,
  display_name          VARCHAR(150) NOT NULL,
  display_name_hi       VARCHAR(150),
  subject_code          VARCHAR(30),
  sort_order            SMALLINT    NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_version_id, class_name, display_name)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_subjects_class
  ON curriculum_subjects(curriculum_version_id, class_name, sort_order);

CREATE TABLE IF NOT EXISTS curriculum_units (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_subject_id UUID        NOT NULL REFERENCES curriculum_subjects(id) ON DELETE CASCADE,
  unit_number           VARCHAR(30),
  title                 VARCHAR(220) NOT NULL,
  title_hi              VARCHAR(220),
  description           TEXT,
  sort_order            SMALLINT    NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_subject_id, title)
);

CREATE TABLE IF NOT EXISTS curriculum_topics (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_unit_id UUID      NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
  topic_number     VARCHAR(30),
  title            VARCHAR(220) NOT NULL,
  title_hi         VARCHAR(220),
  learning_outcome TEXT,
  competency_tags  TEXT[]      NOT NULL DEFAULT '{}',
  sort_order       SMALLINT    NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_unit_id, title)
);

CREATE TABLE IF NOT EXISTS learning_content_sources (
  id                          UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                        VARCHAR(40)          NOT NULL UNIQUE,
  name                        VARCHAR(180)         NOT NULL,
  source_kind                 learning_source_kind NOT NULL,
  homepage_url                TEXT,
  default_license             learning_license_code NOT NULL,
  attribution_required        BOOLEAN              NOT NULL DEFAULT TRUE,
  allow_rehosting_default     BOOLEAN              NOT NULL DEFAULT FALSE,
  allow_adaptation_default    BOOLEAN              NOT NULL DEFAULT FALSE,
  requires_item_license_check BOOLEAN              NOT NULL DEFAULT TRUE,
  notes                       TEXT,
  is_active                   BOOLEAN              NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_learning_sources_updated_at
  BEFORE UPDATE ON learning_content_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO learning_content_sources
  (id, code, name, source_kind, homepage_url, default_license, attribution_required,
   allow_rehosting_default, allow_adaptation_default, requires_item_license_check, notes)
VALUES
  ('83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL','VidyaSetu Original','VIDYASETU_ORIGINAL','https://vidyasetu.sbs','VIDYASETU_ORIGINAL',FALSE,TRUE,TRUE,FALSE,
   'Original educational and life-skills content authored/reviewed for VidyaSetu.'),
  ('83000000-0000-0000-0000-000000000002','NROER','National Repository of Open Educational Resources','NROER','https://nroer.gov.in','CC_BY_SA',TRUE,FALSE,FALSE,TRUE,
   'Import or adapt only after verifying the individual resource licence and storing required attribution. Rehosting is off by default.'),
  ('83000000-0000-0000-0000-000000000003','EXTERNAL_OFFICIAL','Official external education resource','EXTERNAL_OFFICIAL',NULL,'EXTERNAL_LINK_ONLY',TRUE,FALSE,FALSE,TRUE,
   'For official resources that VidyaSetu should link to rather than copy/rehost.'),
  ('83000000-0000-0000-0000-000000000004','SCHOOL_CREATED','School-created resource','SCHOOL',NULL,'VIDYASETU_ORIGINAL',TRUE,TRUE,TRUE,FALSE,
   'School-created resource. School-only by default unless submitted and approved for wider publication.'),
  ('83000000-0000-0000-0000-000000000005','TEACHER_CREATED','Teacher-created resource','TEACHER',NULL,'VIDYASETU_ORIGINAL',TRUE,TRUE,TRUE,FALSE,
   'Teacher-created resource. School-only by default unless submitted and approved for wider publication.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS learning_resources (
  id                  UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_slug         VARCHAR(180)           UNIQUE,
  title               VARCHAR(300)           NOT NULL,
  title_hi            VARCHAR(300),
  summary             TEXT,
  summary_hi          TEXT,
  body_markdown       TEXT,
  body_markdown_hi    TEXT,
  resource_type       learning_resource_type NOT NULL,
  category            learning_category      NOT NULL DEFAULT 'ACADEMIC',
  visibility          learning_visibility    NOT NULL DEFAULT 'REGISTERED',
  review_status       learning_review_status NOT NULL DEFAULT 'DRAFT',
  language            VARCHAR(5)              NOT NULL DEFAULT 'en',
  class_min           SMALLINT                CHECK (class_min BETWEEN 1 AND 12),
  class_max           SMALLINT                CHECK (class_max BETWEEN 1 AND 12),
  subject_id          UUID                    REFERENCES subjects(id),
  curriculum_topic_id UUID                    REFERENCES curriculum_topics(id) ON DELETE SET NULL,
  source_id           UUID                    NOT NULL REFERENCES learning_content_sources(id),
  source_url          TEXT,
  source_item_id      VARCHAR(180),
  licence             learning_license_code   NOT NULL,
  licence_url         TEXT,
  attribution_text    TEXT,
  external_url        TEXT,
  file_key            TEXT,
  thumbnail_url       TEXT,
  duration_secs       INTEGER,
  is_offline_ready    BOOLEAN                 NOT NULL DEFAULT FALSE,
  is_featured_public  BOOLEAN                 NOT NULL DEFAULT FALSE,
  sort_order          SMALLINT                NOT NULL DEFAULT 0,
  created_by          UUID                    REFERENCES users(id),
  reviewed_by         UUID                    REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  CHECK (class_min IS NULL OR class_max IS NULL OR class_min <= class_max),
  CHECK (resource_type <> 'EXTERNAL_LINK' OR external_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lr_public
  ON learning_resources(visibility, review_status, is_featured_public, sort_order)
  WHERE visibility='PUBLIC' AND review_status='PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_lr_category ON learning_resources(category, review_status);
CREATE INDEX IF NOT EXISTS idx_lr_class_range ON learning_resources(class_min, class_max);
CREATE INDEX IF NOT EXISTS idx_lr_source ON learning_resources(source_id);
CREATE INDEX IF NOT EXISTS idx_lr_subject ON learning_resources(subject_id);

CREATE OR REPLACE TRIGGER trg_learning_resources_updated_at
  BEFORE UPDATE ON learning_resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS learning_resource_boards (
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  board_id    UUID NOT NULL REFERENCES education_boards(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, board_id)
);

CREATE TABLE IF NOT EXISTS learning_resource_curricula (
  resource_id          UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  curriculum_version_id UUID NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, curriculum_version_id)
);

CREATE TABLE IF NOT EXISTS learning_resource_reviews (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id    UUID        NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  reviewer_id    UUID        REFERENCES users(id),
  from_status    learning_review_status,
  to_status      learning_review_status NOT NULL,
  review_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lrr_resource ON learning_resource_reviews(resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student_learning_bookmarks (
  student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  resource_id UUID        NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, resource_id)
);

-- ------------------------------------------------------------
-- VidyaSetu Original: public motivation / life-skills starter set
-- These are original platform-authored resources. They intentionally
-- do not depend on a school board and can be read without login.
-- ------------------------------------------------------------
INSERT INTO learning_resources
  (id, public_slug, title, title_hi, summary, summary_hi, body_markdown,
   resource_type, category, visibility, review_status, language,
   class_min, class_max, source_id, licence, is_featured_public, sort_order, published_at)
VALUES
  ('84000000-0000-0000-0000-000000000001','progress-not-perfection',
   'Progress, Not Perfection','पूर्णता नहीं, प्रगति',
   'A practical reminder that steady effort matters more than getting everything right on the first try.',
   'हर बार बिल्कुल सही होना जरूरी नहीं है; लगातार आगे बढ़ना अधिक महत्वपूर्ण है।',
   '## One small step still counts\nBig goals can make us feel that we must improve everything at once. Real progress usually looks smaller: reading ten pages, solving five questions, asking one doubt, or trying again after a mistake.\n\n## Compare with your yesterday\nA useful question is not “Am I better than everyone?” It is “What can I do a little better than yesterday?” This keeps attention on effort, learning and habits that are under your control.\n\n## When you get stuck\nPause. Name the problem. Break it into the smallest next action. Ask for help when you need it. Then continue. Confidence often comes after action, not before it.\n\n## Today\nChoose one task that matters. Work on it for twenty focused minutes. Finish the session by writing the next step for tomorrow.',
   'ARTICLE','MOTIVATION','PUBLIC','PUBLISHED','en',6,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',TRUE,1,NOW()),

  ('84000000-0000-0000-0000-000000000002','focus-before-motivation',
   'Focus Before Motivation','प्रेरणा से पहले एकाग्रता',
   'Simple study habits for beginning important work even on days when you do not feel motivated.',
   'ऐसे दिनों के लिए सरल अध्ययन आदतें जब पढ़ने का मन कम हो।',
   '## Motivation changes; routines stay\nYou will not feel equally motivated every day. A dependable learner builds a small routine that works even on ordinary days.\n\n## Make starting easy\nKeep the book, notebook and pen ready. Put the phone away for a short study block. Decide the exact task before you begin: “I will solve questions 1–5,” not “I will study maths.”\n\n## Use focused blocks\nStudy with full attention for 20–30 minutes, take a short break, then continue. During the block, write distracting thoughts on a scrap page instead of following them.\n\n## End with evidence\nAt the end, record what you completed and what comes next. Visible progress is one of the best sources of future motivation.',
   'ARTICLE','STUDY_SKILLS','PUBLIC','PUBLISHED','en',6,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',TRUE,2,NOW()),

  ('84000000-0000-0000-0000-000000000003','work-ethic-show-up-and-finish',
   'Work Ethic: Show Up and Finish','कार्य नैतिकता: शुरुआत करें और पूरा करें',
   'Why reliability, preparation, honesty and finishing responsibilities matter in school and later life.',
   'विद्यालय और जीवन में जिम्मेदारी, तैयारी, ईमानदारी और काम पूरा करने का महत्व।',
   '## Work ethic is a habit\nWork ethic is not about being busy all the time. It means taking responsibility seriously, preparing well, using time honestly and doing the work you agreed to do.\n\n## Reliability builds trust\nWhen classmates, teachers or family members can depend on you, trust grows. Arriving prepared, meeting a deadline and admitting when something went wrong are small actions with long-term value.\n\n## Quality without excuses\nDo the best work possible with the time and resources available. If you need help, ask early. If you make a mistake, correct it rather than hiding it.\n\n## Practice today\nPick one responsibility you have been postponing. Define what “finished” means and complete it before starting another optional task.',
   'ARTICLE','WORK_ETHIC','PUBLIC','PUBLISHED','en',8,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',TRUE,3,NOW()),

  ('84000000-0000-0000-0000-000000000004','social-responsibility-start-near-you',
   'Social Responsibility Starts Near You','सामाजिक जिम्मेदारी आपके आसपास से शुरू होती है',
   'Everyday ways students can make classrooms, homes, neighbourhoods and online spaces better for others.',
   'छात्र अपने घर, कक्षा, समुदाय और ऑनलाइन दुनिया को बेहतर बनाने में कैसे योगदान दे सकते हैं।',
   '## Responsibility is participation\nA community improves when people notice what needs care and contribute instead of assuming someone else will do it.\n\n## Start close to home\nKeep shared spaces clean. Save water and electricity. Help a younger learner. Respect queues and public property. Include someone who is being left out. Small responsible actions are real civic behaviour.\n\n## Think before sharing\nOnline responsibility matters too. Do not forward rumours, humiliating pictures or unverified claims. Disagree without abusing people. Report harmful behaviour to a trusted adult or the appropriate platform channel.\n\n## One useful action\nChoose one problem you can influence this week and take a practical step with others rather than only complaining about it.',
   'ARTICLE','SOCIAL_RESPONSIBILITY','PUBLIC','PUBLISHED','en',6,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',TRUE,4,NOW()),

  ('84000000-0000-0000-0000-000000000005','mistakes-are-feedback',
   'Mistakes Are Feedback','गलतियाँ सीखने का संकेत हैं',
   'A learning method for turning wrong answers and setbacks into information for the next attempt.',
   'गलत उत्तर और असफल प्रयास अगली कोशिश को बेहतर बनाने की जानकारी देते हैं।',
   '## A wrong answer contains information\nWhen an answer is wrong, the useful question is “Why?” Maybe the concept is unclear, a step was skipped, the question was misread, or practice was insufficient. Each cause needs a different response.\n\n## Build an error notebook\nFor important subjects, keep a short record: the question, your mistake, the correct idea and one similar question to retry later. This converts frustration into revision material.\n\n## Separate result from identity\n“I answered this incorrectly” is accurate. “I am bad at this” is not useful evidence. Skills change with practice, feedback and good instruction.\n\n## Retry deliberately\nDo not immediately copy the solution. Understand the missing step, close the solution, and solve the problem again yourself.',
   'ARTICLE','LIFE_SKILLS','PUBLIC','PUBLISHED','en',6,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',FALSE,5,NOW()),

  ('84000000-0000-0000-0000-000000000006','digital-citizenship-think-before-you-post',
   'Digital Citizenship: Think Before You Post','डिजिटल नागरिकता: पोस्ट करने से पहले सोचें',
   'A short guide to privacy, respectful communication, misinformation and responsible use of digital tools.',
   'गोपनीयता, सम्मानजनक संवाद, गलत सूचना और डिजिटल साधनों के जिम्मेदार उपयोग की संक्षिप्त मार्गदर्शिका।',
   '## Your digital actions have real consequences\nMessages, photos and comments can travel much further than expected. Before posting, ask whether the content is true, necessary, respectful and safe for everyone involved.\n\n## Protect private information\nDo not publicly share passwords, OTPs, home addresses, private school records or someone else’s personal information. Ask a trusted adult when a request feels suspicious.\n\n## Verify before forwarding\nA confident-looking message can still be false. Check the original source, date and context before sharing it.\n\n## Use technology to build\nDigital tools are most valuable when they help you learn, create, solve problems and collaborate responsibly—not when they control all of your attention.',
   'ARTICLE','DIGITAL_CITIZENSHIP','PUBLIC','PUBLISHED','en',6,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',FALSE,6,NOW()),

  ('84000000-0000-0000-0000-000000000007','rest-is-part-of-learning',
   'Rest Is Part of Learning','आराम भी सीखने का हिस्सा है',
   'A balanced approach to study, sleep, movement and recovery so effort can remain sustainable.',
   'पढ़ाई, नींद, गतिविधि और आराम के बीच संतुलन बनाए रखने की सरल समझ।',
   '## Sustainable effort beats exhaustion\nLong hours do not automatically produce good learning. Attention and memory fall when the body and mind are exhausted.\n\n## Protect the basics\nRegular sleep, meals, hydration, movement and short breaks support concentration. A realistic study plan should leave room for these basics instead of treating them as wasted time.\n\n## Notice overload early\nIf you are repeatedly unable to concentrate, becoming unusually irritable or feeling overwhelmed by school pressure, talk to a parent, teacher, counsellor or another trusted adult.\n\n## Plan recovery\nAfter a demanding study block, step away briefly, move, drink water and return with a clear next task.',
   'ARTICLE','WELLBEING','PUBLIC','PUBLISHED','en',6,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',FALSE,7,NOW()),

  ('84000000-0000-0000-0000-000000000008','career-curiosity-before-career-pressure',
   'Career Curiosity Before Career Pressure','करियर के दबाव से पहले जिज्ञासा',
   'Explore strengths, interests and real-world work before feeling forced to choose one permanent career too early.',
   'बहुत जल्दी अंतिम करियर चुनने के दबाव से पहले अपनी रुचियों और क्षमताओं को समझें।',
   '## You are allowed to explore\nSchool years are a time to discover what kinds of problems, subjects and activities hold your attention. You do not need to have your entire future decided immediately.\n\n## Look for patterns\nNotice what you enjoy learning, what others ask your help with, what work gives you energy and what skills you are willing to practise repeatedly.\n\n## Learn about real work\nA career title tells only part of the story. Read about typical tasks, required education, working conditions and different pathways. Speak with trustworthy adults who actually do the work when possible.\n\n## Build transferable skills\nCommunication, reasoning, digital literacy, reliability, teamwork and the ability to learn are useful across many careers. Developing them keeps more doors open.',
   'ARTICLE','CAREER_AWARENESS','PUBLIC','PUBLISHED','en',8,12,
   '83000000-0000-0000-0000-000000000001','VIDYASETU_ORIGINAL',FALSE,8,NOW())
ON CONFLICT (public_slug) DO NOTHING;

-- Cross-board public resources apply to the COMMON board catalogue.
INSERT INTO learning_resource_boards (resource_id, board_id)
SELECT lr.id, '82000000-0000-0000-0000-000000000001'::uuid
FROM learning_resources lr
WHERE lr.source_id='83000000-0000-0000-0000-000000000001'::uuid
  AND lr.visibility='PUBLIC'
ON CONFLICT DO NOTHING;

INSERT INTO platform_config (key, value, description) VALUES
  ('PUBLIC_LEARNING_ENABLED','true','Enable the public VidyaSetu Learning Library'),
  ('NROER_IMPORT_ENABLED','false','NROER ingestion remains disabled until each resource licence/attribution is verified'),
  ('LEARNING_DEFAULT_VISIBILITY','REGISTERED','Default visibility for newly created academic learning resources')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE education_boards IS 'Extensible national/state/other board registry. Content is not limited to CBSE.';
COMMENT ON TABLE curriculum_versions IS 'Board-specific curriculum versions by academic year.';
COMMENT ON TABLE learning_content_sources IS 'Source and licence policy registry. NROER resources require item-level licence verification before import/adaptation.';
COMMENT ON TABLE learning_resources IS 'Canonical cross-board public/registered learning and growth library resources.';
COMMENT ON COLUMN learning_resources.visibility IS 'PUBLIC is discoverable without login; REGISTERED/CLASS_ONLY/SCHOOL_ONLY require authenticated delivery policies.';
COMMENT ON COLUMN learning_resources.licence IS 'Per-resource licence is mandatory; never infer reuse rights from the source name alone.';

COMMIT;
