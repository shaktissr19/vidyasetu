-- Homepage editorial content is independently managed from learning content.
-- Platform operators are distinct from the single VidyaSetu owner account.
BEGIN;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';

-- Enforce the one-owner ceiling even if a future API path misses its guard.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN') > 1 THEN
    RAISE EXCEPTION 'Migration 062 requires at most one SUPER_ADMIN account; resolve duplicate owners before retrying.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_super_admin
  ON users(role) WHERE role = 'SUPER_ADMIN';

CREATE TABLE IF NOT EXISTS public_homepage_content (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  published_content JSONB NOT NULL,
  draft_content JSONB,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

COMMENT ON TABLE public_homepage_content IS
  'Owner-managed public Home editorial sections and platform introduction video metadata; learning resources remain in the governed learning library.';

INSERT INTO public_homepage_content(singleton, published_content)
VALUES (TRUE, '{
  "hero":{"eyebrow":"INDIA’S CONNECTED EDUCATION ECOSYSTEM","title":"One platform for learning, schools and families.","description":"VidyaSetu connects students, schools, teachers and parents on one trusted platform to learn, manage, communicate and grow together."},
  "benefits":[
    {"icon":"graduation","title":"Learn Better","copy":"Quality content and practice for every learner","tone":"orange"},
    {"icon":"school","title":"Run Schools Better","copy":"Smart tools for academics, operations and growth","tone":"green"},
    {"icon":"family","title":"Stay Connected","copy":"Real-time communication and progress tracking","tone":"violet"}
  ],
  "modules":[
    {"title":"Students","copy":"Learn, practice and track your progress","href":"/for-students","imageUrl":"/images/heroes/students-hero.png","icon":"graduation","tone":"blue"},
    {"title":"Schools","copy":"Manage classes, teachers, attendance and more","href":"/for-schools","imageUrl":"/images/heroes/schools-hero.png","icon":"school","tone":"green"},
    {"title":"Parents","copy":"Monitor progress and stay connected with schools","href":"/for-parents","imageUrl":"/images/home-cards/home-parents.png","icon":"family","tone":"violet"},
    {"title":"Learning","copy":"Access public resources for all grades","href":"/learn","imageUrl":"/images/heroes/learn-hero.png","icon":"book","tone":"orange"},
    {"title":"Competitions","copy":"Participate, compete and excel","href":"/competition","imageUrl":"/images/heroes/competition-hero.png","icon":"trophy","tone":"rose"},
    {"title":"Communities","copy":"Connect, discuss and learn together","href":"/communities","imageUrl":"","icon":"family","tone":"teal"}
  ],
  "video":{"title":"Discover VidyaSetu","description":"See how students, schools and families learn and stay connected.","videoUrl":"","posterUrl":"/images/heroes/home-hero.png","captionsUrl":"","captionsLanguage":"en","transcript":""},
  "journey":[
    {"step":"01","icon":"graduation","title":"A student learns","copy":"Discover resources, practise by class and build a visible learning journey."},
    {"step":"02","icon":"school","title":"The school supports","copy":"School academics and everyday operations stay connected to the learner."},
    {"step":"03","icon":"family","title":"The family stays informed","copy":"Parents can follow progress and school communication from one trusted space."},
    {"step":"04","icon":"link","title":"Growth continues beyond class","copy":"Competitions and Communities extend participation, confidence and opportunity."}
  ],
  "trust":[
    {"icon":"shield","title":"Safe by design","copy":"Role-aware access keeps personal, school and family records inside protected workspaces."},
    {"icon":"link","title":"Connected, not fragmented","copy":"Learning, school operations and family participation belong to the same education journey."},
    {"icon":"india","title":"Built for Indian education","copy":"Cross-board learning and school workflows reflect Indian classrooms, families and institutions."},
    {"icon":"progress","title":"Progress with context","copy":"Learning activity can sit alongside school-linked academic context instead of living in another silo."},
    {"icon":"device","title":"Made for everyday access","copy":"Public discovery is simple and the role-based experience works across modern devices."}
  ],
  "finalCta":{"eyebrow":"START WITH THE PART YOU NEED","title":"Learn publicly. Join when you are ready for the connected experience.","copy":"Create an account for role-based learning, school workflows, parent visibility, Communities and participation history."}
}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;

COMMIT;
