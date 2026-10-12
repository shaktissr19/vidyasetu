\set ON_ERROR_STOP on
DO $$
BEGIN
  IF to_regclass('public.curriculum_chapters') IS NULL
     OR to_regclass('public.curriculum_version_evidence') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curriculum_versions' AND column_name='source_hash')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curriculum_topics' AND column_name='chapter_id') THEN
    RAISE EXCEPTION 'Curriculum Framework migration 056 is incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM curriculum_topics WHERE chapter_id IS NULL) THEN
    RAISE EXCEPTION 'Existing curriculum topics were not mapped to a chapter';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_curriculum_versions_year_medium_version') THEN
    RAISE EXCEPTION 'Framework versions are not isolated by medium';
  END IF;
END $$;
