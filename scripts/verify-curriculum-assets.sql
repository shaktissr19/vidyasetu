DO $$
BEGIN
  IF to_regclass('public.learning_asset_nodes') IS NULL
     OR to_regclass('public.learning_asset_review_assignments') IS NULL
     OR to_regclass('public.learning_asset_checklist') IS NULL
     OR to_regclass('public.learning_asset_versions') IS NULL
     OR to_regclass('public.learning_asset_moderation') IS NULL
     OR to_regclass('public.learning_asset_usage_events') IS NULL
     OR to_regclass('public.learning_asset_governance_audit') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_content_assets' AND column_name='original_file_name')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='doubts' AND column_name='curriculum_topic_id') THEN
    RAISE EXCEPTION 'Curriculum topic asset governance migrations 057/058 are incomplete';
  END IF;
END $$;
